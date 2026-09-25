import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MaterialType, MovementType } from '@prisma/client';
import { parse, listQuery, optText, must, num, optDecimal, date } from '../lib/http.js';
import { need, audit } from '../lib/auth.js';
import { badRequest, conflict } from '../lib/errors.js';
import type { TenantDb } from '../db.js';

const materialBody = z.object({
  type: z.nativeEnum(MaterialType),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  color: optText(60),
  unit: z.enum(['METRE', 'KG', 'ADET', 'TOP', 'PAKET', 'KONI', 'DUZINE']).default('METRE'),
  widthCm: z.coerce.number().int().min(0).max(1000).optional().nullable(),
  gsm: z.coerce.number().int().min(0).max(5000).optional().nullable(),
  composition: optText(120),
  supplierId: z.string().max(40).optional().nullable().transform((v) => v || null),
  ownerPartyId: z.string().max(40).optional().nullable().transform((v) => v || null),
  unitPrice: optDecimal,
  minStock: z.coerce.number().min(0).max(100_000_000).default(0),
  location: optText(60),
  active: z.boolean().optional(),
});

async function checkParties(db: TenantDb, ids: (string | null | undefined)[]) {
  for (const id of ids) if (id) await must(db.party.findFirst({ where: { id } }), 'Cari');
}

/** Açık siparişlerin reçeteye göre malzeme ihtiyacı (henüz kesilmemiş adetler için) */
export async function materialRequirements(db: TenantDb) {
  const lines = await db.orderLine.findMany({
    where: { order: { status: { in: ['ONAYLANDI', 'URETIMDE'] } } },
    include: {
      order: { select: { no: true, dueDate: true } },
      model: { include: { materials: true } },
      workOrders: { where: { status: { not: 'IPTAL' } }, include: { cuttings: { select: { cutQty: true } } } },
    },
  });
  const req: Record<string, { required: number; orders: Set<string> }> = {};
  for (const l of lines) {
    const cut = l.workOrders.reduce((s, w) => s + w.cuttings.reduce((a, c) => a + c.cutQty, 0), 0);
    const remaining = Math.max(0, l.quantity - cut);
    if (!remaining) continue;
    for (const mm of l.model.materials) {
      const r = (req[mm.materialId] ??= { required: 0, orders: new Set() });
      r.required += num(mm.consumption) * remaining;
      r.orders.add(l.order.no);
    }
  }
  const ids = Object.keys(req);
  const mats = ids.length ? await db.material.findMany({ where: { id: { in: ids } } }) : [];
  return mats
    .map((m) => {
      const r = req[m.id];
      const required = Math.round(r.required * 100) / 100;
      return { material: { id: m.id, code: m.code, name: m.name, unit: m.unit, color: m.color, type: m.type }, stock: num(m.stock), required, shortage: Math.max(0, Math.round((required - num(m.stock)) * 100) / 100), orders: [...r.orders] };
    })
    .sort((a, b) => b.shortage - a.shortage);
}

