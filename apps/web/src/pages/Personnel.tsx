import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, CheckCheck, ChevronLeft, ChevronRight, Clock, Coins, Info, MessageSquare, Plus, Save, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { fmtDate, fmtMoney, fmtNum, fmtQty, toInputDate } from '@/lib/format';
import { ATTENDANCE, WAGE_TYPE } from '@/lib/labels';
import type { Tone } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, SearchBox, Select, Stat, Table, Tabs, cx, useConfirm, type Column } from '@/components/ui';

// ── Tipler
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  nationalId?: string | null;
  iban?: string | null;
  phone?: string | null;
  department: string;
  position?: string | null;
  wageType?: string;
  wage?: string | number;
  startDate?: string;
  endDate?: string | null;
  active?: boolean;
  note?: string | null;
}

export const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;

export const ATT_STYLE: Record<string, { short: string; on: string; dot: string; tone: Tone }> = {
  GELDI: { short: 'Geldi', on: 'bg-emerald-600 text-white ring-emerald-600', dot: 'bg-emerald-500', tone: 'green' },
  YARIM_GUN: { short: 'Yarım', on: 'bg-amber-400 text-ink-900 ring-amber-400', dot: 'bg-amber-400', tone: 'amber' },
  GELMEDI: { short: 'Gelmedi', on: 'bg-red-600 text-white ring-red-600', dot: 'bg-red-500', tone: 'red' },
  IZINLI: { short: 'İzinli', on: 'bg-sky-600 text-white ring-sky-600', dot: 'bg-sky-500', tone: 'blue' },
  RAPORLU: { short: 'Raporlu', on: 'bg-violet-600 text-white ring-violet-600', dot: 'bg-violet-500', tone: 'violet' },
};
const ATT_KEYS = Object.keys(ATT_STYLE);

export const wageText = (e: Employee) => {
  if (e.wage === undefined || e.wage === null) return null;
  const w = Number(e.wage);
  if (!w) return null;
  const suffix = e.wageType === 'GUNLUK' ? ' / gün' : e.wageType === 'AYLIK' ? ' / ay' : '';
  return `${fmtMoney(w)}${suffix}`;
};

const monthStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// ── Personel formu (yeni + düzenle)
export function EmployeeModal({ open, onClose, employee }: { open: boolean; onClose: () => void; employee?: Employee }) {
  const { me, can } = useSession();
  const sensitive = can('personel:hassas');
  const nav = useNavigate();
  const init = () => ({
    firstName: employee?.firstName ?? '',
    lastName: employee?.lastName ?? '',
    phone: employee?.phone ?? '',
    department: employee?.department ?? me.settings.departments?.[0] ?? '',
    position: employee?.position ?? '',
    wageType: employee?.wageType ?? 'AYLIK',
    wage: employee?.wage !== undefined && employee?.wage !== null ? String(Number(employee.wage)) : '',
    startDate: employee?.startDate ? toInputDate(employee.startDate) : toInputDate(),
    nationalId: employee?.nationalId ?? '',
    iban: employee?.iban ?? '',
    note: employee?.note ?? '',
  });
  const [f, setF] = useState(init);
  useEffect(() => {
    if (open) setF(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee?.id]);

  const departments = useMemo(() => {
    const l = [...(me.settings.departments ?? [])];
    if (f.department && !l.includes(f.department)) l.push(f.department);
    return l;
  }, [me.settings.departments, f.department]);
  const positions = useMemo(() => {
    const l = [...(me.settings.positions ?? [])];
    if (f.position && !l.includes(f.position)) l.push(f.position);
    return l;
  }, [me.settings.positions, f.position]);

  const save = useAction(
    () => {
      const body: Record<string, unknown> = {
        firstName: f.firstName,
        lastName: f.lastName,
        phone: f.phone || null,
        department: f.department,
        position: f.position || null,
        wageType: f.wageType,
        startDate: f.startDate || undefined,
        note: f.note || null,
      };
      if (sensitive) {
        body.wage = f.wage ? Number(f.wage.replace(',', '.')) : 0;
        body.nationalId = f.nationalId || null;
        body.iban = f.iban ? f.iban.replace(/\s/g, '').toUpperCase() : null;
      }
      return employee ? api.patch<Employee>(`/personnel/employees/${employee.id}`, body) : api.post<Employee>('/personnel/employees', body);
    },
    {
      success: employee ? 'Personel bilgileri güncellendi.' : 'Personel kaydedildi.',
      invalidate: [['employees'], ['employee'], ['attendance'], ['payroll']],
      onDone: (r) => {
        onClose();
        if (!employee && r?.id) nav(`/personel/${r.id}`);
      },
    },
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={employee ? 'Personel bilgilerini düzenle' : 'Yeni personel'}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button className="btn-primary" form="emp-form" disabled={save.isPending || !f.firstName.trim() || !f.lastName.trim() || !f.department}>Kaydet</button>
        </>
      }
    >
      <form id="emp-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Adı" required>
          <input className="input" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} maxLength={60} required autoFocus={!employee} />
        </Field>
        <Field label="Soyadı" required>
          <input className="input" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} maxLength={60} required />
        </Field>
        <Field label="Bölüm" required>
          {departments.length ? (
            <Select value={f.department} onChange={(v) => setF({ ...f, department: v })} options={departments.map((d) => ({ value: d, label: d }))} required />
          ) : (
            <input className="input" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} maxLength={60} required placeholder="Örn. Dikim" />
          )}
        </Field>
        <Field label="Görevi">
          <Select value={f.position} onChange={(v) => setF({ ...f, position: v })} placeholder="— Seçin —" options={positions.map((d) => ({ value: d, label: d }))} />
        </Field>
        <Field label="Telefon">
          <input className="input" type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} placeholder="05xx xxx xx xx" />
        </Field>
        <Field label="İşe giriş tarihi">
          <input type="date" className="input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
        </Field>
        <Field label="Ücret tipi" className={cx(!sensitive && 'sm:col-span-2')}>
          <Select value={f.wageType} onChange={(v) => setF({ ...f, wageType: v })} options={WAGE_TYPE} />
        </Field>
        {sensitive && (
          <Field label={f.wageType === 'GUNLUK' ? 'Yevmiye (TL / gün)' : f.wageType === 'AYLIK' ? 'Aylık net ücret (TL)' : 'Ücret (parça başı için boş bırakılabilir)'}>
            <input className="input num" inputMode="decimal" value={f.wage} onChange={(e) => setF({ ...f, wage: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="0" />
          </Field>
        )}
        {sensitive && (
          <div className="rounded-2xl bg-ink-50 p-3 ring-1 ring-ink-200 sm:col-span-2">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-600">
              <ShieldCheck className="size-4 text-brand-600" /> Kişisel veriler (KVKK)
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="T.C. kimlik no">
                <input className="input num" inputMode="numeric" value={f.nationalId} onChange={(e) => setF({ ...f, nationalId: e.target.value.replace(/\D/g, '').slice(0, 11) })} placeholder="11 haneli" />
              </Field>
              <Field label="IBAN">
                <input className="input num" value={f.iban} onChange={(e) => setF({ ...f, iban: e.target.value.toUpperCase().slice(0, 34) })} placeholder="TR00 0000 0000 0000 0000 0000 00" />
              </Field>
            </div>
            <p className="mt-2 text-[11px] text-ink-500">
              Bu bilgiler 6698 sayılı KVKK kapsamında kişisel veridir; yalnızca maaş ödemesi ve yasal yükümlülükler için saklanır ve sadece yetkili kullanıcılar görebilir.
            </p>
          </div>
        )}
        <Field label="Not" className="sm:col-span-2">
          <textarea className="input min-h-16" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={1000} />
        </Field>
      </form>
    </Modal>
  );
}

// ── Sayfa
type TabKey = 'personel' | 'puantaj' | 'parca' | 'hakedis';

export default function Personnel() {
  const { can } = useSession();
  const [sp, setSp] = useSearchParams();
  const tabs = [
    can('personel:gor') && { value: 'personel' as TabKey, label: 'Personel' },
    can('personel:gor', 'puantaj:yaz') && { value: 'puantaj' as TabKey, label: 'Puantaj' },
    can('personel:gor', 'uretim:gor') && { value: 'parca' as TabKey, label: 'Parça başı' },
    can('personel:hassas') && { value: 'hakedis' as TabKey, label: 'Hak ediş' },
  ].filter(Boolean) as { value: TabKey; label: string }[];
  const raw = sp.get('tab') as TabKey | null;
  const tab: TabKey = tabs.find((t) => t.value === raw)?.value ?? tabs[0]?.value ?? 'puantaj';
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sp.get('yeni') === '1') {
      if (can('personel:yaz')) setOpen(true);
      const n = new URLSearchParams(sp);
      n.delete('yeni');
      setSp(n, { replace: true });
    }
  }, [sp, setSp, can]);

  const setTab = (v: TabKey) => setSp(new URLSearchParams({ tab: v }), { replace: true });

  return (
    <div>
      <PageHeader
        title="Personel"
        subtitle="Personel kartları, günlük puantaj, parça başı üretim ve aylık hak ediş"
        actions={
          can('personel:yaz') &&
          tab === 'personel' && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <UserPlus className="size-4" /> Yeni personel
            </button>
          )
        }
      />
      {tabs.length > 1 && <Tabs<TabKey> value={tab} onChange={setTab} tabs={tabs} />}
      {tab === 'personel' && <EmployeesTab onNew={() => setOpen(true)} />}
      {tab === 'puantaj' && <AttendanceTab />}
      {tab === 'parca' && <PieceTab />}
      {tab === 'hakedis' && <PayrollTab />}
      <EmployeeModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

