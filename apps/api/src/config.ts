import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  // Yeni firma kaydına izin (SaaS açık kayıt)
  ALLOW_SIGNUP: z.enum(['true', 'false']).default('true'),
  // Uygulamanın dışarıdan erişilen adresi (CSRF Origin kontrolü için)
  PUBLIC_ORIGIN: z.string().default('http://localhost:5173'),
  // Proxy arkasında (Caddy/Nginx) gerçek istemci IP'si için
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  SESSION_IDLE_HOURS: z.coerce.number().default(12),
  SESSION_MAX_DAYS: z.coerce.number().default(7),
  WEB_DIST: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).optional(),
  // Hız sınırı çarpanı (yalnızca test/geliştirmede büyütülür)
  RATE_LIMIT_FACTOR: z.coerce.number().min(1).max(1000).default(1),
});

export const config = schema.parse(process.env);
export const isProd = config.NODE_ENV === 'production';
