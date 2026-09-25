import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CheckCircle2, ClipboardCheck, Percent, Plus, Trash2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { fmtDate, fmtNum, toInputDate } from '@/lib/format';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, Stat, Table, cx, useConfirm, type Column } from '@/components/ui';

interface Check {
  id: string;
  date: string;
  stage: string;
  checkedQty: number;
  passedQty: number;
  defects: Record<string, number> | null;
  inspector?: string | null;
  note?: string | null;
  workOrder?: { id: string; no: string; color: string; model: { code: string; name: string } } | null;
}
interface QualityData {
  checks: Check[];
  stats: { checked: number; passed: number; failed: number; failRate: number };
  pareto: { type: string; count: number }[];
}
interface WoOpt { id: string; no: string; color: string; model: { code: string; name: string }; stages: { stage: string }[] }

const PERIODS = [
  { value: '7', label: 'Son 7 gün' },
  { value: '30', label: 'Son 30 gün' },
  { value: '90', label: 'Son 90 gün' },
];

function Pareto({ items }: { items: { type: string; count: number }[] }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  const max = Math.max(1, ...items.map((i) => i.count));
  let cum = 0;
  return (
    <div className="space-y-2.5">
      {items.map((i) => {
        cum += i.count;
        const cumPct = total ? Math.round((cum / total) * 100) : 0;
        const share = total ? Math.round((i.count / total) * 1000) / 10 : 0;
        const vital = cumPct - share < 80; // ilk %80'i oluşturan "önemli az sayıdaki" hatalar
        return (
          <div key={i.type} className="grid grid-cols-[minmax(90px,160px)_1fr_auto] items-center gap-3">
            <div className="truncate text-sm font-medium text-ink-800" title={i.type}>{i.type}</div>
            <div className="relative h-6 rounded-lg bg-ink-100">
              <div className={cx('h-full rounded-lg transition-all', vital ? 'bg-red-500' : 'bg-ink-400')} style={{ width: `${(i.count / max) * 100}%` }} />
              <span className="num absolute inset-y-0 left-2 flex items-center text-[11px] font-bold text-white mix-blend-difference">{fmtNum(i.count)}</span>
            </div>
            <div className="num w-24 text-right text-xs text-ink-500">
              %{fmtNum(share, 1)} · <b className={cx(cumPct <= 80 ? 'text-red-600' : 'text-ink-700')}>Σ%{cumPct}</b>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 pt-2 text-[11px] text-ink-500">
        <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-red-500" /> Hataların ilk %80'ini oluşturan tipler — önce bunlara odaklanın</span>
        <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-ink-400" /> Diğer</span>
        <span>Σ = kümülatif pay</span>
      </div>
    </div>
  );
}

export default function Quality() {
  const { can, stageLabel } = useSession();
  const [days, setDays] = useState('30');
  const [modal, setModal] = useState(false);
  const { confirm, node } = useConfirm();
  const { data, isLoading, error } = useQuery({ queryKey: ['quality', days], queryFn: () => api.get<QualityData>(`/quality?days=${days}`) });

  const del = useAction((id: string) => api.del(`/quality/${id}`), { success: 'Kalite kaydı silindi.', invalidate: [['quality']] });

  const columns: Column<Check>[] = [
    { key: 'date', header: 'Tarih', cell: (c) => fmtDate(c.date), csv: (c) => fmtDate(c.date) },
    {
      key: 'wo',
      header: 'İş emri / model',
      cell: (c) =>
        c.workOrder ? (
          <Link to={`/uretim/${c.workOrder.id}`} className="hover:underline">
            <div className="font-semibold text-brand-700">{c.workOrder.no}</div>
            <div className="text-xs text-ink-500">{c.workOrder.model.code} · {c.workOrder.color}</div>
          </Link>
        ) : (
          <span className="text-ink-400">—</span>
        ),
      csv: (c) => (c.workOrder ? `${c.workOrder.no} ${c.workOrder.model.code}` : ''),
    },
    { key: 'stage', header: 'Aşama', cell: (c) => <Badge tone="violet">{stageLabel(c.stage)}</Badge>, csv: (c) => stageLabel(c.stage) },
    { key: 'checked', header: 'Kontrol', align: 'right', cell: (c) => fmtNum(c.checkedQty), csv: (c) => c.checkedQty },
    { key: 'passed', header: 'Sağlam', align: 'right', cell: (c) => <span className="text-emerald-700">{fmtNum(c.passedQty)}</span>, csv: (c) => c.passedQty },
    {
      key: 'failed',
      header: 'Hatalı',
      align: 'right',
      cell: (c) => {
        const f = c.checkedQty - c.passedQty;
        const r = c.checkedQty ? (f / c.checkedQty) * 100 : 0;
        return f ? (
          <span className="font-semibold text-red-600">
            {fmtNum(f)} <span className="text-[11px] font-normal text-ink-500">(%{fmtNum(r, 1)})</span>
          </span>
        ) : (
          '0'
        );
      },
      csv: (c) => c.checkedQty - c.passedQty,
    },
    {
      key: 'defects',
      header: 'Hata dağılımı',
      cell: (c) => {
        const e = Object.entries(c.defects ?? {}).filter(([, v]) => Number(v) > 0);
        if (!e.length) return <span className="text-ink-400">—</span>;
        return (
          <div className="flex max-w-xs flex-wrap gap-1">
            {e.map(([k, v]) => (
              <span key={k} className="rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-100">
                {k} <b className="num">{v}</b>
              </span>
            ))}
          </div>
        );
      },
      csv: (c) => Object.entries(c.defects ?? {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k}: ${v}`).join(', '),
    },
    { key: 'insp', header: 'Kontrolör', cell: (c) => c.inspector || '—', csv: (c) => c.inspector },
  ];
  if (can('kalite:yaz'))
    columns.push({
      key: 'del',
      header: '',
      align: 'right',
      cell: (c) => (
        <button
          className="btn-ghost btn-sm text-red-600"
          aria-label="Sil"
          disabled={del.isPending}
          onClick={async (e) => {
            e.stopPropagation();
            if (await confirm(`${fmtDate(c.date)} tarihli ${fmtNum(c.checkedQty)} adetlik kalite kaydı silinecek.`)) del.mutate(c.id);
          }}
        >
          <Trash2 className="size-4" />
        </button>
      ),
    });

  const s = data?.stats;
  return (
    <div>
      {node}
      <PageHeader
        title="Kalite Kontrol"
        subtitle="Ara ve son kontrol kayıtları, hata tipleri ve hata oranı"
        actions={
          <>
            <Select value={days} onChange={setDays} options={PERIODS} className="w-auto" />
            {can('kalite:yaz') && (
              <button className="btn-primary" onClick={() => setModal(true)}>
                <Plus className="size-4" /> Kalite kaydı
              </button>
            )}
          </>
        }
      />
      {isLoading ? (
        <Loading />
      ) : error || !data || !s ? (
        <ErrorBox error={error} />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Kontrol edilen" value={fmtNum(s.checked)} hint={`${data.checks.length} kayıt`} icon={<ClipboardCheck className="size-5" />} />
            <Stat label="Sağlam" value={fmtNum(s.passed)} tone="green" icon={<CheckCircle2 className="size-5" />} />
            <Stat label="Hatalı" value={fmtNum(s.failed)} tone={s.failed ? 'red' : 'gray'} icon={<XCircle className="size-5" />} />
            <Stat label="Hata oranı" value={`%${fmtNum(s.failRate, 1)}`} tone={s.failRate > 5 ? 'red' : s.failRate > 2 ? 'amber' : 'green'} hint={s.failRate > 5 ? 'Yüksek — kaynağını araştırın' : 'Kontrol edilene göre'} icon={<Percent className="size-5" />} />
          </div>

          <Card title="Hata tipleri (Pareto)" subtitle="En çok tekrarlanan hatalar üstte; kümülatif payla birlikte">
            {data.pareto.length ? (
              <Pareto items={data.pareto} />
            ) : (
              <Empty icon={<BarChart3 className="size-6" />} title="Bu dönemde hata kaydı yok" text="Kalite kaydı girerken hata tiplerini de işaretlerseniz burada en sık hatalar sıralanır." />
            )}
          </Card>

          <Card title="Kontrol kayıtları" bodyClass="p-0">
            <Table
              rows={data.checks}
              columns={columns}
              rowKey={(c) => c.id}
              csvName="kalite-kayitlari"
              empty={
                <Empty
                  icon={<ClipboardCheck className="size-6" />}
                  title="Bu dönemde kalite kaydı yok"
                  text="Ara kontrol veya son kontrolde bakılan, sağlam ve hatalı adetleri kaydedin."
                  action={can('kalite:yaz') ? <button className="btn-primary btn-sm" onClick={() => setModal(true)}><Plus className="size-4" /> Kalite kaydı</button> : undefined}
                />
              }
            />
          </Card>
        </div>
      )}
      {modal && <QualityModal onClose={() => setModal(false)} />}
    </div>
  );
}

function QualityModal({ onClose }: { onClose: () => void }) {
  const { me, can, stageLabel } = useSession();
  const [f, setF] = useState({ workOrderId: '', stage: '', checkedQty: '', passedQty: '', inspector: me.user.name, note: '', date: toInputDate() });
  const [defects, setDefects] = useState<Record<string, number>>({});
  const [custom, setCustom] = useState({ type: '', qty: '' });
  const [err, setErr] = useState('');
  const wos = useQuery({ queryKey: ['work-orders', 'open'], queryFn: () => api.get<WoOpt[]>('/production/work-orders?open=1&take=500'), enabled: can('uretim:gor') });
  const wo = wos.data?.find((w) => w.id === f.workOrderId);
  const stageOpts = wo ? wo.stages.map((s) => ({ value: s.stage, label: stageLabel(s.stage) })) : me.settings.stages.map((s) => ({ value: s.code, label: s.label }));

  const checked = Number(f.checkedQty) || 0;
  const passed = Number(f.passedQty) || 0;
  const failed = Math.max(0, checked - passed);
  const defectSum = useMemo(() => Object.values(defects).reduce((a, b) => a + (b || 0), 0) + (custom.type.trim() ? Number(custom.qty) || 0 : 0), [defects, custom]);

  const save = useAction(
    (body: Record<string, unknown>) => api.post('/quality', body),
    { success: 'Kalite kaydı eklendi.', invalidate: [['quality'], ['work-order']], onDone: onClose },
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (checked <= 0) return setErr('Kontrol edilen adet girin.');
    if (passed > checked) return setErr('Sağlam adet, kontrol edilen adetten fazla olamaz.');
    const d: Record<string, number> = {};
    for (const [k, v] of Object.entries(defects)) if (v > 0) d[k] = v;
    if (custom.type.trim() && Number(custom.qty) > 0) d[custom.type.trim()] = (d[custom.type.trim()] ?? 0) + Number(custom.qty);
    save.mutate({ workOrderId: f.workOrderId || null, stage: f.stage, checkedQty: checked, passedQty: passed, defects: d, inspector: f.inspector || undefined, note: f.note || undefined, date: f.date || undefined });
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Kalite kaydı"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button type="submit" form="quality-form" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </>
      }
    >
      <form id="quality-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {can('uretim:gor') && (
            <Field label="İş emri" className="sm:col-span-2">
              <Select value={f.workOrderId} onChange={(v) => setF({ ...f, workOrderId: v, stage: '' })} placeholder="İş emrine bağlı değil" options={(wos.data ?? []).map((w) => ({ value: w.id, label: `${w.no} · ${w.model.code} ${w.model.name} · ${w.color}` }))} />
            </Field>
          )}
          <Field label="Aşama" required>
            <Select required value={f.stage} onChange={(v) => setF({ ...f, stage: v })} placeholder="Aşama seçin" options={stageOpts} />
          </Field>
          <Field label="Tarih">
            <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Kontrol edilen adet" required>
            <input className="input num" type="number" min={1} required value={f.checkedQty} onChange={(e) => setF({ ...f, checkedQty: e.target.value })} />
          </Field>
          <Field label="Sağlam adet" required hint={checked ? <span className={cx(passed > checked && 'font-semibold text-red-600')}>Hatalı: {passed > checked ? 'sağlam, kontrolden fazla!' : `${fmtNum(failed)} adet (%${fmtNum((failed / checked) * 100, 1)})`}</span> : undefined}>
            <input className={cx('input num', passed > checked && 'ring-red-400')} type="number" min={0} required value={f.passedQty} onChange={(e) => setF({ ...f, passedQty: e.target.value })} />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Hata dağılımı (adet)</span>
            <span className={cx('text-xs', failed && defectSum !== failed ? 'text-amber-700' : 'text-ink-500')}>
              Girilen: <b className="num">{fmtNum(defectSum)}</b>{failed ? ` / hatalı ${fmtNum(failed)}` : ''}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {me.settings.defectTypes.map((t) => (
              <label key={t} className={cx('flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 ring-1', defects[t] ? 'bg-red-50 ring-red-200' : 'bg-white ring-ink-200')}>
                <span className="truncate text-xs font-medium text-ink-700" title={t}>{t}</span>
                <input
                  className="w-16 rounded-lg bg-white px-2 py-1 text-right text-sm ring-1 ring-ink-200 focus:outline-none focus:ring-2 focus:ring-brand-500 num"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="0"
                  value={defects[t] || ''}
                  onChange={(e) => setDefects({ ...defects, [t]: Math.max(0, parseInt(e.target.value || '0', 10) || 0) })}
                />
              </label>
            ))}
            <div className="col-span-2 flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-1.5 ring-1 ring-dashed ring-ink-300 sm:col-span-3">
              <input className="input py-1" placeholder="Diğer hata tipi (listede yoksa)" maxLength={60} value={custom.type} onChange={(e) => setCustom({ ...custom, type: e.target.value })} />
              <input className="w-20 rounded-lg bg-white px-2 py-1 text-right text-sm ring-1 ring-ink-200 num" type="number" min={0} placeholder="0" value={custom.qty} onChange={(e) => setCustom({ ...custom, qty: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kontrolör">
            <input className="input" maxLength={80} value={f.inspector} onChange={(e) => setF({ ...f, inspector: e.target.value })} />
          </Field>
          <Field label="Not">
            <input className="input" maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </div>
        {err && <ErrorBox error={new Error(err)} />}
      </form>
    </Modal>
  );
}
