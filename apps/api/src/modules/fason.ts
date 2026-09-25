import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FasonStatus } from '@prisma/client';
import { nextNo } from '../db.js';
import { parse, listQuery, optText, must, num, date, qty, optDecimal } from '../lib/http.js';
import { need, audit } from '../lib/auth.js';
import { badRequest } from '../lib/errors.js';
import { addStageProgress } from '../lib/production.js';

export function fasonFlags(j: { status: string; dueDate: Date; sentQty: number; receivedQty: number; defectQty: number }) {
  const open = j.status === 'GONDERILDI' || j.status === 'KISMI_DONDU';
  const daysLate = open ? Math.floor((Date.now() - j.dueDate.getTime()) / 86400_000) : 0;
  return {
    open,
    late: open && daysLate > 0,
    daysLate: Math.max(0, daysLate),
    pending: Math.max(0, j.sentQty - j.receivedQty - j.defectQty),
    missing: j.status === 'TAMAMLANDI' ? Math.max(0, j.sentQty - j.receivedQty - j.defectQty) : 0,
  };
}

export async function fasonRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: need('fason:gor') }, async (req) => {
    const q = parse(listQuery.extend({ open: z.enum(['1', '0']).optional(), partyId: z.string().max(40).optional() }), req.query);
    const where: any = {};
    if (q.status && q.status in FasonStatus) where.status = q.status;
    else if (q.open === '1') where.status = { in: ['GONDERILDI', 'KISMI_DONDU'] };
    if (q.partyId) where.partyId = q.partyId;
    if (q.q) where.OR = [{ no: { contains: q.q, mode: 'insensitive' } }, { party: { name: { contains: q.q, mode: 'insensitive' } } }, { dispatchNo: { contains: q.q } }, { workOrder: { no: { contains: q.q, mode: 'insensitive' } } }];
    const list = await req.db.fasonJob.findMany({
      where,
      include: { party: { select: { id: true, name: true, phone: true } }, workOrder: { select: { id: true, no: true, color: true, model: { select: { code: true, name: true } } } } },
      orderBy: [{ dueDate: 'asc' }],
      take: q.take,
      skip: q.skip,
    });
    return list.map((j) => ({ ...j, ...fasonFlags(j), amount: j.unitPrice ? Math.round(num(j.unitPrice) * j.receivedQty * 100) / 100 : null }));
  });

  app.get('/performance', { preHandler: need('fason:gor') }, async (req) => {
    const jobs = await req.db.fasonJob.findMany({ where: { status: { not: 'IPTAL' } }, include: { party: { select: { id: true, name: true, dailyCapacity: true } } } });
    const by: Record<string, any> = {};
    for (const j of jobs) {
      const p = (by[j.partyId] ??= { party: j.party, jobs: 0, open: 0, late: 0, onTime: 0, closed: 0, sent: 0, received: 0, defect: 0, missing: 0, delaySum: 0, openQty: 0 });
      const f = fasonFlags(j);
      p.jobs++;
      p.sent += j.sentQty;
      p.received += j.receivedQty;
      p.defect += j.defectQty;
      p.missing += f.missing;
      if (f.open) {
        p.open++;
        p.openQty += f.pending;
        if (f.late) p.late++;
      } else if (j.completedAt) {
        p.closed++;
        const delay = Math.floor((j.completedAt.getTime() - j.dueDate.getTime()) / 86400_000);
        if (delay <= 0) p.onTime++;
        else p.delaySum += delay;
      }
    }
    return Object.values(by).map((p: any) => {
      const onTimePct = p.closed ? Math.round((p.onTime / p.closed) * 100) : null;
      const defectPct = p.sent ? Math.round((p.defect / p.sent) * 1000) / 10 : 0;
      // Karne puanı: zamanında teslim %60, kalite %40 ağırlık
      const score = onTimePct === null ? null : Math.max(0, Math.round(onTimePct * 0.6 + Math.max(0, 100 - defectPct * 10) * 0.4 - (p.missing > 0 ? 5 : 0)));
      return { ...p, onTimePct, defectPct, avgDelay: p.closed - p.onTime > 0 ? Math.round((p.delaySum / (p.closed - p.onTime)) * 10) / 10 : 0, score };
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  });

  app.get('/:id', { preHandler: need('fason:gor') }, async (req) => {
    const { id } = req.params as { id: string };
    const j = await must(
      req.db.fasonJob.findFirst({
        where: { id },
        include: { party: true, receipts: { orderBy: { date: 'desc' } }, workOrder: { select: { id: true, no: true, color: true, model: { select: { code: true, name: true } } } } },
      }),
      'Fason işi',
    );
    return { ...j, ...fasonFlags(j) };
  });

  app.post('/', { preHandler: need('fason:yaz') }, async (req) => {
    const body = parse(
      z.object({
        partyId: z.string().min(1).max(40),
        workOrderId: z.string().max(40).optional().nullable(),
        stage: z.string().trim().regex(/^[A-Z0-9_]{2,20}$/),
        description: optText(300),
        sentQty: z.coerce.number().int().min(1).max(10_000_000),
        unitPrice: optDecimal,
        sentDate: date.optional(),
        dueDate: date,
        dispatchNo: optText(40),
        note: optText(1000),
      }),
      req.body,
    );
    const party = await must(req.db.party.findFirst({ where: { id: body.partyId } }), 'Fasoncu');
    if (!party.roles.includes('FASONCU')) throw badRequest('Seçilen cari fasoncu olarak tanımlı değil.');
    if (body.workOrderId) {
      const wo = await must(req.db.workOrder.findFirst({ where: { id: body.workOrderId }, include: { stages: true } }), 'İş emri');
      const st = wo.stages.find((s) => s.stage === body.stage);
      if (!st) throw badRequest('İş emrinin rotasında bu aşama yok.');
      await req.db.workOrderStage.update({ where: { id: st.id }, data: { outsourced: true, startedAt: st.startedAt ?? new Date(), status: st.status === 'BEKLIYOR' ? 'DEVAM' : st.status } });
    }
    const no = await nextNo(req.auth!.tenantId, 'FSN');
    const j = await req.db.fasonJob.create({ data: { ...body, no } as any });
    await audit(req, 'FASON_GONDER', 'FasonJob', j.id, { no, party: party.name, qty: body.sentQty });
    return j;
  });

  // Fasondan dönüş (kısmi veya tam)
  app.post('/:id/receipts', { preHandler: need('fason:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(z.object({ qty, defectQty: qty.default(0), dispatchNo: optText(40), note: optText(300), date: date.optional() }), req.body);
    if (body.qty + body.defectQty <= 0) throw badRequest('Dönen adet girin.');
    const j = await must(req.db.fasonJob.findFirst({ where: { id } }), 'Fason işi');
    if (j.status === 'TAMAMLANDI' || j.status === 'IPTAL') throw badRequest('Bu fason işi kapalı.');
    const received = j.receivedQty + body.qty;
    const defect = j.defectQty + body.defectQty;
    if (received + defect > j.sentQty) throw badRequest(`Gönderilenden fazla dönüş girilemez (bekleyen: ${j.sentQty - j.receivedQty - j.defectQty}).`);
    const done = received + defect >= j.sentQty;
    await req.db.$transaction(async (tx) => {
      await tx.fasonReceipt.create({ data: { fasonJobId: id, qty: body.qty, defectQty: body.defectQty, dispatchNo: body.dispatchNo, note: body.note, date: body.date ?? new Date() } as any });
      await tx.fasonJob.update({ where: { id }, data: { receivedQty: received, defectQty: defect, status: done ? 'TAMAMLANDI' : 'KISMI_DONDU', completedAt: done ? new Date() : null } });
      if (j.workOrderId) {
        const st = await tx.workOrderStage.findFirst({ where: { workOrderId: j.workOrderId, stage: j.stage } });
        if (st) await addStageProgress(tx, { stageId: st.id, qty: body.qty, defectQty: body.defectQty, note: `Fason dönüş ${j.no}`, source: 'FASON', user: req.auth!.user });
      }
    });
    await audit(req, 'FASON_DONUS', 'FasonJob', id, { qty: body.qty, defect: body.defectQty });
    return { ok: true };
  });

  // Eksikle kapat / iptal / termin güncelle
  app.patch('/:id', { preHandler: need('fason:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(
      z.object({ action: z.enum(['KAPAT', 'IPTAL', 'GUNCELLE']), dueDate: date.optional(), unitPrice: optDecimal, note: optText(1000) }),
      req.body,
    );
    const j = await must(req.db.fasonJob.findFirst({ where: { id } }), 'Fason işi');
    const data: any = {};
    if (body.action === 'KAPAT') {
      if (j.receivedQty === 0) throw badRequest('Hiç dönüş olmayan işi kapatmak yerine iptal edin.');
      data.status = 'TAMAMLANDI';
      data.completedAt = new Date();
    } else if (body.action === 'IPTAL') {
      if (j.receivedQty > 0) throw badRequest('Dönüşü olan iş iptal edilemez; eksikle kapatın.');
      data.status = 'IPTAL';
    }
    if (body.dueDate) data.dueDate = body.dueDate;
    if (body.unitPrice !== undefined && body.unitPrice !== null) data.unitPrice = body.unitPrice;
    if (body.note !== undefined) data.note = body.note;
    const missing = j.sentQty - j.receivedQty - j.defectQty;
    await req.db.$transaction(async (tx) => {
      await tx.fasonJob.update({ where: { id }, data });
      // Eksikle kapatılan işte kayıp adet, iş emri aşamasına fire olarak yazılır
      if (body.action === 'KAPAT' && missing > 0 && j.workOrderId) {
        const st = await tx.workOrderStage.findFirst({ where: { workOrderId: j.workOrderId, stage: j.stage } });
        if (st) await addStageProgress(tx, { stageId: st.id, qty: 0, defectQty: missing, note: `Fason eksik/kayıp ${j.no}`, source: 'FASON', user: req.auth!.user });
      }
    });
    await audit(req, `FASON_${body.action}`, 'FasonJob', id, { missing: j.sentQty - j.receivedQty - j.defectQty });
    return { ok: true };
  });
}
