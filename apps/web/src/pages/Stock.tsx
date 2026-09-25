import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Boxes, ClipboardList, Layers, Plus, Save, ShieldCheck, Warehouse } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { fmtQty } from '@/lib/format';
import { MATERIAL_TYPE, UNITS, type Tone } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, SearchBox, Select, Stat, Table, Tabs, cx, type Column } from '@/components/ui';

// ── Ortak tipler ve yardımcılar (MaterialDetail de kullanır)
export interface PartyRef { id: string; name: string; roles?: string[] }
export interface Lot { id: string; lotNo: string; rollNo?: string | null; quantity: string; remaining: string; location?: string | null; receivedAt: string }
export interface Material {
  id: string;
  type: string;
  code: string;
  name: string;
  color?: string | null;
  unit: string;
  widthCm?: number | null;
  gsm?: number | null;
  composition?: string | null;
  supplierId?: string | null;
  supplier?: PartyRef | null;
  ownerPartyId?: string | null;
  ownerParty?: PartyRef | null;
  unitPrice?: string | null;
  minStock: string;
  stock: string;
  location?: string | null;
  active: boolean;
  lots?: Lot[];
  critical?: boolean;
}

const UNIT_SHORT: Record<string, string> = { METRE: 'm', KG: 'kg', ADET: 'adet', TOP: 'top', PAKET: 'paket', KONI: 'koni', DUZINE: 'düzine' };
export const unitShort = (u?: string | null) => (u ? UNIT_SHORT[u] ?? u.toLowerCase() : '');
export const qtyUnit = (v: unknown, u?: string | null) => `${fmtQty(Number(v ?? 0))} ${unitShort(u)}`.trim();

export const MATERIAL_TONE: Record<string, Tone> = { KUMAS: 'brand', ASTAR: 'violet', AKSESUAR: 'amber', IPLIK: 'blue', ETIKET: 'green', AMBALAJ: 'gray', DIGER: 'gray' };
const DEFAULT_UNIT: Record<string, string> = { KUMAS: 'METRE', ASTAR: 'METRE', AKSESUAR: 'ADET', IPLIK: 'KONI', ETIKET: 'ADET', AMBALAJ: 'ADET', DIGER: 'ADET' };
const isFabric = (t: string) => t === 'KUMAS' || t === 'ASTAR';

export function useParties(type?: 'MUSTERI' | 'TEDARIKCI' | 'FASONCU', enabled = true) {
  return useQuery({
    queryKey: ['parties', { type: type ?? '', take: 500 }],
    queryFn: () => api.get<PartyRef[]>(`/parties?take=500${type ? `&type=${type}` : ''}`),
    enabled,
    staleTime: 60_000,
  });
}
export const partyOptions = (list?: PartyRef[]) => (list ?? []).map((p) => ({ value: p.id, label: p.name }));

// ── Malzeme ekle / düzenle formu
type MatForm = {
  type: string; code: string; name: string; color: string; unit: string; widthCm: string; gsm: string; composition: string;
  supplierId: string; ownerPartyId: string; unitPrice: string; minStock: string; location: string; active: boolean;
};
const toForm = (m?: Material | null): MatForm => ({
  type: m?.type ?? 'KUMAS',
  code: m?.code ?? '',
  name: m?.name ?? '',
  color: m?.color ?? '',
  unit: m?.unit ?? 'METRE',
  widthCm: m?.widthCm != null ? String(m.widthCm) : '',
  gsm: m?.gsm != null ? String(m.gsm) : '',
  composition: m?.composition ?? '',
  supplierId: m?.supplierId ?? '',
  ownerPartyId: m?.ownerPartyId ?? '',
  unitPrice: m?.unitPrice != null ? String(Number(m.unitPrice)) : '',
  minStock: m ? String(Number(m.minStock) || '') : '',
  location: m?.location ?? '',
  active: m?.active ?? true,
});

