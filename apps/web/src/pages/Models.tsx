import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Shirt, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { fmtMoney } from '@/lib/format';
import { MODEL_STATUS, statusTone } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, SearchBox, Select, Table, Tabs, cx, type Column } from '@/components/ui';

export interface StyleModel {
  id: string;
  code: string;
  name: string;
  category?: string | null;
  season?: string | null;
  customerId?: string | null;
  customer?: { id: string; name: string } | null;
  sizes: string[];
  colors: string[];
  status: string;
  description?: string | null;
  route: string[];
  salePrice?: string | null;
  overheadPct?: string | null;
  createdAt?: string;
}

const splitList = (s: string) => [...new Set(s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean))];

function Chips({ items, tone = 'gray', max }: { items: string[]; tone?: 'gray' | 'brand'; max?: number }) {
  const shown = max ? items.slice(0, max) : items;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((x) => (
        <span key={x} className={cx('rounded-md px-1.5 py-0.5 text-[11px] font-semibold', tone === 'brand' ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-700')}>{x}</span>
      ))}
      {max && items.length > max && <span className="px-1 text-[11px] font-semibold text-ink-400">+{items.length - max}</span>}
    </div>
  );
}

// ── Model ekle / düzenle formu (ModelDetail de kullanır)
export function ModelFormModal({ initial, onClose, onSaved }: { initial?: StyleModel | null; onClose: () => void; onSaved?: (m: StyleModel) => void }) {
  const { me, can, stageLabel } = useSession();
  const st = me.settings;
  const showPrice = can('fiyat:gor');
  const edit = !!initial;
  const [f, setF] = useState(() => ({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    category: initial?.category ?? '',
    season: initial?.season ?? '',
    customerId: initial?.customerId ?? '',
    sizes: (initial?.sizes ?? st.sizeSets[0]?.sizes ?? []).join(', '),
    colors: (initial?.colors ?? []).join(', '),
    route: initial?.route?.length ? [...initial.route] : [...st.defaultRoute],
    salePrice: initial?.salePrice != null ? String(Number(initial.salePrice)) : '',
    overheadPct: initial?.overheadPct != null ? String(Number(initial.overheadPct)) : edit ? '' : '15',
    description: initial?.description ?? '',
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const customers = useQuery({ queryKey: ['parties', { type: 'MUSTERI', take: 500 }], queryFn: () => api.get<{ id: string; name: string }[]>('/parties?take=500&type=MUSTERI'), staleTime: 60_000 });

  const sizes = splitList(f.sizes);
  const colors = splitList(f.colors);
  const categoryOpts = [...new Set([...st.categories, ...(f.category ? [f.category] : [])])].map((c) => ({ value: c, label: c }));
  const available = st.stages.filter((s) => !f.route.includes(s.code));

  const move = (i: number, d: -1 | 1) =>
    setF((p) => {
      const r = [...p.route];
      const j = i + d;
      if (j < 0 || j >= r.length) return p;
      [r[i], r[j]] = [r[j], r[i]];
      return { ...p, route: r };
    });

  const save = useAction(
    (body: Record<string, unknown>) => (edit ? api.patch<StyleModel>(`/models/${initial!.id}`, body) : api.post<StyleModel>('/models', body)),
    {
      success: edit ? 'Model güncellendi' : 'Model oluşturuldu',
      invalidate: [['models'], ['model']],
      onDone: (m) => {
        onClose();
        onSaved?.(m);
      },
    },
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      code: f.code.trim(),
      name: f.name.trim(),
      category: f.category,
      season: f.season.trim(),
      customerId: f.customerId || null,
      sizes,
      colors,
      route: f.route,
      description: f.description.trim(),
    };
    if (showPrice) {
      body.salePrice = f.salePrice === '' ? null : Number(f.salePrice);
      if (f.overheadPct !== '') body.overheadPct = Number(f.overheadPct);
    }
    save.mutate(body);
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={edit ? `Modeli düzenle · ${initial!.code}` : 'Yeni model'}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button type="submit" form="model-form" className="btn-primary" disabled={save.isPending || !sizes.length || !colors.length || !f.route.length}>
            <Save className="size-4" /> {edit ? 'Kaydet' : 'Modeli oluştur'}
          </button>
        </>
      }
    >
      <form id="model-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Model kodu" required>
            <input className="input" value={f.code} onChange={(e) => set('code', e.target.value)} required maxLength={40} placeholder="DC-2611" />
          </Field>
          <Field label="Model adı" required className="lg:col-span-2">
            <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required maxLength={160} placeholder="Kadın basic oversize tişört" />
          </Field>
          <Field label="Kategori">
            <Select value={f.category} onChange={(v) => set('category', v)} options={categoryOpts} placeholder="— Seçin —" />
          </Field>
          <Field label="Sezon">
            <input className="input" value={f.season} onChange={(e) => set('season', e.target.value)} maxLength={40} placeholder="2027 İlkbahar-Yaz" />
          </Field>
          <Field label="Müşteri" hint="Marka işi ise müşterisi">
            <Select value={f.customerId} onChange={(v) => set('customerId', v)} options={(customers.data ?? []).map((p) => ({ value: p.id, label: p.name }))} placeholder="— Kendi modelimiz —" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Beden seti" required hint="Hazır setten seçin ya da virgülle ayırarak düzenleyin.">
            {st.sizeSets.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {st.sizeSets.map((s) => {
                  const active = s.sizes.join(',') === sizes.join(',');
                  return (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => set('sizes', s.sizes.join(', '))}
                      className={cx('rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 transition', active ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-ink-700 ring-ink-200 hover:bg-ink-50')}
                      title={s.sizes.join(' · ')}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            )}
            <input className="input" value={f.sizes} onChange={(e) => set('sizes', e.target.value)} placeholder="S, M, L, XL" />
            {sizes.length > 0 && <div className="mt-2"><Chips items={sizes} tone="brand" /></div>}
          </Field>
          <Field label="Renkler" required hint="Virgülle ayırın (ör. Siyah, Beyaz, İndigo).">
            <input className="input" value={f.colors} onChange={(e) => set('colors', e.target.value)} placeholder="Siyah, Beyaz, Lacivert" />
            {colors.length > 0 && <div className="mt-2"><Chips items={colors} /></div>}
          </Field>
        </div>

        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="label mb-0">Üretim rotası (aşama sırası) <span className="text-red-500">*</span></span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => set('route', [...st.defaultRoute])}>
              <RotateCcw className="size-3.5" /> Varsayılan rota
            </button>
          </div>
          <div className="rounded-2xl p-2 ring-1 ring-ink-200">
            {f.route.length === 0 ? (
              <p className="px-2 py-3 text-sm text-ink-500">Aşağıdan en az bir aşama ekleyin.</p>
            ) : (
              <ol className="space-y-1">
                {f.route.map((code, i) => (
                  <li key={code} className="flex items-center gap-2 rounded-xl bg-ink-50 px-2 py-1.5">
                    <span className="num grid size-6 place-items-center rounded-lg bg-brand-700 text-[11px] font-bold text-white">{i + 1}</span>
                    <span className="flex-1 text-sm font-medium text-ink-800">{stageLabel(code)}</span>
                    <button type="button" className="rounded-md p-1 text-ink-500 hover:bg-white disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Yukarı"><ArrowUp className="size-4" /></button>
                    <button type="button" className="rounded-md p-1 text-ink-500 hover:bg-white disabled:opacity-30" disabled={i === f.route.length - 1} onClick={() => move(i, 1)} aria-label="Aşağı"><ArrowDown className="size-4" /></button>
                    <button type="button" className="rounded-md p-1 text-ink-400 hover:bg-red-50 hover:text-red-600" onClick={() => set('route', f.route.filter((c) => c !== code))} aria-label="Çıkar"><X className="size-4" /></button>
                  </li>
                ))}
              </ol>
            )}
            {available.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-ink-100 px-1 pt-2">
                <span className="self-center text-[11px] font-semibold text-ink-500">Ekle:</span>
                {available.map((s) => (
                  <button key={s.code} type="button" className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-ink-700 ring-1 ring-ink-200 hover:bg-brand-50 hover:text-brand-700" onClick={() => set('route', [...f.route, s.code])}>
                    + {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {showPrice && (
            <>
              <Field label="Satış fiyatı (₺ / adet)">
                <input type="number" min={0} step="any" className="input num" value={f.salePrice} onChange={(e) => set('salePrice', e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Genel gider payı (%)" hint="Elektrik, kira, amortisman vb. için birim maliyete eklenir.">
                <input type="number" min={0} max={300} step="any" className="input num" value={f.overheadPct} onChange={(e) => set('overheadPct', e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Açıklama / teknik notlar" className="sm:col-span-2">
            <textarea className="input min-h-20" value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} placeholder="Dikiş detayları, yıkama talimatı, baskı/nakış notları…" />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

// ── Sayfa
export default function Models() {
  const { can } = useSession();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [openNew, setOpenNew] = useState(params.get('yeni') === '1');
  const status = params.get('durum') ?? '';

  const q = useQuery({ queryKey: ['models', { take: 500 }], queryFn: () => api.get<StyleModel[]>('/models?take=500') });
  const all = q.data ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of all) c[m.status] = (c[m.status] ?? 0) + 1;
    return c;
  }, [all]);

  const rows = useMemo(() => {
    const s = search.trim().toLocaleLowerCase('tr');
    return all.filter((m) => {
      if (status ? m.status !== status : m.status === 'ARSIV') return false;
      if (!s) return true;
      return [m.code, m.name, m.category, m.season, m.customer?.name, ...m.colors].some((x) => x?.toLocaleLowerCase('tr').includes(s));
    });
  }, [all, status, search]);

  const setStatus = (v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set('durum', v);
    else p.delete('durum');
    setParams(p, { replace: true });
  };
  const closeNew = () => {
    setOpenNew(false);
    if (params.has('yeni')) {
      const p = new URLSearchParams(params);
      p.delete('yeni');
      setParams(p, { replace: true });
    }
  };

  const cols: Column<StyleModel>[] = [
    { key: 'code', header: 'Kod', cell: (m) => <span className="font-mono text-xs font-bold text-ink-900">{m.code}</span>, csv: (m) => m.code },
    { key: 'name', header: 'Model', cell: (m) => <span className="font-semibold text-ink-900">{m.name}</span>, csv: (m) => m.name },
    { key: 'cat', header: 'Kategori', cell: (m) => m.category || <span className="text-ink-300">—</span>, csv: (m) => m.category },
    { key: 'season', header: 'Sezon', cell: (m) => m.season || <span className="text-ink-300">—</span>, csv: (m) => m.season },
    { key: 'cust', header: 'Müşteri', cell: (m) => m.customer?.name ?? <span className="text-xs text-ink-400">Kendi modelimiz</span>, csv: (m) => m.customer?.name },
    { key: 'sizes', header: 'Bedenler', cell: (m) => <span className="whitespace-nowrap text-xs text-ink-600">{m.sizes.length > 1 ? `${m.sizes[0]}–${m.sizes[m.sizes.length - 1]} (${m.sizes.length})` : m.sizes[0]}</span>, csv: (m) => m.sizes.join(' ') },
    { key: 'colors', header: 'Renkler', cell: (m) => <Chips items={m.colors} max={3} />, csv: (m) => m.colors.join(', ') },
    ...(can('fiyat:gor') ? [{ key: 'price', header: 'Satış fiyatı', align: 'right' as const, cell: (m: StyleModel) => (m.salePrice ? fmtMoney(m.salePrice) : <span className="text-ink-300">—</span>), csv: (m: StyleModel) => (m.salePrice ? Number(m.salePrice) : '') }] : []),
    { key: 'status', header: 'Durum', cell: (m) => <Badge tone={statusTone(m.status)}>{MODEL_STATUS[m.status] ?? m.status}</Badge>, csv: (m) => MODEL_STATUS[m.status] ?? m.status },
  ];

  const tabs = [
    { value: '', label: 'Aktif', count: all.length - (counts.ARSIV ?? 0) },
    ...Object.entries(MODEL_STATUS).map(([value, label]) => ({ value, label, count: counts[value] ?? 0 })),
  ];

  return (
    <div>
      <PageHeader
        title="Modeller"
        subtitle="Teknik föy, beden/renk kırılımı, reçete ve maliyet kartları"
        actions={
          can('model:yaz') && (
            <button className="btn-primary" onClick={() => setOpenNew(true)}>
              <Plus className="size-4" /> Yeni model
            </button>
          )
        }
      />

      <Tabs value={status} onChange={setStatus} tabs={tabs} />

      <Card bodyClass="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Kod, ad, müşteri, renk…" />
          <span className="text-xs text-ink-500">{rows.length} model</span>
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
            onRowClick={(m) => nav(`/modeller/${m.id}`)}
            csvName="modeller"
            empty={
              all.length === 0 ? (
                <Empty
                  icon={<Shirt className="size-6" />}
                  title="Henüz model yok"
                  text="Model kartı açarak beden seti, renkler ve üretim rotasını tanımlayın; ardından reçete (sarfiyat) ve operasyonları girerek birim maliyeti hesaplatın."
                  action={can('model:yaz') && <button className="btn-primary" onClick={() => setOpenNew(true)}><Plus className="size-4" /> Yeni model</button>}
                />
              ) : (
                <Empty title="Eşleşen model yok" text="Arama ifadesini ya da durum filtresini değiştirin. Arşivdeki modeller “Arşiv” sekmesinde." />
              )
            }
          />
        )}
      </Card>

      {openNew && <ModelFormModal onClose={closeNew} onSaved={(m) => nav(`/modeller/${m.id}`)} />}
    </div>
  );
}
