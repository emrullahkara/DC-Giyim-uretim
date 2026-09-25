import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ChequeDirection, ChequeStatus, PayMethod, TxType } from '@prisma/client';
import { parse, optText, must, num, date, addDays, startOfDay } from '../lib/http.js';
import { need, audit } from '../lib/auth.js';
import { badRequest } from '../lib/errors.js';
import { balanceOf } from './parties.js';

export async function financeRoutes(app: FastifyInstance) {
  app.get('/transactions', { preHandler: need('finans:gor') }, async (req) => {
    const q = parse(z.object({ partyId: z.string().max(40).optional(), type: z.string().max(30).optional(), take: z.coerce.number().int().min(1).max(1000).default(200) }), req.query);
    return req.db.transaction.findMany({
      where: { ...(q.partyId ? { partyId: q.partyId } : {}), ...(q.type && q.type in TxType ? { type: q.type as TxType } : {}) },
      include: { party: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
      take: q.take,
    });
  });

  app.post('/transactions', { preHandler: need('finans:yaz') }, async (req) => {
    const body = parse(
      z.object({
        partyId: z.string().min(1).max(40),
        type: z.nativeEnum(TxType),
        amount: z.coerce.number().min(0.01).max(1_000_000_000),
        currency: z.enum(['TRY', 'USD', 'EUR']).default('TRY'),
        method: z.nativeEnum(PayMethod).optional().nullable(),
        date: date.optional(),
        dueDate: date.optional().nullable(),
        docNo: optText(40),
        note: optText(500),
      }),
      req.body,
    );
    await must(req.db.party.findFirst({ where: { id: body.partyId } }), 'Cari');
    const t = await req.db.transaction.create({ data: body as any });
    await audit(req, 'CARI_HAREKET', 'Transaction', t.id, { type: body.type, amount: body.amount });
    return t;
  });

  app.delete('/transactions/:id', { preHandler: need('finans:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const t = await must(req.db.transaction.findFirst({ where: { id } }), 'Hareket');
    await req.db.transaction.delete({ where: { id } });
    await audit(req, 'CARI_HAREKET_SIL', 'Transaction', id, { type: t.type, amount: num(t.amount), partyId: t.partyId });
    return { ok: true };
  });

  // Cari bakiye listesi
  app.get('/balances', { preHandler: need('finans:gor') }, async (req) => {
    const [parties, sums] = await Promise.all([
      req.db.party.findMany({ select: { id: true, name: true, roles: true, phone: true } }),
      req.db.transaction.groupBy({ by: ['partyId', 'type'], _sum: { amount: true } }),
    ]);
    return parties
      .map((p) => ({ party: p, balance: balanceOf(sums.filter((s) => s.partyId === p.id)) }))
      .filter((r) => r.balance !== 0)
      .sort((a, b) => b.balance - a.balance);
  });

  // ── Çek / senet portföyü
  app.get('/cheques', { preHandler: need('finans:gor') }, async (req) => {
    const q = parse(z.object({ status: z.string().max(20).optional(), direction: z.string().max(10).optional() }), req.query);
    const list = await req.db.cheque.findMany({
      where: {
        ...(q.status && q.status in ChequeStatus ? { status: q.status as ChequeStatus } : q.status === 'hepsi' ? {} : { status: 'PORTFOYDE' }),
        ...(q.direction && q.direction in ChequeDirection ? { direction: q.direction as ChequeDirection } : {}),
      },
      include: { party: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 1000,
    });
    const today = startOfDay();
    return list.map((c) => ({ ...c, daysLeft: Math.round((startOfDay(c.dueDate).getTime() - today.getTime()) / 86400_000) }));
  });

  const chequeBody = z.object({
    kind: z.enum(['CEK', 'SENET']).default('CEK'),
    direction: z.nativeEnum(ChequeDirection),
    partyId: z.string().min(1).max(40),
    amount: z.coerce.number().min(0.01).max(1_000_000_000),
    currency: z.enum(['TRY', 'USD', 'EUR']).default('TRY'),
    dueDate: date,
    bank: optText(80),
    serialNo: optText(40),
    note: optText(500),
    // Alınan çek aynı zamanda tahsilat, verilen çek ödeme hareketi olarak işlensin mi?
    postTransaction: z.boolean().default(true),
  });

  app.post('/cheques', { preHandler: need('finans:yaz') }, async (req) => {
    const body = parse(chequeBody, req.body);
    await must(req.db.party.findFirst({ where: { id: body.partyId } }), 'Cari');
    const { postTransaction, ...data } = body;
    const c = await req.db.$transaction(async (tx) => {
      const c = await tx.cheque.create({ data: data as any });
      if (postTransaction) {
        await tx.transaction.create({
          data: { partyId: body.partyId, type: body.direction === 'ALINAN' ? 'TAHSILAT' : 'ODEME', amount: body.amount, currency: body.currency, method: body.kind === 'CEK' ? 'CEK' : 'SENET', dueDate: body.dueDate, docNo: body.serialNo, note: `${body.kind === 'CEK' ? 'Çek' : 'Senet'} ${body.bank ?? ''}`.trim() } as any,
        });
      }
      return c;
    });
    await audit(req, 'CEK_SENET_EKLE', 'Cheque', c.id, { amount: body.amount, direction: body.direction });
    return c;
  });

  app.patch('/cheques/:id', { preHandler: need('finans:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(z.object({ status: z.nativeEnum(ChequeStatus), note: optText(500) }), req.body);
    const c = await must(req.db.cheque.findFirst({ where: { id } }), 'Çek/senet');
    if (c.direction === 'ALINAN' && body.status === 'ODENDI') throw badRequest('Alınan çek için "Tahsil edildi" seçin.');
    if (c.direction === 'VERILEN' && (body.status === 'TAHSIL_EDILDI' || body.status === 'CIRO_EDILDI')) throw badRequest('Verilen çek için "Ödendi" seçin.');
    await req.db.cheque.update({ where: { id }, data: body });
    await audit(req, 'CEK_SENET_DURUM', 'Cheque', id, { from: c.status, to: body.status });
    return { ok: true };
  });

  app.get('/summary', { preHandler: need('finans:gor') }, async (req) => {
    const soon = addDays(startOfDay(), 30);
    const [sums, cheques] = await Promise.all([
      req.db.transaction.groupBy({ by: ['partyId', 'type'], _sum: { amount: true } }),
      req.db.cheque.findMany({ where: { status: 'PORTFOYDE', dueDate: { lte: soon } } }),
    ]);
    const byParty: Record<string, typeof sums> = {};
    for (const s of sums) (byParty[s.partyId] ??= []).push(s);
    let receivable = 0;
    let payable = 0;
    for (const rows of Object.values(byParty)) {
      const b = balanceOf(rows);
      if (b > 0) receivable += b;
      else payable -= b;
    }
    const inCheques = cheques.filter((c) => c.direction === 'ALINAN').reduce((s, c) => s + num(c.amount), 0);
    const outCheques = cheques.filter((c) => c.direction === 'VERILEN').reduce((s, c) => s + num(c.amount), 0);
    const r = (v: number) => Math.round(v * 100) / 100;
    return { receivable: r(receivable), payable: r(payable), chequesIn30: r(inCheques), chequesOut30: r(outCheques) };
  });
}