export function MaterialFormModal({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial?: Material | null; onSaved?: (m: Material) => void }) {
  const { can } = useSession();
  const showPrice = can('fiyat:gor');
  // Not: çağıran taraf modalı yalnızca açıkken render eder; form her açılışta sıfırlanır.
  const [f, setF] = useState<MatForm>(() => toForm(initial));
  const suppliers = useParties('TEDARIKCI', open);
  const customers = useParties('MUSTERI', open);
  const edit = !!initial;

  const save = useAction(
    (body: Record<string, unknown>) => (edit ? api.patch<Material>(`/stock/materials/${initial!.id}`, body) : api.post<Material>('/stock/materials', body)),
    {
      success: edit ? 'Malzeme kartı güncellendi' : 'Malzeme eklendi',
      invalidate: [['materials'], ['material'], ['requirements']],
      onDone: (m) => {
        onClose();
        onSaved?.(m);
      },
    },
  );

  const set = <K extends keyof MatForm>(k: K, v: MatForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      type: f.type,
      code: f.code.trim(),
      name: f.name.trim(),
      color: f.color.trim(),
      unit: f.unit,
      widthCm: f.widthCm === '' ? null : Number(f.widthCm),
      gsm: f.gsm === '' ? null : Number(f.gsm),
      composition: f.composition.trim(),
      supplierId: f.supplierId || null,
      ownerPartyId: f.ownerPartyId || null,
      minStock: f.minStock === '' ? 0 : Number(f.minStock),
      location: f.location.trim(),
    };
    if (showPrice) body.unitPrice = f.unitPrice === '' ? null : Number(f.unitPrice);
    if (edit) body.active = f.active;
    save.mutate(body);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={edit ? 'Malzeme kartını düzenle' : 'Yeni malzeme'}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button type="submit" form="material-form" className="btn-primary" disabled={save.isPending}>
            <Save className="size-4" /> {edit ? 'Kaydet' : 'Malzemeyi ekle'}
          </button>
        </>
      }
    >
      <form id="material-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Malzeme türü" required>
          <Select
            value={f.type}
            onChange={(v) => setF((p) => ({ ...p, type: v, unit: edit ? p.unit : DEFAULT_UNIT[v] ?? p.unit }))}
            options={MATERIAL_TYPE}
          />
        </Field>
        <Field label="Malzeme kodu" required hint="Depoda kullandığınız kısa kod (ör. KMS-0142)">
          <input className="input" value={f.code} onChange={(e) => set('code', e.target.value)} required maxLength={40} placeholder="KMS-0142" />
        </Field>
        <Field label="Malzeme adı" required>
          <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required maxLength={160} placeholder="Süprem penye 30/1" />
        </Field>
        <Field label="Renk">
          <input className="input" value={f.color} onChange={(e) => set('color', e.target.value)} maxLength={60} placeholder="Lacivert" />
        </Field>
        <Field label="Stok birimi" required>
          <Select value={f.unit} onChange={(v) => set('unit', v)} options={UNITS} />
        </Field>
        <Field label="Depo yeri" hint="Raf / bölüm bilgisi">
          <input className="input" value={f.location} onChange={(e) => set('location', e.target.value)} maxLength={60} placeholder="A-3 rafı" />
        </Field>
        {isFabric(f.type) && (
          <>
            <Field label="En (cm)">
              <input className="input num" type="number" min={0} max={1000} value={f.widthCm} onChange={(e) => set('widthCm', e.target.value)} placeholder="180" />
            </Field>
            <Field label="Gramaj (gr/m²)">
              <input className="input num" type="number" min={0} max={5000} value={f.gsm} onChange={(e) => set('gsm', e.target.value)} placeholder="160" />
            </Field>
          </>
        )}
        <Field label="Kompozisyon" className={isFabric(f.type) ? '' : 'sm:col-span-2 lg:col-span-1'}>
          <input className="input" value={f.composition} onChange={(e) => set('composition', e.target.value)} maxLength={120} placeholder="%95 Pamuk %5 Elastan" />
        </Field>
        <Field label="Tedarikçi">
          <Select value={f.supplierId} onChange={(v) => set('supplierId', v)} options={partyOptions(suppliers.data)} placeholder="— Seçilmedi —" />
        </Field>
        <Field label="Müşteri malı ise sahibi (emanet kumaş)" hint="Marka kendi kumaşını gönderdiyse seçin; stok emanet olarak izlenir.">
          <Select value={f.ownerPartyId} onChange={(v) => set('ownerPartyId', v)} options={partyOptions(customers.data)} placeholder="— Kendi malımız —" />
        </Field>
        <Field label={`Minimum stok (${unitShort(f.unit)})`} hint="Stok bu seviyeye inince kritik uyarısı verilir.">
          <input className="input num" type="number" min={0} step="any" value={f.minStock} onChange={(e) => set('minStock', e.target.value)} placeholder="0" />
        </Field>
        {showPrice && (
          <Field label={`Birim fiyat (₺ / ${unitShort(f.unit)})`} hint="Model maliyetinde bu fiyat kullanılır.">
            <input className="input num" type="number" min={0} step="any" value={f.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} placeholder="0,00" />
          </Field>
        )}
        {edit && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-700 sm:col-span-2 lg:col-span-3">
            <input type="checkbox" className="size-4 rounded accent-brand-700" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
            Aktif (kapatırsanız malzeme listelerde görünmez)
          </label>
        )}
      </form>
    </Modal>
  );
}

