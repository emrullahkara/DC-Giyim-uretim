import { buildApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';

const app = await buildApp();

// Süresi dolmuş oturumları saatlik temizle
setInterval(() => {
  prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
}, 3600_000).unref();

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
