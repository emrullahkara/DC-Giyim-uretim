import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ClipboardCheck, FileText, Printer, Scissors, Truck } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { useSession } from '@/lib/session';
import { fmtDate, fmtMoney, fmtNum, toInputDate } from '@/lib/format';
import { Card, Empty, ErrorBox, Loading, PageHeader, Stat, Table, cx, type Column } from '@/components/ui';

interface ReportData {
  error?: string;
  stageTotals: Record<string, { qty: number; defect: number }>;
  topModels: { code: string; name: string; qty: number }[];
  fason: { party: string; sent: number; received: number; defect: number; amount?: number }[];
  customers: { customer: string; qty: number; revenue?: number }[];
  quality: { checked: number; passed: number; failRate: number };
  orders: { count: number; qty: number };
  shippedQty: number;
}

type Preset = 'hafta' | 'ay' | 'gecenay' | '90' | 'ozel';

function rangeOf(p: Preset): { from: string; to: string } {
  const now = new Date();
  if (p === 'hafta') {
    const d = new Date(now);
    const dow = (d.getDay() + 6) % 7; // Pazartesi = 0
    d.setDate(d.getDate() - dow);
    return { from: toInputDate(d), to: toInputDate(now) };
  }
  if (p === 'ay') return { from: toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toInputDate(now) };
  if (p === 'gecenay') return { from: toInputDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: toInputDate(new Date(now.getFullYear(), now.getMonth(), 0)) };
  return { from: toInputDate(new Date(now.getTime() - 89 * 86400_000)), to: toInputDate(now) };
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'hafta', label: 'Bu hafta' },
  { value: 'ay', label: 'Bu ay' },
  { value: 'gecenay', label: 'Geçen ay' },
  { value: '90', label: 'Son 90 gün' },
  { value: 'ozel', label: 'Özel' },
];