// ── Sipariş ihtiyacı
interface Requirement {
  material: { id: string; code: string; name: string; unit: string; color?: string | null; type: string };
  stock: number;
  required: number;
  shortage: number;
  orders: string[];
}

function Requirements() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['requirements'], queryFn: () => api.get<Requirement[]>('/stock/requirements') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const rows = q.data ?? [];
  const short = rows.filter((r) => r.shortage > 0).length;
  const cols: Column<Requirement>[] = [
    {
      key: 'mat',
      header: 'Malzeme',
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-ink-900">{r.material.code} · {r.material.name}</div>
          <div className="text-xs text-ink-500">{[MATERIAL_TYPE[r.material.type], r.material.color].filter(Boolean).join(' · ')}</div>
        </div>
      ),
      csv: (r) => `${r.material.code} ${r.material.name}`,
    },
    { key: 'req', header: 'Gerekli', align: 'right', cell: (r) => qtyUnit(r.required, r.material.unit), csv: (r) => r.required },
    { key: 'stock', header: 'Stok', align: 'right', cell: (r) => qtyUnit(r.stock, r.material.unit), csv: (r) => r.stock },
    {
      key: 'short',
      header: 'Eksik',
      align: 'right',
      cell: (r) => (r.shortage > 0 ? <span className="font-bold text-red-600">−{qtyUnit(r.shortage, r.material.unit)}</span> : <Badge tone="green">Yeterli</Badge>),
      csv: (r) => r.shortage,
    },
    {
      key: 'orders',
      header: 'Siparişler',
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.orders.map((o) => <Badge key={o} tone="blue">{o}</Badge>)}
        </div>
      ),
      csv: (r) => r.orders.join(', '),
    },
  ];
  return (
    <Card
      title="Açık siparişlerin malzeme ihtiyacı"
      subtitle="Onaylı ve üretimdeki siparişlerde henüz kesilmemiş adetler × model reçetesindeki sarfiyat"
      actions={short > 0 ? <Badge tone="red"><AlertTriangle className="size-3" /> {short} kalemde eksik var</Badge> : rows.length ? <Badge tone="green">Tüm ihtiyaç karşılanıyor</Badge> : null}
      bodyClass="p-0"
    >
      <Table
        rows={rows}
        columns={cols}
        rowKey={(r) => r.material.id}
        onRowClick={(r) => nav(`/depo/${r.material.id}`)}
        csvName="malzeme-ihtiyaci"
        empty={
          <Empty
            icon={<ClipboardList className="size-6" />}
            title="Hesaplanacak ihtiyaç yok"
            text="Onaylı ya da üretimdeki siparişlerin modellerine reçete (sarfiyat) girildiğinde, kesilmemiş adetler için gereken kumaş ve malzeme burada listelenir."
          />
        }
      />
    </Card>
  );
}

// ── Sayfa
type View = 'stok' | 'ihtiyac';
type TypeTab = 'ALL' | 'KRITIK' | keyof typeof MATERIAL_TYPE;

