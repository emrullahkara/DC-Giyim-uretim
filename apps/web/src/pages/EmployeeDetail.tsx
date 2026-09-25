import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Banknote, Briefcase, CalendarDays, Coins, CreditCard, HandCoins, IdCard, Pencil, Phone, Plus, Trash2, UserMinus, UserRoundCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { fmtDate, fmtMoney, fmtNum, toInputDate } from '@/lib/format';
import { ATTENDANCE, WAGE_TYPE } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Table, cx, useConfirm, type Column } from '@/components/ui';
import { ATT_STYLE, EmployeeModal, fullName, wageText, type Employee } from './Personnel';

interface AttRec { id: string; date: string; status: string; overtime: string | number; note?: string | null }
interface AdvanceRec { id: string; amount?: string | number; date: string; note?: string | null }
interface PieceRec { id: string; date: string; qty: number; rate?: string | number; description?: string | null; workOrder?: { no: string } | null; operation?: { name: string } | null }
interface Detail { employee: Employee; attendance: AttRec[]; advances: AdvanceRec[]; piece: PieceRec[] }

const dayKey = (v: string | Date) => {
  // Puantaj tarihleri UTC gece yarısı olarak saklanır
  const d = new Date(v);
  return typeof v === 'string' && /T00:00:00(\.000)?Z$/.test(v) ? v.slice(0, 10) : toInputDate(d);
};

