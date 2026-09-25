import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ModelStatus } from '@prisma/client';
import { parse, listQuery, optText, must, num, optDecimal } from '../lib/http.js';
import { need, audit } from '../lib/auth.js';
import { badRequest, conflict } from '../lib/errors.js';
import type { TenantDb } from '../db.js';

const strArr = (max: number) => z.array(z.string().trim().min(1).max(30)).max(max);

const modelBody = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  category: optText(60),
  season: optText(40),
  customerId: z.string().max(40).optional().nullable().transform((v) => v || null),
  sizes: strArr(40).min(1, 'En az bir beden girin'),
  colors: strArr(60).min(1, 'En az bir renk girin'),
  status: z.nativeEnum(ModelStatus).optional(),
  description: optText(2000),
  route: z.array(z.string().trim().regex(/^[A-Z0-9_]{2,20}$/)).min(1, 'Üretim rotasında en az bir aşama olmalı').max(30),
  salePrice: optDecimal,
  overheadPct: z.coerce.number().min(0).max(300).optional(),
});

const recipeBody = z.object({
  materials: z.array(z.object({
    materialId: z.string().min(1).max(40),
    consumption: z.coerce.number().min(0).max(100000),
    note: optText(200),
  })).max(60),
  operations: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    stage: z.string().trim().regex(/^[A-Z0-9_]{2,20}$/),
    minutes: z.coerce.number().min(0).max(1000),
    pieceRate: z.coerce.number().min(0).max(100000),
  })).max(200),
});

/** Birim maliyet hesabı (kumaş + aksesuar + işçilik + genel gider) */
export async function modelCost(db: TenantDb, modelId: string) {
  const m = await db.styleModel.findFirst({
    where: { id: modelId },
    include: { materials: { include: { material: true } }, operations: true },
  });
  if (!m) return null;
  const materialCost = m.materials.reduce((s, r) => s + num(r.consumption) * num(r.material.unitPrice), 0);
  const laborCost = m.operations.reduce((s, o) => s + num(o.pieceRate), 0);
  const minutes = m.operations.reduce((s, o) => s + num(o.minutes), 0);
  const base = materialCost + laborCost;
  const unitCost = base * (1 + num(m.overheadPct) / 100);
  const sale = m.salePrice ? num(m.salePrice) : null;
  return {
    materialCost: round(materialCost),
    laborCost: round(laborCost),
    unitCost: round(unitCost),
    totalMinutes: round(minutes),
    margin: sale ? round(((sale - unitCost) / sale) * 100) : null,
  };
}
const round = (v: number) => Math.round(v * 100) / 100;

async function checkCustomer(db: TenantDb, id: string | null | undefined) {
  if (id) await must(db.party.findFirst({ where: { id } }), 'Müşteri');
}

export async function modelRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: need('model:gor', 'siparis:gor') }, async (req) => {
    const q = parse(listQuery, req.query);
    return req.db.styleModel.findMany({
      where: {
        ...(q.status && q.status in ModelStatus ? { status: q.status as ModelStatus } : {}),
        ...(q.q ? { OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } : {}),
      },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: q.take,
      skip: q.skip,
    });
  });

  app.get('/:id', { preHandler: need('model:gor') }, async (req) => {
    const { id } = req.params as { id: string };
    const model = await must(
      req.db.styleModel.findFirst({
        where: { id },
        include: {
          customer: { select: { id: true, name: true } },
          materials: { include: { material: { select: { id: true, code: true, name: true, unit: true, unitPrice: true, stock: true, type: true, color: true } } } },
          operations: { orderBy: { sequence: 'asc' } },
        },
      }),
      'Model',
    );
    const [cost, stock, workOrders] = await Promise.all([
      modelCost(req.db, id),
      req.db.finishedStock.findMany({ where: { modelId: id } }),
      req.db.workOrder.findMany({ where: { modelId: id }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, no: true, status: true, plannedQty: true, color: true, dueDate: true } }),
    ]);
    return { model, cost, stock, workOrders };
  });

  app.post('/', { preHandler: need('model:yaz') }, async (req) => {
    const body = parse(modelBody, req.body);
    await checkCustomer(req.db, body.customerId);
    if (await req.db.styleModel.findFirst({ where: { code: body.code } })) throw conflict('Bu model kodu zaten var.');
    const m = await req.db.styleModel.create({ data: body as any });
    await audit(req, 'MODEL_EKLE', 'StyleModel', m.id, { code: m.code });
    return m;
  });

  app.patch('/:id', { preHandler: need('model:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(modelBody.partial(), req.body);
    await must(req.db.styleModel.findFirst({ where: { id } }), 'Model');
    await checkCustomer(req.db, body.customerId);
    if (body.code && (await req.db.styleModel.findFirst({ where: { code: body.code, id: { not: id } } }))) throw conflict('Bu model kodu zaten var.');
    const m = await req.db.styleModel.update({ where: { id }, data: body as any });
    await audit(req, 'MODEL_GUNCELLE', 'StyleModel', id);
    return m;
  });

  // Reçete (malzeme listesi) + operasyon listesi: tümüyle değiştirilir
  app.put('/:id/recipe', { preHandler: need('model:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(recipeBody, req.body);
    await must(req.db.styleModel.findFirst({ where: { id } }), 'Model');
    const matIds = [...new Set(body.materials.map((m) => m.materialId))];
    const found = await req.db.material.count({ where: { id: { in: matIds } } });
    if (found !== matIds.length) throw badRequest('Reçetede tanımsız malzeme var.');
    const tenantId = req.auth!.tenantId;
    await req.db.$transaction([
      req.db.modelMaterial.deleteMany({ where: { modelId: id } }),
      req.db.modelOperation.deleteMany({ where: { modelId: id } }),
      req.db.modelMaterial.createMany({ data: body.materials.map((m) => ({ ...m, modelId: id, tenantId })) }),
      req.db.modelOperation.createMany({ data: body.operations.map((o, i) => ({ ...o, sequence: i + 1, modelId: id, tenantId })) }),
    ]);
    await audit(req, 'MODEL_RECETE', 'StyleModel', id);
    return { ok: true, cost: await modelCost(req.db, id) };
  });

  app.delete('/:id', { preHandler: need('model:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    await must(req.db.styleModel.findFirst({ where: { id } }), 'Model');
    try {
      await req.db.styleModel.delete({ where: { id } });
    } catch {
      throw conflict('Bu model siparişlerde kullanılıyor; silmek yerine Arşiv durumuna alın.');
    }
    await audit(req, 'MODEL_SIL', 'StyleModel', id);
    return { ok: true };
  });
}
