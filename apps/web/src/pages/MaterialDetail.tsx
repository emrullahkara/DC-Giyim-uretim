import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Copy, Layers, ListOrdered, PackageMinus, PackagePlus, Pencil, Plus, Save, ShieldCheck, Shirt, Trash2, Wallet, Warehouse } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, toInputDate } from '@/lib/format';
import { MATERIAL_TYPE, MOVEMENT_TYPE, UNITS, type Tone } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, Stat, Table, cx, useToast, type Column } from '@/components/ui';
import { MATERIAL_TONE, MaterialFormModal, partyOptions, qtyUnit, unitShort, useParties, type Lot, type Material, type PartyRef } from './Stock';

interface Movement {
  id: string;
  type: string;
  quantity: string;
  unitPrice?: string | null;
  partyId?: string | null;
  docNo?: string | null;
  note?: string | null;
  userName?: string | null;
  date: string;
  lot?: { lotNo: string; rollNo?: string | null } | null;
}
interface Detail {
  material: Material & { models?: { id: string; consumption: string; model: { id: string; code: string; name: string } }[] };
  movements: Movement[];
}

const MOVE_TONE: Record<string, Tone> = { GIRIS: 'green', IADE: 'blue', CIKIS: 'brand', FIRE: 'red', FASONA_CIKIS: 'violet', SAYIM: 'amber' };
const INVALIDATE = [['material'], ['materials'], ['requirements']];

const lotText = (l?: { lotNo: string; rollNo?: string | null } | null) => (l ? `${l.lotNo}${l.rollNo ? ` / Top ${l.rollNo}` : ''}` : '');

// ── Toplu top girişi
type RollRow = { key: number; lotNo: string; rollNo: string; quantity: string; location: string };
let rowSeq = 0;
const newRow = (p: Partial<RollRow> = {}): RollRow => ({ key: ++rowSeq, lotNo: '', rollNo: '', quantity: '', location: '', ...p });

