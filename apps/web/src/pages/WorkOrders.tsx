import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { addDaysInput, fmtDate, fmtNum } from '@/lib/format';
import { WO_STATUS, statusTone } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Progress, SearchBox, Select, SizeGrid, Table, Tabs, type Column } from '@/components/ui';
import { StagePipeline } from '@/components/StagePipeline';

export default function WorkOrders() {
  const { can, stageLabel } = useSession();
  const nav = useNavigate();
  const [tab, setTab] = useState<'acik' | 'hepsi'>('acik');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'liste' | 'akis'>('liste');
  const [newOpen, setNewOpen] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['workorders', tab, q], queryFn: () => api.get<any[]>(`/production/work-orders${qs({ open: tab === 'acik' ? '1' : undefined, q, take: 300 })}`) });

  const cols: Column<any>[] = [
    { key: 'no', header: 'İş emri', cell: (w) => (<div><div className="font-semibold text-ink-900">{w.no}</div><div className="text-xs text-ink-500">{w.order ? `${w.order.no} · ${w.order.customer.name}` : 'Stok üretimi'}</div></div>), csv: (w) => w.no },
    { key: 'model', header: 'Model / renk', cell: (w) => (<div><div className="font-medium">{w.model.code}</div><div className="text-xs text-ink-500">{w.model.name} · {w.color}</div></div>), csv: (w) => `${w.model.code} ${w.color}` },
    { key: 'qty', header: 'Adet', align: 'right', cell: (w) => fmtNum(w.plannedQty), csv: (w) => w.plannedQty },
    { key: 'stage', header: 'Şu an', cell: (w) => (w.currentStage ? <Badge tone="violet">{stageLabel(w.currentStage)}</Badge> : <Badge tone="green">Bitti</Badge>), csv: (w) => (w.currentStage ? stageLabel(w.currentStage) : 'Bitti') },
    { key: 'prog', header: 'İlerleme', className: 'min-w-36', cell: (w) => (<div className="flex items-center gap-2"><Progress value={w.progress} tone={w.overdue ? 'red' : undefined} /><span className="num w-9 text-right text-xs font-semibold">%{w.progress}</span></div>), csv: (w) => w.progress },
    { key: 'fin', header: 'Paketlenen', align: 'right', cell: (w) => fmtNum(w.finished), csv: (w) => w.finished },
    { key: 'due', header: 'Termin', cell: (w) => <span className={w.overdue ? 'font-semibold text-red-600' : ''}>{fmtDate(w.dueDate)}</span>, csv: (w) => fmtDate(w.dueDate) },
    { key: 'st', header: 'Durum', cell: (w) => <Badge tone={statusTone(w.status)}>{WO_STATUS[w.status]}</Badge>, csv: (w) => WO_STATUS[w.status] },
  ];

  return (
    <div>
      <PageHeader
        title="İş Emirleri"
        subtitle="Kesimden paketlemeye her iş emrinin aşama aşama durumu"
        actions={can('uretim:yaz') && <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus className="size-4" /> Siparişsiz iş emri</button>}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'acik', label: 'Açık' }, { value: 'hepsi', label: 'Tümü' }]} />
        <div className="mb-4 flex gap-2">
          <Select className="w-36" value={view} onChange={(v) => setView(v as any)} options={{ liste: 'Liste görünümü', akis: 'Aşama akışı' }} />
          <SearchBox value={q} onChange={setQ} placeholder="İş emri, model, sipariş no…" />
        </div>
      </div>
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : view === 'liste' ? (
        <Card bodyClass="p-0">
          <Table rows={data ?? []} columns={cols} rowKey={(w) => w.id} onRowClick={(w) => nav(`/uretim/${w.id}`)} csvName="is-emirleri" empty={<Empty title="İş emri yok" text="Sipariş detayından “İş emri oluştur” ile başlayın." />} />
        </Card>
      ) : (
        <div className="space-y-3">
          {(data ?? []).length === 0 && <Empty title="İş emri yok" />}
          {(data ?? []).map((w) => (
            <Card key={w.id} className="cursor-pointer hover:ring-brand-300" bodyClass="p-3">
              <div onClick={() => nav(`/uretim/${w.id}`)}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-semibold">{w.no} · {w.model.code} {w.color} <span className="font-normal text-ink-500">{w.order ? `· ${w.order.customer.name}` : ''}</span></span>
                  <span className={w.overdue ? 'text-xs font-semibold text-red-600' : 'text-xs text-ink-500'}>Termin {fmtDate(w.dueDate)}</span>
                </div>
                <StagePipeline stages={w.stages} planned={w.plannedQty} compact />
              </div>
            </Card>
          ))}
        </div>
      )}
      {newOpen && <NewWorkOrder onClose={() => setNewOpen(false)} onCreated={(id) => nav(`/uretim/${id}`)} />}
    </div>
  );
}

function NewWorkOrder({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const models = useQuery({ queryKey: ['models', 'all'], queryFn: () => api.get<any[]>('/models?take=500') });
  const [modelId, setModelId] = useState('');
  const [color, setColor] = useState('');
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [due, setDue] = useState(addDaysInput(14));
  const [note, setNote] = useState('');
  const m = models.data?.find((x) => x.id === modelId);
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  const save = useAction(() => api.post('/production/work-orders', { modelId, color, sizes, dueDate: new Date(due).toISOString(), note: note || null }), { success: (r) => `${r.no} açıldı`, invalidate: [['workorders'], ['board']], onDone: (r) => onCreated(r.id) });
  return (
    <Modal open onClose={onClose} title="Siparişsiz (stok için) iş emri" wide footer={<><button className="btn-outline" onClick={onClose}>Vazgeç</button><button className="btn-primary" disabled={!modelId || !color || !total || save.isPending} onClick={() => save.mutate()}>İş emrini aç</button></>}>
      <p className="mb-4 text-sm text-ink-600">Mağazaya stoktan satış veya numune için sipariş bağlamadan üretim başlatın. Sipariş varsa iş emrini sipariş ekranından açmanız termin takibi için daha doğrudur.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Model" required className="sm:col-span-2"><Select value={modelId} onChange={(v) => { setModelId(v); const mm = models.data?.find((x) => x.id === v); setColor(mm?.colors?.[0] ?? ''); setSizes({}); }} options={(models.data ?? []).map((x) => ({ value: x.id, label: `${x.code} — ${x.name}` }))} placeholder="Seçin…" /></Field>
        <Field label="Renk" required>{m?.colors?.length ? <Select value={color} onChange={setColor} options={m.colors.map((c: string) => ({ value: c, label: c }))} /> : <input className="input" value={color} onChange={(e) => setColor(e.target.value)} />}</Field>
        <Field label="Termin" required><input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Not" className="sm:col-span-2"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></Field>
      </div>
      {m && <div className="mt-4"><span className="label">Beden asortisi</span><SizeGrid sizes={m.sizes} value={sizes} onChange={setSizes} /></div>}
    </Modal>
  );
}
