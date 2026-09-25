import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OrderStatus, OrderType } from '@prisma/client';
import { nextNo, type TenantDb } from '../db.js';
import { parse, listQuery, optText, must, num, date, sizeMap, sumSizes, optDecimal } from '../lib/http.js';
import { need, audit } from '../lib/auth.js';
import { badRequest } from '../lib/errors.js';
import { workOrderProgress, finishedOf } from '../lib/production.js';
import { mergeSettings } from '../lib/defaults.js';
import { prisma } from '../db.js';

const lineBody = z.object({
  modelId: z.string().min(1).max(40),
  color: z.string().trim().min(1).max(40),
  sizes: sizeMap,
  unitPrice: optDecimal,
});

const orderBody = z.object({
  type: z.nativeEnum(OrderType).default('SATIS'),
  customerId: z.string().min(1).max(40),
  orderDate: date.optional(),
  dueDate: date,
  priority: z.coerce.number().int().min(1).max(3).default(2),
  currency: z.enum(['TRY', 'USD', 'EUR']).default('TRY'),
  customerRef: optText(80),
  note: optText(2000),
  lines: z.array(lineBody).min(1, 'En az bir kalem ekleyin').max(100),
});

async function validateRefs(db: TenantDb, customerId: string, modelIds: string[]) {
  await must(db.party.findFirst({ where: { id: customerId } }), 'Müşteri');
  const ids = [...new Set(modelIds)];
  const n = await db.styleModel.count({ where: { id: { in: ids } } });
  if (n !== ids.length) throw badRequest('Siparişte tanımsız model var.');
}

export const orderInclude = {
  customer: { select: { id: true, name: true } },
  lines: { include: { model: { select: { id: true, code: true, name: true } } } },
  workOrders: { include: { stages: { orderBy: { sequence: 'asc' as const } } } },
} as const;

/** Sipariş özeti: ilerleme, üretilen, sevk edilen, termin riski */
export function summarize(o: any, dueSoonDays = 3) {
  const total = o.lines.reduce((s: number, l: any) => s + l.quantity, 0);
  const shipped = o.lines.reduce((s: number, l: any) => s + l.shippedQty, 0);
  const wos = o.workOrders.filter((w: any) => w.status !== 'IPTAL');
  const planned = wos.reduce((s: number, w: any) => s + w.plannedQty, 0);
  const finished = wos.reduce((s: number, w: any) => s + finishedOf(w), 0);
  const progress = planned ? Math.round(wos.reduce((s: number, w: any) => s + workOrderProgress(w) * w.plannedQty, 0) / planned) : 0;
  const amount = o.lines.reduce((s: number, l: any) => s + l.quantity * num(l.unitPrice), 0);
  const now = Date.now();
  const due = new Date(o.dueDate).getTime();
  const start = new Date(o.orderDate).getTime();
  const daysLeft = Math.ceil((due - now) / 86400_000);
  const closed = o.status === 'TAMAMLANDI' || o.status === 'IPTAL';
  const expected = due > start ? Math.min(100, Math.max(0, Math.round(((now - start) / (due - start)) * 100))) : 100;
  let risk: 'GECIKTI' | 'RISKLI' | 'YAKIN' | 'NORMAL' | 'KAPALI' = 'NORMAL';
  let reason = '';
  if (closed) risk = 'KAPALI';
  else if (daysLeft < 0) {
    risk = 'GECIKTI';
    reason = `Termin ${-daysLeft} gün geçti`;
  } else if (!wos.length && o.status !== 'TASLAK' && daysLeft <= dueSoonDays * 3) {
    risk = 'RISKLI';
    reason = 'Termin yaklaşıyor, henüz iş emri açılmadı';
  } else if (progress + 20 < expected) {
    risk = 'RISKLI';
    reason = `Plana göre %${expected - progress} geride`;
  } else if (daysLeft <= dueSoonDays) {
    risk = 'YAKIN';
    reason = `Termine ${daysLeft} gün kaldı`;
  }
  const remaining = Math.max(0, total - Math.max(finished, shipped));
  const dailyNeeded = !closed && daysLeft > 0 && remaining > 0 ? Math.ceil(remaining / daysLeft) : null;
  return { total, shipped, finished, progress, expected, amount: Math.round(amount * 100) / 100, daysLeft, risk, reason, remaining, dailyNeeded };
}

