import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { parse, num, startOfDay, addDays } from '../lib/http.js';
import { need, can } from '../lib/auth.js';
import { mergeSettings } from '../lib/defaults.js';
import { orderInclude, summarize } from './orders.js';
import { fasonFlags } from './fason.js';
import { materialRequirements } from './stock.js';
import { balanceOf } from './parties.js';
import { todayStr } from './personnel.js';

type Level = 'kritik' | 'uyari' | 'bilgi';
interface Alert {
  level: Level;
  module: string;
  title: string;
  detail: string;
  link: string;
  action?: string;
}

const fmtDate = (d: Date) => d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: need('panel:gor') }, async (req) => {
    const db = req.db;
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: req.auth!.tenantId } });
    const settings = mergeSettings(t.settings);
    const A = settings.alerts;
    const today = startOfDay();
    const tomorrow = addDays(today, 1);
    const alerts: Alert[] = [];
    const kpi: Record<string, number | null> = {};
    const out: Record<string, unknown> = { alerts, kpi };

    // ── Siparişler ve termin riski
    if (can(req, 'siparis:gor')) {
      const orders = await db.order.findMany({ where: { status: { notIn: ['TAMAMLANDI', 'IPTAL', 'TASLAK'] } }, include: orderInclude, orderBy: { dueDate: 'asc' }, take: 500 });
      const rows = orders.map((o) => ({ id: o.id, no: o.no, customer: o.customer.name, dueDate: o.dueDate, status: o.status, ...summarize(o, A.dueSoonDays) }));
      kpi.openOrders = rows.length;
      kpi.openQty = rows.reduce((s, r) => s + r.remaining, 0);
      kpi.lateOrders = rows.filter((r) => r.risk === 'GECIKTI').length;
      kpi.riskyOrders = rows.filter((r) => r.risk === 'RISKLI').length;
      out.orders = rows.filter((r) => r.risk !== 'NORMAL').slice(0, 30);
      for (const r of rows) {
        if (r.risk === 'GECIKTI')
          alerts.push({ level: 'kritik', module: 'siparis', title: `${r.no} · ${r.customer} — termin geçti`, detail: `${r.reason}. Kalan ${r.remaining} adet, ilerleme %${r.progress}.`, link: `/siparisler/${r.id}`, action: 'Siparişe git' });
        else if (r.risk === 'RISKLI')
          alerts.push({ level: 'uyari', module: 'siparis', title: `${r.no} · ${r.customer} — yetişmeme riski`, detail: `${r.reason}. Termin ${fmtDate(r.dueDate)}${r.dailyNeeded ? `, günde ${r.dailyNeeded} adet çıkmalı` : ''}.`, link: `/siparisler/${r.id}`, action: 'İncele' });
        else if (r.risk === 'YAKIN')
          alerts.push({ level: 'bilgi', module: 'siparis', title: `${r.no} · ${r.customer} — termin yaklaşıyor`, detail: `${r.reason}, ilerleme %${r.progress}.`, link: `/siparisler/${r.id}` });
      }
    }

    // ── Üretim: bugünkü çıkış, bekleyen aşamalar
    if (can(req, 'uretim:gor')) {
      const [logsToday, openWos] = await Promise.all([
        db.stageLog.findMany({ where: { createdAt: { gte: today, lt: tomorrow } }, include: { stage: { select: { stage: true } } } }),
        db.workOrder.findMany({ where: { status: { in: ['PLANLANDI', 'DEVAM'] } }, include: { stages: { orderBy: { sequence: 'asc' } }, model: { select: { code: true } } } }),
      ]);
      const byStage: Record<string, number> = {};
      for (const l of logsToday) byStage[l.stage.stage] = (byStage[l.stage.stage] ?? 0) + l.qty;
      out.todayByStage = byStage;
      const lastCode = settings.defaultRoute[settings.defaultRoute.length - 1];
      kpi.todayOutput = byStage[lastCode] ?? 0;
      kpi.openWorkOrders = openWos.length;
      const waiting: Record<string, number> = {};
      for (const w of openWos) {
        const cur = w.stages.find((s) => s.status !== 'TAMAM');
        if (!cur) continue;
        const prev = w.stages.find((s) => s.sequence === cur.sequence - 1);
        const avail = (prev ? prev.doneQty : w.plannedQty) - cur.doneQty - cur.defectQty;
        waiting[cur.stage] = (waiting[cur.stage] ?? 0) + Math.max(0, avail);
        if (w.dueDate < today) alerts.push({ level: 'kritik', module: 'uretim', title: `İş emri ${w.no} (${w.model.code} ${w.color}) gecikti`, detail: `${cur.stage} aşamasında bekliyor.`, link: `/uretim/${w.id}`, action: 'Kayıt gir' });
        // Fire kontrolü
        for (const s of w.stages) {
          const total = s.doneQty + s.defectQty;
          if (total >= 20 && (s.defectQty / total) * 100 > A.wasteRatePct)
            alerts.push({ level: 'uyari', module: 'kalite', title: `${w.no} ${s.stage} aşamasında yüksek fire`, detail: `Fire oranı %${Math.round((s.defectQty / total) * 1000) / 10} (sınır %${A.wasteRatePct}).`, link: `/uretim/${w.id}` });
        }
      }
      out.waitingByStage = waiting;
      // Son 14 gün üretim grafiği
      const from = addDays(today, -13);
      const logs = await db.stageLog.findMany({ where: { createdAt: { gte: from } }, include: { stage: { select: { stage: true } } } });
      const days: { date: string; qty: number }[] = [];
      for (let i = 0; i < 14; i++) {
        const d = addDays(from, i);
        const key = d.toISOString().slice(0, 10);
        days.push({ date: key, qty: logs.filter((l) => l.stage.stage === lastCode && startOfDay(l.createdAt).getTime() === d.getTime()).reduce((s, l) => s + l.qty, 0) });
      }
      out.outputTrend = days;
    }

    // ── Fason
    if (can(req, 'fason:gor')) {
      const jobs = await db.fasonJob.findMany({ where: { status: { in: ['GONDERILDI', 'KISMI_DONDU'] } }, include: { party: { select: { name: true, phone: true } } }, orderBy: { dueDate: 'asc' } });
      kpi.fasonOpen = jobs.length;
      kpi.fasonPendingQty = 0;
      let late = 0;
      for (const j of jobs) {
        const f = fasonFlags(j);
        kpi.fasonPendingQty += f.pending;
        if (f.daysLate > A.fasonGraceDays) {
          late++;
          alerts.push({ level: f.daysLate > 3 ? 'kritik' : 'uyari', module: 'fason', title: `${j.party.name} — ${j.no} ${f.daysLate} gün gecikti`, detail: `${j.stage}: ${f.pending} adet bekleniyor${j.party.phone ? ` · Tel: ${j.party.phone}` : ''}.`, link: `/fason/${j.id}`, action: 'Dönüş gir' });
        } else if (Math.ceil((j.dueDate.getTime() - Date.now()) / 86400_000) <= 1) {
          alerts.push({ level: 'bilgi', module: 'fason', title: `${j.party.name} — ${j.no} teslimi yarın/bugün`, detail: `${f.pending} adet bekleniyor.`, link: `/fason/${j.id}` });
        }
      }
      kpi.fasonLate = late;
      // Eksik dönen işler (son 30 gün kapanan)
      const closed = await db.fasonJob.findMany({ where: { status: 'TAMAMLANDI', completedAt: { gte: addDays(today, -30) } }, include: { party: { select: { name: true } } } });
      for (const j of closed) {
        const f = fasonFlags(j);
        if (f.missing > 0) alerts.push({ level: 'uyari', module: 'fason', title: `${j.party.name} — ${j.no} ${f.missing} adet eksik döndü`, detail: `Gönderilen ${j.sentQty}, dönen ${j.receivedQty}, fire ${j.defectQty}. Hesaplaşmada düşülmeli.`, link: `/fason/${j.id}` });
      }
    }

    // ── Depo: kritik stok ve sipariş ihtiyacı
    if (can(req, 'depo:gor')) {
      const mats = await db.material.findMany({ where: { active: true, minStock: { gt: 0 } } });
      const critical = mats.filter((m) => num(m.stock) <= num(m.minStock));
      kpi.criticalStock = critical.length;
      for (const m of critical.slice(0, 10))
        alerts.push({ level: 'uyari', module: 'depo', title: `Kritik stok: ${m.code} ${m.name}${m.color ? ` (${m.color})` : ''}`, detail: `Mevcut ${num(m.stock)} ${m.unit}, minimum ${num(m.minStock)} ${m.unit}.`, link: `/depo/${m.id}`, action: 'Sipariş ver' });
      const reqs = (await materialRequirements(db)).filter((r) => r.shortage > 0);
      kpi.materialShortage = reqs.length;
      out.shortages = reqs.slice(0, 15);
      for (const r of reqs.slice(0, 10))
        alerts.push({ level: 'kritik', module: 'depo', title: `Kumaş/malzeme yetmiyor: ${r.material.code} ${r.material.name}`, detail: `Açık siparişler için ${r.required} ${r.material.unit} gerekli, depoda ${r.stock}. Eksik: ${r.shortage} ${r.material.unit} (${r.orders.slice(0, 3).join(', ')}).`, link: `/depo/${r.material.id}`, action: 'Tedarik planla' });
    }

    // ── Finans: çek/senet vadeleri, alacak
    if (can(req, 'finans:gor')) {
      const limit = addDays(today, A.chequeDays + 1);
      const cheques = await db.cheque.findMany({ where: { status: 'PORTFOYDE', dueDate: { lt: limit } }, include: { party: { select: { name: true } } }, orderBy: { dueDate: 'asc' } });
      for (const c of cheques) {
        const days = Math.ceil((c.dueDate.getTime() - today.getTime()) / 86400_000);
        const amount = num(c.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
        const what = c.direction === 'VERILEN' ? 'Ödenecek' : 'Tahsil edilecek';
        alerts.push({
          level: days < 0 ? 'kritik' : c.direction === 'VERILEN' && days <= 2 ? 'kritik' : 'uyari',
          module: 'finans',
          title: `${what} ${c.kind === 'SENET' ? 'senet' : 'çek'}: ${c.party.name} ${amount} ${c.currency}`,
          detail: days < 0 ? `Vadesi ${-days} gün geçti!` : days === 0 ? 'Vadesi bugün.' : `Vadeye ${days} gün (${fmtDate(c.dueDate)}).`,
          link: '/finans?tab=cek',
          action: 'Durum güncelle',
        });
      }
      const sums = await db.transaction.groupBy({ by: ['partyId', 'type'], _sum: { amount: true } });
      const by: Record<string, typeof sums> = {};
      for (const s of sums) (by[s.partyId] ??= []).push(s);
      let rec = 0;
      let pay = 0;
      for (const rows of Object.values(by)) {
        const b = balanceOf(rows);
        if (b > 0) rec += b;
        else pay -= b;
      }
      out.finance = { receivable: Math.round(rec * 100) / 100, payable: Math.round(pay * 100) / 100, chequesDue: cheques.length };
    }

    // ── Personel: bugünkü devam
    if (can(req, 'personel:gor') || can(req, 'puantaj:yaz')) {
      const day = new Date(`${todayStr()}T00:00:00.000Z`);
      const [active, att] = await Promise.all([db.employee.count({ where: { active: true } }), db.attendance.findMany({ where: { date: day } })]);
      const present = att.filter((a) => a.status === 'GELDI' || a.status === 'YARIM_GUN').length;
      const absent = att.filter((a) => a.status === 'GELMEDI').length;
      kpi.employees = active;
      kpi.present = present;
      kpi.absent = absent;
      out.attendanceEntered = att.length;
      if (active > 0 && att.length === 0 && new Date().getHours() >= 10)
        alerts.push({ level: 'bilgi', module: 'personel', title: 'Bugünün puantajı girilmedi', detail: `${active} aktif personel var.`, link: '/personel?tab=puantaj', action: 'Puantaj gir' });
    }

    // ── Kalite: son 7 gün
    if (can(req, 'kalite:gor')) {
      const qc = await db.qualityCheck.findMany({ where: { date: { gte: addDays(today, -7) } } });
      const checked = qc.reduce((s, c) => s + c.checkedQty, 0);
      const passed = qc.reduce((s, c) => s + c.passedQty, 0);
      kpi.qualityFailRate = checked ? Math.round(((checked - passed) / checked) * 1000) / 10 : null;
    }

    // ── Görevler
    if (can(req, 'gorev:gor')) {
      const tasks = await db.task.findMany({ where: { status: 'ACIK' }, orderBy: [{ dueDate: 'asc' }], take: 50 });
      kpi.openTasks = tasks.length;
      out.tasks = tasks.slice(0, 8);
      for (const tk of tasks) {
        if (tk.dueDate && tk.dueDate < today)
          alerts.push({ level: 'uyari', module: 'gorev', title: `Geciken görev: ${tk.title}`, detail: `${tk.assigneeName ?? 'Atanmamış'} · son tarih ${fmtDate(tk.dueDate)}`, link: '/gorevler' });
      }
    }

    const order: Record<Level, number> = { kritik: 0, uyari: 1, bilgi: 2 };
    alerts.sort((a, b) => order[a.level] - order[b.level]);
    return out;
  });

  // ── Genel arama (üst çubuk)
  app.get('/search', { preHandler: need() }, async (req) => {
    const { q } = parse(z.object({ q: z.string().trim().min(2).max(60) }), req.query);
    const ci = { contains: q, mode: 'insensitive' as const };
    const res: { type: string; label: string; sub?: string; link: string }[] = [];
    const tasks: Promise<void>[] = [];
    if (can(req, 'siparis:gor'))
      tasks.push(req.db.order.findMany({ where: { OR: [{ no: ci }, { customer: { name: ci } }, { customerRef: ci }] }, include: { customer: { select: { name: true } } }, take: 6 }).then((r) => { r.forEach((o) => res.push({ type: 'Sipariş', label: o.no, sub: o.customer.name, link: `/siparisler/${o.id}` })); }));
    if (can(req, 'uretim:gor'))
      tasks.push(req.db.workOrder.findMany({ where: { OR: [{ no: ci }, { model: { code: ci } }] }, include: { model: { select: { code: true, name: true } } }, take: 6 }).then((r) => { r.forEach((w) => res.push({ type: 'İş emri', label: w.no, sub: `${w.model.code} ${w.color}`, link: `/uretim/${w.id}` })); }));
    if (can(req, 'model:gor'))
      tasks.push(req.db.styleModel.findMany({ where: { OR: [{ code: ci }, { name: ci }] }, take: 6 }).then((r) => { r.forEach((m) => res.push({ type: 'Model', label: m.code, sub: m.name, link: `/modeller/${m.id}` })); }));
    if (can(req, 'cari:gor'))
      tasks.push(req.db.party.findMany({ where: { OR: [{ name: ci }, { contactName: ci }] }, take: 6 }).then((r) => { r.forEach((p) => res.push({ type: 'Cari', label: p.name, sub: p.contactName ?? undefined, link: `/cariler/${p.id}` })); }));
    if (can(req, 'fason:gor'))
      tasks.push(req.db.fasonJob.findMany({ where: { OR: [{ no: ci }, { dispatchNo: ci }, { party: { name: ci } }] }, include: { party: { select: { name: true } } }, take: 6 }).then((r) => { r.forEach((j) => res.push({ type: 'Fason', label: j.no, sub: j.party.name, link: `/fason/${j.id}` })); }));
    if (can(req, 'depo:gor'))
      tasks.push(req.db.material.findMany({ where: { OR: [{ code: ci }, { name: ci }] }, take: 6 }).then((r) => { r.forEach((m) => res.push({ type: 'Malzeme', label: m.code, sub: m.name, link: `/depo/${m.id}` })); }));
    if (can(req, 'personel:gor'))
      tasks.push(req.db.employee.findMany({ where: { OR: [{ firstName: ci }, { lastName: ci }] }, take: 6 }).then((r) => { r.forEach((e) => res.push({ type: 'Personel', label: `${e.firstName} ${e.lastName}`, sub: e.department, link: `/personel/${e.id}` })); }));
    await Promise.all(tasks);
    return res;
  });

  // ── Raporlar
  app.get('/reports', { preHandler: need('rapor:gor') }, async (req) => {
    const q = parse(z.object({ from: z.coerce.date(), to: z.coerce.date() }), req.query);
    const from = startOfDay(q.from);
    const to = addDays(startOfDay(q.to), 1);
    if (to.getTime() - from.getTime() > 400 * 86400_000) return { error: 'En fazla 400 günlük aralık' };
    const [logs, fason, shipments, qc, orders] = await Promise.all([
      req.db.stageLog.findMany({ where: { createdAt: { gte: from, lt: to } }, include: { stage: { select: { stage: true, workOrder: { select: { model: { select: { code: true, name: true } } } } } } } }),
      req.db.fasonJob.findMany({ where: { sentDate: { gte: from, lt: to } }, include: { party: { select: { name: true } } } }),
      req.db.shipment.findMany({ where: { date: { gte: from, lt: to } }, include: { lines: true, customer: { select: { name: true } } } }),
      req.db.qualityCheck.findMany({ where: { date: { gte: from, lt: to } } }),
      req.db.order.findMany({ where: { orderDate: { gte: from, lt: to } }, include: { lines: true } }),
    ]);
    const stageTotals: Record<string, { qty: number; defect: number }> = {};
    const modelTotals: Record<string, { code: string; name: string; qty: number }> = {};
    for (const l of logs) {
      const s = (stageTotals[l.stage.stage] ??= { qty: 0, defect: 0 });
      s.qty += l.qty;
      s.defect += l.defectQty;
      const m = l.stage.workOrder.model;
      const mt = (modelTotals[m.code] ??= { code: m.code, name: m.name, qty: 0 });
      if (l.sizes) mt.qty += l.qty;
    }
    const fasonBy: Record<string, { party: string; sent: number; received: number; defect: number; amount: number }> = {};
    for (const j of fason) {
      const f = (fasonBy[j.partyId] ??= { party: j.party.name, sent: 0, received: 0, defect: 0, amount: 0 });
      f.sent += j.sentQty;
      f.received += j.receivedQty;
      f.defect += j.defectQty;
      f.amount += j.receivedQty * num(j.unitPrice);
    }
    const customerBy: Record<string, { customer: string; qty: number; revenue: number }> = {};
    for (const s of shipments) {
      const c = (customerBy[s.customerId] ??= { customer: s.customer.name, qty: 0, revenue: 0 });
      for (const l of s.lines) {
        c.qty += l.quantity;
        c.revenue += l.quantity * num(l.unitPrice);
      }
    }
    const checked = qc.reduce((s, c) => s + c.checkedQty, 0);
    const passed = qc.reduce((s, c) => s + c.passedQty, 0);
    return {
      stageTotals,
      topModels: Object.values(modelTotals).sort((a, b) => b.qty - a.qty).slice(0, 15),
      fason: Object.values(fasonBy).map((f) => ({ ...f, amount: Math.round(f.amount * 100) / 100 })),
      customers: Object.values(customerBy).map((c) => ({ ...c, revenue: Math.round(c.revenue * 100) / 100 })).sort((a, b) => b.qty - a.qty),
      quality: { checked, passed, failRate: checked ? Math.round(((checked - passed) / checked) * 1000) / 10 : 0 },
      orders: { count: orders.length, qty: orders.reduce((s, o) => s + o.lines.reduce((a, l) => a + l.quantity, 0), 0) },
      shippedQty: shipments.reduce((s, x) => s + x.lines.reduce((a, l) => a + l.quantity, 0), 0),
    };
  });
}
