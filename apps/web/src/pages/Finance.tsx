import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, FileText, HandCoins, Landmark, MoreHorizontal, Plus, Scale, Trash2, Wallet } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { addDaysInput, fmtDate, fmtMoney, fmtShort, toInputDate } from '@/lib/format';
import { CHEQUE_STATUS, PARTY_ROLE, PAY_METHOD, TX_TYPE, statusTone } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, Stat, Table, Tabs, cx, useConfirm, type Column } from '@/components/ui';

// ── Tipler
export interface PartyLite { id: string; name: string; roles?: string[]; phone?: string | null }
export interface Tx {
  id: string;
  partyId: string;
  party?: { id: string; name: string };
  type: string;
  amount?: string | number;
  currency: string;
  method?: string | null;
  date: string;
  dueDate?: string | null;
  docNo?: string | null;
  note?: string | null;
}
export interface Cheque {
  id: string;
  kind: string;
  direction: 'ALINAN' | 'VERILEN';
  partyId: string;
  party?: { id: string; name: string };
  amount?: string | number;
  currency: string;
  dueDate: string;
  bank?: string | null;
  serialNo?: string | null;
  status: string;
  note?: string | null;
  daysLeft?: number;
}

export const TX_HELP: Record<string, string> = {
  SATIS_FATURASI: 'Müşteriye kestiğimiz fatura. Carinin bize borcunu artırır (alacağımız).',
  ALIS_FATURASI: 'Tedarikçiden (kumaş, aksesuar vb.) aldığımız fatura. Bizim borcumuzu artırır.',
  FASON_FATURASI: 'Fasoncunun yaptığı iş için bize kestiği fatura. Bizim borcumuzu artırır.',
  TAHSILAT: 'Müşteriden aldığımız para (nakit, havale, çek…). Alacağımızı azaltır.',
  ODEME: 'Tedarikçiye / fasoncuya yaptığımız ödeme. Borcumuzu azaltır.',
};
const TX_IN = new Set(['SATIS_FATURASI', 'ODEME']);
const CURRENCIES = { TRY: 'TL', USD: 'USD', EUR: 'EUR' };

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));

// ── Aramalı cari seçimi
export function PartyPicker({ value, onChange, parties, required }: { value: string; onChange: (v: string) => void; parties: PartyLite[]; required?: boolean }) {
  const [term, setTerm] = useState('');
  const filtered = useMemo(() => {
    const t = term.trim().toLocaleLowerCase('tr-TR');
    const l = t ? parties.filter((p) => p.name.toLocaleLowerCase('tr-TR').includes(t)) : parties;
    // Seçili cari filtre dışında kalsa bile listede görünsün
    const sel = parties.find((p) => p.id === value);
    return sel && !l.includes(sel) ? [sel, ...l] : l;
  }, [term, parties, value]);
  return (
    <div className="space-y-1.5">
      <input className="input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Cari ara…" />
      <Select
        value={value}
        onChange={onChange}
        required={required}
        placeholder={filtered.length ? '— Cari seçin —' : 'Eşleşen cari yok'}
        options={filtered.map((p) => ({ value: p.id, label: p.roles?.length ? `${p.name} · ${p.roles.map((r) => PARTY_ROLE[r] ?? r).join(', ')}` : p.name }))}
      />
    </div>
  );
}

function useAllParties(enabled = true) {
  return useQuery({ queryKey: ['parties', 'all-lite'], queryFn: () => api.get<PartyLite[]>(`/parties${qs({ take: 500 })}`), enabled, staleTime: 60_000 });
}