export default function Stock() {
  const { can } = useSession();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [openNew, setOpenNew] = useState(false);

  const view: View = params.get('gorunum') === 'ihtiyac' ? 'ihtiyac' : 'stok';
  const tab: TypeTab = params.get('critical') === '1' ? 'KRITIK' : ((params.get('tur') as TypeTab) || 'ALL');

  const setParam = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    setParams(p, { replace: true });
  };
  const setTab = (t: TypeTab) => setParam({ critical: t === 'KRITIK' ? '1' : null, tur: t !== 'KRITIK' && t !== 'ALL' ? t : null });

  const q = useQuery({ queryKey: ['materials', { take: 500 }], queryFn: () => api.get<Material[]>('/stock/materials?take=500') });
  const all = q.data ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: all.length, KRITIK: 0 };
    for (const m of all) {
      c[m.type] = (c[m.type] ?? 0) + 1;
      if (m.critical) c.KRITIK++;
    }
    return c;
  }, [all]);

  const rows = useMemo(() => {
    const s = search.trim().toLocaleLowerCase('tr');
    return all.filter((m) => {
      if (tab === 'KRITIK' && !m.critical) return false;
      if (tab !== 'KRITIK' && tab !== 'ALL' && m.type !== tab) return false;
      if (!s) return true;
      return [m.code, m.name, m.color, m.supplier?.name, m.ownerParty?.name, m.composition].some((x) => x?.toLocaleLowerCase('tr').includes(s));
    });
  }, [all, tab, search]);

  const stats = useMemo(
    () => ({
      rolls: all.reduce((s, m) => s + (m.lots?.length ?? 0), 0),
      consigned: all.filter((m) => m.ownerParty).length,
    }),
    [all],
  );

  const tabs: { value: TypeTab; label: string; count?: number }[] = [
    { value: 'ALL', label: 'Tümü', count: counts.ALL },
    ...Object.entries(MATERIAL_TYPE).map(([value, label]) => ({ value: value as TypeTab, label, count: counts[value] ?? 0 })),
    { value: 'KRITIK', label: 'Kritik stok', count: counts.KRITIK },
  ];

  const cols: Column<Material>[] = [
    { key: 'code', header: 'Kod', cell: (m) => <span className="font-mono text-xs font-bold text-ink-900">{m.code}</span>, csv: (m) => m.code },
    {
      key: 'name',
      header: 'Malzeme',
      cell: (m) => (
        <div className="min-w-[10rem]">
          <div className="font-semibold text-ink-900">{m.name}</div>
          {!!(m.composition || m.widthCm || m.gsm) && (
            <div className="text-xs text-ink-500">{[m.composition, m.widthCm ? `${m.widthCm} cm en` : null, m.gsm ? `${m.gsm} gr/m²` : null].filter(Boolean).join(' · ')}</div>
          )}
        </div>
      ),
      csv: (m) => m.name,
    },
    { key: 'color', header: 'Renk', cell: (m) => m.color || <span className="text-ink-400">—</span>, csv: (m) => m.color },
    { key: 'type', header: 'Tür', cell: (m) => <Badge tone={MATERIAL_TONE[m.type]}>{MATERIAL_TYPE[m.type] ?? m.type}</Badge>, csv: (m) => MATERIAL_TYPE[m.type] ?? m.type },
    {
      key: 'stock',
      header: 'Stok',
      align: 'right',
      cell: (m) => <span className={cx('font-bold', m.critical ? 'text-red-600' : 'text-ink-900')}>{qtyUnit(m.stock, m.unit)}</span>,
      csv: (m) => Number(m.stock),
    },
    { key: 'min', header: 'Min. stok', align: 'right', cell: (m) => (Number(m.minStock) ? <span className="text-ink-500">{qtyUnit(m.minStock, m.unit)}</span> : <span className="text-ink-300">—</span>), csv: (m) => Number(m.minStock) },
    {
      key: 'state',
      header: 'Durum',
      cell: (m) =>
        m.critical ? (
          <Badge tone="red"><AlertTriangle className="size-3" /> Kritik</Badge>
        ) : Number(m.stock) <= 0 ? (
          <Badge tone="gray">Stok yok</Badge>
        ) : (
          <Badge tone="green">Yeterli</Badge>
        ),
      csv: (m) => (m.critical ? 'Kritik' : ''),
    },
    { key: 'supplier', header: 'Tedarikçi', cell: (m) => m.supplier?.name ?? <span className="text-ink-400">—</span>, csv: (m) => m.supplier?.name },
    {
      key: 'owner',
      header: 'Mülkiyet',
      cell: (m) => (m.ownerParty ? <Badge tone="violet" className="max-w-[12rem] truncate"><ShieldCheck className="size-3" /> Emanet · {m.ownerParty.name}</Badge> : <span className="text-xs text-ink-400">Kendi malımız</span>),
      csv: (m) => (m.ownerParty ? `Emanet: ${m.ownerParty.name}` : ''),
    },
    { key: 'lots', header: 'Açık top', align: 'right', cell: (m) => (m.lots?.length ? <span className="font-semibold">{m.lots.length}</span> : <span className="text-ink-300">0</span>), csv: (m) => m.lots?.length ?? 0 },
    { key: 'loc', header: 'Yer', cell: (m) => <span className="text-xs text-ink-500">{m.location ?? '—'}</span>, csv: (m) => m.location, className: 'hidden xl:table-cell' },
  ];

  return (
    <div>
      <PageHeader
        title="Kumaş & Malzeme"
        subtitle="Kumaş topları, astar, aksesuar ve yardımcı malzeme deposu"
        actions={
          can('depo:yaz') && (
            <button className="btn-primary" onClick={() => setOpenNew(true)}>
              <Plus className="size-4" /> Yeni malzeme
            </button>
          )
        }
      />

      <div className="mb-4 inline-flex rounded-xl bg-white p-1 ring-1 ring-ink-200">
        {([
          { v: 'stok', label: 'Depo stoğu', icon: <Warehouse className="size-4" /> },
          { v: 'ihtiyac', label: 'Sipariş ihtiyacı', icon: <ClipboardList className="size-4" /> },
        ] as const).map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setParam({ gorunum: o.v === 'ihtiyac' ? 'ihtiyac' : null })}
            className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition', view === o.v ? 'bg-brand-700 text-white shadow-sm' : 'text-ink-600 hover:bg-ink-100')}
          >
            {o.icon} {o.label}
          </button>
        ))}
      </div>

      {view === 'ihtiyac' ? (
        <Requirements />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Malzeme kalemi" value={all.length} icon={<Boxes className="size-5" />} />
            <Stat label="Kritik stok" value={counts.KRITIK} tone={counts.KRITIK ? 'red' : 'green'} icon={<AlertTriangle className="size-5" />} hint="Min. stok altındakiler" onClick={() => setTab('KRITIK')} />
            <Stat label="Açık top / parti" value={stats.rolls} tone="blue" icon={<Layers className="size-5" />} />
            <Stat label="Emanet (müşteri malı)" value={stats.consigned} tone="violet" icon={<ShieldCheck className="size-5" />} />
          </div>

          <Tabs value={tab} onChange={setTab} tabs={tabs} />

          <Card bodyClass="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
              <SearchBox value={search} onChange={setSearch} placeholder="Kod, ad, renk, tedarikçi…" />
              <span className="text-xs text-ink-500">{rows.length} kalem</span>
            </div>
            {q.isLoading ? (
              <Loading />
            ) : q.error ? (
              <div className="p-4"><ErrorBox error={q.error} /></div>
            ) : (
              <Table
                rows={rows}
                columns={cols}
                rowKey={(m) => m.id}
                onRowClick={(m) => nav(`/depo/${m.id}`)}
                csvName="malzeme-stok"
                empty={
                  all.length === 0 ? (
                    <Empty
                      icon={<Boxes className="size-6" />}
                      title="Henüz malzeme tanımlanmamış"
                      text="Önce kumaş, astar, aksesuar gibi malzemelerin kartını açın; ardından malzeme sayfasından top/parti girişi yaparak stoğu oluşturun."
                      action={can('depo:yaz') && <button className="btn-primary" onClick={() => setOpenNew(true)}><Plus className="size-4" /> Yeni malzeme</button>}
                    />
                  ) : tab === 'KRITIK' && !search ? (
                    <Empty icon={<ShieldCheck className="size-6" />} title="Kritik stokta malzeme yok" text="Minimum stok seviyesinin altına düşen malzeme olduğunda burada listelenir." />
                  ) : (
                    <Empty title="Eşleşen malzeme yok" text="Arama ifadesini ya da seçili türü değiştirmeyi deneyin." />
                  )
                }
              />
            )}
          </Card>
        </>
      )}

      {openNew && <MaterialFormModal open onClose={() => setOpenNew(false)} onSaved={(m) => nav(`/depo/${m.id}`)} />}
    </div>
  );
}
