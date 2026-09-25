import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { addDaysInput, fmtDate, fmtMoney, fmtNum } from '@/lib/format';
import { ORDER_STATUS, ORDER_TYPE, RISK, statusTone } from '@/lib/labels';
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader, Progress, SearchBox, Select, SizeGrid, Table, Tabs, Empty, type Column } from '@/components/ui';

type Row = {
  id: string; no: string; type: string; status: string; dueDate: string; orderDate: string; priority: number; customer: { name: string };
  models: string; total: number; shipped: number; finished: number; progress: number; expected: number; risk: string; reason: string;
  daysLeft: number; amount?: number; currency: string; customerRef: string | null; dailyNeeded: number | null;
};

export default function Orders() {
  const { can } = useSession();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'acik' | 'hepsi' | 'riskli'>('acik');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [newOpen, setNewOpen] = useState(params.get('yeni') === '1');
  useEffect(() => {
    if (params.get('yeni') === '1') setNewOpen(true);
  }, [params]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['orders', tab, q, type],
    queryFn: () => api.get<Row[]>(`/orders${qs({ open: tab !== 'hepsi' ? '1' : undefined, q, type, take: 300 })}`),
  });
  const rows = (data ?? []).filter((r) => tab !== 'riskli' || r.risk === 'GECIKTI' || r.risk === 'RISKLI');

  const cols: Column<Row>[] = [
    { key: 'no', header: 'Sipariş', cell: (r) => (<div><div className="font-semibold text-ink-900">{r.no}</div><div className="text-xs text-ink-500">{r.customerRef ?? ORDER_TYPE[r.type]}</div></div>), csv: (r) => r.no },
    { key: 'cust', header: 'Müşteri', cell: (r) => <span className="font-medium">{r.customer.name}</span>, csv: (r) => r.customer.name },
    { key: 'models', header: 'Model', cell: (r) => <span className="text-ink-600">{r.models}</span>, csv: (r) => r.models },
    { key: 'qty', header: 'Adet', align: 'right', cell: (r) => fmtNum(r.total), csv: (r) => r.total },
    {
      key: 'prog', header: 'İlerleme', className: 'min-w-40',
      cell: (r) => (
        <div>
          <div className="flex items-center gap-2"><Progress value={r.progress} expected={r.status === 'TAMAMLANDI' ? undefined : r.expected} tone={r.risk === 'GECIKTI' ? 'red' : r.risk === 'RISKLI' ? 'amber' : undefined} /><span className="num w-9 text-right text-xs font-semibold">%{r.progress}</span></div>
          <div className="mt-0.5 text-[11px] text-ink-500">Paket {fmtNum(r.finished)} · Sevk {fmtNum(r.shipped)}</div>
        </div>
      ),
      csv: (r) => r.progress,
    },
    {
      key: 'due', header: 'Termin',
      cell: (r) => (<div><div className="num">{fmtDate(r.dueDate)}</div>{r.status !== 'TAMAMLANDI' && r.status !== 'IPTAL' && <div className={r.daysLeft < 0 ? 'text-xs font-semibold text-red-600' : r.daysLeft <= 3 ? 'text-xs font-semibold text-amber-600' : 'text-xs text-ink-500'}>{r.daysLeft < 0 ? `${-r.daysLeft} gün geçti` : r.daysLeft === 0 ? 'bugün' : `${r.daysLeft} gün kaldı`}</div>}</div>),
      csv: (r) => fmtDate(r.dueDate),
    },
    { key: 'risk', header: 'Durum', cell: (r) => (<div className="flex flex-col items-start gap-1"><Badge tone={statusTone(r.status)}>{ORDER_STATUS[r.status]}</Badge>{r.risk !== 'NORMAL' && r.risk !== 'KAPALI' && <Badge tone={RISK[r.risk].tone} className="max-w-48 truncate">{r.reason || RISK[r.risk].label}</Badge>}</div>), csv: (r) => `${ORDER_STATUS[r.status]} ${r.reason}` },
    ...(can('fiyat:gor') ? [{ key: 'amount', header: 'Tutar', align: 'right' as const, cell: (r: Row) => fmtMoney(r.amount, r.currency), csv: (r: Row) => r.amount }] : []),
  ];

  const closeNew = () => {
    setNewOpen(false);
    if (params.get('yeni')) {
      params.delete('yeni');
      setParams(params, { replace: true });
    }
  };

  return (
    <div>
      <PageHeader
        title="Siparişler"
        subtitle="Mağaza siparişleri ve markalardan gelen fason işler — termin riskiyle birlikte"
        actions={can('siparis:yaz') && <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus className="size-4" /> Yeni sipariş</button>}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'acik', label: 'Açık' }, { value: 'riskli', label: 'Geciken / riskli' }, { value: 'hepsi', label: 'Tümü' }]} />
        <div className="mb-4 flex flex-wrap gap-2">
          <Select className="w-44" value={type} onChange={setType} options={ORDER_TYPE} placeholder="Tüm sipariş türleri" />
          <SearchBox value={q} onChange={setQ} placeholder="No, müşteri, müşteri ref…" />
        </div>
      </div>
      <Card bodyClass="p-0">
        {isLoading ? <Loading /> : error ? <div className="p-4"><ErrorBox error={error} /></div> : (
          <Table
            rows={rows}
            columns={cols}
            rowKey={(r) => r.id}
            onRowClick={(r) => nav(`/siparisler/${r.id}`)}
            csvName="siparisler"
            empty={<Empty title="Sipariş bulunamadı" text="Yeni sipariş ekleyerek başlayın. Sipariş, beden asortisiyle girilir; iş emirleri tek tıkla oluşur." />}
          />
        )}
      </Card>
      {newOpen && <NewOrder onClose={closeNew} onCreated={(id) => nav(`/siparisler/${id}`)} />}
    </div>
  );
}

