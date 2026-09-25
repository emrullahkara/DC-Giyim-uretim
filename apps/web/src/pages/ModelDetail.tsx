import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, Calculator, ChevronRight, Clock, Factory, Layers, Lock, Pencil, Plus, RotateCcw, Save, Scissors, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { fmtDate, fmtMoney, fmtNum, fmtQty } from '@/lib/format';
import { MATERIAL_TYPE, MODEL_STATUS, WO_STATUS, statusTone } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Select, cx, useConfirm, useToast } from '@/components/ui';
import { ModelFormModal, type StyleModel } from './Models';
import { unitShort, type Material } from './Stock';

interface RecipeMaterial { id: string; materialId: string; consumption: string; note?: string | null; material: { id: string; code: string; name: string; unit: string; unitPrice?: string | null; stock: string; type: string; color?: string | null } }
interface Operation { id: string; sequence: number; name: string; stage: string; minutes: string; pieceRate?: string }
interface Cost { materialCost?: number; laborCost?: number; unitCost?: number; totalMinutes?: number; margin?: number | null }
interface Detail {
  model: StyleModel & { materials: RecipeMaterial[]; operations: Operation[] };
  cost?: Cost | null;
  stock: { id: string; color: string; size: string; quantity: number; secondQty: number }[];
  workOrders: { id: string; no: string; status: string; plannedQty: number; color: string; dueDate: string }[];
}

type MatRow = { key: number; materialId: string; consumption: string; note: string };
type OpRow = { key: number; name: string; stage: string; minutes: string; pieceRate: string };
let seq = 0;
const k = () => ++seq;

function moveIn<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const r = [...arr];
  [r[i], r[j]] = [r[j], r[i]];
  return r;
}

function RowTools({ i, n, onMove, onRemove }: { i: number; n: number; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <button type="button" className="rounded-md p-1 text-ink-400 hover:bg-ink-100 disabled:opacity-30" disabled={i === 0} onClick={() => onMove(-1)} aria-label="Yukarı"><ArrowUp className="size-4" /></button>
      <button type="button" className="rounded-md p-1 text-ink-400 hover:bg-ink-100 disabled:opacity-30" disabled={i === n - 1} onClick={() => onMove(1)} aria-label="Aşağı"><ArrowDown className="size-4" /></button>
      <button type="button" className="rounded-md p-1 text-ink-400 hover:bg-red-50 hover:text-red-600" onClick={onRemove} aria-label="Sil"><Trash2 className="size-4" /></button>
    </div>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-ink-900">{children ?? <span className="text-ink-300">—</span>}</div>
    </div>
  );
}

function CostRow({ label, value, strong, hint }: { label: string; value: ReactNode; strong?: boolean; hint?: string }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3 py-2', strong && 'border-t border-ink-200 pt-3')}>
      <div>
        <div className={cx('text-sm', strong ? 'font-bold text-ink-900' : 'text-ink-600')}>{label}</div>
        {hint && <div className="text-[11px] text-ink-400">{hint}</div>}
      </div>
      <div className={cx('num text-right', strong ? 'text-lg font-bold text-ink-900' : 'text-sm font-semibold text-ink-800')}>{value}</div>
    </div>
  );
}

