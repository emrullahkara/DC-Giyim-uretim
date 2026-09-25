import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AttendanceStatus, WageType } from '@prisma/client';
import { prisma } from '../db.js';
import { parse, optText, must, num, date } from '../lib/http.js';
import { need, audit, can } from '../lib/auth.js';
import { badRequest } from '../lib/errors.js';
import { mergeSettings } from '../lib/defaults.js';

const dayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı');
const toDay = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function validTc(tc: string) {
  if (!/^[1-9]\d{10}$/.test(tc)) return false;
  const d = tc.split('').map(Number);
  const c10 = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10;
  const c11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return c10 === d[9] && c11 === d[10];
}

const employeeBody = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  nationalId: z.union([z.string().trim().refine(validTc, 'Geçersiz T.C. kimlik no'), z.literal(''), z.null()]).optional().transform((v) => v || null),
  iban: z.union([z.string().trim().toUpperCase().transform((v) => v.replace(/\s/g, '')).refine((v) => /^TR\d{24}$/.test(v), 'IBAN TR ile başlayan 26 karakter olmalı'), z.literal(''), z.null()]).optional().transform((v) => v || null),
  phone: optText(30),
  department: z.string().trim().min(1).max(60),
  position: optText(60),
  wageType: z.nativeEnum(WageType).default('AYLIK'),
  wage: z.coerce.number().min(0).max(10_000_000).default(0),
  startDate: date.optional(),
  endDate: date.optional().nullable(),
  active: z.boolean().optional(),
  note: optText(1000),
});