function EntryModal({ material, onClose }: { material: Material; onClose: () => void }) {
  const { can } = useSession();
  const toast = useToast();
  const fabric = material.type === 'KUMAS' || material.type === 'ASTAR';
  const u = unitShort(material.unit);
  const [rows, setRows] = useState<RollRow[]>(() =>
    fabric ? [1, 2, 3].map((i) => newRow({ rollNo: String(i), location: material.location ?? '' })) : [newRow({ location: material.location ?? '' })],
  );
  const [f, setF] = useState({ date: toInputDate(), partyId: material.supplierId ?? '', docNo: '', unitPrice: material.unitPrice != null ? String(Number(material.unitPrice)) : '', note: '' });
  const suppliers = useParties('TEDARIKCI');

  const filled = rows.filter((r) => Number(r.quantity) > 0);
  const total = filled.reduce((s, r) => s + Number(r.quantity), 0);
  const lotCount = new Set(filled.map((r) => r.lotNo.trim()).filter(Boolean)).size;

  const upd = (key: number, patch: Partial<RollRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRows = (n: number) =>
    setRows((rs) => {
      const last = rs[rs.length - 1];
      const nextRoll = (i: number) => (last && /^\d+$/.test(last.rollNo) ? String(Number(last.rollNo) + i) : '');
      return [...rs, ...Array.from({ length: n }, (_, i) => newRow({ lotNo: last?.lotNo ?? '', rollNo: nextRoll(i + 1), location: last?.location ?? material.location ?? '' }))];
    });
  const copyLot = () => {
    const lot = rows.find((r) => r.lotNo.trim())?.lotNo ?? '';
    if (!lot) return toast('err', 'Önce ilk satıra parti (lot) numarasını yazın.');
    setRows((rs) => rs.map((r) => ({ ...r, lotNo: lot })));
  };
  const numberRolls = () => setRows((rs) => rs.map((r, i) => ({ ...r, rollNo: String(i + 1) })));

  const save = useAction((body: Record<string, unknown>) => api.post(`/stock/materials/${material.id}/movements`, body), {
    success: 'Stok girişi kaydedildi',
    invalidate: INVALIDATE,
    onDone: onClose,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!filled.length) return toast('err', 'En az bir satıra miktar girin.');
    const withLot = filled.filter((r) => r.lotNo.trim());
    if (withLot.length && withLot.length !== filled.length) return toast('err', 'Parti no bazı satırlarda boş. Ya tüm satırlara parti no girin ya da hepsini boş bırakın.');
    const body: Record<string, unknown> = {
      type: 'GIRIS',
      quantity: Math.round(total * 1000) / 1000,
      partyId: f.partyId || null,
      docNo: f.docNo.trim(),
      note: f.note.trim(),
      date: f.date,
    };
    if (can('fiyat:gor') && f.unitPrice !== '') body.unitPrice = Number(f.unitPrice);
    if (withLot.length) body.lots = filled.map((r) => ({ lotNo: r.lotNo.trim(), rollNo: r.rollNo.trim(), quantity: Number(r.quantity), location: r.location.trim() }));
    save.mutate(body);
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide="xl"
      title={<span className="flex items-center gap-2"><PackagePlus className="size-5 text-emerald-600" /> Stok girişi · {material.code}</span>}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-ink-600">
            <b className="num text-ink-900">{filled.length}</b> {fabric ? 'top' : 'satır'}
            {lotCount > 0 && <> · <b className="num text-ink-900">{lotCount}</b> parti</>} · Toplam <b className="num text-emerald-700">{fmtQty(total)} {u}</b>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-outline" onClick={onClose}>Vazgeç</button>
            <button type="submit" form="entry-form" className="btn-primary" disabled={save.isPending || !filled.length}>
              <Save className="size-4" /> Girişi kaydet
            </button>
          </div>
        </div>
      }
    >
      <form id="entry-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Giriş tarihi" required>
            <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
          </Field>
          <Field label="Tedarikçi">
            <Select value={f.partyId} onChange={(v) => setF({ ...f, partyId: v })} options={partyOptions(suppliers.data)} placeholder="— Seçilmedi —" />
          </Field>
          <Field label="İrsaliye no">
            <input className="input" value={f.docNo} onChange={(e) => setF({ ...f, docNo: e.target.value })} maxLength={40} placeholder="İRS-2026-0412" />
          </Field>
          {can('fiyat:gor') && (
            <Field label={`Birim fiyat (₺ / ${u})`} hint="Girilirse malzeme kartındaki fiyat güncellenir.">
              <input type="number" min={0} step="any" className="input num" value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: e.target.value })} />
            </Field>
          )}
        </div>

        <div className="rounded-2xl ring-1 ring-ink-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2">
            <div>
              <div className="text-sm font-semibold text-ink-900">{fabric ? 'Gelen toplar' : 'Gelen partiler'}</div>
              <div className="text-[11px] text-ink-500">Aynı boya partisinden gelen her top ayrı satırdır; kesimde hangi toptan ne kullanıldığı izlenir.</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="btn-outline btn-sm" onClick={copyLot}><Copy className="size-3.5" /> Parti no'yu tüm satırlara kopyala</button>
              {fabric && <button type="button" className="btn-outline btn-sm" onClick={numberRolls}><ListOrdered className="size-3.5" /> Top no'ları sırala</button>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="th w-10">#</th>
                  <th className="th">Parti (lot) no</th>
                  <th className="th">Top no</th>
                  <th className="th text-right">Miktar ({u})</th>
                  <th className="th">Depo yeri</th>
                  <th className="th w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r, i) => (
                  <tr key={r.key}>
                    <td className="td num py-1.5 text-xs text-ink-400">{i + 1}</td>
                    <td className="td py-1.5"><input className="input min-w-[8rem]" value={r.lotNo} onChange={(e) => upd(r.key, { lotNo: e.target.value })} maxLength={40} placeholder="Ör. 24-117" /></td>
                    <td className="td py-1.5"><input className="input min-w-[5rem]" value={r.rollNo} onChange={(e) => upd(r.key, { rollNo: e.target.value })} maxLength={40} /></td>
                    <td className="td py-1.5">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="input num min-w-[7rem] text-right"
                        value={r.quantity}
                        onChange={(e) => upd(r.key, { quantity: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && i === rows.length - 1) {
                            e.preventDefault();
                            addRows(1);
                          }
                        }}
                        placeholder="0"
                      />
                    </td>
                    <td className="td py-1.5"><input className="input min-w-[7rem]" value={r.location} onChange={(e) => upd(r.key, { location: e.target.value })} maxLength={60} /></td>
                    <td className="td py-1.5">
                      <button type="button" className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Satırı sil">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-emerald-50/60">
                  <td className="td text-xs font-semibold text-ink-600" colSpan={3}>Toplam ({filled.length} {fabric ? 'top' : 'satır'})</td>
                  <td className="td num text-right font-bold text-emerald-700">{fmtQty(total)} {u}</td>
                  <td className="td" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-ink-100 px-3 py-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => addRows(1)}><Plus className="size-3.5" /> Satır ekle</button>
            {fabric && <button type="button" className="btn-ghost btn-sm" onClick={() => addRows(5)}><Plus className="size-3.5" /> 5 top ekle</button>}
            <span className="ml-auto self-center text-[11px] text-ink-400">İpucu: son satırda Enter'a basınca yeni satır açılır.</span>
          </div>
        </div>

        <Field label="Not" hint="Parti no tüm satırlarda boş bırakılırsa giriş, top/parti takibi olmadan toplam miktar olarak kaydedilir.">
          <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} placeholder="Ör. boya farkı kontrol edildi, 2. top hafif ton farklı" />
        </Field>
      </form>
    </Modal>
  );
}

