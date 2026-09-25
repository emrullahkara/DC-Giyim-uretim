import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PartyRole } from '@prisma/client';
import { parse, listQuery, optText, must, num } from '../lib/http.js';
import { need, audit, can } from '../lib/auth.js';
import { conflict } from '../lib/errors.js';

const partyBody = z.object({
  roles: z.array(z.nativeEnum(PartyRole)).min(1, 'En az bir cari türü seçin').max(3),
  name: z.string().trim().min(2).max(160),
  contactName: optText(120),
  phone: optText(40),
  email: z.union([z.string().trim().email().max(160), z.literal(''), z.null()]).optional().transform((v) => v || null),
  taxOffice: optText(80),
  taxNo: z.union([z.string().trim().regex(/^\d{10,11}$/, 'Vergi/TC no 10-11 haneli olmalı'), z.literal(''), z.null()]).optional().transform((v) => v || null),
  city: optText(60),
  address: optText(400),
  specialties: z.array(z.string().trim().max(30)).max(20).default([]),
  dailyCapacity: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  note: optText(1000),
  active: z.boolean().optional(),
});

// Bakiye: pozitif = cari bize borçlu (alacağımız), negatif = biz borçluyuz
export function balanceOf(rows: { type: string; _sum: { amount: unknown } }[]) {
  let b = 0;
  for (const r of rows) {
    const v = num(r._sum.amount);
    if (r.type === 'SATIS_FATURASI' || r.type === 'ODEME') b += v;
    else b -= v;
  }
  return Math.round(b * 100) / 100;
}

export async function partyRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: need('cari:gor', 'siparis:gor', 'fason:gor', 'depo:gor', 'finans:gor') }, async (req) => {
    const q = parse(listQuery, req.query);
    const role = q.type && q.type in PartyRole ? (q.type as PartyRole) : undefined;
    return req.db.party.findMany({
      where: {
        ...(role ? { roles: { has: role } } : {}),
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { contactName: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] } : {}),
        ...(q.status === 'pasif' ? { active: false } : q.status === 'hepsi' ? {} : { active: true }),
      },
      orderBy: { name: 'asc' },
      take: q.take,
      skip: q.skip,
    });
  });

  app.get('/:id', { preHandler: need('cari:gor') }, async (req) => {
    const { id } = req.params as { id: string };
    const party = await must(req.db.party.findFirst({ where: { id } }), 'Cari');
    const [orders, fason, sums, cheques] = await Promise.all([
      req.db.order.findMany({ where: { customerId: id }, orderBy: { orderDate: 'desc' }, take: 20, select: { id: true, no: true, status: true, dueDate: true, orderDate: true, type: true } }),
      req.db.fasonJob.findMany({ where: { partyId: id }, orderBy: { sentDate: 'desc' }, take: 20, select: { id: true, no: true, stage: true, status: true, sentQty: true, receivedQty: true, defectQty: true, dueDate: true, sentDate: true, completedAt: true } }),
      can(req, 'finans:gor') ? req.db.transaction.groupBy({ by: ['type'], where: { partyId: id }, _sum: { amount: true } }) : Promise.resolve([]),
      can(req, 'finans:gor') ? req.db.cheque.findMany({ where: { partyId: id, status: 'PORTFOYDE' }, orderBy: { dueDate: 'asc' } }) : Promise.resolve([]),
    ]);
    return { party, orders, fason, balance: can(req, 'finans:gor') ? balanceOf(sums) : undefined, cheques };
  });

  app.post('/', { preHandler: need('cari:yaz') }, async (req) => {
    const body = parse(partyBody, req.body);
    const p = await req.db.party.create({ data: body as any });
    await audit(req, 'CARI_EKLE', 'Party', p.id, { name: p.name });
    return p;
  });

  app.patch('/:id', { preHandler: need('cari:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(partyBody.partial(), req.body);
    await must(req.db.party.findFirst({ where: { id } }), 'Cari');
    const p = await req.db.party.update({ where: { id }, data: body as any });
    await audit(req, 'CARI_GUNCELLE', 'Party', id);
    return p;
  });

  app.delete('/:id', { preHandler: need('cari:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    await must(req.db.party.findFirst({ where: { id } }), 'Cari');
    try {
      await req.db.party.delete({ where: { id } });
    } catch {
      throw conflict('Bu carinin hareketleri var; silmek yerine pasif yapın.');
    }
    await audit(req, 'CARI_SIL', 'Party', id);
    return { ok: true };
  });
}
