import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

// Yalnızca adında "_test" geçen veritabanında çalışır: yanlışlıkla gerçek veriyi silmeyi engeller.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://dcgiyim:dcgiyim@localhost:5432/dcgiyim_test';
  if (!/_test(\?|$)/.test(url)) throw new Error('Test veritabanı adı _test ile bitmeli');
  const db = new PrismaClient({ datasources: { db: { url } } });
  await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await db.$executeRawUnsafe('CREATE SCHEMA public');
  await db.$disconnect();
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
}