// ── Personel listesi
function EmployeesTab({ onNew }: { onNew: () => void }) {
  const { can } = useSession();
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [term, setTerm] = useState('');
  const [dept, setDept] = useState('');
  const q = useQuery({ queryKey: ['employees', status], queryFn: () => api.get<Employee[]>(`/personnel/employees${qs({ status })}`) });
  const all = q.data ?? [];
  const depts = [...new Set(all.map((e) => e.department))].sort((a, b) => a.localeCompare(b, 'tr'));
  const t = term.trim().toLocaleLowerCase('tr-TR');
  const rows = all.filter((e) => (!dept || e.department === dept) && (!t || fullName(e).toLocaleLowerCase('tr-TR').includes(t) || (e.position ?? '').toLocaleLowerCase('tr-TR').includes(t)));
  const showWage = all.some((e) => e.wage !== undefined);

  const cols: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Ad soyad',
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
            {r.firstName[0]}
            {r.lastName[0]}
          </div>
          <div>
            <div className="font-semibold text-ink-900">{fullName(r)}</div>
            {r.active === false && <Badge tone="gray">Ayrıldı{r.endDate ? ` · ${fmtDate(r.endDate)}` : ''}</Badge>}
          </div>
        </div>
      ),
      csv: (r) => fullName(r),
    },
    { key: 'dept', header: 'Bölüm', cell: (r) => r.department, csv: (r) => r.department },
    { key: 'pos', header: 'Görev', cell: (r) => r.position ?? '—', csv: (r) => r.position },
    { key: 'wt', header: 'Ücret tipi', cell: (r) => (r.wageType ? <Badge tone={r.wageType === 'PARCA_BASI' ? 'violet' : r.wageType === 'GUNLUK' ? 'amber' : 'blue'}>{WAGE_TYPE[r.wageType] ?? r.wageType}</Badge> : '—'), csv: (r) => (r.wageType ? WAGE_TYPE[r.wageType] : '') },
    ...(showWage ? [{ key: 'wage', header: 'Ücret', align: 'right' as const, cell: (r: Employee) => wageText(r) ?? '—', csv: (r: Employee) => (r.wage !== undefined ? Number(r.wage) : '') }] : []),
    { key: 'phone', header: 'Telefon', cell: (r) => (r.phone ? <a href={`tel:${r.phone.replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap text-brand-700 hover:underline">{r.phone}</a> : '—'), csv: (r) => r.phone },
    { key: 'start', header: 'İşe giriş', cell: (r) => <span className="whitespace-nowrap">{fmtDate(r.startDate)}</span>, csv: (r) => fmtDate(r.startDate) },
  ];

  return (
    <Card
      bodyClass="p-0"
      title={`${rows.length} personel`}
      actions={
        <>
          <SearchBox value={term} onChange={setTerm} placeholder="İsim veya görev ara…" />
          <Select className="w-36" value={dept} onChange={setDept} placeholder="Tüm bölümler" options={depts.map((d) => ({ value: d, label: d }))} />
          <Select className="w-32" value={status} onChange={setStatus} options={[{ value: '', label: 'Çalışan' }, { value: 'pasif', label: 'Ayrılan' }, { value: 'hepsi', label: 'Hepsi' }]} />
        </>
      }
    >
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <div className="p-4"><ErrorBox error={q.error} /></div>
      ) : (
        <Table
          rows={rows}
          columns={cols}
          rowKey={(r) => r.id}
          csvName="personel-listesi"
          onRowClick={(r) => nav(`/personel/${r.id}`)}
          empty={
            <Empty
              icon={<Users className="size-6" />}
              title={all.length ? 'Filtreye uygun personel yok' : 'Henüz personel kaydı yok'}
              text={all.length ? undefined : 'Puantaj ve hak ediş takibi için önce personeli ekleyin.'}
              action={!all.length && can('personel:yaz') ? <button className="btn-outline btn-sm" onClick={onNew}><Plus className="size-3.5" /> Personel ekle</button> : undefined}
            />
          }
        />
      )}
    </Card>
  );
}

// ── Puantaj
interface AttRow {
  employee: { id: string; firstName: string; lastName: string; department: string; position?: string | null };
  record: { status: string; overtime: string | number; note?: string | null } | null;
}
type Entry = { status: string; overtime: string; note: string };

function shiftDate(s: string, n: number) {
  const d = new Date(`${s}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toInputDate(d);
}

function AttendanceTab() {
  const { can } = useSession();
  const editable = can('puantaj:yaz');
  const today = toInputDate();
  const [date, setDate] = useState(today);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [dirty, setDirty] = useState(false);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['attendance', date], queryFn: () => api.get<AttRow[]>(`/personnel/attendance${qs({ date })}`) });

  useEffect(() => {
    if (!q.data) return;
    const m: Record<string, Entry> = {};
    for (const r of q.data) m[r.employee.id] = { status: r.record?.status ?? '', overtime: r.record && Number(r.record.overtime) ? String(Number(r.record.overtime)) : '', note: r.record?.note ?? '' };
    setEntries(m);
    setDirty(false);
  }, [q.data]);

  const set = (id: string, patch: Partial<Entry>) => {
    setEntries((m) => ({ ...m, [id]: { ...(m[id] ?? { status: '', overtime: '', note: '' }), ...patch } }));
    setDirty(true);
  };

  const rows = q.data ?? [];
  const groups = useMemo(() => {
    const g = new Map<string, AttRow[]>();
    for (const r of rows) g.set(r.employee.department, [...(g.get(r.employee.department) ?? []), r]);
    return [...g.entries()];
  }, [rows]);

  const counts = ATT_KEYS.reduce<Record<string, number>>((a, k) => ({ ...a, [k]: 0 }), {});
  let unmarked = 0;
  for (const r of rows) {
    const s = entries[r.employee.id]?.status;
    if (s) counts[s] = (counts[s] ?? 0) + 1;
    else unmarked++;
  }

  const markAll = () => {
    setEntries((m) => {
      const n = { ...m };
      for (const r of rows) if (!n[r.employee.id]?.status) n[r.employee.id] = { ...(n[r.employee.id] ?? { overtime: '', note: '' }), status: 'GELDI' };
      return n;
    });
    setDirty(true);
  };

  const save = useAction(
    () =>
      api.put('/personnel/attendance', {
        date,
        entries: Object.entries(entries)
          .filter(([, e]) => e.status)
          .map(([employeeId, e]) => ({ employeeId, status: e.status, overtime: Number(e.overtime.replace(',', '.')) || 0, note: e.note || null })),
      }),
    { success: 'Puantaj kaydedildi.', invalidate: [['attendance'], ['payroll'], ['employee']], onDone: () => setDirty(false) },
  );

  const changeDate = (d: string) => {
    if (d > today) return;
    if (dirty && !window.confirm('Kaydedilmemiş değişiklikler var. Yine de tarih değiştirilsin mi?')) return;
    setDate(d);
  };

  const dayName = new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="pb-24">
      <div className="card mb-3 flex flex-wrap items-center gap-2 p-3">
        <button className="btn-outline btn-sm size-9 p-0" onClick={() => changeDate(shiftDate(date, -1))} aria-label="Önceki gün">
          <ChevronLeft className="size-4" />
        </button>
        <input type="date" className="input w-40" value={date} max={today} onChange={(e) => e.target.value && changeDate(e.target.value)} />
        <button className="btn-outline btn-sm size-9 p-0" disabled={date >= today} onClick={() => changeDate(shiftDate(date, 1))} aria-label="Sonraki gün">
          <ChevronRight className="size-4" />
        </button>
        <div className="text-sm font-semibold capitalize text-ink-700">{dayName}</div>
        {date !== today && (
          <button className="btn-ghost btn-sm" onClick={() => changeDate(today)}>
            Bugün
          </button>
        )}
        {editable && rows.length > 0 && (
          <button className="btn-accent ml-auto w-full sm:w-auto" onClick={markAll} disabled={!unmarked}>
            <CheckCheck className="size-4" /> Herkesi geldi işaretle
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {ATT_KEYS.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 ring-1 ring-ink-200">
              <span className={cx('size-2 rounded-full', ATT_STYLE[k].dot)} /> {ATTENDANCE[k]} <span className="num">{counts[k]}</span>
            </span>
          ))}
          {unmarked > 0 && <span className="inline-flex items-center rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-500">İşaretlenmemiş {unmarked}</span>}
        </div>
      )}

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !rows.length ? (
        <Card>
          <Empty icon={<CalendarCheck2 className="size-6" />} title="Aktif personel yok" text="Puantaj tutmak için önce Personel sekmesinden çalışanları ekleyin." />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([dept, list]) => (
            <section key={dept} className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/60 px-4 py-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-ink-600">{dept}</h3>
                <span className="text-xs text-ink-500">{list.filter((r) => entries[r.employee.id]?.status === 'GELDI' || entries[r.employee.id]?.status === 'YARIM_GUN').length} / {list.length} işte</span>
              </div>
              <ul className="divide-y divide-ink-100">
                {list.map((r) => {
                  const e = entries[r.employee.id] ?? { status: '', overtime: '', note: '' };
                  const noteOpen = openNote === r.employee.id;
                  return (
                    <li key={r.employee.id} className="px-3 py-2.5 sm:px-4">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                        <div className="flex min-w-0 items-center justify-between gap-2 lg:w-52">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-ink-900">{fullName(r.employee)}</div>
                            {r.employee.position && <div className="truncate text-[11px] text-ink-500">{r.employee.position}</div>}
                          </div>
                          {!e.status && <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-500 lg:hidden">Girilmedi</span>}
                        </div>
                        <div className="grid flex-1 grid-cols-5 gap-1">
                          {ATT_KEYS.map((k) => (
                            <button
                              key={k}
                              type="button"
                              disabled={!editable}
                              onClick={() => set(r.employee.id, { status: k })}
                              className={cx(
                                'min-h-11 rounded-xl px-1 text-[12px] font-bold ring-1 transition active:scale-95 sm:text-xs',
                                e.status === k ? ATT_STYLE[k].on : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
                                !editable && 'cursor-default',
                              )}
                            >
                              {ATT_STYLE[k].short}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 lg:w-48">
                          <label className="flex flex-1 items-center gap-1 rounded-xl bg-white px-2 ring-1 ring-ink-200 focus-within:ring-2 focus-within:ring-brand-500" title="Fazla mesai (saat)">
                            <Clock className="size-3.5 shrink-0 text-ink-400" />
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={16}
                              step={0.5}
                              disabled={!editable}
                              className="num h-10 w-full border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0"
                              placeholder="Mesai sa."
                              value={e.overtime}
                              onChange={(ev) => set(r.employee.id, { overtime: ev.target.value })}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setOpenNote(noteOpen ? null : r.employee.id)}
                            className={cx('grid size-10 shrink-0 place-items-center rounded-xl ring-1', e.note ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-white text-ink-400 ring-ink-200 hover:text-ink-700')}
                            aria-label="Not"
                            title={e.note || 'Not ekle'}
                          >
                            <MessageSquare className="size-4" />
                          </button>
                        </div>
                      </div>
                      {noteOpen && (
                        <input
                          className="input mt-2"
                          autoFocus
                          disabled={!editable}
                          value={e.note}
                          maxLength={200}
                          placeholder="Not (örn. öğleden sonra hastaneye gitti)"
                          onChange={(ev) => set(r.employee.id, { note: ev.target.value })}
                          onKeyDown={(ev) => ev.key === 'Enter' && setOpenNote(null)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editable && rows.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-3 lg:bottom-4 lg:left-64">
          <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl bg-ink-900/95 px-4 py-2.5 text-white shadow-pop backdrop-blur">
            <div className="min-w-0 flex-1 text-xs">
              {dirty ? <span className="font-semibold text-thread-300">Kaydedilmemiş değişiklik var</span> : <span className="text-ink-300">Puantaj güncel</span>}
              <span className="ml-1 hidden text-ink-300 sm:inline">· {rows.length - unmarked}/{rows.length} kişi işaretli</span>
            </div>
            <button className="btn-accent" disabled={save.isPending || !dirty || rows.length === unmarked} onClick={() => save.mutate()}>
              <Save className="size-4" /> {save.isPending ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Parça başı
interface PieceRow {
  id: string;
  employeeId: string;
  employee?: { id: string; firstName: string; lastName: string };
  workOrder?: { id: string; no: string } | null;
  operation?: { id: string; name: string } | null;
  description?: string | null;
  qty: number;
  rate?: string | number;
  date: string;
}
interface WorkOrderLite { id: string; no: string; color?: string; model?: { code?: string; name?: string } }
interface Operation { id: string; name: string; sequence: number; pieceRate?: string | number }

function PieceTab() {
  const { can } = useSession();
  const { confirm, node } = useConfirm();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return toInputDate(d);
  });
  const [to, setTo] = useState(toInputDate());
  const [employeeId, setEmployeeId] = useState('');
  const emps = useQuery({ queryKey: ['employees', ''], queryFn: () => api.get<Employee[]>('/personnel/employees') });
  const q = useQuery({ queryKey: ['piecework', from, to, employeeId], queryFn: () => api.get<PieceRow[]>(`/production/piecework${qs({ from, to, employeeId })}`) });
  const remove = useAction((id: string) => api.del(`/production/piecework/${id}`), { success: 'Kayıt silindi.', invalidate: [['piecework'], ['payroll'], ['employee']] });

  const rows = q.data ?? [];
  const hasRate = rows.some((r) => r.rate !== undefined);
  const totals = useMemo(() => {
    const m = new Map<string, { id: string; name: string; qty: number; earn: number; count: number }>();
    for (const r of rows) {
      const k = r.employeeId;
      const cur = m.get(k) ?? { id: k, name: r.employee ? fullName(r.employee) : '—', qty: 0, earn: 0, count: 0 };
      cur.qty += r.qty;
      cur.earn += r.qty * Number(r.rate ?? 0);
      cur.count++;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty);
  }, [rows]);
  const grandQty = totals.reduce((s, t) => s + t.qty, 0);
  const grandEarn = totals.reduce((s, t) => s + t.earn, 0);

  const cols: Column<PieceRow>[] = [
    { key: 'date', header: 'Tarih', cell: (r) => <span className="whitespace-nowrap">{fmtDate(r.date)}</span>, csv: (r) => fmtDate(r.date) },
    { key: 'emp', header: 'Personel', cell: (r) => <span className="font-medium">{r.employee ? fullName(r.employee) : '—'}</span>, csv: (r) => (r.employee ? fullName(r.employee) : '') },
    { key: 'wo', header: 'İş emri', cell: (r) => r.workOrder?.no ?? '—', csv: (r) => r.workOrder?.no },
    { key: 'op', header: 'Operasyon / iş', cell: (r) => <span className="text-ink-700">{r.operation?.name ?? r.description ?? '—'}{r.operation && r.description ? <span className="block text-[11px] text-ink-500">{r.description}</span> : null}</span>, csv: (r) => [r.operation?.name, r.description].filter(Boolean).join(' - ') },
    { key: 'qty', header: 'Adet', align: 'right', cell: (r) => <b>{fmtNum(r.qty)}</b>, csv: (r) => r.qty },
    ...(hasRate
      ? [
          { key: 'rate', header: 'Birim ücret', align: 'right' as const, cell: (r: PieceRow) => (r.rate !== undefined ? fmtMoney(r.rate) : '—'), csv: (r: PieceRow) => Number(r.rate ?? 0) },
          { key: 'earn', header: 'Tutar', align: 'right' as const, cell: (r: PieceRow) => (r.rate !== undefined ? <b>{fmtMoney(r.qty * Number(r.rate))}</b> : '—'), csv: (r: PieceRow) => r.qty * Number(r.rate ?? 0) },
        ]
      : []),
  ];
  if (can('uretim:yaz'))
    cols.push({
      key: 'x',
      header: '',
      align: 'right',
      cell: (r) => (
        <button className="btn-ghost btn-sm text-ink-400 hover:text-red-600" title="Sil" onClick={async () => (await confirm(`${r.employee ? fullName(r.employee) : ''} için ${r.qty} adetlik kayıt silinecek.`)) && remove.mutate(r.id)}>
          <Trash2 className="size-4" />
        </button>
      ),
    });

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      {can('uretim:kayit') ? <PieceForm employees={emps.data ?? []} /> : null}
      <div className={cx('space-y-4', !can('uretim:kayit') && 'xl:col-span-2')}>
        <div className="card flex flex-wrap items-end gap-2 p-3">
          <Field label="Başlangıç" className="w-[calc(50%-4px)] sm:w-40">
            <input type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Bitiş" className="w-[calc(50%-4px)] sm:w-40">
            <input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Personel" className="w-full sm:w-56">
            <Select value={employeeId} onChange={setEmployeeId} placeholder="Tüm personel" options={(emps.data ?? []).map((e) => ({ value: e.id, label: fullName(e) }))} />
          </Field>
        </div>

        {totals.length > 0 && (
          <Card title="Personel bazında toplam" subtitle={`${fmtDate(from)} – ${fmtDate(to)}`} bodyClass="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink-100">
                <thead className="bg-ink-50/60">
                  <tr>
                    <th className="th">Personel</th>
                    <th className="th text-right">Kayıt</th>
                    <th className="th text-right">Toplam adet</th>
                    {hasRate && <th className="th text-right">Kazanç</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {totals.map((t) => (
                    <tr key={t.id}>
                      <td className="td font-medium">{t.name}</td>
                      <td className="td num text-right text-ink-500">{t.count}</td>
                      <td className="td num text-right font-semibold">{fmtNum(t.qty)}</td>
                      {hasRate && <td className="td num text-right font-semibold text-emerald-700">{fmtMoney(t.earn)}</td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-ink-50">
                  <tr>
                    <td className="td font-bold">Toplam</td>
                    <td className="td num text-right">{rows.length}</td>
                    <td className="td num text-right font-bold">{fmtNum(grandQty)}</td>
                    {hasRate && <td className="td num text-right font-bold text-emerald-700">{fmtMoney(grandEarn)}</td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}

        <Card title="Parça başı kayıtları" bodyClass="p-0">
          {q.isLoading ? (
            <Loading />
          ) : q.error ? (
            <div className="p-4"><ErrorBox error={q.error} /></div>
          ) : (
            <Table rows={rows} columns={cols} rowKey={(r) => r.id} csvName="parca-basi" dense empty={<Empty icon={<Coins className="size-6" />} title="Bu aralıkta parça başı kaydı yok" text="Operatörlerin yaptığı adetleri girdikçe kazançları burada toplanır." />} />
          )}
        </Card>
      </div>
      {node}
    </div>
  );
}

function PieceForm({ employees }: { employees: Employee[] }) {
  const { can } = useSession();
  const canRate = can('fiyat:gor');
  const empty = { employeeId: '', workOrderId: '', operationId: '', qty: '', rate: '', description: '', date: toInputDate() };
  const [f, setF] = useState(empty);
  const wos = useQuery({ queryKey: ['work-orders', 'open-lite'], queryFn: () => api.get<WorkOrderLite[]>('/production/work-orders?open=1'), enabled: can('uretim:gor') });
  const wo = useQuery({
    queryKey: ['work-order', f.workOrderId],
    queryFn: () => api.get<{ workOrder: { model: { operations: Operation[] } } }>(`/production/work-orders/${f.workOrderId}`),
    enabled: !!f.workOrderId,
  });
  const ops = wo.data?.workOrder.model.operations ?? [];
  const op = ops.find((o) => o.id === f.operationId);
  const defaultRate = op?.pieceRate !== undefined ? Number(op.pieceRate) : undefined;
  const effRate = f.rate ? Number(f.rate.replace(',', '.')) : defaultRate;

  const save = useAction(
    () =>
      api.post('/production/piecework', {
        employeeId: f.employeeId,
        workOrderId: f.workOrderId || null,
        operationId: f.operationId || null,
        qty: Number(f.qty),
        ...(canRate && f.rate ? { rate: Number(f.rate.replace(',', '.')) } : {}),
        description: f.description || null,
        date: f.date || undefined,
      }),
    {
      success: 'Parça başı kaydı eklendi.',
      invalidate: [['piecework'], ['payroll'], ['employee']],
      // Aynı iş emri/operasyonda seri giriş için personeli ve adedi temizle
      onDone: () => setF((p) => ({ ...p, employeeId: '', qty: '', description: '' })),
    },
  );

  return (
    <Card title="Parça başı giriş" subtitle="Operatörün yaptığı adetleri kaydedin" className="self-start">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"
      >
        <Field label="Personel" required>
          <Select value={f.employeeId} onChange={(v) => setF({ ...f, employeeId: v })} placeholder="— Seçin —" required options={employees.filter((e) => e.active !== false).map((e) => ({ value: e.id, label: `${fullName(e)} · ${e.department}` }))} />
        </Field>
        <Field label="Tarih">
          <input type="date" className="input" value={f.date} max={toInputDate()} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="İş emri">
          <Select
            value={f.workOrderId}
            onChange={(v) => setF({ ...f, workOrderId: v, operationId: '', rate: '' })}
            placeholder="— İş emri yok / genel iş —"
            options={(wos.data ?? []).map((w) => ({ value: w.id, label: [w.no, w.model?.code, w.model?.name, w.color].filter(Boolean).join(' · ') }))}
          />
        </Field>
        <Field label="Operasyon" hint={f.workOrderId && !wo.isLoading && !ops.length ? 'Bu modelde tanımlı operasyon yok.' : undefined}>
          <Select
            value={f.operationId}
            onChange={(v) => setF({ ...f, operationId: v, rate: '' })}
            disabled={!f.workOrderId || !ops.length}
            placeholder={f.workOrderId ? (wo.isLoading ? 'Yükleniyor…' : '— Seçin —') : 'Önce iş emri seçin'}
            options={ops.map((o) => ({ value: o.id, label: o.pieceRate !== undefined && Number(o.pieceRate) ? `${o.sequence}. ${o.name} · ${fmtQty(o.pieceRate)} ₺` : `${o.sequence}. ${o.name}` }))}
          />
        </Field>
        <Field label="Adet" required>
          <input className="input num text-lg font-semibold" type="number" inputMode="numeric" min={1} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} required placeholder="0" />
        </Field>
        {canRate && (
          <Field label="Birim ücret (₺/adet)" hint={defaultRate !== undefined ? `Boş bırakılırsa operasyon ücreti: ${fmtQty(defaultRate)} ₺` : 'Operasyon seçilmezse girilmelidir.'}>
            <input className="input num" inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value.replace(/[^\d.,]/g, '') })} placeholder={defaultRate !== undefined ? String(defaultRate) : '0'} />
          </Field>
        )}
        <Field label="Açıklama" className="sm:col-span-2 xl:col-span-1">
          <input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={200} placeholder={f.operationId ? 'İsteğe bağlı' : 'Örn. yaka çevirme'} />
        </Field>
        {canRate && effRate !== undefined && Number(f.qty) > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200 sm:col-span-2 xl:col-span-1">
            <span>Hak edilen</span>
            <b className="num">{fmtMoney(Number(f.qty) * effRate)}</b>
          </div>
        )}
        <button className="btn-primary sm:col-span-2 xl:col-span-1" disabled={save.isPending || !f.employeeId || !(Number(f.qty) > 0)}>
          <Plus className="size-4" /> Kaydı ekle
        </button>
      </form>
    </Card>
  );
}

// ── Hak ediş
const TOTAL_ID = '__toplam__';
interface PayRow {
  employee: { id: string; firstName: string; lastName: string; department: string; wageType: string; wage?: number };
  worked: number;
  paidLeave: number;
  absent: number;
  overtime: number;
  base: number;
  overtimePay: number;
  pieceEarn: number;
  gross: number;
  advances: number;
  net: number;
}

function PayrollTab() {
  const nav = useNavigate();
  const [month, setMonth] = useState(monthStr());
  const q = useQuery({ queryKey: ['payroll', month], queryFn: () => api.get<PayRow[]>(`/personnel/payroll${qs({ month })}`), enabled: /^\d{4}-\d{2}$/.test(month) });
  const rows = q.data ?? [];
  const sum = (k: keyof Omit<PayRow, 'employee'>) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const money = (v: number) => fmtMoney(v);
  const totalRow: PayRow = {
    employee: { id: TOTAL_ID, firstName: 'TOPLAM', lastName: '', department: '', wageType: '' },
    worked: sum('worked'), paidLeave: sum('paidLeave'), absent: sum('absent'), overtime: sum('overtime'),
    base: sum('base'), overtimePay: sum('overtimePay'), pieceEarn: sum('pieceEarn'), gross: sum('gross'), advances: sum('advances'), net: sum('net'),
  };
  const isTotal = (r: PayRow) => r.employee.id === TOTAL_ID;
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(monthStr(new Date(y, m - 1 + n, 1)));
  };

  const cols: Column<PayRow>[] = [
    {
      key: 'name',
      header: 'Personel',
      cell: (r) =>
        isTotal(r) ? (
          <div className="text-xs font-extrabold uppercase tracking-wide text-ink-900">Toplam · {rows.length} kişi</div>
        ) : (
        <div className="min-w-36">
          <div className="font-semibold text-ink-900">{fullName(r.employee)}</div>
          <div className="text-[11px] text-ink-500">{r.employee.department} · {WAGE_TYPE[r.employee.wageType] ?? r.employee.wageType}</div>
        </div>
      ),
      csv: (r) => (isTotal(r) ? 'TOPLAM' : fullName(r.employee)),
    },
    { key: 'dept', header: 'Bölüm', className: 'hidden', cell: () => null, csv: (r) => r.employee.department },
    { key: 'wt', header: 'Ücret tipi', className: 'hidden', cell: () => null, csv: (r) => WAGE_TYPE[r.employee.wageType] ?? r.employee.wageType },
    { key: 'worked', header: 'Çalıştığı gün', align: 'right', cell: (r) => fmtQty(r.worked), csv: (r) => r.worked },
    { key: 'leave', header: 'Ücretli izin/rapor', align: 'right', cell: (r) => fmtQty(r.paidLeave), csv: (r) => r.paidLeave },
    { key: 'absent', header: 'Devamsız', align: 'right', cell: (r) => <span className={cx(r.absent > 0 && 'font-semibold text-red-600')}>{fmtQty(r.absent)}</span>, csv: (r) => r.absent },
    { key: 'ot', header: 'Mesai (sa)', align: 'right', cell: (r) => fmtQty(r.overtime), csv: (r) => r.overtime },
    { key: 'base', header: 'Temel', align: 'right', cell: (r) => money(r.base), csv: (r) => r.base },
    { key: 'otp', header: 'Mesai ücreti', align: 'right', cell: (r) => money(r.overtimePay), csv: (r) => r.overtimePay },
    { key: 'piece', header: 'Parça başı', align: 'right', cell: (r) => money(r.pieceEarn), csv: (r) => r.pieceEarn },
    { key: 'gross', header: 'Brüt hak ediş', align: 'right', cell: (r) => <b>{money(r.gross)}</b>, csv: (r) => r.gross },
    { key: 'adv', header: 'Avans', align: 'right', cell: (r) => (r.advances ? <span className="text-red-600">−{money(r.advances)}</span> : '—'), csv: (r) => r.advances },
    { key: 'net', header: 'Ödenecek', align: 'right', cell: (r) => <b className={cx(r.net < 0 ? 'text-red-600' : 'text-emerald-700')}>{money(r.net)}</b>, csv: (r) => r.net },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        <Info className="mt-0.5 size-4 shrink-0" />
        <div>
          <b>Tahmini hak ediştir, resmi bordro yerine geçmez.</b> Puantaj, fazla mesai (%50 zamlı), parça başı kayıtları ve verilen avanslardan hesaplanır. SGK primi, gelir/damga vergisi ve yasal kesintiler dahil değildir; resmi bordro için mali müşavirinize başvurun.
        </div>
      </div>
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <button className="btn-outline btn-sm size-9 p-0" onClick={() => shift(-1)} aria-label="Önceki ay"><ChevronLeft className="size-4" /></button>
        <input type="month" className="input w-44" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <button className="btn-outline btn-sm size-9 p-0" onClick={() => shift(1)} disabled={month >= monthStr()} aria-label="Sonraki ay"><ChevronRight className="size-4" /></button>
        <span className="text-sm font-semibold capitalize text-ink-700">{new Date(`${month}-15T12:00:00`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</span>
      </div>
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Brüt hak ediş" value={money(sum('gross'))} tone="brand" icon={<Coins className="size-5" />} />
          <Stat label="Verilen avans" value={money(sum('advances'))} tone="amber" />
          <Stat label="Ödenecek (net)" value={money(sum('net'))} tone="green" />
          <Stat label="Toplam fazla mesai" value={`${fmtQty(sum('overtime'))} sa`} tone="violet" icon={<Clock className="size-5" />} />
        </div>
      )}
      <Card bodyClass="p-0" title="Aylık hak ediş tablosu" subtitle={`${rows.length} personel`}>
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <div className="p-4"><ErrorBox error={q.error} /></div>
        ) : (
          <>
            <Table
              rows={rows.length ? [...rows, totalRow] : []}
              columns={cols}
              rowKey={(r) => r.employee.id}
              csvName={`hak-edis-${month}`}
              onRowClick={(r) => r.employee.id !== TOTAL_ID && nav(`/personel/${r.employee.id}`)}
              empty={<Empty title="Bu ay için hesaplanacak personel yok" text="Aktif personel veya bu ay içinde ayrılan personel bulunmuyor." />}
            />
          </>
        )}
      </Card>
    </div>
  );
}
