import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';
import { prisma, tenantDb, type TenantDb } from '../db.js';
import { config, isProd } from '../config.js';
import { permissionsOf, type Permission, PRICE_KEYS, SENSITIVE_EMPLOYEE_KEYS } from './permissions.js';
import { forbidden, unauthorized } from './errors.js';
import { sha256 } from './password.js';

export const COOKIE = isProd ? '__Host-dc_sid' : 'dc_sid';

export interface AuthCtx {
  sessionId: string;
  tenantId: string;
  tenantName: string;
  user: { id: string; name: string; email: string; role: Role; mustChangePassword: boolean };
  perms: Set<Permission>;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthCtx | null;
    db: TenantDb;
  }
}

export function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict' as const,
    path: '/',
    ...(expires ? { expires } : {}),
  };
}

export async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('auth', null);
  app.decorateRequest('db', null as unknown as TenantDb);

  app.addHook('onRequest', async (req, reply) => {
    // CSRF: durum değiştiren isteklerde özel başlık + Origin doğrulaması.
    // Özel başlık, çapraz-site formlarından gönderilemez (CORS kapalı).
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.url.startsWith('/api/')) {
      if (req.headers['x-dc-csrf'] !== '1') throw forbidden('Güvenlik doğrulaması başarısız (CSRF).');
      const origin = req.headers.origin;
      if (origin && isProd && origin !== config.PUBLIC_ORIGIN) throw forbidden('İzin verilmeyen kaynak.');
    }

    const token = req.cookies[COOKIE];
    if (!token || token.length > 100) return;
    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true, tenant: { select: { name: true } } },
    });
    const now = new Date();
    if (!session) {
      reply.clearCookie(COOKIE, cookieOptions());
      return;
    }
    const idleLimit = new Date(session.lastSeenAt.getTime() + config.SESSION_IDLE_HOURS * 3600_000);
    if (session.expiresAt < now || idleLimit < now || !session.user.active || session.user.tenantId !== session.tenantId) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      reply.clearCookie(COOKIE, cookieOptions());
      return;
    }
    // Son görülme zamanını dakikada bir güncelle
    if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
      await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } }).catch(() => {});
    }
    const u = session.user;
    req.auth = {
      sessionId: session.id,
      tenantId: session.tenantId,
      tenantName: session.tenant.name,
      user: { id: u.id, name: u.name, email: u.email, role: u.role, mustChangePassword: u.mustChangePassword },
      perms: permissionsOf(u.role),
    };
    req.db = tenantDb(session.tenantId);
  });

  // Yetkiye göre alan gizleme: fiyat ve personel hassas verileri
  app.addHook('preSerialization', async (req: FastifyRequest, _reply, payload) => {
    const a = req.auth;
    if (!a) return payload;
    const hidePrices = !a.perms.has('fiyat:gor');
    const hideSensitive = !a.perms.has('personel:hassas');
    if (!hidePrices && !hideSensitive) return payload;
    return redact(payload, hidePrices, hideSensitive);
  });
}

// Kapsüllemeyi kaldır: kancalar TÜM rotalara uygulanmalı
(authPlugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

function redact(v: unknown, prices: boolean, sensitive: boolean): unknown {
  if (Array.isArray(v)) return v.map((x) => redact(x, prices, sensitive));
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (prices && PRICE_KEYS.has(k)) continue;
      if (sensitive && SENSITIVE_EMPLOYEE_KEYS.has(k)) continue;
      out[k] = redact(val, prices, sensitive);
    }
    return out;
  }
  return v;
}

/** Oturum zorunlu + belirtilen yetkilerden en az biri */
export function need(...perms: Permission[]) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!req.auth) throw unauthorized();
    if (req.auth.user.mustChangePassword && !req.url.startsWith('/api/auth/')) {
      throw forbidden('Devam etmeden önce şifrenizi değiştirmeniz gerekiyor.');
    }
    if (perms.length && !perms.some((p) => req.auth!.perms.has(p))) throw forbidden();
  };
}

export function can(req: FastifyRequest, p: Permission) {
  return !!req.auth?.perms.has(p);
}

export async function audit(
  req: FastifyRequest,
  action: string,
  entity: string,
  entityId?: string | null,
  meta?: Record<string, unknown>,
) {
  const a = req.auth;
  if (!a) return;
  await prisma.auditLog.create({
    data: {
      tenantId: a.tenantId,
      userId: a.user.id,
      userName: a.user.name,
      action,
      entity,
      entityId: entityId ?? null,
      meta: (meta ?? undefined) as object | undefined,
      ip: req.ip,
    },
  });
}
