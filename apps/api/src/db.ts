import { PrismaClient, Prisma } from '@prisma/client';

// Ham istemci: YALNIZCA firma dışı (global) işlemler için — giriş, oturum, sayaç.
export const prisma = new PrismaClient();

// Firma dışı tablolar (bu tablolara tenant filtresi eklenmez, elle yönetilir)
const GLOBAL_MODELS = new Set<string>(['Tenant', 'Session', 'Counter']);

/**
 * Firma-kapsamlı veritabanı istemcisi.
 * Her sorguya tenantId koşulunu ZORLA ekler; oluşturulan her kayda tenantId yazar.
 * Böylece bir firma, başka firmanın kaydının id'sini bilse bile ona erişemez.
 */
export function tenantDb(tenantId: string) {
  if (!tenantId) throw new Error('tenantId zorunlu');
  return prisma.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (GLOBAL_MODELS.has(model)) return query(args);
          const a = (args ?? {}) as Record<string, any>;
          switch (operation) {
            case 'create':
              a.data = { ...a.data, tenantId };
              break;
            case 'createMany':
            case 'createManyAndReturn':
              a.data = Array.isArray(a.data)
                ? a.data.map((d: object) => ({ ...d, tenantId }))
                : { ...a.data, tenantId };
              break;
            case 'upsert':
              a.where = { ...a.where, tenantId };
              a.create = { ...a.create, tenantId };
              break;
            default:
              // find*, update*, delete*, count, aggregate, groupBy
              a.where = { ...(a.where ?? {}), tenantId };
          }
          // update/updateMany ile tenantId değiştirilmesini engelle
          if (a.data && !Array.isArray(a.data) && (operation === 'update' || operation === 'updateMany')) {
            if ('tenantId' in a.data) delete a.data.tenantId;
          }
          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
export { Prisma };

/** Belge numarası üretir: SIP-2026-0001 */
export async function nextNo(tenantId: string, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const c = await prisma.counter.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${key}-${String(c.value).padStart(4, '0')}`;
}