interface Line { modelId: string; color: string; sizes: Record<string, number>; unitPrice: string }

function NewOrder({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { can } = useSession();
  const customers = useQuery({ queryKey: ['parties', 'MUSTERI'], queryFn: () => api.get<any[]>('/parties?type=MUSTERI') });
  const models = useQuery({ queryKey: ['models', 'all'], queryFn: () => api.get<any[]>('/models?take=500') });
  const [f, setF] = useState({ type: 'SATIS', customerId: '', dueDate: addDaysInput(21), priority: '2', currency: 'TRY', customerRef: '', note: '' });
  const [lines, setLines] = useState<Line[]>([{ modelId: '', color: '', sizes: {}, unitPrice: '' }]);
  const save = useAction(
    () =>
      api.post('/orders', {
        ...f,
        priority: Number(f.priority),
        dueDate: new Date(f.dueDate).toISOString(),
        lines: lines.map((l) => ({ modelId: l.modelId, color: l.color, sizes: l.sizes, unitPrice: l.unitPrice === '' ? null : Number(l.unitPrice) })),
      }),
    { success: (r) => `${r.no} numaralı sipariş oluşturuldu`, invalidate: [['orders']], onDone: (r) => onCreated(r.id) },
  );
  const modelById = (id: string) => models.data?.find((m) => m.id === id);
  const setLine = (i: number, p: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const total = lines.reduce((s, l) => s + Object.values(l.sizes).reduce((a, b) => a + b, 0), 0);
  const customerModels = (models.data ?? []).filter((m) => m.status !== 'ARSIV');

  return (
    <Modal
      open
      onClose={onClose}
      title="Yeni sipariş"
      wide="xl"
      footer={
        <>
          <span className="mr-auto self-center text-sm text-ink-600">Toplam <b className="num">{fmtNum(total)}</b> adet</span>
          <button className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button className="btn-primary" disabled={save.isPending || !f.customerId || total === 0 || lines.some((l) => !l.modelId || !l.color)} onClick={() => save.mutate()}>Siparişi kaydet</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Sipariş türü" required><Select value={f.type} onChange={(v) => setF({ ...f, type: v })} options={ORDER_TYPE} /></Field>
        <Field label={f.type === 'FASON_ALINAN' ? 'Marka / müşteri' : 'Mağaza / müşteri'} required className="lg:col-span-2">
          <Select value={f.customerId} onChange={(v) => setF({ ...f, customerId: v })} options={(customers.data ?? []).map((c) => ({ value: c.id, label: c.name }))} placeholder={customers.data?.length ? 'Seçin…' : 'Önce Cariler bölümünden müşteri ekleyin'} />
        </Field>
        <Field label="Termin" required><input type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        <Field label="Öncelik"><Select value={f.priority} onChange={(v) => setF({ ...f, priority: v })} options={{ 1: 'Yüksek', 2: 'Normal', 3: 'Düşük' }} /></Field>
        <Field label="Para birimi"><Select value={f.currency} onChange={(v) => setF({ ...f, currency: v })} options={{ TRY: 'TL', USD: 'USD', EUR: 'EUR' }} /></Field>
        <Field label="Müşteri sipariş no / PO" className="lg:col-span-2"><input className="input" value={f.customerRef} onChange={(e) => setF({ ...f, customerRef: e.target.value })} maxLength={80} /></Field>
      </div>

      <div className="mt-5 space-y-3">
        {lines.map((l, i) => {
          const m = modelById(l.modelId);
          return (
            <div key={i} className="rounded-2xl bg-ink-50 p-3 ring-1 ring-ink-200/70">
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <Field label={`Kalem ${i + 1} · Model`} required>
                  <Select value={l.modelId} onChange={(v) => { const mm = modelById(v); setLine(i, { modelId: v, color: mm?.colors?.[0] ?? '', sizes: {} }); }} options={customerModels.map((mm) => ({ value: mm.id, label: `${mm.code} — ${mm.name}` }))} placeholder={models.data?.length ? 'Model seçin…' : 'Önce Modeller bölümünden model ekleyin'} />
                </Field>
                <Field label="Renk" required>
                  {m?.colors?.length ? <Select value={l.color} onChange={(v) => setLine(i, { color: v })} options={m.colors.map((c: string) => ({ value: c, label: c }))} /> : <input className="input" value={l.color} onChange={(e) => setLine(i, { color: e.target.value })} />}
                </Field>
                {can('fiyat:gor') ? (
                  <Field label={`Birim fiyat (${f.currency})`}><input type="number" min={0} step="0.01" className="input num" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></Field>
                ) : <div />}
                <div className="flex items-end">
                  <button type="button" className="btn-ghost text-red-600" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Kalemi sil"><Trash2 className="size-4" /></button>
                </div>
              </div>
              {m && (
                <div className="mt-3">
                  <span className="label">Beden asortisi</span>
                  <SizeGrid sizes={m.sizes} value={l.sizes} onChange={(v) => setLine(i, { sizes: v })} />
                </div>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline btn-sm" onClick={() => setLines([...lines, { modelId: '', color: '', sizes: {}, unitPrice: '' }])}><Plus className="size-3.5" /> Kalem ekle</button>
          {lines.length > 0 && lines[lines.length - 1].modelId && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => { const last = lines[lines.length - 1]; const mm = modelById(last.modelId); const nextColor = mm?.colors?.find((c: string) => !lines.some((x) => x.modelId === last.modelId && x.color === c)); setLines([...lines, { ...last, color: nextColor ?? last.color }]); }}>
              Aynı modeli başka renkte ekle
            </button>
          )}
        </div>
      </div>
      <Field label="Not" className="mt-4"><textarea className="input" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={2000} /></Field>
    </Modal>
  );
}