export default function Reports() {
  const { me, can, stageLabel } = useSession();
  const showPrice = can('fiyat:gor');
  const [preset, setPreset] = useState<Preset>('ay');
  const [range, setRange] = useState(rangeOf('ay'));
  const pick = (p: Preset) => {
    setPreset(p);
    if (p !== 'ozel') setRange(rangeOf(p));
  };
  const valid = !!range.from && !!range.to && range.from <= range.to;
  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', range.from, range.to],
    queryFn: () => api.get<ReportData>(`/dashboard/reports${qs(range)}`),
    enabled: valid,
  });

  const stages = useMemo(() => {
    if (!data?.stageTotals) return [];
    const order = me.settings.stages.map((s) => s.code);
    return Object.entries(data.stageTotals)
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => {
        const ia = order.indexOf(a.code);
        const ib = order.indexOf(b.code);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
  }, [data, me.settings.stages]);
  const maxStage = Math.max(1, ...stages.map((s) => s.qty + s.defect));
  const waste = me.settings.alerts.wasteRatePct;

  const modelCols: Column<ReportData['topModels'][number]>[] = [
    { key: 'rank', header: '#', cell: (m) => <span className="text-ink-400">{(data?.topModels.indexOf(m) ?? 0) + 1}</span> },
    { key: 'code', header: 'Model kodu', cell: (m) => <span className="font-semibold">{m.code}</span>, csv: (m) => m.code },
    { key: 'name', header: 'Model adı', cell: (m) => m.name, csv: (m) => m.name },
    { key: 'qty', header: 'Üretilen adet', align: 'right', cell: (m) => <b>{fmtNum(m.qty)}</b>, csv: (m) => m.qty },
  ];
  const fasonCols: Column<ReportData['fason'][number]>[] = [
    { key: 'party', header: 'Fasoncu', cell: (f) => <span className="font-semibold">{f.party}</span>, csv: (f) => f.party },
    { key: 'sent', header: 'Gönderilen', align: 'right', cell: (f) => fmtNum(f.sent), csv: (f) => f.sent },
    { key: 'recv', header: 'Dönen', align: 'right', cell: (f) => fmtNum(f.received), csv: (f) => f.received },
    { key: 'defect', header: 'Fire', align: 'right', cell: (f) => <span className={cx(f.defect > 0 && 'text-red-600')}>{fmtNum(f.defect)}</span>, csv: (f) => f.defect },
    { key: 'rate', header: 'Fire %', align: 'right', cell: (f) => (f.sent ? `%${fmtNum((f.defect / f.sent) * 100, 1)}` : '—'), csv: (f) => (f.sent ? Math.round((f.defect / f.sent) * 1000) / 10 : '') },
  ];
  if (showPrice) fasonCols.push({ key: 'amount', header: 'Tutar', align: 'right', cell: (f) => (f.amount !== undefined ? fmtMoney(f.amount) : '—'), csv: (f) => f.amount });
  const custCols: Column<ReportData['customers'][number]>[] = [
    { key: 'c', header: 'Müşteri', cell: (c) => <span className="font-semibold">{c.customer}</span>, csv: (c) => c.customer },
    { key: 'qty', header: 'Sevk edilen adet', align: 'right', cell: (c) => fmtNum(c.qty), csv: (c) => c.qty },
  ];
  if (showPrice) custCols.push({ key: 'rev', header: 'Ciro', align: 'right', cell: (c) => (c.revenue !== undefined ? fmtMoney(c.revenue) : '—'), csv: (c) => c.revenue });

  const totalProduced = stages.reduce((s, x) => s + x.qty, 0);
  const fasonTotal = (data?.fason ?? []).reduce((s, f) => s + f.sent, 0);
  const revenue = showPrice ? (data?.customers ?? []).reduce((s, c) => s + (c.revenue ?? 0), 0) : null;

  return (
    <div>
      <PageHeader
        title="Raporlar"
        subtitle={`${fmtDate(range.from)} – ${fmtDate(range.to)} dönemi`}
        actions={
          <button className="btn-outline no-print" onClick={() => window.print()}>
            <Printer className="size-4" /> Yazdır
          </button>
        }
      />

      <div className="no-print mb-5 flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-ink-200">
          {PRESETS.map((p) => (
            <button key={p.value} type="button" onClick={() => pick(p.value)} className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold transition', preset === p.value ? 'bg-brand-800 text-white' : 'text-ink-600 hover:bg-ink-100')}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input className="input w-auto" type="date" value={range.from} max={range.to} onChange={(e) => { setPreset('ozel'); setRange({ ...range, from: e.target.value }); }} aria-label="Başlangıç" />
          <span className="text-ink-400">–</span>
          <input className="input w-auto" type="date" value={range.to} min={range.from} onChange={(e) => { setPreset('ozel'); setRange({ ...range, to: e.target.value }); }} aria-label="Bitiş" />
        </div>
      </div>

      {!valid ? (
        <ErrorBox error={new Error('Başlangıç tarihi bitişten sonra olamaz.')} />
      ) : isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorBox error={error} />
      ) : data.error ? (
        <ErrorBox error={new Error(`${data.error}. Daha kısa bir aralık seçin.`)} />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Yeni sipariş" value={fmtNum(data.orders.count)} hint={`${fmtNum(data.orders.qty)} adet`} icon={<FileText className="size-5" />} />
            <Stat label="Üretim kaydı (tüm aşamalar)" value={fmtNum(totalProduced)} hint="Aşamalarda işlenen adet" tone="violet" icon={<Scissors className="size-5" />} />
            <Stat label="Sevk edilen" value={fmtNum(data.shippedQty)} hint={revenue !== null ? fmtMoney(revenue) : 'adet'} tone="green" icon={<Truck className="size-5" />} />
            <Stat label="Fasona giden" value={fmtNum(fasonTotal)} hint={`${data.fason.length} fasoncu`} tone="blue" icon={<BarChart3 className="size-5" />} />
            <Stat label="Kalite hata oranı" value={`%${fmtNum(data.quality.failRate, 1)}`} hint={`${fmtNum(data.quality.checked)} kontrol, ${fmtNum(data.quality.passed)} sağlam`} tone={data.quality.failRate > waste ? 'red' : 'green'} icon={<ClipboardCheck className="size-5" />} />
          </div>

          <Card title="Aşama bazında üretim" subtitle={`Her aşamada işlenen sağlam adet ve fire; fire oranı %${waste} eşiğini aşarsa kırmızı`}>
            {stages.length ? (
              <div className="space-y-3">
                {stages.map((s) => {
                  const tot = s.qty + s.defect;
                  const rate = tot ? (s.defect / tot) * 100 : 0;
                  return (
                    <div key={s.code} className="grid grid-cols-[minmax(80px,140px)_1fr_auto] items-center gap-3">
                      <div className="truncate text-sm font-semibold text-ink-800">{stageLabel(s.code)}</div>
                      <div className="flex h-6 overflow-hidden rounded-lg bg-ink-100">
                        <div className="h-full bg-brand-600" style={{ width: `${(s.qty / maxStage) * 100}%` }} title={`Sağlam ${s.qty}`} />
                        <div className="h-full bg-red-500" style={{ width: `${(s.defect / maxStage) * 100}%` }} title={`Fire ${s.defect}`} />
                      </div>
                      <div className="num w-36 text-right text-xs">
                        <b className="text-sm text-ink-900">{fmtNum(s.qty)}</b>
                        <span className={cx('ml-2', rate > waste ? 'font-bold text-red-600' : 'text-ink-500')}>fire {fmtNum(s.defect)} (%{fmtNum(rate, 1)})</span>
                      </div>
                    </div>
                  );
                })}
                <div className="flex gap-4 pt-1 text-[11px] text-ink-500">
                  <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-brand-600" /> Sağlam</span>
                  <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-red-500" /> Fire</span>
                </div>
              </div>
            ) : (
              <Empty title="Bu dönemde üretim kaydı yok" text="Atölye panosundan aşama kayıtları girildikçe burada görünür." />
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="En çok üretilen modeller" bodyClass="p-0">
              <Table rows={data.topModels} columns={modelCols} rowKey={(m) => m.code} csvName="rapor-modeller" dense empty={<Empty title="Veri yok" text="Seçilen dönemde model bazlı üretim kaydı bulunmuyor." />} />
            </Card>
            <Card title="Müşteri bazında sevkiyat" bodyClass="p-0">
              <Table rows={data.customers} columns={custCols} rowKey={(c) => c.customer} csvName="rapor-musteriler" dense empty={<Empty title="Sevkiyat yok" text="Seçilen dönemde sevkiyat yapılmamış." />} />
            </Card>
          </div>

          <Card title="Fasoncu bazında" subtitle="Dönem içinde gönderilen işler" bodyClass="p-0">
            <Table rows={data.fason} columns={fasonCols} rowKey={(f) => f.party} csvName="rapor-fason" dense empty={<Empty title="Fason işi yok" text="Seçilen dönemde fasona iş gönderilmemiş." />} />
          </Card>
        </div>
      )}
    </div>
  );
}