export async function stockRoutes(app: FastifyInstance) {
  app.get('/materials', { preHandler: need('depo:gor', 'model:gor', 'uretim:gor') }, async (req) => {
    const q = parse(listQuery.extend({ critical: z.enum(['1']).optional() }), req.query);
    const list = await req.db.material.findMany({
      where: {
        ...(q.type && q.type in MaterialType ? { type: q.type as MaterialType } : {}),
        ...(q.status === 'pasif' ? { active: false } : { active: true }),
        ...(q.q ? { OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }, { color: { contains: q.q, mode: 'insensitive' } }] } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        ownerParty: { select: { id: true, name: true } },
        lots: { where: { remaining: { gt: 0 } }, orderBy: { receivedAt: 'asc' } },
      },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
      take: q.take,
      skip: q.skip,
    });
    const out = list.map((m) => ({ ...m, critical: num(m.minStock) > 0 && num(m.stock) <= num(m.minStock) }));
    return q.critical ? out.filter((m) => m.critical) : out;
  });

  app.get('/materials/:id', { preHandler: need('depo:gor') }, async (req) => {
    const { id } = req.params as { id: string };
    const m = await must(
      req.db.material.findFirst({
        where: { id },
        include: {
          supplier: { select: { id: true, name: true } },
          ownerParty: { select: { id: true, name: true } },
          lots: { orderBy: { receivedAt: 'desc' } },
          models: { include: { model: { select: { id: true, code: true, name: true } } } },
        },
      }),
      'Malzeme',
    );
    const movements = await req.db.stockMovement.findMany({ where: { materialId: id }, orderBy: { date: 'desc' }, take: 200, include: { lot: { select: { lotNo: true, rollNo: true } } } });
    return { material: m, movements };
  });

  app.post('/materials', { preHandler: need('depo:yaz') }, async (req) => {
    const body = parse(materialBody, req.body);
    await checkParties(req.db, [body.supplierId, body.ownerPartyId]);
    if (await req.db.material.findFirst({ where: { code: body.code } })) throw conflict('Bu malzeme kodu zaten var.');
    const m = await req.db.material.create({ data: body as any });
    await audit(req, 'MALZEME_EKLE', 'Material', m.id, { code: m.code });
    return m;
  });

  app.patch('/materials/:id', { preHandler: need('depo:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(materialBody.partial(), req.body);
    await must(req.db.material.findFirst({ where: { id } }), 'Malzeme');
    await checkParties(req.db, [body.supplierId, body.ownerPartyId]);
    if (body.code && (await req.db.material.findFirst({ where: { code: body.code, id: { not: id } } }))) throw conflict('Bu malzeme kodu zaten var.');
    const m = await req.db.material.update({ where: { id }, data: body as any });
    await audit(req, 'MALZEME_GUNCELLE', 'Material', id);
    return m;
  });

  // Stok hareketi: giriş (yeni top/parti ile), çıkış, iade, fire, fasona çıkış, sayım
  app.post('/materials/:id/movements', { preHandler: need('depo:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(
      z.object({
        type: z.nativeEnum(MovementType),
        quantity: z.coerce.number().min(0).max(100_000_000),
        lotId: z.string().max(40).optional().nullable(),
        lots: z.array(z.object({ lotNo: z.string().trim().min(1).max(40), rollNo: optText(40), quantity: z.coerce.number().min(0.001).max(1_000_000), location: optText(60) })).max(200).optional(),
        unitPrice: optDecimal,
        partyId: z.string().max(40).optional().nullable(),
        docNo: optText(40),
        note: optText(300),
        date: date.optional(),
      }),
      req.body,
    );
    const m = await must(req.db.material.findFirst({ where: { id } }), 'Malzeme');
    if (body.partyId) await must(req.db.party.findFirst({ where: { id: body.partyId } }), 'Cari');
    if (body.lotId) {
      const lot = await must(req.db.materialLot.findFirst({ where: { id: body.lotId, materialId: id } }), 'Top / parti');
      void lot;
    }
    const stock = num(m.stock);
    const common = { materialId: id, unitPrice: body.unitPrice, partyId: body.partyId ?? null, docNo: body.docNo, note: body.note, userName: req.auth!.user.name, date: body.date ?? new Date() };

    await req.db.$transaction(async (tx) => {
      if (body.type === 'GIRIS' || body.type === 'IADE') {
        // Toplu top girişi: her top ayrı parti kaydı
        if (body.lots?.length) {
          for (const l of body.lots) {
            const lot = await tx.materialLot.create({ data: { materialId: id, lotNo: l.lotNo, rollNo: l.rollNo, quantity: l.quantity, remaining: l.quantity, location: l.location } as any });
            await tx.stockMovement.create({ data: { ...common, type: body.type, quantity: l.quantity, lotId: lot.id } as any });
          }
          const total = body.lots.reduce((s, l) => s + l.quantity, 0);
          await tx.material.update({ where: { id }, data: { stock: { increment: total }, ...(body.unitPrice ? { unitPrice: body.unitPrice } : {}) } });
        } else {
          if (body.quantity <= 0) throw badRequest('Miktar girin.');
          if (body.lotId) await tx.materialLot.update({ where: { id: body.lotId }, data: { remaining: { increment: body.quantity } } });
          await tx.stockMovement.create({ data: { ...common, type: body.type, quantity: body.quantity, lotId: body.lotId ?? null } as any });
          await tx.material.update({ where: { id }, data: { stock: { increment: body.quantity }, ...(body.unitPrice && body.type === 'GIRIS' ? { unitPrice: body.unitPrice } : {}) } });
        }
      } else if (body.type === 'SAYIM') {
        const diff = Math.round((body.quantity - stock) * 1000) / 1000;
        await tx.stockMovement.create({ data: { ...common, type: 'SAYIM', quantity: diff, note: body.note ?? `Sayım: ${stock} → ${body.quantity}` } as any });
        await tx.material.update({ where: { id }, data: { stock: body.quantity } });
      } else {
        if (body.quantity <= 0) throw badRequest('Miktar girin.');
        if (body.quantity > stock) throw badRequest(`Stok yetersiz (mevcut: ${stock} ${m.unit}).`);
        if (body.lotId) {
          const lot = await tx.materialLot.findFirstOrThrow({ where: { id: body.lotId } });
          if (num(lot.remaining) < body.quantity) throw badRequest(`Bu topta yeterli miktar yok (kalan: ${num(lot.remaining)}).`);
          await tx.materialLot.update({ where: { id: body.lotId }, data: { remaining: { decrement: body.quantity } } });
        }
        await tx.stockMovement.create({ data: { ...common, type: body.type, quantity: -body.quantity, lotId: body.lotId ?? null } as any });
        await tx.material.update({ where: { id }, data: { stock: { decrement: body.quantity } } });
      }
    });
    await audit(req, `STOK_${body.type}`, 'Material', id, { quantity: body.quantity, lots: body.lots?.length });
    return { ok: true };
  });

  app.get('/requirements', { preHandler: need('depo:gor', 'siparis:gor') }, async (req) => materialRequirements(req.db));

  app.get('/movements', { preHandler: need('depo:gor') }, async (req) => {
    const q = parse(z.object({ take: z.coerce.number().int().min(1).max(500).default(100) }), req.query);
    return req.db.stockMovement.findMany({ orderBy: { date: 'desc' }, take: q.take, include: { material: { select: { id: true, code: true, name: true, unit: true } }, lot: { select: { lotNo: true, rollNo: true } } } });
  });
}
