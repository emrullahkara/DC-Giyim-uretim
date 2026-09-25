import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Boxes, FileText, PackageCheck, Plus, Save, Shirt, SlidersHorizontal, Trash2, Truck, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { fmtDate, fmtMoney, fmtNum, sizesText, toInputDate } from '@/lib/format';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, SearchBox, Select, SizeChips, SizeGrid, Stat, Table, Tabs, cx, useToast, type Column } from '@/components/ui';

interface ModelRef { id: string; code: string; name: string; sizes: string[]; colors?: string[] }
interface StockGroup { model: ModelRef; color: string; sizes: Record<string, number>; total: number; second: number }
interface ShipmentLine { id: string; modelId: string; color: string; sizes: Record<string, number>; quantity: number; unitPrice?: string | null }
interface Shipment {
  id: string;
  no: string;
  date: string;
  dispatchNo?: string | null;
  cartons?: number | null;
  note?: string | null;
  customer: { id: string; name: string };
  order?: { id: string; no: string } | null;
  lines: ShipmentLine[];
}
interface OpenOrder { id: string; no: string; status: string; customerId: string; customer?: { id: string; name: string }; dueDate: string; total?: number; shipped?: number; models?: string }
interface OrderDetail {
  order: {
    id: string;
    no: string;
    currency?: string;
    lines: { id: string; modelId: string; color: string; sizes: Record<string, number>; quantity: number; shippedQty: number; unitPrice?: string | null; model: { id: string; code: string; name: string } }[];
  };
}

const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + (Number(b) || 0), 0);
const clean = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).filter(([, q]) => q));
/** Beden sırasına göre sıralı harita (model beden seti önce) */
const ordered = (sizes: Record<string, number>, order: string[]) => {
  const out: Record<string, number> = {};
  for (const s of order) if (sizes[s]) out[s] = sizes[s];
  for (const [s, q] of Object.entries(sizes)) if (!(s in out) && q) out[s] = q;
  return out;
};

/** Model bilgisi: /models listesi (yetki varsa) + mamul stoktaki modeller */
function useModelIndex(enabled: boolean) {
  const { can } = useSession();
  const models = useQuery({ queryKey: ['models', { take: 500 }], queryFn: () => api.get<ModelRef[]>('/models?take=500'), enabled: enabled && can('model:gor', 'siparis:gor'), staleTime: 60_000 });
  const stock = useQuery({ queryKey: ['finished-stock'], queryFn: () => api.get<StockGroup[]>('/finished/stock'), enabled });
  const index = useMemo(() => {
    const map = new Map<string, ModelRef>();
    for (const g of stock.data ?? []) {
      const prev = map.get(g.model.id);
      map.set(g.model.id, { ...g.model, colors: [...new Set([...(prev?.colors ?? []), g.color])] });
    }
    for (const m of models.data ?? []) {
      const prev = map.get(m.id);
      map.set(m.id, { ...m, colors: [...new Set([...(m.colors ?? []), ...(prev?.colors ?? [])])] });
    }
    return map;
  }, [models.data, stock.data]);
  const avail = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const g of stock.data ?? []) map.set(`${g.model.id}|${g.color}`, g.sizes);
    return map;
  }, [stock.data]);
  return { index, avail, loading: stock.isLoading };
}

// ── Yeni sevkiyat
type ShipLineForm = { key: number; orderLineId?: string; modelId: string; color: string; sizes: Record<string, number>; unitPrice: string; orderedSizes?: Record<string, number>; remainingQty?: number };
let lineSeq = 0;