// ── Çıkış / fire / fason / iade / sayım
const OUT_TYPES: { value: string; label: string; hint: string }[] = [
  { value: 'CIKIS', label: 'Stok çıkışı (üretime / kesime)', hint: 'Depodan üretime ya da başka bir yere verilen miktar stoktan düşülür.' },
  { value: 'FIRE', label: 'Fire', hint: 'Hatalı, lekeli, kullanılamaz durumdaki malzeme stoktan düşülür.' },
  { value: 'FASONA_CIKIS', label: 'Fasona çıkış', hint: 'Fasoncuya gönderilen malzeme stoktan düşülür; fasoncuyu seçmeyi unutmayın.' },
  { value: 'IADE', label: 'İade (depoya geri dönüş)', hint: 'Kesimden artan ya da fasondan geri gelen malzeme stoğa geri eklenir.' },
  { value: 'SAYIM', label: 'Sayım düzeltmesi', hint: 'Sayımda bulduğunuz GERÇEK stok miktarını girin; sistem aradaki farkı (+/−) kendisi hesaplayıp düzeltme hareketi yazar.' },
];

function MovementModal({ material, lots, onClose }: { material: Material; lots: Lot[]; onClose: () => void }) {
  const toast = useToast();
  const u = unitShort(material.unit);
  const stock = Number(material.stock);
  const [f, setF] = useState({ type: 'CIKIS', quantity: '', lotId: '', partyId: '', docNo: '', note: '', date: toInputDate() });
  const parties = useParties();
  const isCount = f.type === 'SAYIM';
  const isIn = f.type === 'IADE';
  const qty = Number(f.quantity) || 0;
  const lot = lots.find((l) => l.id === f.lotId);
  const lotChoices = lots.filter((l) => isIn || Number(l.remaining) > 0);
  const partyList: PartyRef[] = (parties.data ?? []).filter((p) => f.type !== 'FASONA_CIKIS' || !p.roles || p.roles.includes('FASONCU'));
  const meta = OUT_TYPES.find((t) => t.value === f.type)!;

  let warn: ReactNode = null;
  if (!isCount && !isIn && qty > stock) warn = `Stok yetersiz: mevcut ${fmtQty(stock)} ${u}.`;
  else if (!isCount && !isIn && lot && qty > Number(lot.remaining)) warn = `Seçilen topta ${fmtQty(lot.remaining)} ${u} kaldı.`;

  const save = useAction((body: Record<string, unknown>) => api.post(`/stock/materials/${material.id}/movements`, body), {
    success: isCount ? 'Sayım düzeltmesi kaydedildi' : 'Stok hareketi kaydedildi',
    invalidate: INVALIDATE,
    onDone: onClose,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (f.quantity === '' || (!isCount && qty <= 0)) return toast('err', 'Miktar girin.');
    save.mutate({
      type: f.type,
      quantity: qty,
      lotId: isCount ? null : f.lotId || null,
      partyId: f.partyId || null,
      docNo: f.docNo.trim(),
      note: f.note.trim(),
      date: f.date,
    });
  };

  const diff = Math.round((qty - stock) * 1000) / 1000;

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={<span className="flex items-center gap-2"><PackageMinus className="size-5 text-brand-600" /> Stok hareketi · {material.code}</span>}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button type="submit" form="move-form" className="btn-primary" disabled={save.isPending}>
            <Save className="size-4" /> Kaydet
          </button>
        </>
      }
    >
      <form id="move-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Hareket türü" required className="sm:col-span-2" hint={meta.hint}>
          <Select value={f.type} onChange={(v) => setF({ ...f, type: v, lotId: '', partyId: '' })} options={OUT_TYPES.map(({ value, label }) => ({ value, label }))} />
        </Field>
        <Field label={isCount ? `Sayılan gerçek stok (${u})` : `Miktar (${u})`} required hint={`Kayıtlı stok: ${fmtQty(stock)} ${u}`}>
          <input type="number" min={0} step="any" className="input num" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} required autoFocus />
        </Field>
        {!isCount ? (
          <Field label="Top / parti" hint={lotChoices.length ? 'Seçerseniz miktar o topun kalanından düşülür.' : 'Bu malzemede kalan top yok.'}>
            <Select
              value={f.lotId}
              onChange={(v) => setF({ ...f, lotId: v })}
              placeholder="— Toptan bağımsız —"
              options={lotChoices.map((l) => ({ value: l.id, label: `${lotText(l)} · kalan ${fmtQty(l.remaining)} ${u}` }))}
            />
          </Field>
        ) : (
          <div className="self-end rounded-xl bg-amber-50 px-3 py-2 text-sm ring-1 ring-amber-200">
            {f.quantity === '' ? (
              <span className="text-amber-800">Saydığınız miktarı girin, fark burada görünür.</span>
            ) : (
              <span className="text-amber-900">
                Fark:{' '}
                <b className={cx('num', diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-red-600' : '')}>
                  {diff > 0 ? '+' : ''}{fmtQty(diff)} {u}
                </b>{' '}
                ({fmtQty(stock)} → {fmtQty(qty)})
              </span>
            )}
          </div>
        )}
        {warn && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 sm:col-span-2">
            <AlertTriangle className="size-4 shrink-0" /> {warn}
          </div>
        )}
        <Field label={f.type === 'FASONA_CIKIS' ? 'Fasoncu' : 'Cari'}>
          <Select value={f.partyId} onChange={(v) => setF({ ...f, partyId: v })} options={partyOptions(partyList)} placeholder="— Seçilmedi —" />
        </Field>
        <Field label="Tarih">
          <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Belge / irsaliye no">
          <input className="input" value={f.docNo} onChange={(e) => setF({ ...f, docNo: e.target.value })} maxLength={40} />
        </Field>
        <Field label="Not">
          <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} placeholder={isCount ? 'Ör. yıl sonu sayımı' : ''} />
        </Field>
      </form>
    </Modal>
  );
}

