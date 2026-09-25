import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nextNo } from '../db.js';
import { parse, optText, must, num, date, sizeMap, sumSizes, optDecimal } from '../lib/http.js';
import { need, audit, can } from '../lib/auth.js';
import { badRequest } from '../lib/errors.js';
import { addFinished } from '../lib/production.js';

export async function finishedRoutes(app: FastifyInstance) {
  // Mamul stok: model/renk bazında beden kırılımı
  app.get('/stock', { preHandler: need('mamul:gor') }, async (req) => {
    const q = parse(z.object({ q: z.string().max(100).optional() }), req.query);
    const rows = await req.db.finishedStock.findMany({
      where: { OR: [{ quantity: { gt: 0 } }, { secondQty: { gt: 0 } }], ...(q.q ? { model: { OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } } : {}) },
      include: { model: { select: { id: true, code: true, name: true, sizes: true } } },
    });
    const groups: Record<string, any> = {};
    for (const r of rows) {
      const k = `${r.modelId}|${r.color}`;
      const g = (groups[k] ??= { model: r.model, color: r.color, sizes: {} as Record<string, number>, second: 0, total: 0 });
      g.sizes[r.size] = r.quantity;
      g.total += r.quantity;
      g.second += r.secondQty;
    }
    return Object.values(groups).sort((a, b) => a.model.code.localeCompare(b.model.code));
  });

  // Elle stok düzeltme / giriş (ör. dışarıdan hazır alınan ürün, sayım)
  app.post('/stock/adjust', { preHandler: need('mamul:yaz') }, async (req) => {
    const body = parse(z.object({ modelId: z.string().min(1).max(40), color: z.string().trim().min(1).max(40), sizes: z.record(z.string().max(12), z.coerce.number().int().min(-1_000_000).max(1_000_000)), note: optText(300) }), req.body);
    await must(req.db.styleModel.findFirst({ where: { id: body.modelId } }), 'Model');
    await req.db.$transaction(async (tx) => {
      const plus: Record<string, number> = {};
      const minus: Record<string, number> = {};
      for (const [s, q] of Object.entries(body.sizes)) (q >= 0 ? plus : minus)[s] = Math.abs(q);
      await addFinished(tx, body.modelId, body.color, plus, 1);
      await addFinished(tx, body.modelId, body.color, minus, -1);
    });
    await audit(req, 'MAMUL_DUZELT', 'FinishedStock', body.modelId, { color: body.color, sizes: body.sizes, note: body.note });
    return { ok: true };
  });

  app.get('/shipments', { preHandler: need('mamul:gor') }, async (req) => {
    const q = parse(z.object({ take: z.coerce.number().int().min(1).max(500).default(100), q: z.string().max(100).optional() }), req.query);
    return req.db.shipment.findMany({
      where: q.q ? { OR: [{ no: { contains: q.q, mode: 'insensitive' } }, { dispatchNo: { contains: q.q } }, { customer: { name: { contains: q.q, mode: 'insensitive' } } }] } : {},
      include: { customer: { select: { id: true, name: true } }, order: { select: { id: true, no: true } }, lines: true },
      orderBy: { date: 'desc' },
      take: q.take,
    });
  });

  app.post('/shipments', { preHandler: need('mamul:yaz') }, async (req) => {
    const body = parse(
      z.object({
        customerId: z.string().min(1).max(40),
        orderId: z.string().max(40).optional().nullable(),
        date: date.optional(),
        dispatchNo: optText(40),
        cartons: z.coerce.number().int().min(0).max(100000).optional().nullable(),
        note: optText(1000),
        createInvoice: z.boolean().default(false),
        lines: z.array(z.object({ orderLineId: z.string().max(40).optional().nullable(), modelId: z.string().min(1).max(40), color: z.string().trim().min(1).max(40), sizes: sizeMap, unitPrice: optDecimal })).min(1).max(100),
      }),
      req.body,
    );
    await must(req.db.party.findFirst({ where: { id: body.customerId } }), 'Müşteri');
    let order = null;
    if (body.orderId) {
      order = await must(req.db.order.findFirst({ where: { id: body.orderId }, include: { lines: true } }), 'Sipariş');
      if (order.customerId !== body.customerId) throw badRequest('Sipariş bu müşteriye ait değil.');
      if (order.status === 'IPTAL') throw badRequest('İptal edilmiş siparişe sevk yapılamaz.');
    }
    const lines = body.lines.map((l) => ({ ...l, quantity: sumSizes(l.sizes) })).filter((l) => l.quantity > 0);
    if (!lines.length) throw badRequest('Sevk edilecek adet girin.');
    const modelIds = [...new Set(lines.map((l) => l.modelId))];
    if ((await req.db.styleModel.count({ where: { id: { in: modelIds } } })) !== modelIds.length) throw badRequest('Tanımsız model.');
    for (const l of lines) {
      if (l.orderLineId) {
        const ol = order?.lines.find((x) => x.id === l.orderLineId);
        if (!ol) throw badRequest('Sevk kalemi siparişle eşleşmiyor.');
        l.unitPrice ??= ol.unitPrice ? num(ol.unitPrice) : null;
      }
    }
    // Fiyat görme yetkisi olmayan kullanıcı fiyat giremez
    if (!can(req, 'fiyat:gor')) for (const l of lines) if (!l.orderLineId) l.unitPrice = null;

    const tenantId = req.auth!.tenantId;
    const no = await nextNo(tenantId, 'SVK');
    const shipment = await req.db.$transaction(async (tx) => {
      for (const l of lines) await addFinished(tx, l.modelId, l.color, l.sizes, -1);
      const s = await tx.shipment.create({
        data: {
          no, customerId: body.customerId, orderId: body.orderId ?? null, date: body.date ?? new Date(), dispatchNo: body.dispatchNo, cartons: body.cartons ?? null, note: body.note,
          lines: { create: lines.map((l) => ({ tenantId, orderLineId: l.orderLineId ?? null, modelId: l.modelId, color: l.color, sizes: l.sizes, quantity: l.quantity, unitPrice: l.unitPrice ?? null })) },
        } as any,
      });
      for (const l of lines) if (l.orderLineId) await tx.orderLine.update({ where: { id: l.orderLineId }, data: { shippedQty: { increment: l.quantity } } });
      if (order) {
        const fresh = await tx.orderLine.findMany({ where: { orderId: order.id } });
        const all = fresh.every((x) => x.shippedQty >= x.quantity);
        await tx.order.update({ where: { id: order.id }, data: { status: all ? 'TAMAMLANDI' : 'KISMI_SEVK' } });
      }
      const amount = lines.reduce((s, l) => s + l.quantity * num(l.unitPrice), 0);
      if (body.createInvoice && amount > 0 && can(req, 'finans:yaz')) {
        await tx.transaction.create({ data: { partyId: body.customerId, type: 'SATIS_FATURASI', amount: Math.round(amount * 100) / 100, currency: order?.currency ?? 'TRY', docNo: body.dispatchNo ?? no, note: `Sevkiyat ${no}` } as any });
      }
      return s;
    });
    await audit(req, 'SEVKIYAT', 'Shipment', shipment.id, { no, qty: lines.reduce((s, l) => s + l.quantity, 0) });
    return shipment;
  });
}
