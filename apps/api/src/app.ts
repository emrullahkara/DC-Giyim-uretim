import Fastify, { type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { config, isProd } from './config.js';
import { AppError } from './lib/errors.js';
import { authPlugin } from './lib/auth.js';
import { authRoutes } from './modules/auth.js';
import { adminRoutes } from './modules/admin.js';
import { partyRoutes } from './modules/parties.js';
import { modelRoutes } from './modules/models.js';
import { orderRoutes } from './modules/orders.js';
import { productionRoutes } from './modules/production.js';
import { fasonRoutes } from './modules/fason.js';
import { stockRoutes } from './modules/stock.js';
import { finishedRoutes } from './modules/finished.js';
import { qualityRoutes } from './modules/quality.js';
import { personnelRoutes } from './modules/personnel.js';
import { financeRoutes } from './modules/finance.js';
import { taskRoutes } from './modules/tasks.js';
import { dashboardRoutes } from './modules/dashboard.js';
import { prisma } from './db.js';

export async function buildApp() {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: isProd ? 'info' : 'debug', redact: ['req.headers.cookie', 'req.headers.authorization'] },
    trustProxy: config.TRUST_PROXY === 'true',
    bodyLimit: 1024 * 1024, // 1 MB
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 300 * config.RATE_LIMIT_FACTOR,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, ctx) => ({ statusCode: 429, code: 'LIMIT', message: `Çok fazla istek. ${Math.ceil(ctx.ttl / 1000)} sn sonra tekrar deneyin.` }),
  });
  await app.register(authPlugin);

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof AppError) return reply.status(err.statusCode).send({ code: err.code, message: err.message });
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return reply.status(409).send({ code: 'CAKISMA', message: 'Bu kayıt zaten mevcut (benzersiz alan çakışması).' });
      if (err.code === 'P2025') return reply.status(404).send({ code: 'BULUNAMADI', message: 'Kayıt bulunamadı.' });
      if (err.code === 'P2003') return reply.status(409).send({ code: 'BAGLI', message: 'Bu kayda bağlı başka kayıtlar var.' });
    }
    const fe = err as FastifyError;
    if (fe.statusCode === 429) return reply.status(429).send(fe);
    if (fe.validation || fe.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || fe.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' || (fe.statusCode && fe.statusCode < 500)) {
      return reply.status(fe.statusCode ?? 400).send({ code: 'GECERSIZ', message: 'Geçersiz istek.' });
    }
    req.log.error(err);
    // İç hata ayrıntısı istemciye asla gönderilmez
    return reply.status(500).send({ code: 'SUNUCU', message: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.' });
  });

  app.get('/api/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await app.register(partyRoutes, { prefix: '/api/parties' });
  await app.register(modelRoutes, { prefix: '/api/models' });
  await app.register(orderRoutes, { prefix: '/api/orders' });
  await app.register(productionRoutes, { prefix: '/api/production' });
  await app.register(fasonRoutes, { prefix: '/api/fason' });
  await app.register(stockRoutes, { prefix: '/api/stock' });
  await app.register(finishedRoutes, { prefix: '/api/finished' });
  await app.register(qualityRoutes, { prefix: '/api/quality' });
  await app.register(personnelRoutes, { prefix: '/api/personnel' });
  await app.register(financeRoutes, { prefix: '/api/finance' });
  await app.register(taskRoutes, { prefix: '/api/tasks' });

  // Üretimde web arayüzü aynı sunucudan verilir (aynı köken → çerez ve CSP basit ve sıkı)
  const webDist = config.WEB_DIST ?? path.resolve(process.cwd(), '../web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false, maxAge: isProd ? '1h' : 0 });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ code: 'BULUNAMADI', message: 'Uç nokta bulunamadı.' });
      return reply.type('text/html').header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.status(404).send({ code: 'BULUNAMADI', message: 'Bulunamadı.' }));
  }

  return app;
}