export default function ModelDetail() {
  const { id = '' } = useParams();
  const { me, can, stageLabel } = useSession();
  const toast = useToast();
  const { confirm, node: confirmNode } = useConfirm();
  const canEdit = can('model:yaz');
  const showPrice = can('fiyat:gor');
  const [editOpen, setEditOpen] = useState(false);

  const q = useQuery({ queryKey: ['model', id], queryFn: () => api.get<Detail>(`/models/${id}`) });
  const mats = useQuery({ queryKey: ['materials', { take: 500 }], queryFn: () => api.get<Material[]>('/stock/materials?take=500'), enabled: canEdit });

  // ── Reçete düzenleme durumu
  const [matRows, setMatRows] = useState<MatRow[]>([]);
  const [opRows, setOpRows] = useState<OpRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [lastCost, setLastCost] = useState<Cost | null>(null);

  const resetRecipe = (d?: Detail) => {
    if (!d) return;
    setMatRows(d.model.materials.map((r) => ({ key: k(), materialId: r.materialId, consumption: String(Number(r.consumption)), note: r.note ?? '' })));
    setOpRows(d.model.operations.map((o) => ({ key: k(), name: o.name, stage: o.stage, minutes: String(Number(o.minutes)), pieceRate: o.pieceRate != null ? String(Number(o.pieceRate)) : '' })));
    setDirty(false);
  };
  // Sunucu verisi değiştiğinde (ilk yükleme / kayıt sonrası) formu tazele; kullanıcı düzenlerken ezme
  useEffect(() => {
    if (!dirty) resetRecipe(q.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const matMap = useMemo(() => {
    const map = new Map<string, { code: string; name: string; unit: string; unitPrice?: string | null; color?: string | null; type: string }>();
    for (const r of q.data?.model.materials ?? []) map.set(r.materialId, r.material);
    for (const m of mats.data ?? []) map.set(m.id, m);
    return map;
  }, [q.data, mats.data]);

  const saveRecipe = useAction(
    (body: { materials: unknown[]; operations: unknown[] }) => api.put<{ ok: boolean; cost?: Cost }>(`/models/${id}/recipe`, body),
    {
      success: (r) => (r.cost?.unitCost != null ? `Reçete kaydedildi · birim maliyet ${fmtMoney(r.cost.unitCost)}` : 'Reçete kaydedildi'),
      invalidate: [['model', id], ['materials'], ['requirements']],
      onDone: (r) => {
        setDirty(false);
        setLastCost(r.cost ?? null);
      },
    },
  );
  const setStatus = useAction((status: string) => api.patch(`/models/${id}`, { status }), { success: 'Model durumu güncellendi', invalidate: [['model', id], ['models']] });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const { model: m, stock, workOrders } = q.data;
  const cost = q.data.cost ?? lastCost;

  const editMat = (key: number, patch: Partial<MatRow>) => {
    setMatRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const editOp = (key: number, patch: Partial<OpRow>) => {
    setOpRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const mutateMats = (fn: (rs: MatRow[]) => MatRow[]) => { setMatRows(fn); setDirty(true); };
  const mutateOps = (fn: (rs: OpRow[]) => OpRow[]) => { setOpRows(fn); setDirty(true); };

  const totalMinutes = opRows.reduce((s, o) => s + (Number(o.minutes) || 0), 0);
  const totalRate = opRows.reduce((s, o) => s + (Number(o.pieceRate) || 0), 0);
  const matCostLive = matRows.reduce((s, r) => s + (Number(r.consumption) || 0) * Number(matMap.get(r.materialId)?.unitPrice ?? 0), 0);

  const submitRecipe = async () => {
    const materials = matRows.filter((r) => r.materialId);
    if (materials.some((r) => r.consumption === '' || Number(r.consumption) < 0)) return toast('err', 'Her malzeme için adet başı sarfiyat girin.');
    if (new Set(materials.map((r) => r.materialId)).size !== materials.length) return toast('err', 'Aynı malzeme reçetede iki kez var; satırları birleştirin.');
    const operations = opRows.filter((o) => o.name.trim());
    if (operations.some((o) => !o.stage)) return toast('err', 'Her operasyon için aşama seçin.');
    if (!showPrice && operations.length && !(await confirm('Parça başı ücretleri görme yetkiniz olmadığı için kaydedilen operasyonların ücretleri sıfırlanacak. Devam edilsin mi?'))) return;
    saveRecipe.mutate({
      materials: materials.map((r) => ({ materialId: r.materialId, consumption: Number(r.consumption), note: r.note.trim() })),
      operations: operations.map((o) => ({ name: o.name.trim(), stage: o.stage, minutes: Number(o.minutes) || 0, pieceRate: Number(o.pieceRate) || 0 })),
    });
  };

  // Mamul stok: renk × beden
  const stockByColor = Object.values(
    stock.reduce<Record<string, { color: string; sizes: Record<string, number>; total: number; second: number }>>((acc, r) => {
      const g = (acc[r.color] ??= { color: r.color, sizes: {}, total: 0, second: 0 });
      g.sizes[r.size] = (g.sizes[r.size] ?? 0) + r.quantity;
      g.total += r.quantity;
      g.second += r.secondQty;
      return acc;
    }, {}),
  ).filter((g) => g.total || g.second);
  const stockSizes = [...m.sizes, ...[...new Set(stock.map((s) => s.size))].filter((s) => !m.sizes.includes(s))];

  const materialOptions = (mats.data ?? [])
    .map((x) => ({ value: x.id, label: `${x.code} · ${x.name}${x.color ? ` (${x.color})` : ''}` }));
  const stageOptions = me.settings.stages.map((s) => ({ value: s.code, label: s.label }));

  return (
    <div className="pb-20">
      <PageHeader
        back={
          <Link to="/modeller" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-brand-700">
            <ArrowLeft className="size-3.5" /> Modeller
          </Link>
        }
        title={<>{m.code} · {m.name}</>}
        subtitle={
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={statusTone(m.status)}>{MODEL_STATUS[m.status] ?? m.status}</Badge>
            {m.category && <Badge>{m.category}</Badge>}
            {m.season && <Badge tone="blue">{m.season}</Badge>}
          </span>
        }
        actions={
          canEdit && (
            <>
              <div className="w-36">
                <Select value={m.status} onChange={(v) => v !== m.status && setStatus.mutate(v)} options={MODEL_STATUS} disabled={setStatus.isPending} className="py-1.5" />
              </div>
              <button className="btn-outline" onClick={() => setEditOpen(true)}><Pencil className="size-4" /> Düzenle</button>
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Teknik föy">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Müşteri">{m.customer ? (can('cari:gor') ? <Link className="text-brand-700 hover:underline" to={`/cariler/${m.customer.id}`}>{m.customer.name}</Link> : m.customer.name) : 'Kendi modelimiz'}</Info>
            <Info label="Kategori">{m.category}</Info>
            <Info label="Sezon">{m.season}</Info>
            <Info label={`Bedenler (${m.sizes.length})`}>
              <div className="flex flex-wrap gap-1">{m.sizes.map((s) => <span key={s} className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">{s}</span>)}</div>
            </Info>
            <Info label={`Renkler (${m.colors.length})`}>
              <div className="flex flex-wrap gap-1">{m.colors.map((c) => <span key={c} className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink-700">{c}</span>)}</div>
            </Info>
            <Info label="Toplam SAM">{fmtNum(totalMinutes, 1)} dk / adet</Info>
          </div>
          <div className="mt-5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Üretim rotası</div>
            <div className="flex flex-wrap items-center gap-1">
              {m.route.map((code, i) => (
                <span key={code} className="flex items-center gap-1">
                  <span className="flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1 text-xs font-semibold text-ink-800 ring-1 ring-ink-200">
                    <span className="num grid size-4 place-items-center rounded bg-brand-700 text-[10px] text-white">{i + 1}</span>
                    {stageLabel(code)}
                  </span>
                  {i < m.route.length - 1 && <ChevronRight className="size-4 text-ink-300" />}
                </span>
              ))}
            </div>
          </div>
          {m.description && (
            <div className="mt-5 rounded-xl bg-ink-50 p-3 text-sm whitespace-pre-line text-ink-700 ring-1 ring-ink-100">{m.description}</div>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-1.5"><Calculator className="size-4 text-brand-600" /> Birim maliyet</span>} subtitle="Kaydedilmiş reçeteye göre, adet başı">
          {cost && cost.unitCost !== undefined ? (
            <div>
              <CostRow label="Malzeme (kumaş + aksesuar)" value={fmtMoney(cost.materialCost)} />
              <CostRow label="İşçilik (parça başı)" value={fmtMoney(cost.laborCost)} />
              <CostRow
                label="Genel gider"
                hint={m.overheadPct != null ? `%${fmtNum(m.overheadPct, 0)} pay` : undefined}
                value={fmtMoney(Math.max(0, (cost.unitCost ?? 0) - (cost.materialCost ?? 0) - (cost.laborCost ?? 0)))}
              />
              <CostRow label="Birim maliyet" value={fmtMoney(cost.unitCost)} strong />
              <CostRow label="Satış fiyatı" value={m.salePrice ? fmtMoney(m.salePrice) : <span className="text-ink-400">Girilmemiş</span>} />
              <div className="mt-2 flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2">
                <span className="text-sm text-ink-600">Kâr marjı</span>
                {cost.margin != null ? <Badge tone={cost.margin < 0 ? 'red' : cost.margin < 15 ? 'amber' : 'green'} className="text-xs">%{fmtNum(cost.margin, 1)}</Badge> : <span className="text-xs text-ink-400">Satış fiyatı girin</span>}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-500"><Clock className="size-3.5" /> Toplam {fmtNum(cost.totalMinutes ?? totalMinutes, 1)} dk (SAM)</div>
            </div>
          ) : (
            <Empty icon={<Lock className="size-6" />} title="Maliyet bilgisi gizli" text="Fiyat ve maliyet bilgilerini görme yetkiniz yok. Toplam standart süre (SAM) teknik föyde görünür." />
          )}
        </Card>
      </div>

      {/* Reçete */}
      <Card
        className="mt-4"
        title={<span className="flex items-center gap-1.5"><Layers className="size-4 text-brand-600" /> Reçete · malzeme sarfiyatı</span>}
        subtitle="Bir adet ürün için gereken kumaş, astar ve aksesuar miktarları"
        actions={canEdit && <button className="btn-outline btn-sm" onClick={() => mutateMats((rs) => [...rs, { key: k(), materialId: '', consumption: '', note: '' }])}><Plus className="size-3.5" /> Malzeme ekle</button>}
        bodyClass="p-0"
      >
        {matRows.length === 0 ? (
          <Empty icon={<Layers className="size-6" />} title="Reçete boş" text={canEdit ? '“Malzeme ekle” ile modelde kullanılan kumaş ve aksesuarları adet başı sarfiyatlarıyla girin. Sipariş ihtiyacı ve maliyet bu listeden hesaplanır.' : 'Bu model için henüz reçete girilmemiş.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-100">
              <thead className="bg-ink-50/60">
                <tr>
                  <th className="th w-8">#</th>
                  <th className="th">Malzeme</th>
                  <th className="th text-right">Sarfiyat / adet</th>
                  <th className="th">Not</th>
                  {showPrice && <th className="th text-right">Tutar / adet</th>}
                  {canEdit && <th className="th w-24" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {matRows.map((r, i) => {
                  const mm = matMap.get(r.materialId);
                  const u = unitShort(mm?.unit);
                  return (
                    <tr key={r.key}>
                      <td className="td num py-1.5 text-xs text-ink-400">{i + 1}</td>
                      <td className="td py-1.5">
                        {canEdit ? (
                          <Select className="min-w-[14rem]" value={r.materialId} onChange={(v) => editMat(r.key, { materialId: v })} options={materialOptions.length ? materialOptions : mm ? [{ value: r.materialId, label: `${mm.code} · ${mm.name}` }] : []} placeholder="— Malzeme seçin —" />
                        ) : mm ? (
                          <Link to={`/depo/${r.materialId}`} className="font-semibold text-ink-900 hover:text-brand-700">{mm.code} · {mm.name}</Link>
                        ) : null}
                        {mm && <div className="mt-0.5 text-[11px] text-ink-500">{[MATERIAL_TYPE[mm.type], mm.color].filter(Boolean).join(' · ')}</div>}
                      </td>
                      <td className="td py-1.5 text-right">
                        {canEdit ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <input type="number" min={0} step="any" className="input num w-28 text-right" value={r.consumption} onChange={(e) => editMat(r.key, { consumption: e.target.value })} placeholder="0" />
                            <span className="w-10 text-left text-xs text-ink-500">{u}</span>
                          </div>
                        ) : (
                          <span className="num font-semibold">{fmtQty(r.consumption)} {u}</span>
                        )}
                      </td>
                      <td className="td py-1.5">
                        {canEdit ? <input className="input min-w-[10rem]" value={r.note} onChange={(e) => editMat(r.key, { note: e.target.value })} maxLength={200} placeholder="Ör. cep astarı" /> : <span className="text-ink-600">{r.note || '—'}</span>}
                      </td>
                      {showPrice && <td className="td num py-1.5 text-right text-ink-700">{mm?.unitPrice != null ? fmtMoney((Number(r.consumption) || 0) * Number(mm.unitPrice)) : '—'}</td>}
                      {canEdit && <td className="td py-1.5"><RowTools i={i} n={matRows.length} onMove={(d) => mutateMats((rs) => moveIn(rs, i, d))} onRemove={() => mutateMats((rs) => rs.filter((x) => x.key !== r.key))} /></td>}
                    </tr>
                  );
                })}
              </tbody>
              {showPrice && (
                <tfoot>
                  <tr className="bg-ink-50/60">
                    <td className="td text-xs font-semibold text-ink-600" colSpan={4}>Malzeme maliyeti (adet)</td>
                    <td className="td num text-right font-bold text-ink-900">{fmtMoney(matCostLive)}</td>
                    {canEdit && <td className="td" />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>

      {/* Operasyonlar */}
      <Card
        className="mt-4"
        title={<span className="flex items-center gap-1.5"><Scissors className="size-4 text-brand-600" /> Operasyon listesi</span>}
        subtitle="Dikim sırası, standart süre (SAM) ve parça başı ücretler"
        actions={canEdit && <button className="btn-outline btn-sm" onClick={() => mutateOps((rs) => [...rs, { key: k(), name: '', stage: rs[rs.length - 1]?.stage ?? m.route.find((c) => c.includes('DIK')) ?? m.route[0] ?? '', minutes: '', pieceRate: '' }])}><Plus className="size-3.5" /> Operasyon ekle</button>}
        bodyClass="p-0"
      >
        {!showPrice && canEdit && opRows.length > 0 && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">Parça başı ücretleri görme yetkiniz yok; reçeteyi kaydederseniz ücretler sıfırlanır.</div>
        )}
        {opRows.length === 0 ? (
          <Empty icon={<Scissors className="size-6" />} title="Operasyon tanımlanmamış" text={canEdit ? '“Operasyon ekle” ile yaka takma, omuz çatma, reçme gibi işlemleri süreleriyle girin. Parça başı hakediş ve kapasite planı buradan hesaplanır.' : 'Bu model için henüz operasyon girilmemiş.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-100">
              <thead className="bg-ink-50/60">
                <tr>
                  <th className="th w-8">#</th>
                  <th className="th">Operasyon</th>
                  <th className="th">Aşama</th>
                  <th className="th text-right">Süre (dk)</th>
                  {showPrice && <th className="th text-right">Parça başı (₺)</th>}
                  {canEdit && <th className="th w-24" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {opRows.map((o, i) => (
                  <tr key={o.key}>
                    <td className="td num py-1.5 text-xs text-ink-400">{i + 1}</td>
                    <td className="td py-1.5">{canEdit ? <input className="input min-w-[12rem]" value={o.name} onChange={(e) => editOp(o.key, { name: e.target.value })} maxLength={120} placeholder="Ör. Yaka takma" /> : <span className="font-medium text-ink-900">{o.name}</span>}</td>
                    <td className="td py-1.5">{canEdit ? <Select className="min-w-[9rem]" value={o.stage} onChange={(v) => editOp(o.key, { stage: v })} options={stageOptions} placeholder="— Aşama —" /> : <Badge>{stageLabel(o.stage)}</Badge>}</td>
                    <td className="td py-1.5 text-right">{canEdit ? <input type="number" min={0} step="any" className="input num ml-auto w-24 text-right" value={o.minutes} onChange={(e) => editOp(o.key, { minutes: e.target.value })} placeholder="0" /> : <span className="num">{fmtNum(o.minutes, 2)}</span>}</td>
                    {showPrice && <td className="td py-1.5 text-right">{canEdit ? <input type="number" min={0} step="any" className="input num ml-auto w-24 text-right" value={o.pieceRate} onChange={(e) => editOp(o.key, { pieceRate: e.target.value })} placeholder="0" /> : <span className="num">{fmtMoney(o.pieceRate)}</span>}</td>}
                    {canEdit && <td className="td py-1.5"><RowTools i={i} n={opRows.length} onMove={(d) => mutateOps((rs) => moveIn(rs, i, d))} onRemove={() => mutateOps((rs) => rs.filter((x) => x.key !== o.key))} /></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-ink-50/60">
                  <td className="td text-xs font-semibold text-ink-600" colSpan={3}>Toplam ({opRows.length} operasyon)</td>
                  <td className="td num text-right font-bold text-ink-900">{fmtNum(totalMinutes, 2)} dk</td>
                  {showPrice && <td className="td num text-right font-bold text-ink-900">{fmtMoney(totalRate)}</td>}
                  {canEdit && <td className="td" />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Mamul stok" subtitle="Renk ve beden bazında hazır ürün" bodyClass="p-0">
          {stockByColor.length === 0 ? (
            <Empty title="Mamul stok yok" text="Üretimi tamamlanan (paketlenen) adetler burada renk/beden kırılımında görünür." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink-100">
                <thead className="bg-ink-50/60">
                  <tr>
                    <th className="th">Renk</th>
                    {stockSizes.map((s) => <th key={s} className="th text-center">{s}</th>)}
                    <th className="th text-right">Toplam</th>
                    <th className="th text-right">2. kalite</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {stockByColor.map((g) => (
                    <tr key={g.color}>
                      <td className="td font-semibold">{g.color}</td>
                      {stockSizes.map((s) => <td key={s} className={cx('td num text-center', !g.sizes[s] && 'text-ink-300')}>{g.sizes[s] ?? 0}</td>)}
                      <td className="td num text-right font-bold">{fmtNum(g.total)}</td>
                      <td className={cx('td num text-right', g.second ? 'font-semibold text-amber-700' : 'text-ink-300')}>{g.second}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Son iş emirleri" subtitle="Bu modelle açılan son 10 iş emri" bodyClass="p-0">
          {workOrders.length === 0 ? (
            <Empty icon={<Factory className="size-6" />} title="İş emri yok" text="Siparişten iş emri açıldığında burada listelenir." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {workOrders.map((w) => (
                <li key={w.id}>
                  <Link to={`/uretim/${w.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-brand-50/40">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink-900">{w.no}</div>
                      <div className="text-xs text-ink-500">{w.color} · {fmtNum(w.plannedQty)} adet · termin {fmtDate(w.dueDate)}</div>
                    </div>
                    <Badge tone={statusTone(w.status)}>{WO_STATUS[w.status] ?? w.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {canEdit && dirty && (
        <div className="sticky bottom-20 z-30 mt-4 lg:bottom-4">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 rounded-2xl bg-ink-900 px-4 py-3 text-white shadow-pop">
            <span className="text-sm">Reçetede kaydedilmemiş değişiklikler var.</span>
            <div className="flex gap-2">
              <button className="btn btn-sm text-white/80 hover:bg-white/10" onClick={() => resetRecipe(q.data)}><RotateCcw className="size-3.5" /> Geri al</button>
              <button className="btn-accent btn-sm" onClick={submitRecipe} disabled={saveRecipe.isPending}><Save className="size-3.5" /> Reçeteyi kaydet</button>
            </div>
          </div>
        </div>
      )}

      {editOpen && <ModelFormModal initial={m} onClose={() => setEditOpen(false)} />}
      {confirmNode}
    </div>
  );
}
