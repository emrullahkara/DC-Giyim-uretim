import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { parse } from '../lib/http.js';
import { AppError, badRequest, forbidden, unauthorized } from '../lib/errors.js';
import { hashPassword, verifyPassword, getDummyHash, newToken, sha256, passwordProblem } from '../lib/password.js';
import { COOKIE, cookieOptions, need, audit } from '../lib/auth.js';
import { ROLE_LABELS } from '../lib/permissions.js';
import { mergeSettings } from '../lib/defaults.js';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const MAX_SESSIONS_PER_USER = 10;

const email = z.string().trim().toLowerCase().email('Geçerli bir e-posta girin').max(160);

function slugify(s: string) {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  return s
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'firma';
}

async function createSession(userId: string, tenantId: string, ip: string, ua?: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + config.SESSION_MAX_DAYS * 86400_000);
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, tenantId, expiresAt, ip, userAgent: ua?.slice(0, 200) },
  });
  // Eski oturumları buda
  const old = await prisma.session.findMany({
    where: { userId },
    orderBy: { lastSeenAt: 'desc' },
    skip: MAX_SESSIONS_PER_USER,
    select: { id: true },
  });
  if (old.length) await prisma.session.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  return { token, expiresAt };
}

export async function authRoutes(app: FastifyInstance) {
  const f = config.RATE_LIMIT_FACTOR;
  const strict = { config: { rateLimit: { max: 10 * f, timeWindow: '15 minutes' } } };

  app.post('/signup', { config: { rateLimit: { max: 5 * f, timeWindow: '1 hour' } } }, async (req, reply) => {
    if (config.ALLOW_SIGNUP !== 'true') throw forbidden('Yeni firma kaydı şu an kapalı.');
    const body = parse(
      z.object({
        companyName: z.string().trim().min(2).max(120),
        name: z.string().trim().min(2).max(120),
        email,
        password: z.string().max(128),
      }),
      req.body,
    );
    const problem = passwordProblem(body.password, body.email);
    if (problem) throw badRequest(problem);
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw new AppError(409, 'Bu e-posta ile kayıtlı bir hesap var.', 'CAKISMA');

    let slug = slugify(body.companyName);
    if (await prisma.tenant.findUnique({ where: { slug } })) slug = `${slug}-${newToken().slice(0, 6).toLowerCase()}`;
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: body.companyName, slug, settings: mergeSettings({}) as object } });
      return tx.user.create({
        data: { tenantId: tenant.id, email: body.email, name: body.name, passwordHash, role: 'SAHIP' },
      });
    });
    const s = await createSession(user.id, user.tenantId, req.ip, req.headers['user-agent']);
    reply.setCookie(COOKIE, s.token, cookieOptions(s.expiresAt));
    await prisma.auditLog.create({
      data: { tenantId: user.tenantId, userId: user.id, userName: user.name, action: 'FIRMA_KAYIT', entity: 'Tenant', ip: req.ip },
    });
    return { ok: true };
  });

  app.post('/login', strict, async (req, reply) => {
    const body = parse(z.object({ email, password: z.string().min(1).max(128) }), req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const generic = unauthorized('E-posta veya şifre hatalı.');
    if (!user) {
      await verifyPassword(body.password, await getDummyHash());
      throw generic;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new AppError(423, `Çok fazla hatalı deneme. Hesap ${mins} dakika kilitli.`, 'KILITLI');
    }
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok || !user.active) {
      const failed = user.failedLogins + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failed >= MAX_FAILED ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
        },
      });
      await prisma.auditLog.create({
        data: { tenantId: user.tenantId, userId: user.id, userName: user.name, action: 'GIRIS_BASARISIZ', entity: 'User', entityId: user.id, ip: req.ip },
      });
      throw generic;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const s = await createSession(user.id, user.tenantId, req.ip, req.headers['user-agent']);
    reply.setCookie(COOKIE, s.token, cookieOptions(s.expiresAt));
    await prisma.auditLog.create({
      data: { tenantId: user.tenantId, userId: user.id, userName: user.name, action: 'GIRIS', entity: 'User', entityId: user.id, ip: req.ip },
    });
    return { ok: true };
  });

  app.post('/logout', async (req, reply) => {
    if (req.auth) await prisma.session.delete({ where: { id: req.auth.sessionId } }).catch(() => {});
    reply.clearCookie(COOKIE, cookieOptions());
    return { ok: true };
  });

  app.get('/me', { preHandler: need() }, async (req) => {
    const a = req.auth!;
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: a.tenantId } });
    return {
      user: { ...a.user, roleLabel: ROLE_LABELS[a.user.role] },
      tenant: { id: tenant.id, name: tenant.name },
      permissions: [...a.perms],
      settings: mergeSettings(tenant.settings),
    };
  });

  app.post('/change-password', { ...strict, preHandler: need() }, async (req) => {
    const body = parse(z.object({ current: z.string().max(128), next: z.string().max(128) }), req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.user.id } });
    if (!(await verifyPassword(body.current, user.passwordHash))) throw badRequest('Mevcut şifre hatalı.');
    const problem = passwordProblem(body.next, user.email);
    if (problem) throw badRequest(problem);
    if (body.next === body.current) throw badRequest('Yeni şifre eskisiyle aynı olamaz.');
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.next), mustChangePassword: false, passwordChangedAt: new Date() },
    });
    // Diğer tüm oturumları kapat
    await prisma.session.deleteMany({ where: { userId: user.id, id: { not: req.auth!.sessionId } } });
    await audit(req, 'SIFRE_DEGISTI', 'User', user.id);
    return { ok: true };
  });

  app.get('/sessions', { preHandler: need() }, async (req) => {
    const list = await prisma.session.findMany({
      where: { userId: req.auth!.user.id },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, createdAt: true, lastSeenAt: true, ip: true, userAgent: true },
    });
    return list.map((s) => ({ ...s, current: s.id === req.auth!.sessionId }));
  });

  app.delete('/sessions/:id', { preHandler: need() }, async (req) => {
    const { id } = req.params as { id: string };
    await prisma.session.deleteMany({ where: { id, userId: req.auth!.user.id } });
    return { ok: true };
  });
}