// ── Sayfa
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-medium text-ink-900">{children ?? <span className="text-ink-300">—</span>}</dd>
    </div>
  );
}

export default function MaterialDetail() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const [modal, setModal] = useState<'in' | 'out' | 'edit' | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const q = useQuery({ queryKey: ['material', id], queryFn: () => api.get<Detail>(`/stock/materials/${id}`) });

  const lots = q.data?.material.lots ?? [];
  const visibleLots = useMemo(() => (showEmpty ? lots : lots.filter((l) => Number(l.remaining) > 0)), [lots, showEmpty]);

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const { material: m, movements } = q.data;
  const u = unitShort(m.unit);
  const stock = Number(m.stock);
  const min = Number(m.minStock);
  const critical = min > 0 && stock <= min;
  const openLots = lots.filter((l) => Number(l.remaining) > 0);
  const hasPrice = m.unitPrice != null && m.unitPrice !== '';
  const write = can('depo:yaz');

  const lotCols: Column<Lot>[] = [
    { key: 'lot', header: 'Parti (lot) no', cell: (l) => <span className="font-semibold text-ink-900">{l.lotNo}</span>, csv: (l) => l.lotNo },
    { key: 'roll', header: 'Top no', cell: (l) => l.rollNo || <span className="text-ink-300">—</span>, csv: (l) => l.rollNo },
    { key: 'qty', header: 'Gelen', align: 'right', cell: (l) => qtyUnit(l.quantity, m.unit), csv: (l) => Number(l.quantity) },
    {
      key: 'rem',
      header: 'Kalan',
      align: 'right',
      cell: (l) => {
        const r = Number(l.remaining);
        const pct = Number(l.quantity) ? Math.round((r / Number(l.quantity)) * 100) : 0;
        return (
          <div className="flex items-center justify-end gap-2">
            <div className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-ink-100 sm:block">
              <div className={cx('h-full rounded-full', r <= 0 ? 'bg-ink-300' : pct < 25 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
            </div>
            <span className={cx('font-bold', r <= 0 ? 'text-ink-400' : 'text-ink-900')}>{qtyUnit(r, m.unit)}</span>
          </div>
        );
      },
      csv: (l) => Number(l.remaining),
    },
    { key: 'loc', header: 'Yer', cell: (l) => l.location || <span className="text-ink-300">—</span>, csv: (l) => l.location },
    { key: 'date', header: 'Giriş', cell: (l) => fmtDate(l.receivedAt), csv: (l) => fmtDate(l.receivedAt) },
  ];

  const moveCols: Column<Movement>[] = [
    { key: 'date', header: 'Tarih', cell: (x) => <span className="whitespace-nowrap">{fmtDateTime(x.date)}</span>, csv: (x) => fmtDateTime(x.date) },
    { key: 'type', header: 'Hareket', cell: (x) => <Badge tone={MOVE_TONE[x.type] ?? 'gray'}>{MOVEMENT_TYPE[x.type] ?? x.type}</Badge>, csv: (x) => MOVEMENT_TYPE[x.type] ?? x.type },
    {
      key: 'qty',
      header: 'Miktar',
      align: 'right',
      cell: (x) => {
        const n = Number(x.quantity);
        return <span className={cx('font-bold whitespace-nowrap', n > 0 ? 'text-emerald-700' : n < 0 ? 'text-red-600' : 'text-ink-500')}>{n > 0 ? '+' : ''}{fmtQty(n)} {u}</span>;
      },
      csv: (x) => Number(x.quantity),
    },
    { key: 'lot', header: 'Parti / top', cell: (x) => lotText(x.lot) || <span className="text-ink-300">—</span>, csv: (x) => lotText(x.lot) },
    { key: 'doc', header: 'Belge no', cell: (x) => x.docNo || <span className="text-ink-300">—</span>, csv: (x) => x.docNo },
    { key: 'note', header: 'Not', cell: (x) => <span className="line-clamp-2 max-w-xs text-ink-600">{x.note || '—'}</span>, csv: (x) => x.note },
    { key: 'user', header: 'Kullanıcı', cell: (x) => <span className="text-xs text-ink-500">{x.userName || '—'}</span>, csv: (x) => x.userName },
  ];

  return (
    <div>
      <PageHeader
        back={
          <Link to="/depo" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-brand-700">
            <ArrowLeft className="size-3.5" /> Kumaş & Malzeme
          </Link>
        }
        title={<>{m.code} · {m.name}</>}
        subtitle={
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={MATERIAL_TONE[m.type]}>{MATERIAL_TYPE[m.type] ?? m.type}</Badge>
            {m.color && <Badge>{m.color}</Badge>}
            {critical && <Badge tone="red"><AlertTriangle className="size-3" /> Kritik stok</Badge>}
            {m.ownerParty && <Badge tone="violet"><ShieldCheck className="size-3" /> Emanet · {m.ownerParty.name}</Badge>}
            {!m.active && <Badge tone="gray">Pasif</Badge>}
          </span>
        }
        actions={
          write && (
            <>
              <button className="btn-ghost" onClick={() => setModal('edit')}><Pencil className="size-4" /> Düzenle</button>
              <button className="btn-outline" onClick={() => setModal('out')}><PackageMinus className="size-4" /> Çıkış / fire / sayım</button>
              <button className="btn-primary" onClick={() => setModal('in')}><PackagePlus className="size-4" /> Stok girişi</button>
            </>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Mevcut stok" value={qtyUnit(stock, m.unit)} tone={critical ? 'red' : 'brand'} icon={<Warehouse className="size-5" />} hint={critical ? 'Minimum seviyenin altında' : undefined} />
        <Stat label="Minimum stok" value={min ? qtyUnit(min, m.unit) : '—'} tone="amber" icon={<AlertTriangle className="size-5" />} />
        <Stat label="Açık top / parti" value={openLots.length} tone="blue" icon={<Layers className="size-5" />} hint={`${new Set(openLots.map((l) => l.lotNo)).size} farklı parti`} />
        {hasPrice ? (
          <Stat label="Stok değeri" value={fmtMoney(stock * Number(m.unitPrice))} tone="green" icon={<Wallet className="size-5" />} hint={`${fmtMoney(m.unitPrice)} / ${u}`} />
        ) : (
          <Stat label="Kullanan model" value={m.models?.length ?? 0} tone="violet" icon={<Shirt className="size-5" />} />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Malzeme kartı">
          <dl className="divide-y divide-ink-100">
            <InfoRow label="Tür">{MATERIAL_TYPE[m.type] ?? m.type}</InfoRow>
            <InfoRow label="Renk">{m.color}</InfoRow>
            <InfoRow label="Birim">{UNITS[m.unit] ?? m.unit}</InfoRow>
            {!!(m.widthCm || m.gsm) && <InfoRow label="En / gramaj">{[m.widthCm ? `${m.widthCm} cm` : null, m.gsm ? `${m.gsm} gr/m²` : null].filter(Boolean).join(' · ')}</InfoRow>}
            <InfoRow label="Kompozisyon">{m.composition}</InfoRow>
            <InfoRow label="Tedarikçi">{m.supplier ? (can('cari:gor') ? <Link className="text-brand-700 hover:underline" to={`/cariler/${m.supplier.id}`}>{m.supplier.name}</Link> : m.supplier.name) : null}</InfoRow>
            <InfoRow label="Mülkiyet">{m.ownerParty ? <span className="text-violet-700">Emanet · {m.ownerParty.name}</span> : 'Kendi malımız'}</InfoRow>
            <InfoRow label="Depo yeri">{m.location}</InfoRow>
            {hasPrice && <InfoRow label="Birim fiyat">{fmtMoney(m.unitPrice)} / {u}</InfoRow>}
          </dl>
        </Card>

        <Card
          className="lg:col-span-2"
          title="Toplar / partiler"
          subtitle="Her giriş topu ayrı izlenir; kesimde hangi partiden kullanıldığı buradan takip edilir."
          actions={
            lots.length > openLots.length && (
              <label className="flex items-center gap-1.5 text-xs text-ink-600">
                <input type="checkbox" className="accent-brand-700" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} /> Bitenleri de göster
              </label>
            )
          }
          bodyClass="p-0"
        >
          <Table
            rows={visibleLots}
            columns={lotCols}
            rowKey={(l) => l.id}
            dense
            csvName={`${m.code}-toplar`}
            empty={
              <Empty
                icon={<Layers className="size-6" />}
                title="Stokta top / parti yok"
                text={write ? '“Stok girişi” ile gelen kumaş toplarını parti ve top numarasıyla kaydedin.' : 'Bu malzeme için henüz top/parti girişi yapılmamış.'}
                action={write && <button className="btn-primary btn-sm" onClick={() => setModal('in')}><PackagePlus className="size-3.5" /> Stok girişi</button>}
              />
            }
          />
        </Card>
      </div>

      <Card className="mt-4" title="Stok hareketleri" subtitle="Son 200 hareket" bodyClass="p-0">
        <Table
          rows={movements}
          columns={moveCols}
          rowKey={(x) => x.id}
          dense
          csvName={`${m.code}-hareketler`}
          empty={<Empty title="Henüz hareket yok" text="Giriş, çıkış, fire, fason ve sayım hareketleri burada tarih sırasıyla listelenir." />}
        />
      </Card>

      <Card className="mt-4" title="Bu malzemeyi kullanan modeller" subtitle="Reçetesinde bu malzeme bulunan modeller ve adet başı sarfiyatları">
        {m.models?.length ? (
          <div className="flex flex-wrap gap-2">
            {m.models.map((mm) => (
              <Link key={mm.id} to={`/modeller/${mm.model.id}`} className="group flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 ring-1 ring-ink-200 transition hover:bg-brand-50 hover:ring-brand-200">
                <Shirt className="size-4 text-ink-400 group-hover:text-brand-600" />
                <span className="text-sm font-semibold text-ink-900">{mm.model.code}</span>
                <span className="text-sm text-ink-600">{mm.model.name}</span>
                <Badge tone="brand" className="num">{fmtQty(mm.consumption)} {u}/adet</Badge>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-500">Henüz hiçbir model reçetesinde kullanılmıyor. Model sayfasındaki reçete bölümünden sarfiyat tanımlayabilirsiniz.</p>
        )}
      </Card>

      {modal === 'in' && <EntryModal material={m} onClose={() => setModal(null)} />}
      {modal === 'out' && <MovementModal material={m} lots={lots} onClose={() => setModal(null)} />}
      {modal === 'edit' && <MaterialFormModal open initial={m} onClose={() => setModal(null)} />}
    </div>
  );
}