export async function personnelRoutes(app: FastifyInstance) {
  app.get('/employees', { preHandler: need('personel:gor', 'uretim:kayit', 'puantaj:yaz') }, async (req) => {
    const q = parse(z.object({ status: z.string().max(10).optional(), q: z.string().max(100).optional() }), req.query);
    const list = await req.db.employee.findMany({
      where: {
        ...(q.status === 'pasif' ? { active: false } : q.status === 'hepsi' ? {} : { active: true }),
        ...(q.q ? { OR: [{ firstName: { contains: q.q, mode: 'insensitive' } }, { lastName: { contains: q.q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: [{ department: 'asc' }, { firstName: 'asc' }],
    });
    // Personel görme yetkisi yoksa (ör. operatör) yalnızca isim/bölüm döner
    if (!can(req, 'personel:gor')) return list.map((e) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName, department: e.department, position: e.position }));
    return list;
  });

  app.get('/employees/:id', { preHandler: need('personel:gor') }, async (req) => {
    const { id } = req.params as { id: string };
    const e = await must(req.db.employee.findFirst({ where: { id } }), 'Personel');
    const [attendance, advances, piece] = await Promise.all([
      req.db.attendance.findMany({ where: { employeeId: id }, orderBy: { date: 'desc' }, take: 62 }),
      req.db.advance.findMany({ where: { employeeId: id }, orderBy: { date: 'desc' }, take: 50 }),
      req.db.pieceWork.findMany({ where: { employeeId: id }, orderBy: { date: 'desc' }, take: 100, include: { workOrder: { select: { no: true } }, operation: { select: { name: true } } } }),
    ]);
    return { employee: e, attendance, advances, piece };
  });

  app.post('/employees', { preHandler: need('personel:yaz') }, async (req) => {
    const body = parse(employeeBody, req.body);
    // Hassas alanlar yalnızca yetkiliyle yazılabilir
    if (!can(req, 'personel:hassas')) {
      delete (body as any).nationalId;
      delete (body as any).iban;
      delete (body as any).wage;
    }
    const e = await req.db.employee.create({ data: body as any });
    await audit(req, 'PERSONEL_EKLE', 'Employee', e.id, { name: `${e.firstName} ${e.lastName}` });
    return e;
  });

  app.patch('/employees/:id', { preHandler: need('personel:yaz') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(employeeBody.partial(), req.body);
    if (!can(req, 'personel:hassas')) {
      delete (body as any).nationalId;
      delete (body as any).iban;
      delete (body as any).wage;
    }
    await must(req.db.employee.findFirst({ where: { id } }), 'Personel');
    const e = await req.db.employee.update({ where: { id }, data: body as any });
    await audit(req, 'PERSONEL_GUNCELLE', 'Employee', id, { fields: Object.keys(body) });
    return e;
  });

  // ── Puantaj (günlük devam)
  app.get('/attendance', { preHandler: need('personel:gor', 'puantaj:yaz') }, async (req) => {
    const q = parse(z.object({ date: dayStr.optional() }), req.query);
    const day = toDay(q.date ?? todayStr());
    const [emps, rows] = await Promise.all([
      req.db.employee.findMany({ where: { active: true }, orderBy: [{ department: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true, department: true, position: true } }),
      req.db.attendance.findMany({ where: { date: day } }),
    ]);
    const map = new Map(rows.map((r) => [r.employeeId, r]));
    return emps.map((e) => ({ employee: e, record: map.get(e.id) ?? null }));
  });

  app.put('/attendance', { preHandler: need('puantaj:yaz') }, async (req) => {
    const body = parse(
      z.object({
        date: dayStr,
        entries: z.array(z.object({ employeeId: z.string().min(1).max(40), status: z.nativeEnum(AttendanceStatus), overtime: z.coerce.number().min(0).max(16).default(0), note: optText(200) })).max(1000),
      }),
      req.body,
    );
    const day = toDay(body.date);
    if (day.getTime() > Date.now() + 86400_000) throw badRequest('İleri tarihli puantaj girilemez.');
    const ids = [...new Set(body.entries.map((e) => e.employeeId))];
    if ((await req.db.employee.count({ where: { id: { in: ids } } })) !== ids.length) throw badRequest('Tanımsız personel.');
    await req.db.$transaction(
      body.entries.map((e) =>
        req.db.attendance.upsert({
          where: { tenantId_employeeId_date: { tenantId: req.auth!.tenantId, employeeId: e.employeeId, date: day } },
          create: { employeeId: e.employeeId, date: day, status: e.status, overtime: e.overtime, note: e.note } as any,
          update: { status: e.status, overtime: e.overtime, note: e.note },
        }),
      ),
    );
    await audit(req, 'PUANTAJ', 'Attendance', null, { date: body.date, count: body.entries.length });
    return { ok: true };
  });

  // ── Avans
  app.post('/advances', { preHandler: need('personel:hassas') }, async (req) => {
    const body = parse(z.object({ employeeId: z.string().min(1).max(40), amount: z.coerce.number().min(1).max(10_000_000), date: date.optional(), note: optText(200) }), req.body);
    await must(req.db.employee.findFirst({ where: { id: body.employeeId } }), 'Personel');
    const a = await req.db.advance.create({ data: body as any });
    await audit(req, 'AVANS', 'Advance', a.id, { employeeId: body.employeeId, amount: body.amount });
    return a;
  });

  app.delete('/advances/:id', { preHandler: need('personel:hassas') }, async (req) => {
    const { id } = req.params as { id: string };
    await must(req.db.advance.findFirst({ where: { id } }), 'Avans');
    await req.db.advance.delete({ where: { id } });
    await audit(req, 'AVANS_SIL', 'Advance', id);
    return { ok: true };
  });

  // ── Aylık hak ediş (tahmini) — resmi bordro değildir
  app.get('/payroll', { preHandler: need('personel:hassas') }, async (req) => {
    const q = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }), req.query);
    const [y, m] = q.month.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: req.auth!.tenantId } });
    const hoursPerDay = mergeSettings(t.settings).workHoursPerDay;
    const [emps, att, adv, piece] = await Promise.all([
      req.db.employee.findMany({ where: { OR: [{ active: true }, { endDate: { gte: from } }] }, orderBy: [{ department: 'asc' }, { firstName: 'asc' }] }),
      req.db.attendance.findMany({ where: { date: { gte: from, lt: to } } }),
      req.db.advance.findMany({ where: { date: { gte: from, lt: to } } }),
      req.db.pieceWork.findMany({ where: { date: { gte: from, lt: to } } }),
    ]);
    return emps.map((e) => {
      const a = att.filter((x) => x.employeeId === e.id);
      const worked = a.reduce((s, x) => s + (x.status === 'GELDI' ? 1 : x.status === 'YARIM_GUN' ? 0.5 : 0), 0);
      const paidLeave = a.filter((x) => x.status === 'IZINLI' || x.status === 'RAPORLU').length;
      const absent = a.filter((x) => x.status === 'GELMEDI').length + a.filter((x) => x.status === 'YARIM_GUN').length * 0.5;
      const overtime = a.reduce((s, x) => s + num(x.overtime), 0);
      const pieceEarn = piece.filter((p) => p.employeeId === e.id).reduce((s, p) => s + p.qty * num(p.rate), 0);
      const advances = adv.filter((x) => x.employeeId === e.id).reduce((s, x) => s + num(x.amount), 0);
      const wage = num(e.wage);
      let base = 0;
      let hourly = 0;
      if (e.wageType === 'AYLIK') {
        base = Math.max(0, wage - (wage / 30) * absent);
        hourly = wage / 225;
      } else if (e.wageType === 'GUNLUK') {
        base = wage * (worked + paidLeave);
        hourly = wage / hoursPerDay;
      } else {
        base = pieceEarn;
        hourly = 0;
      }
      const overtimePay = hourly * 1.5 * overtime;
      const gross = base + overtimePay + (e.wageType !== 'PARCA_BASI' ? pieceEarn : 0);
      const r = (v: number) => Math.round(v * 100) / 100;
      return {
        employee: { id: e.id, firstName: e.firstName, lastName: e.lastName, department: e.department, wageType: e.wageType, wage },
        worked, paidLeave, absent, overtime: r(overtime),
        base: r(base), overtimePay: r(overtimePay), pieceEarn: r(pieceEarn), gross: r(gross), advances: r(advances), net: r(gross - advances),
      };
    });
  });
}