// ── Cari hareket formu (Cari detayında da kullanılır)
export function TransactionModal({ open, onClose, partyId: fixedParty, partyName }: { open: boolean; onClose: () => void; partyId?: string; partyName?: string }) {
  const empty = () => ({ partyId: fixedParty ?? '', type: 'TAHSILAT', amount: '', currency: 'TRY', method: 'NAKIT', date: toInputDate(), dueDate: '', docNo: '', note: '' });
  const [f, setF] = useState(empty);
  useEffect(() => {
    if (open) setF(empty());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedParty]);
  const parties = useAllParties(open && !fixedParty);
  const isPayment = f.type === 'TAHSILAT' || f.type === 'ODEME';
  const save = useAction(
    () =>
      api.post('/finance/transactions', {
        partyId: f.partyId,
        type: f.type,
        amount: Number(String(f.amount).replace(',', '.')),
        currency: f.currency,
        method: isPayment ? f.method || null : null,
        date: f.date || undefined,
        dueDate: f.dueDate || null,
        docNo: f.docNo || null,
        note: f.note || null,
      }),
    { success: 'Cari hareket kaydedildi.', invalidate: [['finance'], ['party']], onDone: onClose },
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={partyName ? `Hareket ekle · ${partyName}` : 'Yeni cari hareket'}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button className="btn-primary" form="tx-form" disabled={save.isPending || !f.partyId || !f.amount}>Kaydet</button>
        </>
      }
    >
      <form id="tx-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {!fixedParty && (
          <Field label="Cari" required className="sm:col-span-2">
            <PartyPicker value={f.partyId} onChange={(v) => setF({ ...f, partyId: v })} parties={parties.data ?? []} required />
          </Field>
        )}
        <Field label="Hareket türü" required className="sm:col-span-2" hint={TX_HELP[f.type]}>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {Object.entries(TX_TYPE).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setF({ ...f, type: k })}
                className={cx('rounded-xl px-2 py-2 text-xs font-semibold ring-1 transition', f.type === k ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-ink-700 ring-ink-200 hover:bg-ink-50')}
              >
                {l}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Tutar" required>
          <input className="input num" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="0,00" required />
        </Field>
        <Field label="Para birimi">
          <Select value={f.currency} onChange={(v) => setF({ ...f, currency: v })} options={CURRENCIES} />
        </Field>
        {isPayment && (
          <Field label="Ödeme şekli">
            <Select value={f.method} onChange={(v) => setF({ ...f, method: v })} options={PAY_METHOD} />
          </Field>
        )}
        <Field label="İşlem tarihi">
          <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Vade tarihi" hint={isPayment ? undefined : 'Faturanın ödeme vadesi'}>
          <input type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        </Field>
        <Field label="Belge / fatura no">
          <input className="input" value={f.docNo} onChange={(e) => setF({ ...f, docNo: e.target.value })} maxLength={40} />
        </Field>
        {isPayment && (f.method === 'CEK' || f.method === 'SENET') && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200 sm:col-span-2">
            Çek/senet ile yapılan tahsilat veya ödemeleri vade takibi için <b>Çek / Senet</b> sekmesinden girmeniz önerilir; orada cari hareket de otomatik oluşur.
          </p>
        )}
        <Field label="Açıklama" className="sm:col-span-2">
          <textarea className="input min-h-16" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} />
        </Field>
      </form>
    </Modal>
  );
}

