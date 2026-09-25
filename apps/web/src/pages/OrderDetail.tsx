import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, Factory, Printer, Trash2, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { fmtDate, fmtMoney, fmtNum, fmtQty, toInputDate } from '@/lib/format';
import { ORDER_STATUS, ORDER_TYPE, RISK, WO_STATUS, statusTone } from '@/lib/labels';
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader, Progress, Select, SizeChips, Table, useConfirm, Empty } from '@/components/ui';
import { StagePipeline } from '@/components/StagePipeline';

export default function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useSession();
  const { confirm, node } = useConfirm();
  const { data, isLoading, error } = useQuery({ queryKey: ['order', id], queryFn: () => api.get<any>(`/orders/${id}`) });
  const reqs = useQuery({ queryKey: ['order', id, 'req'], queryFn: () => api.get<any[]>(`/orders/${id}/requirements`), enabled: can('depo:gor', 'siparis:gor') });
  const [dueOpen, setDueOpen] = useState(false);
  const inv = [['order', id!], ['orders']];
  const makeWo = useAction(() => api.post(`/orders/${id}/work-orders`), { success: (r) => `${r.created.length} iş emri açıldı: ${r.created.join(', ')}`, invalidate: [...inv, ['workorders']] });
  const setStatus = useAction((status: string) => api.patch(`/orders/${id}`, { status }), { success: 'Sipariş durumu güncellendi', invalidate: inv });
  const del = useAction(() => api.del(`/orders/${id}`), { success: 'Sipariş silindi', invalidate: [['orders']], onDone: () => nav('/siparisler') });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const o = data.order;
  const s = data.summary;
  const closed = o.status === 'TAMAMLANDI' || o.status === 'IPTAL';
  const linesWithoutWo = o.lines.filter((l: any) => !o.workOrders.some((w: any) => w.orderLineId === l.id && w.status !== 'IPTAL'));

  return (
    <div className="space-y-5">
      {node}
      <PageHeader
        back={<Link to="/siparisler" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-800"><ArrowLeft className="size-3.5" /> Siparişler</Link>}
        title={<span className="flex flex-wrap items-center gap-2">{o.no} <Badge tone={statusTone(o.status)}>{ORDER_STATUS[o.status]}</Badge>{s.risk !== 'NORMAL' && s.risk !== 'KAPALI' && <Badge tone={RISK[s.risk].tone}>{s.reason}</Badge>}</span>}
        subtitle={<>{o.customer.name} · {ORDER_TYPE[o.type]}{o.customerRef && <> · Ref: {o.customerRef}</>}</>}
        actions={
          <>
            <button className="btn-outline no-print" onClick={() => window.print()}><Printer className="size-4" /> Yazdır</button>
            {can('uretim:yaz') && !closed && linesWithoutWo.length > 0 && (
              <button className="btn-primary" disabled={makeWo.isPending} onClick={() => makeWo.mutate()}><Factory className="size-4" /> İş emri oluştur ({linesWithoutWo.length})</button>
            )}
            {can('mamul:yaz') && !closed && s.finished > s.shipped && <Link to="/mamul?yeni=1" className="btn-accent"><Truck className="size-4" /> Sevkiyat yap</Link>}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-xs font-medium text-ink-500">Termin</div>
          <div className="num mt-0.5 text-xl font-bold">{fmtDate(o.dueDate)}</div>
          <div className={s.daysLeft < 0 && !closed ? 'text-sm font-semibold text-red-600' : 'text-sm text-ink-500'}>{closed ? 'Kapalı' : s.daysLeft < 0 ? `${-s.daysLeft} gün gecikti` : `${s.daysLeft} gün kaldı`}</div>
          {can('siparis:yaz') && !closed && <button className="btn-ghost btn-sm mt-1 -ml-2" onClick={() => setDueOpen(true)}><CalendarClock className="size-3.5" /> Termini değiştir</button>}
        </Card>
        <Card>
          <div className="text-xs font-medium text-ink-500">Üretim ilerlemesi</div>
          <div className="num mt-0.5 text-xl font-bold">%{s.progress}</div>
          <Progress value={s.progress} expected={closed ? undefined : s.expected} tone={s.risk === 'GECIKTI' ? 'red' : s.risk === 'RISKLI' ? 'amber' : undefined} />
          <div className="mt-1 text-xs text-ink-500">Bugün itibarıyla olması gereken: %{s.expected}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-ink-500">Adet</div>
          <div className="num mt-0.5 text-xl font-bold">{fmtNum(s.total)}</div>
          <div className="text-sm text-ink-500">Paket {fmtNum(s.finished)} · Sevk {fmtNum(s.shipped)}</div>
          {s.dailyNeeded && <div className="mt-1 text-xs font-semibold text-brand-700">Termine yetişmek için günde {fmtNum(s.dailyNeeded)} adet</div>}
        </Card>
        <Card>
          <div className="text-xs font-medium text-ink-500">Sipariş tutarı</div>
          <div className="num mt-0.5 text-xl font-bold">{s.amount !== undefined ? fmtMoney(s.amount, o.currency) : '—'}</div>
          <div className="text-sm text-ink-500">Sipariş tarihi {fmtDate(o.orderDate)}</div>
        </Card>
      </div>

      <Card title="Sipariş kalemleri" bodyClass="p-0">
        <Table
          rows={o.lines}
          rowKey={(l: any) => l.id}
          columns={[
            { key: 'm', header: 'Model', cell: (l: any) => <Link to={`/modeller/${l.model.id}`} className="font-semibold text-brand-700 hover:underline">{l.model.code}</Link> },
            { key: 'n', header: 'Ad', cell: (l: any) => l.model.name },
            { key: 'c', header: 'Renk', cell: (l: any) => l.color },
            { key: 's', header: 'Asorti', cell: (l: any) => <SizeChips sizes={l.sizes} /> },
            { key: 'q', header: 'Adet', align: 'right', cell: (l: any) => fmtNum(l.quantity) },
            { key: 'sh', header: 'Sevk edilen', align: 'right', cell: (l: any) => fmtNum(l.shippedQty) },
            ...(can('fiyat:gor') ? [{ key: 'p', header: 'Birim fiyat', align: 'right' as const, cell: (l: any) => fmtMoney(l.unitPrice, o.currency) }] : []),
          ]}
        />
      </Card>

      <Card title="İş emirleri ve aşamalar" subtitle="Her aşamada çıkan sağlam adet / planlanan adet" bodyClass="p-0">
        {data.workOrders.length === 0 ? (
          <Empty title="Henüz iş emri açılmadı" text="“İş emri oluştur” ile her kalem için modelin üretim rotasına göre iş emri açılır." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {data.workOrders.map((w: any) => (
              <li key={w.id} className="px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Link to={`/uretim/${w.id}`} className="font-semibold text-brand-700 hover:underline">{w.no} · {w.color} · {fmtNum(w.plannedQty)} adet</Link>
                  <div className="flex items-center gap-2"><Badge tone={statusTone(w.status)}>{WO_STATUS[w.status]}</Badge><span className="num text-xs font-semibold">%{w.progress}</span></div>
                </div>
                <StagePipeline stages={w.stages} planned={w.plannedQty} compact />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {reqs.data && (
          <Card title="Malzeme ihtiyacı" subtitle="Model reçetesine göre sipariş toplamı" bodyClass="p-0">
            <Table
              rows={reqs.data}
              rowKey={(r: any) => r.material.id}
              empty={<Empty title="Reçete tanımlı değil" text="Modelin reçetesine kumaş/aksesuar sarfiyatı girildiğinde ihtiyaç otomatik hesaplanır." />}
              columns={[
                { key: 'm', header: 'Malzeme', cell: (r: any) => <Link to={`/depo/${r.material.id}`} className="font-medium hover:underline">{r.material.code} · {r.material.name}{r.material.color ? ` (${r.material.color})` : ''}</Link> },
                { key: 'r', header: 'Gerekli', align: 'right', cell: (r: any) => fmtQty(r.required) },
                { key: 's', header: 'Stok', align: 'right', cell: (r: any) => fmtQty(r.material.stock) },
                { key: 'e', header: 'Eksik', align: 'right', cell: (r: any) => (r.shortage > 0 ? <Badge tone="red">{fmtQty(r.shortage)}</Badge> : <Badge tone="green">Yeterli</Badge>) },
              ]}
            />
          </Card>
        )}
        <Card title="Sevkiyatlar" bodyClass="p-0">
          <Table
            rows={o.shipments}
            rowKey={(r: any) => r.id}
            empty={<Empty title="Sevkiyat yok" />}
            columns={[
              { key: 'n', header: 'No', cell: (r: any) => <span className="font-semibold">{r.no}</span> },
              { key: 'd', header: 'Tarih', cell: (r: any) => fmtDate(r.date) },
              { key: 'i', header: 'İrsaliye', cell: (r: any) => r.dispatchNo ?? '—' },
              { key: 'k', header: 'Koli', align: 'right', cell: (r: any) => r.cartons ?? '—' },
            ]}
          />
        </Card>
      </div>

      {o.note && <Card title="Not"><p className="whitespace-pre-wrap text-sm text-ink-700">{o.note}</p></Card>}

      {can('siparis:yaz') && (
        <div className="no-print flex flex-wrap gap-2 border-t border-ink-200 pt-4">
          {!closed && (
            <button className="btn-outline" onClick={async () => (await confirm('Sipariş “Tamamlandı” olarak kapatılsın mı? Kalan adetler artık termin takibinde görünmez.')) && setStatus.mutate('TAMAMLANDI')}>Siparişi kapat</button>
          )}
          {!closed && (
            <button className="btn-outline text-red-600" onClick={async () => (await confirm('Sipariş iptal edilsin mi?')) && setStatus.mutate('IPTAL')}>İptal et</button>
          )}
          {o.status === 'IPTAL' && <button className="btn-outline" onClick={() => setStatus.mutate('ONAYLANDI')}>Yeniden aç</button>}
          {data.workOrders.length === 0 && o.shipments.length === 0 && (
            <button className="btn-ghost text-red-600" onClick={async () => (await confirm('Sipariş kalıcı olarak silinsin mi?')) && del.mutate()}><Trash2 className="size-4" /> Sil</button>
          )}
        </div>
      )}
      {dueOpen && <DueModal id={id!} current={o.dueDate} onClose={() => setDueOpen(false)} />}
    </div>
  );
}

function DueModal({ id, current, onClose }: { id: string; current: string; onClose: () => void }) {
  const [due, setDue] = useState(toInputDate(current));
  const [priority, setPriority] = useState('');
  const save = useAction(() => api.patch(`/orders/${id}`, { dueDate: new Date(due).toISOString(), ...(priority ? { priority: Number(priority) } : {}) }), { success: 'Termin güncellendi (değişiklik denetim kaydına işlendi)', invalidate: [['order', id], ['orders']], onDone: onClose });
  return (
    <Modal open onClose={onClose} title="Termini değiştir" footer={<><button className="btn-outline" onClick={onClose}>Vazgeç</button><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Kaydet</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Yeni termin"><input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Öncelik"><Select value={priority} onChange={setPriority} options={{ 1: 'Yüksek', 2: 'Normal', 3: 'Düşük' }} placeholder="Değiştirme" /></Field>
      </div>
      <p className="mt-3 text-xs text-ink-500">Müşteriyle yeni termin konuşulduysa buradan güncelleyin. Eski termin denetim kaydında saklanır.</p>
    </Modal>
  );
}
