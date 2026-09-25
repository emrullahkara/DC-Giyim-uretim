import type { FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import { badRequest } from './errors.js';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  try {
    return schema.parse(data);
  } catch (e) {
    if (e instanceof ZodError) {
      const first = e.issues[0];
      const field = first?.path?.join('.') || 'veri';
      throw badRequest(`Geçersiz alan: ${field} — ${first?.message ?? 'hatalı değer'}`);
    }
    throw e;
  }
}

// Ortak şema parçaları
export const id = z.string().min(1).max(40);
export const optId = z.string().min(1).max(40).optional().nullable();
export const text = (max = 200) => z.string().trim().max(max);
export const optText = (max = 500) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v === '' ? null : v));
export const qty = z.coerce.number().int().min(0).max(10_000_000);
export const posQty = z.coerce.number().int().min(1).max(10_000_000);
export const decimal = z.coerce.number().min(0).max(1_000_000_000);
export const optDecimal = z
  .union([z.coerce.number().min(0).max(1_000_000_000), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v));
export const date = z.coerce.date().refine((d) => !isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2200, 'Geçersiz tarih');
export const sizeMap = z
  .record(z.string().trim().min(1).max(12), z.coerce.number().int().min(0).max(1_000_000))
  .refine((m) => Object.keys(m).length <= 40, 'En fazla 40 beden');

export const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.string().max(40).optional(),
  type: z.string().max(40).optional(),
  take: z.coerce.number().int().min(1).max(500).default(100),
  skip: z.coerce.number().int().min(0).max(100000).default(0),
});

export function sumSizes(m: Record<string, number>): number {
  return Object.values(m).reduce((a, b) => a + (Number(b) || 0), 0);
}

export function clientIp(req: FastifyRequest): string {
  return req.ip;
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Kayıt yoksa 404 fırlatır (firma kapsamlı sorgu sonucu için) */
export async function must<T>(p: Promise<T | null>, what = 'Kayıt'): Promise<T> {
  const v = await p;
  if (!v) {
    const { notFound } = await import('./errors.js');
    throw notFound(what);
  }
  return v;
}

export const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