// ── Hareket tablosu (Cari detayında da kullanılır)
export function TransactionTable({ rows, showParty = true, csvName }: { rows: Tx[]; showParty?: boolean; csvName?: string }) {
  const { can } = useSession();
  const { confirm, node } = useConfirm();
  const remove = useAction((id: string) => api.del(`/finance/transactions/${id}`), { success: 'Hareket silindi.', invalidate: [['finance'], ['party']] });
  const cols: Column<Tx>[] = [
    { key: 'date', header: 'Tarih', cell: (r) => <span className="whitespace-nowrap">{fmtDate(r.date)}</span>, csv: (r) => fmtDate(r.date) },
    ...(showParty
      ? [{ key: 'party', header: 'Cari', cell: (r: Tx) => (r.party ? <Link to={`/cariler/${r.party.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-brand-700 hover:underline">{r.party.name}</Link> : '—'), csv: (r: Tx) => r.party?.name }]
      : []),
    {
      key: 'type',
      header: 'Tür',
      cell: (r) => (
        <Badge tone={r.type === 'TAHSILAT' ? 'green' : r.type === 'ODEME' ? 'violet' : r.type === 'SATIS_FATURASI' ? 'blue' : 'amber'}>
          {TX_IN.has(r.type) ? <ArrowUpRight className="size-3" /> : <ArrowDownLeft className="size-3" />}
          {TX_TYPE[r.type] ?? r.type}
        </Badge>
      ),
      csv: (r) => TX_TYPE[r.type] ?? r.type,
    },
    { key: 'amount', header: 'Tutar', align: 'right', cell: (r) => <span className="font-semibold">{r.amount !== undefined ? fmtMoney(r.amount, r.currency) : '—'}</span>, csv: (r) => (r.amount !== undefined ? num(r.amount) : '') },
    { key: 'method', header: 'Ödeme şekli', cell: (r) => (r.method ? PAY_METHOD[r.method] ?? r.method : '—'), csv: (r) => (r.method ? PAY_METHOD[r.method] : '') },
    { key: 'due', header: 'Vade', cell: (r) => (r.dueDate ? fmtDate(r.dueDate) : '—'), csv: (r) => (r.dueDate ? fmtDate(r.dueDate) : '') },
    { key: 'doc', header: 'Belge no', cell: (r) => r.docNo ?? '—', csv: (r) => r.docNo },
    { key: 'note', header: 'Açıklama', cell: (r) => <span className="line-clamp-1 max-w-56 text-ink-600">{r.note ?? ''}</span>, csv: (r) => r.note },
  ];
  if (can('finans:yaz'))
    cols.push({
      key: 'x',
      header: '',
      align: 'right',
      cell: (r) => (
        <button
          className="btn-ghost btn-sm text-ink-400 hover:text-red-600"
          title="Sil"
          onClick={async (e) => {
            e.stopPropagation();
            if (await confirm(`${fmtDate(r.date)} tarihli ${TX_TYPE[r.type] ?? ''} hareketi silinecek. Bakiye yeniden hesaplanır.`)) remove.mutate(r.id);
          }}
        >
          <Trash2 className="size-4" />
        </button>
      ),
    });
  return (
    <>
      <Table rows={rows} columns={cols} rowKey={(r) => r.id} csvName={csvName} empty={<Empty icon={<FileText className="size-6" />} title="Cari hareket yok" text="Fatura, tahsilat ve ödemeler burada listelenir." />} />
      {node}
    </>
  );
}

// ── Çek/senet durum seçenekleri
const chequeActions = (c: Cheque): { status: string; label: string; danger?: boolean }[] =>
  c.direction === 'ALINAN'
    ? [
        { status: 'TAHSIL_EDILDI', label: 'Tahsil edildi' },
        { status: 'CIRO_EDILDI', label: 'Ciro edildi' },
        { status: 'KARSILIKSIZ', label: 'Karşılıksız', danger: true },
        { status: 'IADE', label: 'İade' },
      ]
    : [
        { status: 'ODENDI', label: 'Ödendi' },
        { status: 'IADE', label: 'İade' },
      ];

function DaysLeft({ d }: { d?: number }) {
  if (d === undefined) return null;
  const cls = d < 0 ? 'bg-red-50 text-red-700 ring-red-200' : d <= 7 ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-ink-100 text-ink-600 ring-ink-200';
  const text = d < 0 ? `${-d} gün geçti` : d === 0 ? 'Bugün' : `${d} gün`;
  return <span className={cx('num inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap', cls)}>{text}</span>;
}

export function ChequeStatusMenu({ c }: { c: Cheque }) {
  const [open, setOpen] = useState(false);
  const { confirm, node } = useConfirm();
  const upd = useAction((status: string) => api.patch(`/finance/cheques/${c.id}`, { status }), { success: 'Çek/senet durumu güncellendi.', invalidate: [['finance'], ['party']], onDone: () => setOpen(false) });
  if (c.status !== 'PORTFOYDE') return null;
  return (
    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button className="btn-outline btn-sm" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="size-3.5" /> Durum
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl bg-white py-1 text-left shadow-pop ring-1 ring-ink-200">
            {chequeActions(c).map((a) => (
              <button
                key={a.status}
                disabled={upd.isPending}
                className={cx('block w-full px-3 py-2 text-left text-sm hover:bg-ink-50', a.danger ? 'text-red-600' : 'text-ink-800')}
                onClick={async () => {
                  if (a.danger && !(await confirm('Bu çek/senet karşılıksız olarak işaretlenecek.'))) return;
                  upd.mutate(a.status);
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
      {node}
    </div>
  );
}

function ChequeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const empty = () => ({ kind: 'CEK', direction: 'ALINAN', partyId: '', amount: '', currency: 'TRY', dueDate: addDaysInput(30), bank: '', serialNo: '', note: '', postTransaction: true });
  const [f, setF] = useState(empty);
  useEffect(() => {
    if (open) setF(empty());
  }, [open]);
  const parties = useAllParties(open);
  const save = useAction(
    () =>
      api.post('/finance/cheques', {
        ...f,
        amount: Number(String(f.amount).replace(',', '.')),
        bank: f.bank || null,
        serialNo: f.serialNo || null,
        note: f.note || null,
      }),
    { success: 'Çek/senet portföye eklendi.', invalidate: [['finance'], ['party']], onDone: onClose },
  );
  const kindLabel = f.kind === 'CEK' ? 'çek' : 'senet';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Yeni çek / senet"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button className="btn-primary" form="cheque-form" disabled={save.isPending || !f.partyId || !f.amount}>Kaydet</button>
        </>
      }
    >
      <form
        id="cheque-form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <Field label="Türü">
          <Seg value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: 'CEK', label: 'Çek' }, { value: 'SENET', label: 'Senet' }]} />
        </Field>
        <Field label="Yönü">
          <Seg value={f.direction} onChange={(v) => setF({ ...f, direction: v })} options={[{ value: 'ALINAN', label: 'Alınan' }, { value: 'VERILEN', label: 'Verilen' }]} />
        </Field>
        <Field label={f.direction === 'ALINAN' ? 'Kimden alındı' : 'Kime verildi'} required className="sm:col-span-2">
          <PartyPicker value={f.partyId} onChange={(v) => setF({ ...f, partyId: v })} parties={parties.data ?? []} required />
        </Field>
        <Field label="Tutar" required>
          <input className="input num" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="0,00" required />
        </Field>
        <Field label="Para birimi">
          <Select value={f.currency} onChange={(v) => setF({ ...f, currency: v })} options={CURRENCIES} />
        </Field>
        <Field label="Vade tarihi" required>
          <input type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} required />
        </Field>
        <Field label={f.kind === 'CEK' ? 'Banka' : 'Keşideci / ödeme yeri'}>
          <input className="input" value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} maxLength={80} />
        </Field>
        <Field label={f.kind === 'CEK' ? 'Çek seri no' : 'Senet no'}>
          <input className="input" value={f.serialNo} onChange={(e) => setF({ ...f, serialNo: e.target.value })} maxLength={40} />
        </Field>
        <Field label="Not" className="sm:col-span-2">
          <textarea className="input min-h-16" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} />
        </Field>
        <label className="flex items-start gap-2 rounded-xl bg-ink-50 p-3 text-sm text-ink-700 ring-1 ring-ink-200 sm:col-span-2">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand-700" checked={f.postTransaction} onChange={(e) => setF({ ...f, postTransaction: e.target.checked })} />
          <span>
            <b>Cari hesaba {f.direction === 'ALINAN' ? 'tahsilat' : 'ödeme'} olarak da işle</b>
            <span className="block text-xs text-ink-500">
              {f.direction === 'ALINAN' ? `Müşteriden alınan ${kindLabel} carinin borcundan düşülür.` : `Verilen ${kindLabel} bizim borcumuzdan düşülür.`} Hareketi ayrıca girdiyseniz işareti kaldırın.
            </span>
          </span>
        </label>
      </form>
    </Modal>
  );
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="grid rounded-xl bg-ink-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cx('rounded-lg py-1.5 text-sm font-semibold transition', value === o.value ? 'bg-white text-brand-800 shadow-sm' : 'text-ink-500 hover:text-ink-800')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Sekmeler
type TabKey = 'ozet' | 'hareket' | 'cek';

export default function Finance() {
  const { can } = useSession();
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab');
  const tab: TabKey = raw === 'hareket' || raw === 'cek' ? raw : 'ozet';
  const [txOpen, setTxOpen] = useState(false);
  const [chOpen, setChOpen] = useState(false);

  useEffect(() => {
    if (sp.get('yeni') === '1') {
      if (can('finans:yaz')) {
        if (tab === 'cek') setChOpen(true);
        else setTxOpen(true);
      }
      const n = new URLSearchParams(sp);
      n.delete('yeni');
      if (tab === 'ozet') n.set('tab', 'hareket');
      setSp(n, { replace: true });
    }
  }, [sp, setSp, can, tab]);

  const setTab = (v: TabKey) => setSp(new URLSearchParams({ tab: v }), { replace: true });

  return (
    <div>
      <PageHeader
        title="Finans & Çek"
        subtitle="Cari bakiyeler, fatura/tahsilat hareketleri ve çek-senet portföyü"
        actions={
          can('finans:yaz') && (
            <>
              <button className="btn-outline" onClick={() => setChOpen(true)}>
                <Landmark className="size-4" /> Çek / senet
              </button>
              <button className="btn-primary" onClick={() => setTxOpen(true)}>
                <Plus className="size-4" /> Yeni hareket
              </button>
            </>
          )
        }
      />
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'ozet', label: 'Özet & bakiyeler' },
          { value: 'hareket', label: 'Cari hareketler' },
          { value: 'cek', label: 'Çek / Senet' },
        ]}
      />
      {tab === 'ozet' && <SummaryTab onCheques={() => setTab('cek')} />}
      {tab === 'hareket' && <TxTab />}
      {tab === 'cek' && <ChequeTab onNew={() => setChOpen(true)} />}
      <TransactionModal open={txOpen} onClose={() => setTxOpen(false)} />
      <ChequeModal open={chOpen} onClose={() => setChOpen(false)} />
    </div>
  );
}

function SummaryTab({ onCheques }: { onCheques: () => void }) {
  const nav = useNavigate();
  const sum = useQuery({ queryKey: ['finance', 'summary'], queryFn: () => api.get<{ receivable?: number; payable?: number; chequesIn30: number; chequesOut30: number }>('/finance/summary') });
  const bal = useQuery({ queryKey: ['finance', 'balances'], queryFn: () => api.get<{ party: PartyLite; balance?: number }[]>('/finance/balances') });
  const upcoming = useQuery({ queryKey: ['finance', 'cheques', 'PORTFOYDE', ''], queryFn: () => api.get<Cheque[]>('/finance/cheques') });
  const s = sum.data;
  const net = s && s.receivable !== undefined && s.payable !== undefined ? s.receivable - s.payable : undefined;

  const cols: Column<{ party: PartyLite; balance?: number }>[] = [
    { key: 'name', header: 'Cari', cell: (r) => <span className="font-medium text-ink-900">{r.party.name}</span>, csv: (r) => r.party.name },
    { key: 'roles', header: 'Tür', cell: (r) => <div className="flex flex-wrap gap-1">{(r.party.roles ?? []).map((x) => <Badge key={x} tone={x === 'MUSTERI' ? 'blue' : x === 'FASONCU' ? 'violet' : 'amber'}>{PARTY_ROLE[x] ?? x}</Badge>)}</div>, csv: (r) => (r.party.roles ?? []).map((x) => PARTY_ROLE[x]).join(', ') },
    { key: 'phone', header: 'Telefon', cell: (r) => (r.party.phone ? <a href={`tel:${r.party.phone}`} onClick={(e) => e.stopPropagation()} className="text-brand-700 hover:underline">{r.party.phone}</a> : '—'), csv: (r) => r.party.phone },
    {
      key: 'side',
      header: 'Durum',
      cell: (r) => (r.balance === undefined ? '—' : r.balance > 0 ? <Badge tone="green">Alacağımız</Badge> : <Badge tone="red">Borcumuz</Badge>),
      csv: (r) => (r.balance === undefined ? '' : r.balance > 0 ? 'Alacağımız' : 'Borcumuz'),
    },
    {
      key: 'bal',
      header: 'Bakiye',
      align: 'right',
      cell: (r) => (r.balance === undefined ? '—' : <span className={cx('font-semibold', r.balance > 0 ? 'text-emerald-700' : 'text-red-600')}>{fmtMoney(Math.abs(r.balance))}</span>),
      csv: (r) => r.balance,
    },
  ];

  return (
    <div className="space-y-5">
      {sum.error && <ErrorBox error={sum.error} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Toplam alacağımız" value={s?.receivable !== undefined ? fmtMoney(s.receivable) : '—'} hint="Müşterilerin bize borcu" tone="green" icon={<ArrowDownLeft className="size-5" />} />
        <Stat label="Toplam borcumuz" value={s?.payable !== undefined ? fmtMoney(s.payable) : '—'} hint={net !== undefined ? `Net: ${fmtMoney(net)}` : 'Tedarikçi ve fasoncuya'} tone="red" icon={<ArrowUpRight className="size-5" />} />
        <Stat label="30 gün içinde tahsil edilecek çek/senet" value={s ? fmtMoney(s.chequesIn30) : '—'} tone="blue" icon={<HandCoins className="size-5" />} onClick={onCheques} />
        <Stat label="30 gün içinde ödenecek çek/senet" value={s ? fmtMoney(s.chequesOut30) : '—'} tone="amber" icon={<Landmark className="size-5" />} onClick={onCheques} />
      </div>

      <UpcomingTimeline cheques={upcoming.data ?? []} loading={upcoming.isLoading} />

      <Card title="Cari bakiyeler" subtitle="Sıfır olmayan bakiyeler · pozitif = alacağımız, negatif = borcumuz" bodyClass="p-0">
        {bal.isLoading ? (
          <Loading />
        ) : bal.error ? (
          <div className="p-4"><ErrorBox error={bal.error} /></div>
        ) : (
          <Table
            rows={bal.data ?? []}
            columns={cols}
            rowKey={(r) => r.party.id}
            csvName="cari-bakiyeler"
            onRowClick={(r) => nav(`/cariler/${r.party.id}`)}
            empty={<Empty icon={<Scale className="size-6" />} title="Açık bakiye yok" text="Tüm cari hesaplar kapalı görünüyor. Fatura ve tahsilat girdikçe bakiyeler burada oluşur." />}
          />
        )}
      </Card>
    </div>
  );
}

function UpcomingTimeline({ cheques, loading }: { cheques: Cheque[]; loading: boolean }) {
  const list = cheques.filter((c) => c.status === 'PORTFOYDE' && (c.daysLeft ?? 0) <= 30).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  const overdue = list.filter((c) => (c.daysLeft ?? 0) < 0);
  const coming = list.filter((c) => (c.daysLeft ?? 0) >= 0);
  return (
    <Card title="Yaklaşan vadeler" subtitle="Portföydeki çek ve senetler · önümüzdeki 30 gün" bodyClass="p-4">
      {loading ? (
        <Loading />
      ) : !list.length ? (
        <p className="py-4 text-center text-sm text-ink-500">Önümüzdeki 30 günde vadesi gelen çek/senet yok.</p>
      ) : (
        <div className="space-y-3">
          {overdue.length > 0 && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
              <b>{overdue.length}</b> çek/senedin vadesi geçti ve hâlâ portföyde görünüyor — durumunu güncelleyin.
            </div>
          )}
          <ol className="relative ml-2 border-l-2 border-ink-100">
            {[...overdue, ...coming].map((c) => {
              const d = c.daysLeft ?? 0;
              const dot = d < 0 ? 'bg-red-500' : d <= 7 ? 'bg-amber-400' : 'bg-brand-400';
              return (
                <li key={c.id} className="relative mb-3 pl-5 last:mb-0">
                  <span className={cx('absolute -left-[7px] top-1.5 size-3 rounded-full ring-2 ring-white', dot)} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-ink-900">{fmtShort(c.dueDate)}</span>
                        <DaysLeft d={c.daysLeft} />
                        <Badge tone={c.direction === 'ALINAN' ? 'green' : 'amber'}>{c.direction === 'ALINAN' ? 'Tahsil edilecek' : 'Ödenecek'}</Badge>
                      </div>
                      <div className="truncate text-xs text-ink-500">
                        {c.kind === 'SENET' ? 'Senet' : 'Çek'} · {c.party ? <Link to={`/cariler/${c.party.id}`} className="hover:underline">{c.party.name}</Link> : '—'}
                        {c.bank ? ` · ${c.bank}` : ''}
                      </div>
                    </div>
                    <span className={cx('num text-sm font-bold', c.direction === 'ALINAN' ? 'text-emerald-700' : 'text-red-600')}>
                      {c.direction === 'ALINAN' ? '+' : '−'}
                      {c.amount !== undefined ? fmtMoney(c.amount, c.currency) : '—'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Card>
  );
}

function TxTab() {
  const [type, setType] = useState('');
  const q = useQuery({ queryKey: ['finance', 'transactions', type], queryFn: () => api.get<Tx[]>(`/finance/transactions${qs({ type })}`) });
  return (
    <Card
      title="Cari hareketler"
      subtitle="Son 200 hareket"
      actions={<Select className="w-44" value={type} onChange={setType} placeholder="Tüm hareketler" options={TX_TYPE} />}
      bodyClass="p-0"
    >
      {q.isLoading ? <Loading /> : q.error ? <div className="p-4"><ErrorBox error={q.error} /></div> : <TransactionTable rows={q.data ?? []} csvName="cari-hareketler" />}
    </Card>
  );
}

function ChequeTab({ onNew }: { onNew: () => void }) {
  const { can } = useSession();
  const [direction, setDirection] = useState('');
  const [status, setStatus] = useState('PORTFOYDE');
  const q = useQuery({ queryKey: ['finance', 'cheques', status, direction], queryFn: () => api.get<Cheque[]>(`/finance/cheques${qs({ status, direction })}`) });
  const rows = [...(q.data ?? [])].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const total = (dir: string) => rows.filter((r) => r.direction === dir && r.currency === 'TRY').reduce((s, r) => s + num(r.amount), 0);
  const hasAmounts = rows.some((r) => r.amount !== undefined);

  const cols: Column<Cheque>[] = [
    { key: 'due', header: 'Vade', cell: (r) => <span className="whitespace-nowrap font-medium">{fmtDate(r.dueDate)}</span>, csv: (r) => fmtDate(r.dueDate) },
    { key: 'left', header: 'Kalan', cell: (r) => (r.status === 'PORTFOYDE' ? <DaysLeft d={r.daysLeft} /> : '—'), csv: (r) => r.daysLeft },
    { key: 'kind', header: 'Tür', cell: (r) => <div className="flex gap-1"><Badge>{r.kind === 'SENET' ? 'Senet' : 'Çek'}</Badge><Badge tone={r.direction === 'ALINAN' ? 'green' : 'amber'}>{r.direction === 'ALINAN' ? 'Alınan' : 'Verilen'}</Badge></div>, csv: (r) => `${r.kind === 'SENET' ? 'Senet' : 'Çek'} ${r.direction === 'ALINAN' ? 'Alınan' : 'Verilen'}` },
    { key: 'party', header: 'Cari', cell: (r) => (r.party ? <Link to={`/cariler/${r.party.id}`} className="font-medium text-brand-700 hover:underline">{r.party.name}</Link> : '—'), csv: (r) => r.party?.name },
    { key: 'bank', header: 'Banka / seri no', cell: (r) => <span className="text-ink-600">{[r.bank, r.serialNo].filter(Boolean).join(' · ') || '—'}</span>, csv: (r) => [r.bank, r.serialNo].filter(Boolean).join(' ') },
    { key: 'amount', header: 'Tutar', align: 'right', cell: (r) => <span className="font-semibold">{r.amount !== undefined ? fmtMoney(r.amount, r.currency) : '—'}</span>, csv: (r) => (r.amount !== undefined ? num(r.amount) : '') },
    { key: 'status', header: 'Durum', cell: (r) => <Badge tone={statusTone(r.status)}>{CHEQUE_STATUS[r.status] ?? r.status}</Badge>, csv: (r) => CHEQUE_STATUS[r.status] },
  ];
  if (can('finans:yaz')) cols.push({ key: 'act', header: '', align: 'right', cell: (r) => <ChequeStatusMenu c={r} /> });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-56">
          <Seg value={direction} onChange={setDirection} options={[{ value: '', label: 'Tümü' }, { value: 'ALINAN', label: 'Alınan' }, { value: 'VERILEN', label: 'Verilen' }]} />
        </div>
        <Select className="w-full sm:w-48" value={status} onChange={setStatus} options={[{ value: 'PORTFOYDE', label: 'Portföyde' }, ...Object.entries(CHEQUE_STATUS).filter(([k]) => k !== 'PORTFOYDE').map(([value, label]) => ({ value, label })), { value: 'hepsi', label: 'Hepsi' }]} />
        {hasAmounts && rows.length > 0 && (
          <div className="ml-auto flex flex-wrap gap-3 text-xs text-ink-600">
            {direction !== 'VERILEN' && <span>Alınan: <b className="num text-emerald-700">{fmtMoney(total('ALINAN'))}</b></span>}
            {direction !== 'ALINAN' && <span>Verilen: <b className="num text-red-600">{fmtMoney(total('VERILEN'))}</b></span>}
          </div>
        )}
      </div>
      <Card bodyClass="p-0">
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <div className="p-4"><ErrorBox error={q.error} /></div>
        ) : (
          <Table
            rows={rows}
            columns={cols}
            rowKey={(r) => r.id}
            csvName="cek-senet"
            empty={
              <Empty
                icon={<Wallet className="size-6" />}
                title="Bu filtrede çek/senet yok"
                text="Müşteriden aldığınız ve tedarikçiye verdiğiniz çek-senetleri vade takibi için buraya girin."
                action={can('finans:yaz') ? <button className="btn-outline btn-sm" onClick={onNew}><Plus className="size-3.5" /> Çek / senet ekle</button> : undefined}
              />
            }
          />
        )}
      </Card>
      <p className="flex items-center gap-1.5 text-xs text-ink-500">
        <CalendarClock className="size-3.5" /> Vadesi geçenler kırmızı, 7 gün içinde olanlar sarı gösterilir.
      </p>
    </div>
  );
}