function ShipmentModal({ onClose, onSaved }: { onClose: () => void; onSaved: (no: string) => void }) {
  const { can } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const showPrice = can('fiyat:gor');
  const canOrders = can('siparis:gor');
  const { index, avail } = useModelIndex(true);

  const [f, setF] = useState({ customerId: '', orderId: '', date: toInputDate(), dispatchNo: '', cartons: '', note: '', createInvoice: false });
  const [lines, setLines] = useState<ShipLineForm[]>([]);
  const [loadingOrder, setLoadingOrder] = useState(false);

  const customers = useQuery({ queryKey: ['parties', { type: 'MUSTERI', take: 500 }], queryFn: () => api.get<{ id: string; name: string }[]>('/parties?take=500&type=MUSTERI'), staleTime: 60_000 });
  const orders = useQuery({ queryKey: ['orders', { open: 1, take: 500 }], queryFn: () => api.get<OpenOrder[]>('/orders?open=1&take=500'), enabled: canOrders });
  const customerOrders = (orders.data ?? []).filter((o) => (o.customerId ?? o.customer?.id) === f.customerId && o.status !== 'TASLAK');

  const setCustomer = (customerId: string) => {
    setF((p) => ({ ...p, customerId, orderId: '' }));
    setLines((ls) => ls.filter((l) => !l.orderLineId));
  };

  const pickOrder = async (orderId: string) => {
    setF((p) => ({ ...p, orderId }));
    const free = lines.filter((l) => !l.orderLineId);
    if (!orderId) return setLines(free);
    setLoadingOrder(true);
    try {
      const d = await qc.fetchQuery({ queryKey: ['order', orderId], queryFn: () => api.get<OrderDetail>(`/orders/${orderId}`) });
      const fromOrder: ShipLineForm[] = d.order.lines
        .filter((l) => l.quantity - l.shippedQty > 0)
        .map((l) => ({
          key: ++lineSeq,
          orderLineId: l.id,
          modelId: l.modelId,
          color: l.color,
          sizes: {},
          unitPrice: l.unitPrice != null ? String(Number(l.unitPrice)) : '',
          orderedSizes: l.sizes ?? {},
          remainingQty: l.quantity - l.shippedQty,
        }));
      if (!fromOrder.length) toast('err', 'Bu siparişin tüm kalemleri sevk edilmiş görünüyor.');
      setLines([...fromOrder, ...free]);
    } catch (e) {
      toast('err', e instanceof Error ? e.message : 'Sipariş okunamadı.');
    } finally {
      setLoadingOrder(false);
    }
  };

  const upd = (key: number, patch: Partial<ShipLineForm>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addFree = () => setLines((ls) => [...ls, { key: ++lineSeq, modelId: '', color: '', sizes: {}, unitPrice: '' }]);

  const totalQty = lines.reduce((s, l) => s + sum(l.sizes), 0);
  const totalAmount = lines.reduce((s, l) => s + sum(l.sizes) * (Number(l.unitPrice) || 0), 0);

  const modelOptions = [...index.values()].sort((a, b) => a.code.localeCompare(b.code)).map((m) => ({ value: m.id, label: `${m.code} · ${m.name}` }));

  const save = useAction((body: Record<string, unknown>) => api.post<{ id: string; no: string }>('/finished/shipments', body), {
    success: (r) => `Sevkiyat ${r.no} kaydedildi`,
    invalidate: [['finished-stock'], ['shipments'], ['orders'], ['order'], ['model']],
    onDone: (r) => onSaved(r.no),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.customerId) return toast('err', 'Müşteri seçin.');
    const valid = lines.filter((l) => l.modelId && l.color && sum(l.sizes) > 0);
    if (!valid.length) return toast('err', 'Sevk edilecek adet girin.');
    save.mutate({
      customerId: f.customerId,
      orderId: f.orderId || null,
      date: f.date,
      dispatchNo: f.dispatchNo.trim(),
      cartons: f.cartons === '' ? null : Number(f.cartons),
      note: f.note.trim(),
      createInvoice: can('finans:yaz') && f.createInvoice,
      lines: valid.map((l) => ({
        orderLineId: l.orderLineId ?? null,
        modelId: l.modelId,
        color: l.color,
        sizes: clean(l.sizes),
        unitPrice: showPrice && l.unitPrice !== '' ? Number(l.unitPrice) : null,
      })),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide="xl"
      title={<span className="flex items-center gap-2"><Truck className="size-5 text-brand-600" /> Yeni sevkiyat</span>}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-ink-600">
            Toplam <b className="num text-ink-900">{fmtNum(totalQty)}</b> adet
            {showPrice && totalAmount > 0 && <> · <b className="num text-ink-900">{fmtMoney(totalAmount)}</b></>}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-outline" onClick={onClose}>Vazgeç</button>
            <button type="submit" form="shipment-form" className="btn-primary" disabled={save.isPending || !totalQty}>
              <Save className="size-4" /> Sevkiyatı kaydet
            </button>
          </div>
        </div>
      }
    >
      <form id="shipment-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Müşteri" required>
            <Select value={f.customerId} onChange={setCustomer} options={(customers.data ?? []).map((p) => ({ value: p.id, label: p.name }))} placeholder="— Müşteri seçin —" required />
          </Field>
          {canOrders && (
            <Field label="Sipariş" hint={f.customerId ? (customerOrders.length ? 'Seçerseniz sipariş kalemleri otomatik gelir.' : 'Bu müşterinin açık siparişi yok.') : 'Önce müşteri seçin.'}>
              <Select
                value={f.orderId}
                onChange={pickOrder}
                disabled={!f.customerId || loadingOrder}
                options={customerOrders.map((o) => ({ value: o.id, label: `${o.no}${o.models ? ` · ${o.models}` : ''} · termin ${fmtDate(o.dueDate)}` }))}
                placeholder="— Siparişsiz sevkiyat —"
              />
            </Field>
          )}
          <Field label="Sevk tarihi">
            <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="İrsaliye no">
            <input className="input" value={f.dispatchNo} onChange={(e) => setF({ ...f, dispatchNo: e.target.value })} maxLength={40} placeholder="Ör. A-004512" />
          </Field>
          <Field label="Koli adedi">
            <input type="number" min={0} className="input num" value={f.cartons} onChange={(e) => setF({ ...f, cartons: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Not">
            <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={1000} placeholder="Ör. ambar teslim, şoför: …" />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-ink-900">Sevk kalemleri</div>
            <button type="button" className="btn-outline btn-sm" onClick={addFree}><Plus className="size-3.5" /> Serbest kalem ekle</button>
          </div>
          {loadingOrder ? (
            <Loading text="Sipariş kalemleri getiriliyor…" />
          ) : lines.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-500">
              {canOrders ? 'Müşterinin açık siparişini seçin ya da stoktaki bir modeli “Serbest kalem ekle” ile sevk listesine alın.' : '“Serbest kalem ekle” ile stoktaki modeli sevk listesine alın.'}
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((l) => {
                const model = index.get(l.modelId);
                const sizes = model?.sizes?.length ? model.sizes : Object.keys(l.orderedSizes ?? {});
                const max = avail.get(`${l.modelId}|${l.color}`) ?? {};
                const over = Object.entries(l.sizes).filter(([s, q]) => q > (max[s] ?? 0));
                const qty = sum(l.sizes);
                const fill = () => {
                  const next: Record<string, number> = {};
                  for (const s of sizes) {
                    const want = l.orderedSizes ? l.orderedSizes[s] ?? 0 : Infinity;
                    const v = Math.min(want, max[s] ?? 0);
                    if (v > 0) next[s] = v;
                  }
                  upd(l.key, { sizes: next });
                };
                return (
                  <div key={l.key} className={cx('rounded-2xl p-3 ring-1', over.length ? 'ring-red-200 bg-red-50/30' : 'ring-ink-200')}>
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      {l.orderLineId ? (
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                            <Shirt className="size-4 text-ink-400" /> {model ? `${model.code} · ${model.name}` : 'Model'} <Badge>{l.color}</Badge> <Badge tone="blue">Sipariş kalemi</Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                            <span>Sipariş asortisi:</span> <SizeChips sizes={ordered(l.orderedSizes ?? {}, sizes)} />
                            {l.remainingQty !== undefined && <span>· sevk bekleyen <b className="text-ink-700">{fmtNum(l.remainingQty)}</b> adet</span>}
                          </div>
                        </div>
                      ) : (
                        <div className="grid flex-1 gap-2 sm:grid-cols-2">
                          <Select value={l.modelId} onChange={(v) => upd(l.key, { modelId: v, color: '', sizes: {} })} options={modelOptions} placeholder="— Model seçin —" />
                          <Select value={l.color} onChange={(v) => upd(l.key, { color: v, sizes: {} })} options={(model?.colors ?? []).map((c) => ({ value: c, label: c }))} placeholder="— Renk —" disabled={!l.modelId} />
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        {l.modelId && l.color && (
                          <button type="button" className="btn-ghost btn-sm" onClick={fill} title={l.orderedSizes ? 'Sipariş asortisini stoktaki kadarıyla doldur' : 'Stoktaki tüm adetleri ekle'}>
                            <Wand2 className="size-3.5" /> Stoktan doldur
                          </button>
                        )}
                        <button type="button" className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Kalemi çıkar">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                    {l.modelId && l.color && sizes.length ? (
                      <div className="flex flex-wrap items-end gap-4">
                        <div className="min-w-0 flex-1">
                          <SizeGrid sizes={sizes} value={l.sizes} onChange={(v) => upd(l.key, { sizes: v })} max={max} />
                        </div>
                        {showPrice && (
                          <Field label="Birim fiyat (₺)" className="w-32" hint={qty && Number(l.unitPrice) ? fmtMoney(qty * Number(l.unitPrice)) : undefined}>
                            <input type="number" min={0} step="any" className="input num" value={l.unitPrice} onChange={(e) => upd(l.key, { unitPrice: e.target.value })} placeholder={l.orderLineId ? 'Sipariş fiyatı' : '0,00'} />
                          </Field>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-ink-500">Beden adetlerini girmek için model ve renk seçin.</p>
                    )}
                    {over.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
                        <AlertTriangle className="size-3.5" /> Stokta yeterli mamul yok: {over.map(([s]) => `${s} (mevcut ${max[s] ?? 0})`).join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {can('finans:yaz') && (
          <label className="flex items-start gap-2 rounded-xl bg-ink-50 px-3 py-2.5 ring-1 ring-ink-100">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-700" checked={f.createInvoice} onChange={(e) => setF({ ...f, createInvoice: e.target.checked })} />
            <span>
              <span className="block text-sm font-semibold text-ink-800">Satış faturası da oluştur</span>
              <span className="block text-xs text-ink-500">Fiyatlı kalemlerin toplamı müşteri carisine satış faturası olarak işlenir (belge no: irsaliye no).</span>
            </span>
          </label>
        )}
      </form>
    </Modal>
  );
}

// ── Mamul stok düzeltme
function AdjustModal({ onClose, initial }: { onClose: () => void; initial?: { modelId: string; color: string } }) {
  const toast = useToast();
  const { index, avail } = useModelIndex(true);
  const [modelId, setModelId] = useState(initial?.modelId ?? '');
  const [color, setColor] = useState(initial?.color ?? '');
  const [delta, setDelta] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const model = index.get(modelId);
  const current = avail.get(`${modelId}|${color}`) ?? {};
  const sizes = model?.sizes ?? [];
  const nums: Record<string, number> = Object.fromEntries(Object.entries(delta).map(([s, v]) => [s, parseInt(v, 10) || 0] as const).filter(([, v]) => v));
  const net: number = Object.values(nums).reduce((a, b) => a + b, 0);

  const save = useAction((body: Record<string, unknown>) => api.post('/finished/stock/adjust', body), {
    success: 'Mamul stok düzeltildi',
    invalidate: [['finished-stock'], ['model']],
    onDone: onClose,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!modelId || !color) return toast('err', 'Model ve renk seçin.');
    if (!Object.keys(nums).length) return toast('err', 'En az bir bedende artı ya da eksi miktar girin.');
    const neg = sizes.find((s) => (current[s] ?? 0) + ((nums[s] as number) ?? 0) < 0);
    if (neg) return toast('err', `${neg} bedeninde stok eksiye düşemez.`);
    save.mutate({ modelId, color, sizes: nums, note: note.trim() });
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={<span className="flex items-center gap-2"><SlidersHorizontal className="size-5 text-brand-600" /> Mamul stok düzelt</span>}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button type="submit" form="adjust-form" className="btn-primary" disabled={save.isPending}><Save className="size-4" /> Kaydet</button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Model" required>
            <Select value={modelId} onChange={(v) => { setModelId(v); setColor(''); setDelta({}); }} options={[...index.values()].sort((a, b) => a.code.localeCompare(b.code)).map((m) => ({ value: m.id, label: `${m.code} · ${m.name}` }))} placeholder="— Model seçin —" />
          </Field>
          <Field label="Renk" required>
            <Select value={color} onChange={(v) => { setColor(v); setDelta({}); }} options={(model?.colors ?? []).map((c) => ({ value: c, label: c }))} placeholder="— Renk —" disabled={!modelId} />
          </Field>
        </div>
        {modelId && color && sizes.length > 0 && (
          <div>
            <div className="label">Beden bazında düzeltme (+ ekler, − düşer)</div>
            <div className="overflow-x-auto">
              <div className="flex min-w-max items-end gap-1.5">
                {sizes.map((s) => {
                  const d = (nums[s] as number) ?? 0;
                  const after = (current[s] ?? 0) + d;
                  return (
                    <label key={s} className="w-16 text-center">
                      <span className="mb-1 block text-[11px] font-bold text-ink-600">{s}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        className={cx('input num px-1 text-center', d > 0 && 'text-emerald-700', d < 0 && 'text-red-600')}
                        value={delta[s] ?? ''}
                        placeholder="0"
                        onChange={(e) => setDelta({ ...delta, [s]: e.target.value })}
                      />
                      <span className={cx('mt-0.5 block text-[10px]', after < 0 ? 'font-bold text-red-600' : 'text-ink-400')}>
                        {current[s] ?? 0}{d ? ` → ${after}` : ''}
                      </span>
                    </label>
                  );
                })}
                <div className="w-20 pb-4 text-center">
                  <span className="mb-1 block text-[11px] font-bold text-ink-600">NET</span>
                  <div className={cx('num rounded-xl py-2 text-sm font-bold', net > 0 ? 'bg-emerald-50 text-emerald-700' : net < 0 ? 'bg-red-50 text-red-700' : 'bg-ink-100 text-ink-600')}>{net > 0 ? '+' : ''}{net}</div>
                </div>
              </div>
            </div>
          </div>
        )}
        <Field label="Açıklama" hint="Ör. sayım farkı, dışarıdan hazır alınan ürün, numune çıkışı.">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
      </form>
    </Modal>
  );
}

// ── Sevkiyat detayı
function ShipmentView({ s, index, onClose }: { s: Shipment; index: Map<string, ModelRef>; onClose: () => void }) {
  const { can } = useSession();
  const total = s.lines.reduce((a, l) => a + l.quantity, 0);
  const amount = s.lines.reduce((a, l) => a + l.quantity * Number(l.unitPrice ?? 0), 0);
  return (
    <Modal open onClose={onClose} wide title={<span className="flex items-center gap-2"><Truck className="size-5 text-brand-600" /> Sevkiyat {s.no}</span>} footer={<button className="btn-outline" onClick={onClose}>Kapat</button>}>
      <div className="mb-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><div className="label">Müşteri</div>{s.customer.name}</div>
        <div><div className="label">Tarih</div>{fmtDate(s.date)}</div>
        <div><div className="label">Sipariş</div>{s.order ? (can('siparis:gor') ? <Link className="text-brand-700 hover:underline" to={`/siparisler/${s.order.id}`}>{s.order.no}</Link> : s.order.no) : '—'}</div>
        <div><div className="label">İrsaliye no</div>{s.dispatchNo || '—'}</div>
        <div><div className="label">Koli</div>{s.cartons ?? '—'}</div>
        <div><div className="label">Toplam</div><b>{fmtNum(total)}</b> adet{amount > 0 && <> · {fmtMoney(amount)}</>}</div>
      </div>
      {s.note && <p className="mb-4 rounded-xl bg-ink-50 px-3 py-2 text-sm text-ink-700">{s.note}</p>}
      <div className="divide-y divide-ink-100 rounded-2xl ring-1 ring-ink-200">
        {s.lines.map((l) => {
          const m = index.get(l.modelId);
          return (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div>
                <div className="text-sm font-semibold text-ink-900">{m ? `${m.code} · ${m.name}` : 'Model'} <span className="font-normal text-ink-500">· {l.color}</span></div>
                <div className="mt-1"><SizeChips sizes={ordered(l.sizes, m?.sizes ?? [])} /></div>
              </div>
              <div className="text-right">
                <div className="num text-sm font-bold">{fmtNum(l.quantity)} adet</div>
                {l.unitPrice != null && <div className="num text-xs text-ink-500">{fmtMoney(l.unitPrice)} / adet</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Sayfa
type TabT = 'stok' | 'sevkiyat';

export default function Finished() {
  const { can } = useSession();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: TabT = params.get('sekme') === 'sevkiyat' ? 'sevkiyat' : 'stok';
  const newOpen = params.get('yeni') === '1';
  const [search, setSearch] = useState('');
  const [adjust, setAdjust] = useState<{ modelId: string; color: string } | null | undefined>(undefined);
  const [view, setView] = useState<Shipment | null>(null);

  const setParam = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    setParams(p, { replace: true });
  };

  const { index } = useModelIndex(true);
  const stock = useQuery({ queryKey: ['finished-stock'], queryFn: () => api.get<StockGroup[]>('/finished/stock') });
  const shipments = useQuery({ queryKey: ['shipments', { take: 300 }], queryFn: () => api.get<Shipment[]>('/finished/shipments?take=300'), enabled: tab === 'sevkiyat' });

  const s = search.trim().toLocaleLowerCase('tr');
  const stockRows = useMemo(
    () => (stock.data ?? []).filter((g) => !s || [g.model.code, g.model.name, g.color].some((x) => x.toLocaleLowerCase('tr').includes(s))),
    [stock.data, s],
  );
  const shipRows = useMemo(
    () => (shipments.data ?? []).filter((x) => !s || [x.no, x.dispatchNo, x.customer.name, x.order?.no].some((v) => v?.toLocaleLowerCase('tr').includes(s))),
    [shipments.data, s],
  );
  const totals = useMemo(() => {
    const all = stock.data ?? [];
    return { qty: all.reduce((a, g) => a + g.total, 0), second: all.reduce((a, g) => a + g.second, 0), models: new Set(all.map((g) => g.model.id)).size };
  }, [stock.data]);

  const stockCols: Column<StockGroup>[] = [
    {
      key: 'model',
      header: 'Model',
      cell: (g) => (
        <div className="min-w-[10rem]">
          <div className="font-mono text-xs font-bold text-ink-900">{g.model.code}</div>
          <div className="text-sm text-ink-700">{g.model.name}</div>
        </div>
      ),
      csv: (g) => `${g.model.code} ${g.model.name}`,
    },
    { key: 'color', header: 'Renk', cell: (g) => <Badge>{g.color}</Badge>, csv: (g) => g.color },
    { key: 'sizes', header: 'Beden dağılımı', cell: (g) => <SizeChips sizes={ordered(g.sizes, g.model.sizes)} />, csv: (g) => sizesText(ordered(g.sizes, g.model.sizes)) },
    { key: 'total', header: 'Toplam', align: 'right', cell: (g) => <span className="font-bold">{fmtNum(g.total)}</span>, csv: (g) => g.total },
    { key: 'second', header: '2. kalite', align: 'right', cell: (g) => (g.second ? <span className="font-semibold text-amber-700">{fmtNum(g.second)}</span> : <span className="text-ink-300">0</span>), csv: (g) => g.second },
    ...(can('mamul:yaz')
      ? [{
          key: 'act',
          header: '',
          align: 'right' as const,
          cell: (g: StockGroup) => (
            <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setAdjust({ modelId: g.model.id, color: g.color }); }}>
              <SlidersHorizontal className="size-3.5" /> Düzelt
            </button>
          ),
        }]
      : []),
  ];

  const shipCols: Column<Shipment>[] = [
    { key: 'no', header: 'Sevk no', cell: (x) => <span className="font-semibold text-ink-900">{x.no}</span>, csv: (x) => x.no },
    { key: 'date', header: 'Tarih', cell: (x) => fmtDate(x.date), csv: (x) => fmtDate(x.date) },
    { key: 'cust', header: 'Müşteri', cell: (x) => x.customer.name, csv: (x) => x.customer.name },
    { key: 'order', header: 'Sipariş no', cell: (x) => (x.order ? <Badge tone="blue">{x.order.no}</Badge> : <span className="text-xs text-ink-400">Siparişsiz</span>), csv: (x) => x.order?.no },
    { key: 'disp', header: 'İrsaliye no', cell: (x) => x.dispatchNo || <span className="text-ink-300">—</span>, csv: (x) => x.dispatchNo },
    { key: 'cartons', header: 'Koli', align: 'right', cell: (x) => (x.cartons != null ? fmtNum(x.cartons) : '—'), csv: (x) => x.cartons },
    { key: 'qty', header: 'Toplam adet', align: 'right', cell: (x) => <span className="font-bold">{fmtNum(x.lines.reduce((a, l) => a + l.quantity, 0))}</span>, csv: (x) => x.lines.reduce((a, l) => a + l.quantity, 0) },
  ];

  return (
    <div>
      <PageHeader
        title="Mamul & Sevkiyat"
        subtitle="Hazır ürün stoğu (model · renk · beden) ve müşteriye yapılan sevkiyatlar"
        actions={
          can('mamul:yaz') && (
            <>
              <button className="btn-outline" onClick={() => setAdjust(null)}><SlidersHorizontal className="size-4" /> Stok düzelt</button>
              <button className="btn-primary" onClick={() => setParam({ yeni: '1' })}><Truck className="size-4" /> Yeni sevkiyat</button>
            </>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Mamul stok" value={fmtNum(totals.qty)} hint="adet, 1. kalite" icon={<PackageCheck className="size-5" />} />
        <Stat label="Model / renk" value={`${totals.models} / ${(stock.data ?? []).length}`} tone="blue" icon={<Shirt className="size-5" />} />
        <Stat label="2. kalite (defolu)" value={fmtNum(totals.second)} tone={totals.second ? 'amber' : 'gray'} icon={<AlertTriangle className="size-5" />} />
      </div>

      <Tabs<TabT>
        value={tab}
        onChange={(v) => setParam({ sekme: v === 'sevkiyat' ? 'sevkiyat' : null })}
        tabs={[
          { value: 'stok', label: 'Mamul stok', count: stock.data?.length },
          { value: 'sevkiyat', label: 'Sevkiyatlar', count: shipments.data?.length },
        ]}
      />

      <Card bodyClass="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
          <SearchBox value={search} onChange={setSearch} placeholder={tab === 'stok' ? 'Model kodu, adı, renk…' : 'Sevk no, irsaliye, müşteri…'} />
          <span className="text-xs text-ink-500">{tab === 'stok' ? `${stockRows.length} satır` : `${shipRows.length} sevkiyat`}</span>
        </div>
        {tab === 'stok' ? (
          stock.isLoading ? (
            <Loading />
          ) : stock.error ? (
            <div className="p-4"><ErrorBox error={stock.error} /></div>
          ) : (
            <Table
              rows={stockRows}
              columns={stockCols}
              rowKey={(g) => `${g.model.id}|${g.color}`}
              onRowClick={can('model:gor') ? (g) => nav(`/modeller/${g.model.id}`) : undefined}
              csvName="mamul-stok"
              empty={
                (stock.data ?? []).length === 0 ? (
                  <Empty icon={<Boxes className="size-6" />} title="Mamul stok boş" text="Üretimde paketleme aşaması tamamlanan adetler otomatik olarak buraya düşer. Dışarıdan hazır alınan ürün için “Stok düzelt” ile giriş yapabilirsiniz." />
                ) : (
                  <Empty title="Eşleşen kayıt yok" text="Arama ifadesini değiştirin." />
                )
              }
            />
          )
        ) : shipments.isLoading ? (
          <Loading />
        ) : shipments.error ? (
          <div className="p-4"><ErrorBox error={shipments.error} /></div>
        ) : (
          <Table
            rows={shipRows}
            columns={shipCols}
            rowKey={(x) => x.id}
            onRowClick={setView}
            csvName="sevkiyatlar"
            empty={
              (shipments.data ?? []).length === 0 ? (
                <Empty
                  icon={<FileText className="size-6" />}
                  title="Henüz sevkiyat yok"
                  text="Mamul stoktan müşteriye çıkış yaptığınızda irsaliye ve koli bilgisiyle burada listelenir."
                  action={can('mamul:yaz') && <button className="btn-primary" onClick={() => setParam({ yeni: '1' })}><Truck className="size-4" /> Yeni sevkiyat</button>}
                />
              ) : (
                <Empty title="Eşleşen sevkiyat yok" text="Arama ifadesini değiştirin." />
              )
            }
          />
        )}
      </Card>

      {newOpen && can('mamul:yaz') && (
        <ShipmentModal
          onClose={() => setParam({ yeni: null })}
          onSaved={() => setParam({ yeni: null, sekme: 'sevkiyat' })}
        />
      )}
      {adjust !== undefined && <AdjustModal initial={adjust ?? undefined} onClose={() => setAdjust(undefined)} />}
      {view && <ShipmentView s={view} index={index} onClose={() => setView(null)} />}
    </div>
  );
}
