import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomInt } from 'node:crypto';
import { Role } from '@prisma/client';
import { prisma } from '../db.js';
import { parse } from '../lib/http.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { hashPassword } from '../lib/password.js';
import { need, audit } from '../lib/auth.js';
import { ROLE_LABELS, ROLE_PERMISSIONS } from '../lib/permissions.js';
import { mergeSettings } from '../lib/defaults.js';

// Geçici şifre: karışması kolay karakterler çıkarılmış
function tempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += letters[randomInt(letters.length)];
  for (let i = 0; i < 4; i++) s += digits[randomInt(digits.length)];
  return s;
}

const userSelect = {
  id: true, email: true, name: true, role: true, active: true, lastLoginAt: true,
  createdAt: true, mustChangePassword: true, lockedUntil: true,
} as const;

export async function adminRoutes(app: FastifyInstance) {
  app.get('/roles', { preHandler: need('ayar:yonet') }, async () =>
    Object.entries(ROLE_LABELS).map(([role, label]) => ({ role, label, permissions: ROLE_PERMISSIONS[role as Role] })),
  );

  app.get('/users', { preHandler: need('ayar:yonet') }, async (req) =>
    prisma.user.findMany({ where: { tenantId: req.auth!.tenantId }, select: userSelect, orderBy: { createdAt: 'asc' } }),
  );

  // Görev atamak için basit kullanıcı listesi
  app.get('/users/basic', { preHandler: need('gorev:gor') }, async (req) =>
    prisma.user.findMany({
      where: { tenantId: req.auth!.tenantId, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  );

  app.post('/users', { preHandler: need('ayar:yonet') }, async (req) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().toLowerCase().email().max(160),
        role: z.nativeEnum(Role),
      }),
      req.body,
    );
    if (body.role === 'SAHIP' && req.auth!.user.role !== 'SAHIP') throw forbidden('Firma sahibi rolünü yalnızca firma sahibi verebilir.');
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('Bu e-posta zaten kullanılıyor.');
    const pw = tempPassword();
    const user = await prisma.user.create({
      data: {
        tenantId: req.auth!.tenantId,
        name: body.name,
        email: body.email,
        role: body.role,
        passwordHash: await hashPassword(pw),
        mustChangePassword: true,
      },
      select: userSelect,
    });
    await audit(req, 'KULLANICI_EKLE', 'User', user.id, { email: user.email, role: user.role });
    // Geçici şifre yalnızca BİR KEZ gösterilir, hiçbir yerde düz metin saklanmaz.
    return { user, tempPassword: pw };
  });

  async function loadTarget(tenantId: string, id: string) {
    const u = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!u) throw notFound('Kullanıcı');
    return u;
  }

  async function ensureAnotherOwner(tenantId: string, exceptId: string) {
    const n = await prisma.user.count({ where: { tenantId, role: 'SAHIP', active: true, id: { not: exceptId } } });
    if (n === 0) throw badRequest('Firmada en az bir aktif Firma Sahibi kalmalı.');
  }

  app.patch('/users/:id', { preHandler: need('ayar:yonet') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(120).optional(),
        role: z.nativeEnum(Role).optional(),
        active: z.boolean().optional(),
      }),
      req.body,
    );
    const actor = req.auth!;
    const target = await loadTarget(actor.tenantId, id);
    const touchesOwner = target.role === 'SAHIP' || body.role === 'SAHIP';
    if (touchesOwner && actor.user.role !== 'SAHIP') throw forbidden('Firma sahibi hesaplarını yalnızca firma sahibi değiştirebilir.');
    if (target.id === actor.user.id && (body.active === false || (body.role && body.role !== target.role))) {
      throw badRequest('Kendi rolünüzü değiştiremez veya hesabınızı pasifleştiremezsiniz.');
    }
    if (target.role === 'SAHIP' && ((body.role && body.role !== 'SAHIP') || body.active === false)) {
      await ensureAnotherOwner(actor.tenantId, target.id);
    }
    const user = await prisma.user.update({ where: { id: target.id }, data: body, select: userSelect });
    // Rol/durum değiştiyse açık oturumları kapat → yeni yetkiler hemen geçerli olsun
    if (body.role || body.active === false) await prisma.session.deleteMany({ where: { userId: target.id } });
    await audit(req, 'KULLANICI_GUNCELLE', 'User', target.id, body);
    return user;
  });

  app.post('/users/:id/reset-password', { preHandler: need('ayar:yonet') }, async (req) => {
    const { id } = req.params as { id: string };
    const actor = req.auth!;
    const target = await loadTarget(actor.tenantId, id);
    if (target.role === 'SAHIP' && actor.user.role !== 'SAHIP') throw forbidden();
    const pw = tempPassword();
    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: await hashPassword(pw), mustChangePassword: true, failedLogins: 0, lockedUntil: null },
    });
    await prisma.session.deleteMany({ where: { userId: target.id } });
    await audit(req, 'SIFRE_SIFIRLA', 'User', target.id);
    return { tempPassword: pw };
  });

  app.get('/audit', { preHandler: need('denetim:gor') }, async (req) => {
    const q = parse(z.object({ take: z.coerce.number().int().min(1).max(500).default(200) }), req.query);
    return prisma.auditLog.findMany({
      where: { tenantId: req.auth!.tenantId },
      orderBy: { createdAt: 'desc' },
      take: q.take,
    });
  });

  app.get('/settings', { preHandler: need() }, async (req) => {
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: req.auth!.tenantId } });
    return { name: t.name, settings: mergeSettings(t.settings) };
  });

  const strList = (max: number) => z.array(z.string().trim().min(1).max(60)).max(max);
  app.put('/settings', { preHandler: need('ayar:yonet') }, async (req) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(120),
        settings: z.object({
          stages: z.array(z.object({ code: z.string().trim().regex(/^[A-Z0-9_]{2,20}$/, 'Aşama kodu BÜYÜK harf, rakam ve _ içermeli'), label: z.string().trim().min(1).max(40) })).min(1).max(30),
          defaultRoute: strList(30),
          sizeSets: z.array(z.object({ name: z.string().trim().min(1).max(40), sizes: strList(40) })).max(30),
          categories: strList(100),
          defectTypes: strList(60),
          departments: strList(40),
          positions: strList(60),
          alerts: z.object({
            dueSoonDays: z.number().int().min(1).max(60),
            chequeDays: z.number().int().min(1).max(90),
            fasonGraceDays: z.number().int().min(0).max(30),
            wasteRatePct: z.number().min(0).max(100),
          }),
          workHoursPerDay: z.number().min(1).max(24),
        }),
      }),
      req.body,
    );
    const codes = new Set(body.settings.stages.map((s) => s.code));
    if (body.settings.defaultRoute.some((c) => !codes.has(c))) throw badRequest('Varsayılan rota tanımsız bir aşama içeriyor.');
    await prisma.tenant.update({ where: { id: req.auth!.tenantId }, data: { name: body.name, settings: body.settings } });
    await audit(req, 'AYAR_GUNCELLE', 'Tenant', req.auth!.tenantId);
    return { ok: true };
  });
}
