import type { TenantDb } from '../db.js';
import { badRequest, notFound } from './errors.js';
import { sumSizes } from './http.js';

type Tx = Parameters<Parameters<TenantDb['$transaction']>[0]>[0];

/** Toplam adedi beden oranlarına göre dağıtır (en büyük kalan yöntemi) */
export function distribute(total: number, ratio: Record<string, number>): Record<string, number> {
  const sum = sumSizes(ratio);
  const keys = Object.keys(ratio);
  if (!sum || !keys.length) return {};
  const raw = keys.map((k) => ({ k, v: (total * (ratio[k] || 0)) / sum }));
  const out: Record<string, number> = {};
  let used = 0;
  for (const r of raw) {
    out[r.k] = Math.floor(r.v);
    used += out[r.k];
  }
  raw
    .sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)))
    .slice(0, total - used)
    .forEach((r) => (out[r.k] += 1));
  return out;
}

/**
 * Bir aşamaya üretim kaydı ekler. Kurallar:
 *  - İlk aşama (genelde kesim): iş emri adedinin %50 fazlasını geçemez.
 *  - Sonraki aşamalar: önceki aşamadan çıkan sağlam adedi geçemez (kayıp adet yakalanır).
 *  - Son aşamada sağlam adet mamul stoğa (beden kırılımıyla) girer.
 */
export async function addStageProgress(
  tx: Tx,
  opts: {
    stageId: string;
    qty: number;
    defectQty: number;
    sizes?: Record<string, number> | null;
    note?: string | null;
    source?: string;
    user?: { id: string; name: string };
  },
) {
  const stage = await tx.workOrderStage.findFirst({ where: { id: opts.stageId }, include: { workOrder: true } });
  if (!stage) throw notFound('Aşama');
  const wo = stage.workOrder;
  if (wo.status === 'IPTAL' || wo.status === 'TAMAMLANDI') throw badRequest('Bu iş emri kapalı; kayıt girilemez.');
  if (opts.qty + opts.defectQty <= 0) throw badRequest('Adet girin.');

  const stages = await tx.workOrderStage.findMany({ where: { workOrderId: wo.id }, orderBy: { sequence: 'asc' } });
  const idx = stages.findIndex((s) => s.id === stage.id);
  const prev = idx > 0 ? stages[idx - 1] : null;
  const limit = prev ? prev.doneQty : Math.ceil(wo.plannedQty * 1.5);
  const after = stage.doneQty + stage.defectQty + opts.qty + opts.defectQty;
  if (after > limit) {
    throw badRequest(
      prev
        ? `Bu aşamaya en fazla ${limit - stage.doneQty - stage.defectQty} adet girilebilir (önceki aşamadan çıkan: ${limit}).`
        : `Kesim adedi iş emri adedinin (%50 fazlası dahil) üstüne çıkamaz.`,
    );
  }
  const isLast = idx === stages.length - 1;
  let sizes: Record<string, number> | null = null;
  if (isLast && opts.qty > 0) {
    if (opts.sizes && Object.keys(opts.sizes).length) {
      if (sumSizes(opts.sizes) !== opts.qty) throw badRequest('Beden toplamı, sağlam adetle aynı olmalı.');
      sizes = opts.sizes;
    } else {
      sizes = distribute(opts.qty, wo.sizes as Record<string, number>);
    }
  }

  const doneQty = stage.doneQty + opts.qty;
  const defectQty = stage.defectQty + opts.defectQty;
  const inputQty = prev ? prev.doneQty : wo.plannedQty;
  const complete = doneQty + defectQty >= inputQty && (!prev || prev.status === 'TAMAM');
  await tx.workOrderStage.update({
    where: { id: stage.id },
    data: {
      doneQty,
      defectQty,
      status: complete ? 'TAMAM' : 'DEVAM',
      startedAt: stage.startedAt ?? new Date(),
      finishedAt: complete ? new Date() : null,
    },
  });
  await tx.stageLog.create({
    data: {
      stageId: stage.id,
      qty: opts.qty,
      defectQty: opts.defectQty,
      sizes: sizes ?? undefined,
      source: opts.source ?? 'ATOLYE',
      note: opts.note ?? null,
      userId: opts.user?.id,
      userName: opts.user?.name,
    } as any,
  });

  if (sizes) await addFinished(tx, wo.modelId, wo.color, sizes, 1);
  await refreshWorkOrder(tx, wo.id);
}

export async function addFinished(tx: Tx, modelId: string, color: string, sizes: Record<string, number>, sign: 1 | -1) {
  for (const [size, q] of Object.entries(sizes)) {
    if (!q) continue;
    const existing = await tx.finishedStock.findFirst({ where: { modelId, color, size } });
    if (existing) {
      const next = existing.quantity + sign * q;
      if (next < 0) throw badRequest(`${color} / ${size} için mamul stok yetersiz.`);
      await tx.finishedStock.update({ where: { id: existing.id }, data: { quantity: next } });
    } else {
      if (sign < 0) throw badRequest(`${color} / ${size} için mamul stok yok.`);
      await tx.finishedStock.create({ data: { modelId, color, size, quantity: q } as any });
    }
  }
}

/** Aşama durumlarını ve iş emri/sipariş durumunu yeniden hesaplar */
export async function refreshWorkOrder(tx: Tx, workOrderId: string) {
  const wo = await tx.workOrder.findFirst({ where: { id: workOrderId }, include: { stages: { orderBy: { sequence: 'asc' } } } });
  if (!wo) return;
  // Önceki aşama bittiyse ve bu aşama girdiyi karşıladıysa TAMAM yap (zincirleme)
  let prevDone: number | null = null;
  let prevComplete = true;
  for (const s of wo.stages) {
    const input = prevDone ?? wo.plannedQty;
    const touched = s.doneQty + s.defectQty > 0;
    const complete: boolean = touched && prevComplete && s.doneQty + s.defectQty >= input;
    const status = complete ? 'TAMAM' : touched ? 'DEVAM' : 'BEKLIYOR';
    if (status !== s.status) {
      await tx.workOrderStage.update({ where: { id: s.id }, data: { status, finishedAt: complete ? s.finishedAt ?? new Date() : null } });
    }
    prevDone = s.doneQty;
    prevComplete = complete;
  }
  const anyStarted = wo.stages.some((s) => s.doneQty + s.defectQty > 0);
  const status = wo.status === 'IPTAL' ? 'IPTAL' : prevComplete && anyStarted ? 'TAMAMLANDI' : anyStarted ? 'DEVAM' : 'PLANLANDI';
  if (status !== wo.status) await tx.workOrder.update({ where: { id: wo.id }, data: { status } });
  if (wo.orderId && anyStarted) {
    await tx.order.updateMany({ where: { id: wo.orderId, status: 'ONAYLANDI' }, data: { status: 'URETIMDE' } });
  }
}

/** İş emri ilerleme yüzdesi: aşamaların ortalama tamamlanma oranı */
export function workOrderProgress(wo: { plannedQty: number; stages: { doneQty: number; defectQty: number }[] }) {
  if (!wo.stages.length || !wo.plannedQty) return 0;
  const r = wo.stages.reduce((s, st) => s + Math.min(1, (st.doneQty + st.defectQty) / wo.plannedQty), 0) / wo.stages.length;
  return Math.round(r * 100);
}

export function finishedOf(wo: { stages: { doneQty: number; sequence: number }[] }) {
  if (!wo.stages.length) return 0;
  const last = [...wo.stages].sort((a, b) => b.sequence - a.sequence)[0];
  return last.doneQty;
}