export default function EmployeeDetail() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const sensitive = can('personel:hassas');
  const [edit, setEdit] = useState(false);
  const [leave, setLeave] = useState(false);
  const [adv, setAdv] = useState(false);
  const { confirm, node } = useConfirm();
  const q = useQuery({ queryKey: ['employee', id], queryFn: () => api.get<Detail>(`/personnel/employees/${id}`), enabled: !!id });

  const reactivate = useAction(() => api.patch(`/personnel/employees/${id}`, { active: true, endDate: null }), { success: 'Personel yeniden aktif edildi.', invalidate: [['employee', id], ['employees'], ['attendance']] });
  const delAdv = useAction((aid: string) => api.del(`/personnel/advances/${aid}`), { success: 'Avans kaydı silindi.', invalidate: [['employee', id], ['payroll']] });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const { employee: e, attendance, advances, piece } = q.data;
  const active = e.active !== false;

  const back = (
    <Link to="/personel" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-brand-700">
      <ArrowLeft className="size-3.5" /> Personel
    </Link>
  );

  const info: { icon: ReactNode; label: string; value: ReactNode }[] = [
    { icon: <Briefcase />, label: 'Bölüm / görev', value: [e.department, e.position].filter(Boolean).join(' · ') },
    { icon: <Phone />, label: 'Telefon', value: e.phone ? <a href={`tel:${e.phone.replace(/\s/g, '')}`} className="text-brand-700 hover:underline">{e.phone}</a> : null },
    { icon: <CalendarDays />, label: 'İşe giriş', value: fmtDate(e.startDate) + (e.endDate ? ` · Çıkış: ${fmtDate(e.endDate)}` : '') },
    { icon: <Banknote />, label: 'Ücret', value: [e.wageType ? WAGE_TYPE[e.wageType] : null, wageText(e)].filter(Boolean).join(' · ') },
  ];
  if (sensitive) {
    info.push({ icon: <IdCard />, label: 'T.C. kimlik no', value: e.nationalId ? <span className="num">{e.nationalId}</span> : null });
    info.push({ icon: <CreditCard />, label: 'IBAN', value: e.iban ? <span className="num break-all">{e.iban.replace(/(.{4})/g, '$1 ').trim()}</span> : null });
  }

  const advTotal = advances.reduce((s, a) => s + Number(a.amount ?? 0), 0);
  const advCols: Column<AdvanceRec>[] = [
    { key: 'date', header: 'Tarih', cell: (r) => fmtDate(r.date) },
    { key: 'amount', header: 'Tutar', align: 'right', cell: (r) => <b>{r.amount !== undefined ? fmtMoney(r.amount) : '—'}</b> },
    { key: 'note', header: 'Açıklama', cell: (r) => <span className="text-ink-600">{r.note ?? ''}</span> },
    ...(sensitive
      ? [{
          key: 'x',
          header: '',
          align: 'right' as const,
          cell: (r: AdvanceRec) => (
            <button className="btn-ghost btn-sm text-ink-400 hover:text-red-600" title="Sil" onClick={async () => (await confirm(`${fmtDate(r.date)} tarihli ${r.amount !== undefined ? fmtMoney(r.amount) : ''} avans silinecek.`)) && delAdv.mutate(r.id)}>
              <Trash2 className="size-4" />
            </button>
          ),
        }]
      : []),
  ];
  const hasRate = piece.some((p) => p.rate !== undefined);
  const pieceCols: Column<PieceRec>[] = [
    { key: 'date', header: 'Tarih', cell: (r) => fmtDate(r.date) },
    { key: 'wo', header: 'İş emri', cell: (r) => r.workOrder?.no ?? '—' },
    { key: 'op', header: 'Operasyon / iş', cell: (r) => r.operation?.name ?? r.description ?? '—' },
    { key: 'qty', header: 'Adet', align: 'right', cell: (r) => <b>{fmtNum(r.qty)}</b> },
    ...(hasRate
      ? [
          { key: 'rate', header: 'Birim', align: 'right' as const, cell: (r: PieceRec) => (r.rate !== undefined ? fmtMoney(r.rate) : '—') },
          { key: 'earn', header: 'Tutar', align: 'right' as const, cell: (r: PieceRec) => (r.rate !== undefined ? fmtMoney(r.qty * Number(r.rate)) : '—') },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        back={back}
        title={fullName(e)}
        subtitle={
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <span>{[e.department, e.position].filter(Boolean).join(' · ')}</span>
            {active ? <Badge tone="green"><BadgeCheck className="size-3" /> Çalışıyor</Badge> : <Badge tone="gray">Ayrıldı{e.endDate ? ` · ${fmtDate(e.endDate)}` : ''}</Badge>}
          </span>
        }
        actions={
          can('personel:yaz') && (
            <>
              {active ? (
                <button className="btn-outline" onClick={() => setLeave(true)}>
                  <UserMinus className="size-4" /> İşten çıkış
                </button>
              ) : (
                <button className="btn-outline" disabled={reactivate.isPending} onClick={() => reactivate.mutate()}>
                  <UserRoundCheck className="size-4" /> Yeniden aktif yap
                </button>
              )}
              <button className="btn-primary" onClick={() => setEdit(true)}>
                <Pencil className="size-4" /> Düzenle
              </button>
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Personel kartı" className="lg:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-700 text-lg font-bold text-white">
              {e.firstName[0]}
              {e.lastName[0]}
            </div>
            <div>
              <div className="text-lg font-bold text-ink-900">{fullName(e)}</div>
              {e.wageType && <Badge tone={e.wageType === 'PARCA_BASI' ? 'violet' : e.wageType === 'GUNLUK' ? 'amber' : 'blue'}>{WAGE_TYPE[e.wageType]}</Badge>}
            </div>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {info.map((x) => (
              <div key={x.label} className="flex gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-500 [&_svg]:size-4">{x.icon}</div>
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{x.label}</dt>
                  <dd className="text-sm text-ink-800">{x.value || <span className="text-ink-400">—</span>}</dd>
                </div>
              </div>
            ))}
          </dl>
          {e.note && <p className="mt-4 whitespace-pre-line rounded-xl bg-ink-50 px-3 py-2 text-sm text-ink-700">{e.note}</p>}
          {!sensitive && <p className="mt-3 text-[11px] text-ink-400">T.C. kimlik, IBAN ve ücret bilgileri yetkiniz olmadığı için gizlenmiştir (KVKK).</p>}
        </Card>
        <AttendanceSummary attendance={attendance} />
      </div>

      <Card title="Devam takvimi" subtitle="Son 2 ay · günlere dokunarak notu görebilirsiniz">
        <AttendanceCalendar attendance={attendance} />
      </Card>

      {sensitive && (
        <Card
          title="Avanslar"
          subtitle={advances.length ? `Son ${advances.length} kayıt · toplam ${fmtMoney(advTotal)}` : undefined}
          bodyClass="p-0"
          actions={
            active && (
              <button className="btn-accent btn-sm" onClick={() => setAdv(true)}>
                <HandCoins className="size-3.5" /> Avans ver
              </button>
            )
          }
        >
          <Table rows={advances} columns={advCols} rowKey={(r) => r.id} empty={<Empty icon={<HandCoins className="size-6" />} title="Avans kaydı yok" text="Verilen avanslar aylık hak edişten otomatik düşülür." />} />
        </Card>
      )}

      <Card title="Parça başı geçmişi" subtitle="Son 100 kayıt" bodyClass="p-0">
        <Table rows={piece} columns={pieceCols} rowKey={(r) => r.id} dense empty={<Empty icon={<Coins className="size-6" />} title="Parça başı kaydı yok" />} />
      </Card>

      <EmployeeModal open={edit} onClose={() => setEdit(false)} employee={e} />
      <LeaveModal open={leave} onClose={() => setLeave(false)} employee={e} confirm={confirm} />
      <AdvanceModal open={adv} onClose={() => setAdv(false)} employee={e} />
      {node}
    </div>
  );
}

function AttendanceSummary({ attendance }: { attendance: AttRec[] }) {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = attendance.filter((a) => dayKey(a.date).startsWith(ym));
  const c = (s: string) => month.filter((a) => a.status === s).length;
  const ot = month.reduce((s, a) => s + Number(a.overtime || 0), 0);
  return (
    <Card title="Bu ay" subtitle={now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}>
      <div className="grid grid-cols-2 gap-2">
        {Object.keys(ATT_STYLE).map((k) => (
          <div key={k} className="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-600">
              <span className={cx('size-2.5 rounded-full', ATT_STYLE[k].dot)} /> {ATTENDANCE[k]}
            </span>
            <span className="num text-sm font-bold text-ink-900">{c(k)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2">
          <span className="text-xs font-semibold text-brand-700">Fazla mesai</span>
          <span className="num text-sm font-bold text-brand-800">{fmtNum(ot, ot % 1 ? 1 : 0)} sa</span>
        </div>
      </div>
    </Card>
  );
}

function AttendanceCalendar({ attendance }: { attendance: AttRec[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const map = useMemo(() => new Map(attendance.map((a) => [dayKey(a.date), a])), [attendance]);
  const now = new Date();
  const months = [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)];
  const today = toInputDate();
  const selRec = sel ? map.get(sel) : undefined;
  return (
    <div>
      <div className="grid gap-6 md:grid-cols-2">
        {months.map((m) => {
          const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
          const lead = (m.getDay() + 6) % 7; // Pazartesi başlangıç
          const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => toInputDate(new Date(m.getFullYear(), m.getMonth(), i + 1)))];
          return (
            <div key={m.toISOString()}>
              <div className="mb-2 text-sm font-semibold capitalize text-ink-800">{m.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map((d) => (
                  <div key={d} className="text-[10px] font-bold uppercase text-ink-400">{d}</div>
                ))}
                {cells.map((d, i) => {
                  if (!d) return <div key={`e${i}`} />;
                  const r = map.get(d);
                  const st = r ? ATT_STYLE[r.status] : undefined;
                  const ot = r && Number(r.overtime) > 0;
                  const future = d > today;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSel(sel === d ? null : d)}
                      title={r ? `${fmtDate(d)} · ${ATTENDANCE[r.status]}${ot ? ` · ${fmtNum(r.overtime, 1)} sa mesai` : ''}${r.note ? ` · ${r.note}` : ''}` : fmtDate(d)}
                      className={cx(
                        'relative aspect-square rounded-lg text-xs font-semibold transition',
                        st ? st.on : future ? 'bg-transparent text-ink-300' : 'bg-ink-50 text-ink-500 ring-1 ring-inset ring-ink-100',
                        d === today && 'outline-2 outline-offset-1 outline-brand-500',
                        sel === d && 'scale-110 shadow-pop',
                      )}
                    >
                      {Number(d.slice(8))}
                      {ot && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-white/90" />}
                      {r?.note && <span className="absolute bottom-0.5 left-1/2 h-0.5 w-2 -translate-x-1/2 rounded bg-current opacity-70" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {sel && (
        <div className="mt-4 rounded-xl bg-ink-50 px-3 py-2 text-sm text-ink-700">
          <b>{fmtDate(sel)}</b> ·{' '}
          {selRec ? (
            <>
              {ATTENDANCE[selRec.status]}
              {Number(selRec.overtime) > 0 && ` · ${fmtNum(selRec.overtime, 1)} saat fazla mesai`}
              {selRec.note && ` · ${selRec.note}`}
            </>
          ) : (
            'Puantaj girilmemiş'
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-ink-600">
        {Object.keys(ATT_STYLE).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={cx('size-2.5 rounded', ATT_STYLE[k].dot)} /> {ATTENDANCE[k]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded bg-ink-100 ring-1 ring-ink-200" /> Girilmemiş</span>
        <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-ink-500" /> Fazla mesai</span>
      </div>
    </div>
  );
}

function LeaveModal({ open, onClose, employee, confirm }: { open: boolean; onClose: () => void; employee: Employee; confirm: (t: string) => Promise<boolean> }) {
  const [endDate, setEndDate] = useState(toInputDate());
  const save = useAction(() => api.patch(`/personnel/employees/${employee.id}`, { active: false, endDate }), {
    success: 'Personelin işten çıkışı kaydedildi.',
    invalidate: [['employee', employee.id], ['employees'], ['attendance']],
    onDone: onClose,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="İşten çıkış"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button
            className="btn-danger"
            disabled={save.isPending || !endDate}
            onClick={async () => {
              if (await confirm(`${fullName(employee)} ${fmtDate(endDate)} tarihiyle pasife alınacak.`)) save.mutate();
            }}
          >
            <UserMinus className="size-4" /> Çıkışı kaydet
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-700">
          <b>{fullName(employee)}</b> pasife alınır; günlük puantaj listesinde görünmez. Geçmiş puantaj, avans ve parça başı kayıtları saklanır, çıkış ayının hak edişinde yer almaya devam eder.
        </p>
        <Field label="İşten çıkış tarihi" required>
          <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function AdvanceModal({ open, onClose, employee }: { open: boolean; onClose: () => void; employee: Employee }) {
  const [f, setF] = useState({ amount: '', date: toInputDate(), note: '' });
  const save = useAction(
    () => api.post('/personnel/advances', { employeeId: employee.id, amount: Number(f.amount.replace(',', '.')), date: f.date || undefined, note: f.note || null }),
    {
      success: 'Avans kaydedildi.',
      invalidate: [['employee', employee.id], ['payroll']],
      onDone: () => {
        setF({ amount: '', date: toInputDate(), note: '' });
        onClose();
      },
    },
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Avans ver · ${fullName(employee)}`}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button className="btn-primary" form="adv-form" disabled={save.isPending || !(Number(f.amount.replace(',', '.')) >= 1)}>
            <Plus className="size-4" /> Kaydet
          </button>
        </>
      }
    >
      <form
        id="adv-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          save.mutate();
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <Field label="Tutar (₺)" required>
          <input className="input num text-lg font-semibold" inputMode="decimal" autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="0" required />
        </Field>
        <Field label="Tarih">
          <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Açıklama" className="sm:col-span-2">
          <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={200} placeholder="Örn. bayram öncesi avans" />
        </Field>
        <p className="text-xs text-ink-500 sm:col-span-2">Verilen avans, ilgili ayın tahmini hak edişinden otomatik düşülür.</p>
      </form>
    </Modal>
  );
}