export async function orderRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: need('siparis:gor') }, async (req) => {
    const q = parse(listQuery.extend({ open: z.enum(['1', '0']).optional() }), req.query);
    const where: any = {};
    if (q.status && q.status in OrderStatus) where.status = q.status;
    else if (q.open === '1') where.status = { notIn: ['TAMAMLANDI', 'IPTAL'] };
    if (q.type && q.type in OrderType) where.type = q.type;
    if (q.q) where.OR = [{ no: { contains: q.q, mode: 'insensitive' } }, { customer: { name: { contains: q.q, mode: 'insensitive' } } }, { customerRef: { contains: q.q, mode: 'insensitive' } }];
    const orders = await req.db.order.findMany({ where, include: orderInclude, orderBy: [{ dueDate: 'asc' }], take: q.take, skip: q.skip });
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: req.auth!.tenantId } });
    const days = mergeSettings(t.settings).alerts.dueSoonDays;
    return orders.map((o) => {
      const { lines, workOrders, ...rest } = o;
      return { ...rest, lineCount: lines.length, models: [...new Set(lines.map((l) => l.model.code))].join(', '), ...summarize(o, days) };
    });
  });

  app.get('/:id', { preHandler: need('siparis:gor') }, async (req) => {
    const { id } = req.params as { id: string };
    const o = await must(req.db.order.findFirst({ where: { id }, include: { ...orderInclude, shipments: { orderBy: { date: 'desc' } } } }), 'Sipariş');
    return { order: o, summary: summarize(o), workOrders: o.workOrders.map((w) => ({ ...w, progress: workOrderProgress(w), finished: finishedOf(w) })) };
  });

  // Siparişin malzeme ihtiyacı (reçeteye göre)
  app.get('/:id/requirements', { preHandler: need('siparis:gor') }, async (req) => {
    const { id } = req.params as { id: string };
    const o = await must(req.db.order.findFirst({ where: { id }, include: { lines: { include: { model: { include: { materials: { include: { material: true } } } } } } } }), 'Sipariş');
    const need_: Record<string, { material: any; required: number }> = {};
    for (const l of o.lines) {
      for (const mm of l.model.materials) {
        const k = mm.materialId;
        need_[k] ??= { material: { id: mm.material.id, code: mm.material.code, name: mm.material.name, unit: mm.material.unit, stock: mm.material.stock, color: mm.material.color }, required: 0 };
        need_[k].required += num(mm.consumption) * l.quantity;
      }
    }
    return Object.values(need_).map((r) => ({ ...r, required: Math.round(r.required * 100) / 100, shortage: Math.max(0, Math.round((r.required - num(r.material.stock)) * 100) / 100) }));
  });

  app.post('/', { preHandler: need('siparis:yaz') }, async (req) => {
    const body = parse(orderBody, req.body);
    await validateRefs(req.db, body.customerId, body.lines.map((l) => l.modelId));
    for (const l of body.lines) if (sumSizes(l.sizes) <= 0) throw badRequest('Her kalemde beden adedi girilmeli.');
    const tenantId = req.auth!.tenantId;
    const no = await nextNo(tenantId, 'SIP');
    const { lines, ...head } = body;
    const o = await req.db.order.create({
      data: {
        ...head,
        no,
        status: 'ONAYLANDI',
        lines: { create: lines.map((l) => ({ ...l, tenantId, quantity: sumSizes(l.sizes) })) },
      } as any,
    });
    await audit(req, 'SIPARIS_EKLE', 'Order', o.id, { no });
    return o;
  });

  app.patch('/:id', { preHandler: need('siparis:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(
      z.object({
        dueDate: date.optional(),
        priority: z.coerce.number().int().min(1).max(3).optional(),
        status: z.nativeEnum(OrderStatus).optional(),
        customerRef: optText(80),
        note: optText(2000),
      }),
      req.body,
    );
    const o = await must(req.db.order.findFirst({ where: { id } }), 'Sipariş');
    const updated = await req.db.order.update({ where: { id }, data: body });
    await audit(req, 'SIPARIS_GUNCELLE', 'Order', id, { ...body, oldDue: o.dueDate });
    return updated;
  });

  // Kalemleri değiştir (yalnızca üretime girmemiş sipariş)
  app.put('/:id/lines', { preHandler: need('siparis:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(z.object({ lines: z.array(lineBody).min(1).max(100) }), req.body);
    const o = await must(req.db.order.findFirst({ where: { id }, include: { workOrders: true } }), 'Sipariş');
    if (o.workOrders.length) throw badRequest('İş emri açılmış siparişin kalemleri değiştirilemez.');
    await validateRefs(req.db, o.customerId, body.lines.map((l) => l.modelId));
    const tenantId = req.auth!.tenantId;
    await req.db.$transaction([
      req.db.orderLine.deleteMany({ where: { orderId: id } }),
      req.db.orderLine.createMany({ data: body.lines.map((l) => ({ ...l, tenantId, orderId: id, quantity: sumSizes(l.sizes) })) as any }),
    ]);
    await audit(req, 'SIPARIS_KALEM', 'Order', id);
    return { ok: true };
  });

  // Siparişten iş emirleri oluştur (her kalem için bir iş emri)
  app.post('/:id/work-orders', { preHandler: need('uretim:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const o = await must(req.db.order.findFirst({ where: { id }, include: { lines: { include: { model: true, workOrders: true } } } }), 'Sipariş');
    if (o.status === 'IPTAL' || o.status === 'TAMAMLANDI') throw badRequest('Kapalı siparişe iş emri açılamaz.');
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: req.auth!.tenantId } });
    const settings = mergeSettings(t.settings);
    const tenantId = req.auth!.tenantId;
    const created: string[] = [];
    for (const l of o.lines) {
      if (l.workOrders.some((w) => w.status !== 'IPTAL')) continue;
      const route = l.model.route.length ? l.model.route : settings.defaultRoute;
      const no = await nextNo(tenantId, 'IE');
      await req.db.workOrder.create({
        data: {
          no,
          orderId: o.id,
          orderLineId: l.id,
          modelId: l.modelId,
          color: l.color,
          sizes: l.sizes as object,
          plannedQty: l.quantity,
          dueDate: o.dueDate,
          stages: { create: route.map((stage, i) => ({ tenantId, stage, sequence: i + 1 })) },
        } as any,
      });
      created.push(no);
    }
    if (!created.length) throw badRequest('Tüm kalemler için iş emri zaten açılmış.');
    await audit(req, 'IS_EMRI_OLUSTUR', 'Order', id, { created });
    return { created };
  });

  app.delete('/:id', { preHandler: need('siparis:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const o = await must(req.db.order.findFirst({ where: { id }, include: { workOrders: true, shipments: true } }), 'Sipariş');
    if (o.workOrders.length || o.shipments.length) throw badRequest('Üretime girmiş siparişi silemezsiniz; durumunu İptal yapın.');
    await req.db.order.delete({ where: { id } });
    await audit(req, 'SIPARIS_SIL', 'Order', id, { no: o.no });
    return { ok: true };
  });
}
