import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Award, Clock, Handshake, PackageMinus, Phone, Plus, Send, Trophy } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { addDaysInput, fmtDate, fmtMoney, fmtNum, toInputDate } from '@/lib/format';
import { FASON_STATUS, statusTone, type Tone } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Progress, SearchBox, Select, Stat, Table, Tabs, cx, type Column } from '@/components/ui';

type Tab = 'acik' | 'tumu' | 'karne';

export interface FasonJobRow {
  id: string;
  no: string;
  stage: string;
  status: string;
  description?: string | null;
  sentQty: number;
  receivedQty: number;
  defectQty: number;
  unitPrice?: string | number | null;
  amount?: number | null;
  sentDate: string;
  dueDate: string;
  dispatchNo?: string | null;
  party: { id: string; name: string; phone?: string | null };
  workOrder?: { id: string; no: string; color: string; model: { code: string; name: string } } | null;
  open: boolean;
  late: boolean;
  daysLate: number;
  pending: number;
  missing: number;
}

interface Perf {
  party: { id: string; name: string; dailyCapacity?: number | null };
  jobs: number;
  open: number;
  late: number;
  onTime: number;
  closed: number;
  sent: number;
  received: number;
  defect: number;
  missing: number;
  openQty: number;
  onTimePct: number | null;
  defectPct: number;
  avgDelay: number;
  score: number | null;
}

const scoreTone = (s: number | null): Tone => (s === null ? 'gray' : s >= 80 ? 'green' : s >= 60 ? 'amber' : 'red');
const scoreColor = (s: number | null) => (s === null ? 'text-ink-400' : s >= 80 ? 'text-emerald-600' : s >= 60 ? 'text-amber-600' : 'text-red-600');
const scoreRing = (s: number | null) => (s === null ? '#b7bdd3' : s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : '#ef4444');

function TerminCell({ j }: { j: FasonJobRow }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="num text-sm">{fmtDate(j.dueDate)}</span>
      {j.late ? <Badge tone="red">{j.daysLate} gün gecikti</Badge> : j.open && daysLeft(j.dueDate) <= 2 ? <Badge tone="amber">{daysLeft(j.dueDate) === 0 ? 'Bugün' : `${daysLeft(j.dueDate)} gün kaldı`}</Badge> : null}
    </div>
  );
}

function daysLeft(v: string) {
  const d = new Date(v);
  const t = new Date();
  d.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400_000);
}

