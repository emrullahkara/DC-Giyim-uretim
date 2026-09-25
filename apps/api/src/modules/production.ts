import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { WorkOrderStatus } from '@prisma/client';
import { nextNo, prisma } from '../db.js';
import { parse, listQuery, optText, must, num, date, sizeMap, sumSizes, qty, startOfDay, addDays } from '../lib/http.js';
import { need, audit, can } from '../lib/auth.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { addStageProgress, workOrderProgress, finishedOf, refreshWorkOrder, addFinished } from '../lib/production.js';
import { mergeSettings } from '../lib/defaults.js';

const woInclude = {
  model: { select: { id: true, code: true, name: true } },
  order: { select: { id: true, no: true, customer: { select: { id: true, name: true } } } },
  stages: { orderBy: { sequence: 'asc' as const } },
};

export async function productionRoutes(app: FastifyInstance) {
  // ── İş emirleri
  app.get('/work-orders', { preHandler: need('uretim:gor') }, async (req) => {
    const q = parse(listQuery.extend({ open: z.enum(['1', '0']).optional(), stage: z.string().max(20).optional() }), req.query);
    const where: any = {};
    if (q.status && q.status in WorkOrderStatus) where.status = q.status;
    else if (q.open === '1') where.status = { in: ['PLANLANDI', 'DEVAM'] };
    if (q.q) where.OR = [{ no: { contains: q.q, mode: 'insensitive' } }, { model: { code: { contains: q.q, mode: 'insensitive' } } }, { model: { name: { contains: q.q, mode: 'insensitive' } } }, { order: { no: { contains: q.q, mode: 'insensitive' } } }];
    const list = await req.db.workOrder.findMany({ where, include: woInclude, orderBy: [{ dueDate: 'asc' }], take: q.take, skip: q.skip });
    return list.map((w) => {
      const current = w.stages.find((s) => s.status !== 'TAMAM');
      return { ...w, progress: workOrderProgress(w), finished: finishedOf(w), currentStage: current?.stage ?? null, overdue: w.status !== 'TAMAMLANDI' && w.status !== 'IPTAL' && w.dueDate < new Date() };
    }).filter((w) => !q.stage || w.currentStage === q.stage);
  });

  app.get('/work-orders/:id', { preHandler: need('uretim:gor') }, async (req) => {
    const { id } = req.params as { id: string };
    const wo = await must(
      req.db.workOrder.findFirst({
        where: { id },
        include: {
          ...woInclude,
          model: { select: { id: true, code: true, name: true, operations: { orderBy: { sequence: 'asc' } }, materials: { include: { material: { select: { id: true, code: true, name: true, unit: true, type: true } } } } } },
          stages: { orderBy: { sequence: 'asc' }, include: { logs: { orderBy: { createdAt: 'desc' }, take: 50 } } },
          cuttings: { orderBy: { date: 'desc' }, include: { lot: { select: { lotNo: true, rollNo: true } } } },
          fasonJobs: { include: { party: { select: { id: true, name: true } } }, orderBy: { sentDate: 'desc' } },
          qualityChecks: { orderBy: { date: 'desc' } },
        },
      }),
      'İş emri',
    );
    // Kesim verimliliği: reçetedeki kumaş sarfiyatına göre
    const fabric = wo.model.materials.find((m) => m.material.type === 'KUMAS');
    const cutQty = wo.cuttings.reduce((s, c) => s + c.cutQty, 0);
    const used = wo.cuttings.reduce((s, c) => s + num(c.fabricUsed), 0);
    const planned = fabric ? num(fabric.consumption) * cutQty : null;
    return {
      workOrder: wo,
      progress: workOrderProgress(wo),
      finished: finishedOf(wo),
      cutting: { cutQty, used: Math.round(used * 100) / 100, planned: planned !== null ? Math.round(planned * 100) / 100 : null, wastePct: planned ? Math.round(((used - planned) / planned) * 1000) / 10 : null },
    };
  });

  app.post('/work-orders', { preHandler: need('uretim:yaz') }, async (req) => {
    const body = parse(
      z.object({
        modelId: z.string().min(1).max(40),
        color: z.string().trim().min(1).max(40),
        sizes: sizeMap,
        dueDate: date,
        route: z.array(z.string().regex(/^[A-Z0-9_]{2,20}$/)).max(30).optional(),
        note: optText(1000),
      }),
      req.body,
    );
    const model = await must(req.db.styleModel.findFirst({ where: { id: body.modelId } }), 'Model');
    const total = sumSizes(body.sizes);
    if (total <= 0) throw badRequest('Beden adetleri girilmeli.');
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: req.auth!.tenantId } });
    const route = body.route?.length ? body.route : model.route.length ? model.route : mergeSettings(t.settings).defaultRoute;
    const tenantId = req.auth!.tenantId;
    const no = await nextNo(tenantId, 'IE');
    const wo = await req.db.workOrder.create({
      data: {
        no, modelId: model.id, color: body.color, sizes: body.sizes, plannedQty: total, dueDate: body.dueDate, note: body.note,
        stages: { create: route.map((stage, i) => ({ tenantId, stage, sequence: i + 1 })) },
      } as any,
    });
    await audit(req, 'IS_EMRI_EKLE', 'WorkOrder', wo.id, { no });
    return wo;
  });

  app.patch('/work-orders/:id', { preHandler: need('uretim:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(z.object({ dueDate: date.optional(), note: optText(1000), status: z.enum(['IPTAL', 'PLANLANDI']).optional() }), req.body);
    const wo = await must(req.db.workOrder.findFirst({ where: { id } }), 'İş emri');
    if (body.status === 'PLANLANDI' && wo.status !== 'IPTAL') delete body.status;
    await req.db.workOrder.update({ where: { id }, data: body });
    if (body.status === 'PLANLANDI') await req.db.$transaction((tx) => refreshWorkOrder(tx, id));
    await audit(req, 'IS_EMRI_GUNCELLE', 'WorkOrder', id, body);
    return { ok: true };
  });

  // ── Aşama üretim kaydı (atölyeden hızlı giriş)
  app.post('/stages/:id/progress', { preHandler: need('uretim:kayit') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(
      z.object({ qty: qty, defectQty: qty.default(0), sizes: sizeMap.optional().nullable(), note: optText(300) }),
      req.body,
    );
    const stage = await must(req.db.workOrderStage.findFirst({ where: { id } }), 'Aşama');
    if (stage.outsourced && !can(req, 'fason:yaz')) throw badRequest('Bu aşama fasonda; kayıt fason dönüşünden girilir.');
    await req.db.$transaction((tx) =>
      addStageProgress(tx, { stageId: id, qty: body.qty, defectQty: body.defectQty, sizes: body.sizes, note: body.note, user: req.auth!.user }),
    );
    await audit(req, 'URETIM_KAYIT', 'WorkOrderStage', id, { qty: body.qty, defect: body.defectQty, stage: stage.stage });
    return { ok: true };
  });

  // Hatalı kaydı geri al (24 saat içinde)
  app.delete('/logs/:id', { preHandler: need('uretim:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const log = await must(req.db.stageLog.findFirst({ where: { id }, include: { stage: { include: { workOrder: true } } } }), 'Kayıt');
    if (Date.now() - log.createdAt.getTime() > 24 * 3600_000) throw forbidden('24 saatten eski kayıtlar geri alınamaz.');
    if (log.source === 'FASON') throw badRequest('Fason dönüş kaydı, fason ekranından düzeltilir.');
    const st = log.stage;
    const next = await req.db.workOrderStage.findFirst({ where: { workOrderId: st.workOrderId, sequence: st.sequence + 1 } });
    if (next && next.doneQty + next.defectQty > st.doneQty - log.qty) throw badRequest('Sonraki aşamaya geçmiş adetler var; önce onları geri alın.');
    await req.db.$transaction(async (tx) => {
      await tx.workOrderStage.update({ where: { id: st.id }, data: { doneQty: st.doneQty - log.qty, defectQty: st.defectQty - log.defectQty } });
      if (log.sizes) await addFinished(tx, st.workOrder.modelId, st.workOrder.color, log.sizes as Record<string, number>, -1);
      await tx.stageLog.delete({ where: { id } });
      if (st.workOrder.status === 'TAMAMLANDI') await tx.workOrder.update({ where: { id: st.workOrderId }, data: { status: 'DEVAM' } });
      await refreshWorkOrder(tx, st.workOrderId);
    });
    await audit(req, 'URETIM_GERI_AL', 'StageLog', id, { qty: log.qty, stage: st.stage });
    return { ok: true };
  });

  // ── Kesim kaydı
  app.post('/work-orders/:id/cuttings', { preHandler: need('uretim:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(
      z.object({
        materialId: z.string().max(40).optional().nullable(),
        lotId: z.string().max(40).optional().nullable(),
        layers: z.coerce.number().int().min(1).max(1000),
        markerLength: z.coerce.number().min(0).max(1000),
        fabricUsed: z.coerce.number().min(0).max(1_000_000),
        sizes: sizeMap,
        note: optText(300),
      }),
      req.body,
    );
    const wo = await must(req.db.workOrder.findFirst({ where: { id }, include: { stages: { orderBy: { sequence: 'asc' } } } }), 'İş emri');
    const cutQty = sumSizes(body.sizes);
    if (cutQty <= 0) throw badRequest('Kesilen beden adetlerini girin.');
    let materialId = body.materialId ?? null;
    if (body.lotId) {
      const lot = await must(req.db.materialLot.findFirst({ where: { id: body.lotId } }), 'Top / parti');
      materialId = lot.materialId;
    }
    if (materialId) await must(req.db.material.findFirst({ where: { id: materialId } }), 'Kumaş');
    const cutStage = wo.stages.find((s) => s.stage === 'KESIM');
    await req.db.$transaction(async (tx) => {
      await tx.cutting.create({ data: { workOrderId: id, lotId: body.lotId ?? null, materialId, layers: body.layers, markerLength: body.markerLength, fabricUsed: body.fabricUsed, sizes: body.sizes, cutQty, note: body.note } as any });
      if (materialId && body.fabricUsed > 0) {
        const mat = await tx.material.findFirstOrThrow({ where: { id: materialId } });
        if (num(mat.stock) < body.fabricUsed) throw badRequest(`Depoda yeterli kumaş yok (mevcut: ${num(mat.stock)} ${mat.unit}).`);
        await tx.material.update({ where: { id: materialId }, data: { stock: { decrement: body.fabricUsed } } });
        if (body.lotId) {
          const lot = await tx.materialLot.findFirstOrThrow({ where: { id: body.lotId } });
          if (num(lot.remaining) < body.fabricUsed) throw badRequest(`Bu topta yeterli kumaş yok (kalan: ${num(lot.remaining)}).`);
          await tx.materialLot.update({ where: { id: body.lotId }, data: { remaining: { decrement: body.fabricUsed } } });
        }
        await tx.stockMovement.create({ data: { materialId, lotId: body.lotId ?? null, type: 'CIKIS', quantity: -body.fabricUsed, workOrderId: id, docNo: wo.no, note: 'Kesim', userName: req.auth!.user.name } as any });
      }
      if (cutStage) await addStageProgress(tx, { stageId: cutStage.id, qty: cutQty, defectQty: 0, note: `Kesim: ${body.layers} kat`, source: 'KESIM', user: req.auth!.user });
    });
    await audit(req, 'KESIM_KAYIT', 'WorkOrder', id, { cutQty, fabricUsed: body.fabricUsed });
    return { ok: true };
  });

  // ── Parça başı üretim (personel hak edişi)
  app.get('/piecework', { preHandler: need('uretim:gor', 'personel:gor') }, async (req) => {
    const q = parse(z.object({ from: date.optional(), to: date.optional(), employeeId: z.string().max(40).optional() }), req.query);
    const from = q.from ?? addDays(startOfDay(), -7);
    const to = q.to ? addDays(startOfDay(q.to), 1) : addDays(startOfDay(), 1);
    return req.db.pieceWork.findMany({
      where: { date: { gte: from, lt: to }, ...(q.employeeId ? { employeeId: q.employeeId } : {}) },
      include: { employee: { select: { id: true, firstName: true, lastName: true } }, workOrder: { select: { id: true, no: true } }, operation: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
      take: 1000,
    });
  });

  app.post('/piecework', { preHandler: need('uretim:kayit') }, async (req) => {
    const body = parse(
      z.object({
        employeeId: z.string().min(1).max(40),
        workOrderId: z.string().max(40).optional().nullable(),
        operationId: z.string().max(40).optional().nullable(),
        description: optText(200),
        qty: z.coerce.number().int().min(1).max(100000),
        rate: z.coerce.number().min(0).max(100000).optional(),
        date: date.optional(),
      }),
      req.body,
    );
    await must(req.db.employee.findFirst({ where: { id: body.employeeId, active: true } }), 'Personel');
    if (body.workOrderId) await must(req.db.workOrder.findFirst({ where: { id: body.workOrderId } }), 'İş emri');
    let rate = body.rate;
    if (body.operationId) {
      const op = await must(req.db.modelOperation.findFirst({ where: { id: body.operationId } }), 'Operasyon');
      rate ??= num(op.pieceRate);
    }
    // Ücreti yalnızca fiyat görme yetkisi olan değiştirebilir
    if (body.rate !== undefined && !can(req, 'fiyat:gor')) rate = undefined;
    const pw = await req.db.pieceWork.create({ data: { ...body, rate: rate ?? 0 } as any });
    await audit(req, 'PARCA_BASI_KAYIT', 'PieceWork', pw.id, { qty: body.qty });
    return pw;
  });

  app.delete('/piecework/:id', { preHandler: need('uretim:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    await must(req.db.pieceWork.findFirst({ where: { id } }), 'Kayıt');
    await req.db.pieceWork.delete({ where: { id } });
    await audit(req, 'PARCA_BASI_SIL', 'PieceWork', id);
    return { ok: true };
  });

  // ── Atölye panosu: aşama bazında bekleyen işler (kanban)
  app.get('/board', { preHandler: need('uretim:gor') }, async (req) => {
    const list = await req.db.workOrder.findMany({ where: { status: { in: ['PLANLANDI', 'DEVAM'] } }, include: woInclude, orderBy: { dueDate: 'asc' }, take: 500 });
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: req.auth!.tenantId } });
    const settings = mergeSettings(t.settings);
    const columns: Record<string, any[]> = {};
    for (const w of list) {
      const current = w.stages.find((s) => s.status !== 'TAMAM');
      if (!current) continue;
      const prev = w.stages.find((s) => s.sequence === current.sequence - 1);
      const available = (prev ? prev.doneQty : w.plannedQty) - current.doneQty - current.defectQty;
      (columns[current.stage] ??= []).push({
        id: w.id, no: w.no, model: w.model, order: w.order, color: w.color, plannedQty: w.plannedQty, dueDate: w.dueDate,
        stageId: current.id, stageDone: current.doneQty, outsourced: current.outsourced, waiting: Math.max(0, available),
        progress: workOrderProgress(w), overdue: w.dueDate < new Date(),
      });
    }
    return { stages: settings.stages, columns };
  });

  // ── Günlük üretim özeti
  app.get('/daily', { preHandler: need('uretim:gor') }, async (req) => {
    const q = parse(z.object({ days: z.coerce.number().int().min(1).max(90).default(14) }), req.query);
    const from = addDays(startOfDay(), -q.days + 1);
    const logs = await req.db.stageLog.findMany({ where: { createdAt: { gte: from } }, include: { stage: { select: { stage: true } } } });
    const byDay: Record<string, Record<string, number>> = {};
    for (const l of logs) {
      const d = l.createdAt.toISOString().slice(0, 10);
      byDay[d] ??= {};
      byDay[d][l.stage.stage] = (byDay[d][l.stage.stage] ?? 0) + l.qty;
    }
    return byDay;
  });
}