export default function Fason() {
  const { can, stageLabel } = useSession();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('acik');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  const showPrice = can('fiyat:gor');

  useEffect(() => {
    if (params.get('yeni') === '1' && can('fason:yaz')) setModal(true);
  }, [params]);

  const closeModal = () => {
    setModal(false);
    if (params.get('yeni') || params.get('wo') || params.get('stage')) {
      const p = new URLSearchParams(params);
      p.delete('yeni');
      p.delete('wo');
      p.delete('stage');
      setParams(p, { replace: true });
    }
  };

  const openQ = useQuery({ queryKey: ['fason', 'open'], queryFn: () => api.get<FasonJobRow[]>('/fason?open=1') });
  const allQ = useQuery({ queryKey: ['fason', 'all'], queryFn: () => api.get<FasonJobRow[]>('/fason?take=500'), enabled: tab === 'tumu' });
  const perfQ = useQuery({ queryKey: ['fason', 'performance'], queryFn: () => api.get<Perf[]>('/fason/performance'), enabled: tab === 'karne' });

  const open = openQ.data ?? [];
  const stats = useMemo(() => {
    const late = open.filter((j) => j.late).length;
    const pending = open.reduce((s, j) => s + j.pending, 0);
    const partial = open.filter((j) => j.status === 'KISMI_DONDU').length;
    return { count: open.length, pending, late, partial };
  }, [open]);
  const missingTotal = useMemo(() => (allQ.data ?? []).reduce((s, j) => s + j.missing, 0), [allQ.data]);

  const rows = (tab === 'acik' ? openQ.data : allQ.data) ?? [];
  const filtered = useMemo(() => {
    const s = q.trim().toLocaleLowerCase('tr');
    if (!s) return rows;
    return rows.filter((j) =>
      [j.no, j.party.name, j.workOrder?.no, j.workOrder?.model.code, j.workOrder?.model.name, j.dispatchNo, stageLabel(j.stage)]
        .filter(Boolean)
        .some((v) => String(v).toLocaleLowerCase('tr').includes(s)),
    );
  }, [rows, q, stageLabel]);

  const columns: Column<FasonJobRow>[] = [
    { key: 'no', header: 'No', cell: (j) => <span className="font-semibold text-brand-700">{j.no}</span>, csv: (j) => j.no },
    {
      key: 'party',
      header: 'Fasoncu',
      cell: (j) => (
        <div className="min-w-[140px]">
          <div className="font-semibold text-ink-900">{j.party.name}</div>
          {j.party.phone && (
            <a href={`tel:${j.party.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
              <Phone className="size-3" /> {j.party.phone}
            </a>
          )}
        </div>
      ),
      csv: (j) => j.party.name,
    },
    {
      key: 'wo',
      header: 'İş emri / model',
      cell: (j) =>
        j.workOrder ? (
          <div>
            <div className="font-medium">{j.workOrder.no}</div>
            <div className="text-xs text-ink-500">{j.workOrder.model.code} · {j.workOrder.color}</div>
          </div>
        ) : (
          <span className="text-xs text-ink-500">{j.description || 'Serbest iş'}</span>
        ),
      csv: (j) => (j.workOrder ? `${j.workOrder.no} ${j.workOrder.model.code} ${j.workOrder.color}` : j.description ?? ''),
    },
    { key: 'stage', header: 'Aşama', cell: (j) => <Badge tone="violet">{stageLabel(j.stage)}</Badge>, csv: (j) => stageLabel(j.stage) },
    { key: 'sent', header: 'Gönderilen', align: 'right', cell: (j) => fmtNum(j.sentQty), csv: (j) => j.sentQty },
    { key: 'recv', header: 'Dönen', align: 'right', cell: (j) => <span className="text-emerald-700">{fmtNum(j.receivedQty)}</span>, csv: (j) => j.receivedQty },
    { key: 'defect', header: 'Fire', align: 'right', cell: (j) => <span className={cx(j.defectQty > 0 && 'text-red-600')}>{fmtNum(j.defectQty)}</span>, csv: (j) => j.defectQty },
    {
      key: 'pending',
      header: 'Bekleyen',
      align: 'right',
      cell: (j) =>
        j.open ? (
          <span className="font-bold text-ink-900">{fmtNum(j.pending)}</span>
        ) : j.missing > 0 ? (
          <Badge tone="red">{fmtNum(j.missing)} eksik</Badge>
        ) : (
          <span className="text-ink-400">—</span>
        ),
      csv: (j) => (j.open ? j.pending : j.missing ? `eksik ${j.missing}` : 0),
    },
    { key: 'due', header: 'Termin', cell: (j) => <TerminCell j={j} />, csv: (j) => `${fmtDate(j.dueDate)}${j.late ? ` (${j.daysLate} gün gecikti)` : ''}` },
    { key: 'status', header: 'Durum', cell: (j) => <Badge tone={statusTone(j.status)}>{FASON_STATUS[j.status] ?? j.status}</Badge>, csv: (j) => FASON_STATUS[j.status] ?? j.status },
  ];
  if (showPrice) columns.push({ key: 'amount', header: 'Tutar', align: 'right', cell: (j) => (j.amount !== null && j.amount !== undefined ? fmtMoney(j.amount) : '—'), csv: (j) => j.amount ?? '' });

  const activeQ = tab === 'acik' ? openQ : allQ;

  return (
    <div>
      <PageHeader
        title="Fason Takibi"
        subtitle="Dışarıya verilen işler, dönüşler, eksik ve fire takibi; fasoncu karnesi"
        actions={
          can('fason:yaz') && (
            <button className="btn-primary" onClick={() => setModal(true)}>
              <Send className="size-4" /> Fasona iş gönder
            </button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Açık iş" value={fmtNum(stats.count)} hint={stats.partial ? `${stats.partial} tanesi kısmi döndü` : 'Fasonda bekleyen işler'} icon={<Handshake className="size-5" />} onClick={() => setTab('acik')} />
        <Stat label="Bekleyen adet" value={fmtNum(stats.pending)} hint="Fasoncuda duran parça" tone="blue" icon={<Clock className="size-5" />} />
        <Stat label="Geciken iş" value={fmtNum(stats.late)} hint={stats.late ? 'Termini geçmiş, hemen arayın' : 'Geciken iş yok'} tone={stats.late ? 'red' : 'green'} icon={<AlertTriangle className="size-5" />} />
        <Stat
          label="Eksik dönen"
          value={allQ.data ? fmtNum(missingTotal) : '—'}
          hint={allQ.data ? 'Eksikle kapatılan işlerdeki kayıp adet' : 'Görmek için "Tümü" sekmesine geçin'}
          tone={missingTotal ? 'amber' : 'gray'}
          icon={<PackageMinus className="size-5" />}
          onClick={() => setTab('tumu')}
        />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'acik', label: 'Açık işler', count: openQ.data?.length },
          { value: 'tumu', label: 'Tümü' },
          { value: 'karne', label: <><Trophy className="size-3.5" /> Fasoncu karnesi</> },
        ]}
      />

      {tab === 'karne' ? (
        <Scorecard q={perfQ} />
      ) : (
        <Card bodyClass="p-0" title={tab === 'acik' ? 'Fasondaki açık işler' : 'Tüm fason işleri'} subtitle={tab === 'acik' ? 'Termine göre sıralı; geciken işler kırmızı' : 'Son 500 kayıt'} actions={<SearchBox value={q} onChange={setQ} placeholder="No, fasoncu, iş emri, irsaliye…" />}>
          {activeQ.isLoading ? (
            <Loading />
          ) : activeQ.error ? (
            <div className="p-4"><ErrorBox error={activeQ.error} /></div>
          ) : (
            <Table
              rows={filtered}
              columns={columns}
              rowKey={(j) => j.id}
              onRowClick={(j) => nav(`/fason/${j.id}`)}
              csvName={tab === 'acik' ? 'fason-acik-isler' : 'fason-isleri'}
              empty={
                <Empty
                  icon={<Handshake className="size-6" />}
                  title={q ? 'Aramaya uyan iş yok' : tab === 'acik' ? 'Fasonda açık iş yok' : 'Henüz fasona iş gönderilmemiş'}
                  text={q ? 'Farklı bir kelimeyle arayın.' : 'Nakış, baskı, dikim gibi dışarıya verdiğiniz işleri buradan takip edin; dönüşleri girdikçe iş emrine otomatik işlenir.'}
                  action={can('fason:yaz') && !q ? <button className="btn-primary btn-sm" onClick={() => setModal(true)}><Plus className="size-4" /> Fasona iş gönder</button> : undefined}
                />
              }
            />
          )}
        </Card>
      )}

      {modal && <SendModal onClose={closeModal} initialWo={params.get('wo') ?? ''} initialStage={params.get('stage') ?? ''} onCreated={(id) => nav(`/fason/${id}`)} />}
    </div>
  );
}

// ── Fasoncu karnesi
function ScoreRing({ score }: { score: number | null }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = score ?? 0;
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#eceef6" strokeWidth="7" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={scoreRing(score)} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <div className={cx('absolute inset-0 grid place-items-center text-lg font-extrabold num', scoreColor(score))}>{score ?? '—'}</div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="rounded-xl bg-ink-50 px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className={cx('num text-sm font-bold', tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-ink-900')}>{value}</div>
    </div>
  );
}

function Scorecard({ q }: { q: { data?: Perf[]; isLoading: boolean; error: unknown } }) {
  const nav = useNavigate();
  const { can } = useSession();
  const goParty = can('cari:gor') ? (id: string) => nav(`/cariler/${id}`) : undefined;
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const list = q.data ?? [];
  if (!list.length)
    return (
      <Card>
        <Empty icon={<Award className="size-6" />} title="Karne için henüz veri yok" text="Fasoncular iş teslim ettikçe zamanında teslim, fire ve gecikme puanları burada oluşur." />
      </Card>
    );
  const ranked = list.filter((p) => p.score !== null);
  const unrated = list.filter((p) => p.score === null);
  const medal = ['bg-thread-400 text-brand-900', 'bg-ink-200 text-ink-800', 'bg-amber-700/80 text-white'];

  const columns: Column<Perf>[] = [
    { key: 'name', header: 'Fasoncu', cell: (p) => <span className="font-semibold">{p.party.name}</span>, csv: (p) => p.party.name },
    { key: 'score', header: 'Puan', align: 'right', cell: (p) => <Badge tone={scoreTone(p.score)}>{p.score ?? 'Yeni'}</Badge>, csv: (p) => p.score ?? '' },
    { key: 'ontime', header: 'Zamanında %', align: 'right', cell: (p) => (p.onTimePct === null ? '—' : `%${p.onTimePct}`), csv: (p) => p.onTimePct ?? '' },
    { key: 'defect', header: 'Fire %', align: 'right', cell: (p) => `%${fmtNum(p.defectPct, 1)}`, csv: (p) => p.defectPct },
    { key: 'delay', header: 'Ort. gecikme', align: 'right', cell: (p) => (p.avgDelay ? `${fmtNum(p.avgDelay, 1)} gün` : '—'), csv: (p) => p.avgDelay },
    { key: 'jobs', header: 'Toplam iş', align: 'right', cell: (p) => fmtNum(p.jobs), csv: (p) => p.jobs },
    { key: 'open', header: 'Açık iş / adet', align: 'right', cell: (p) => `${p.open} / ${fmtNum(p.openQty)}`, csv: (p) => `${p.open} / ${p.openQty}` },
    { key: 'late', header: 'Şu an geciken', align: 'right', cell: (p) => (p.late ? <Badge tone="red">{p.late}</Badge> : '0'), csv: (p) => p.late },
    { key: 'sent', header: 'Gönderilen', align: 'right', cell: (p) => fmtNum(p.sent), csv: (p) => p.sent },
    { key: 'missing', header: 'Eksik adet', align: 'right', cell: (p) => (p.missing ? <span className="font-semibold text-red-600">{fmtNum(p.missing)}</span> : '0'), csv: (p) => p.missing },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-brand-200">
        <Award className="mt-0.5 size-5 shrink-0" />
        <div>
          <b>Sıradaki işi kime vermeli?</b> Puan; zamanında teslim oranı (%60) ve fire oranından (%40) hesaplanır, eksik teslim eden fasoncudan 5 puan düşülür. Açık işi çok olan fasoncunun kapasitesi dolu olabilir.
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ranked.map((p, i) => {
          const load = p.party.dailyCapacity ? Math.round((p.openQty / p.party.dailyCapacity) * 10) / 10 : null;
          return (
            <button key={p.party.id} type="button" onClick={goParty ? () => goParty(p.party.id) : undefined} className={cx('card relative flex flex-col gap-3 p-4 text-left transition', goParty && 'hover:shadow-pop hover:ring-brand-300', i === 0 && 'ring-2 ring-thread-400')}>
              <div className="flex items-center gap-3">
                <ScoreRing score={p.score} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cx('grid size-6 shrink-0 place-items-center rounded-full text-xs font-extrabold', medal[i] ?? 'bg-ink-100 text-ink-600')}>{i + 1}</span>
                    <span className="truncate font-bold text-ink-900">{p.party.name}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {i === 0 && <Badge tone="amber"><Trophy className="size-3" /> En iyi</Badge>}
                    {p.late > 0 && <Badge tone="red">{p.late} iş gecikmede</Badge>}
                    {p.open === 0 && <Badge tone="green">Boşta</Badge>}
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11px] font-semibold text-ink-500">
                  <span>Zamanında teslim</span>
                  <span className="num">%{p.onTimePct ?? 0}</span>
                </div>
                <Progress value={p.onTimePct ?? 0} tone={(p.onTimePct ?? 0) < 60 ? 'red' : (p.onTimePct ?? 0) < 80 ? 'amber' : undefined} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Fire" value={`%${fmtNum(p.defectPct, 1)}`} tone={p.defectPct > 5 ? 'bad' : p.defectPct > 2 ? 'warn' : 'good'} />
                <Metric label="Ort. gecikme" value={p.avgDelay ? `${fmtNum(p.avgDelay, 1)} g` : '0 g'} tone={p.avgDelay > 3 ? 'bad' : p.avgDelay > 0 ? 'warn' : 'good'} />
                <Metric label="Eksik" value={fmtNum(p.missing)} tone={p.missing ? 'bad' : 'good'} />
                <Metric label="Açık iş" value={String(p.open)} />
                <Metric label="Açık adet" value={fmtNum(p.openQty)} />
                <Metric label="Kapasite" value={load !== null ? `${fmtNum(load, 1)} gün` : '—'} tone={load !== null && load > 5 ? 'warn' : undefined} />
              </div>
              <div className="text-[11px] text-ink-500">{p.closed} teslim · {p.onTime} zamanında · toplam {fmtNum(p.sent)} adet gönderildi</div>
            </button>
          );
        })}
      </div>

      {unrated.length > 0 && (
        <Card title="Henüz puanlanmamış fasoncular" subtitle="Tamamlanmış işi olmayan fasoncular; ilk teslimden sonra puan alır">
          <div className="flex flex-wrap gap-2">
            {unrated.map((p) => (
              <span key={p.party.id} className="rounded-xl bg-ink-50 px-3 py-1.5 text-sm ring-1 ring-ink-200">
                <b>{p.party.name}</b> <span className="text-ink-500">· {p.open} açık iş, {fmtNum(p.openQty)} adet</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card title="Karne tablosu" bodyClass="p-0">
        <Table rows={list} columns={columns} rowKey={(p) => p.party.id} csvName="fasoncu-karnesi" onRowClick={goParty ? (p) => goParty(p.party.id) : undefined} />
      </Card>
    </div>
  );
}

// ── Fasona iş gönder
interface PartyOpt { id: string; name: string; phone?: string | null; specialties?: string[]; dailyCapacity?: number | null }
interface WoStage { id: string; stage: string; sequence: number; doneQty: number; defectQty: number; status: string }
interface WoOpt { id: string; no: string; color: string; plannedQty: number; dueDate: string; model: { code: string; name: string }; stages: WoStage[] }

function SendModal({ onClose, initialWo, initialStage, onCreated }: { onClose: () => void; initialWo: string; initialStage: string; onCreated: (id: string) => void }) {
  const { me, can, stageLabel } = useSession();
  const showPrice = can('fiyat:gor');
  const [f, setF] = useState({
    partyId: '',
    workOrderId: initialWo,
    stage: initialStage,
    sentQty: '',
    unitPrice: '',
    sentDate: toInputDate(),
    dueDate: addDaysInput(7),
    dispatchNo: '',
    description: '',
    note: '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const parties = useQuery({ queryKey: ['parties', 'FASONCU'], queryFn: () => api.get<PartyOpt[]>(`/parties${qs({ type: 'FASONCU', take: 500 })}`) });
  const wos = useQuery({ queryKey: ['work-orders', 'open'], queryFn: () => api.get<WoOpt[]>('/production/work-orders?open=1&take=500'), enabled: can('uretim:gor') });

  const wo = wos.data?.find((w) => w.id === f.workOrderId);
  const stageOpts = wo
    ? wo.stages.map((s) => ({ value: s.stage, label: stageLabel(s.stage) }))
    : me.settings.stages.map((s) => ({ value: s.code, label: s.label }));

  // İş emri değişince aşama rotada yoksa temizle
  useEffect(() => {
    if (wo && f.stage && !wo.stages.some((s) => s.stage === f.stage)) setF((s) => ({ ...s, stage: '' }));
  }, [wo, f.stage]);

  const waiting = useMemo(() => {
    if (!wo || !f.stage) return null;
    const idx = wo.stages.findIndex((s) => s.stage === f.stage);
    if (idx < 0) return null;
    const cur = wo.stages[idx];
    const prevDone = idx === 0 ? wo.plannedQty : wo.stages[idx - 1].doneQty;
    return Math.max(0, prevDone - cur.doneQty - cur.defectQty);
  }, [wo, f.stage]);

  const party = parties.data?.find((p) => p.id === f.partyId);

  const save = useAction(
    () =>
      api.post('/fason', {
        partyId: f.partyId,
        workOrderId: f.workOrderId || null,
        stage: f.stage,
        sentQty: Number(f.sentQty),
        unitPrice: showPrice && f.unitPrice !== '' ? f.unitPrice : undefined,
        sentDate: f.sentDate || undefined,
        dueDate: f.dueDate,
        dispatchNo: f.dispatchNo || undefined,
        description: f.description || undefined,
        note: f.note || undefined,
      }),
    { success: (r: any) => `Fason işi oluşturuldu${r?.no ? ` (${r.no})` : ''}.`, invalidate: [['fason'], ['work-orders'], ['work-order']], onDone: (r: any) => { onClose(); if (r?.id) onCreated(r.id); } },
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Fasona iş gönder"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button type="submit" form="fason-send" className="btn-primary" disabled={save.isPending}>
            <Send className="size-4" /> {save.isPending ? 'Kaydediliyor…' : 'Gönder'}
          </button>
        </>
      }
    >
      <form id="fason-send" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Fasoncu" required className="sm:col-span-2" hint={party?.specialties?.length ? `Uzmanlık: ${party.specialties.join(', ')}${party.dailyCapacity ? ` · günlük kapasite ${fmtNum(party.dailyCapacity)} adet` : ''}` : parties.data && !parties.data.length ? 'Cariler ekranında fasoncu rolüyle kayıt açın.' : undefined}>
          <Select
            required
            value={f.partyId}
            onChange={set('partyId')}
            placeholder={parties.isLoading ? 'Yükleniyor…' : 'Fasoncu seçin'}
            options={(parties.data ?? []).map((p) => ({ value: p.id, label: p.specialties?.length ? `${p.name} — ${p.specialties.join(', ')}` : p.name }))}
          />
        </Field>
        {can('uretim:gor') && (
          <Field label="İş emri" className="sm:col-span-2" hint="Seçerseniz dönüşler iş emrinin ilgili aşamasına otomatik işlenir.">
            <Select
              value={f.workOrderId}
              onChange={set('workOrderId')}
              placeholder="İş emrine bağlı değil (serbest iş)"
              options={(wos.data ?? []).map((w) => ({ value: w.id, label: `${w.no} · ${w.model.code} ${w.model.name} · ${w.color}` }))}
            />
          </Field>
        )}
        <Field label="Aşama" required hint={wo ? 'Yalnızca iş emrinin rotasındaki aşamalar' : undefined}>
          <Select required value={f.stage} onChange={set('stage')} placeholder="Aşama seçin" options={stageOpts} />
        </Field>
        <Field
          label="Gönderilen adet"
          required
          hint={
            waiting !== null ? (
              <span>
                Bu aşamada bekleyen: <b className="num">{fmtNum(waiting)}</b> adet{' '}
                {waiting > 0 && String(waiting) !== f.sentQty && (
                  <button type="button" className="font-semibold text-brand-700 underline" onClick={() => set('sentQty')(String(waiting))}>
                    kullan
                  </button>
                )}
              </span>
            ) : undefined
          }
        >
          <input className="input num" type="number" min={1} required inputMode="numeric" value={f.sentQty} onChange={(e) => set('sentQty')(e.target.value)} />
        </Field>
        {showPrice && (
          <Field label="Birim fiyat (₺/adet)" hint={f.unitPrice && f.sentQty ? `Tahmini tutar: ${fmtMoney(Number(f.unitPrice) * Number(f.sentQty))}` : 'Fason faturası kontrolü için'}>
            <input className="input num" type="number" min={0} step="0.01" inputMode="decimal" value={f.unitPrice} onChange={(e) => set('unitPrice')(e.target.value)} />
          </Field>
        )}
        <Field label="İrsaliye no">
          <input className="input" maxLength={40} value={f.dispatchNo} onChange={(e) => set('dispatchNo')(e.target.value)} placeholder="Çıkış irsaliyesi" />
        </Field>
        <Field label="Gönderim tarihi">
          <input className="input" type="date" value={f.sentDate} onChange={(e) => set('sentDate')(e.target.value)} />
        </Field>
        <Field label="Termin (dönüş tarihi)" required hint={wo ? `İş emri termini: ${fmtDate(wo.dueDate)}` : undefined}>
          <input className="input" type="date" required value={f.dueDate} onChange={(e) => set('dueDate')(e.target.value)} />
        </Field>
        <Field label="İş tanımı" className="sm:col-span-2">
          <input className="input" maxLength={300} value={f.description} onChange={(e) => set('description')(e.target.value)} placeholder="Örn. göğüs nakışı, sırt baskısı, taşlama yıkama" />
        </Field>
        <Field label="Not" className="sm:col-span-2">
          <textarea className="input" rows={2} maxLength={1000} value={f.note} onChange={(e) => set('note')(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
