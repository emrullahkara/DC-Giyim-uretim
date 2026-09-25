import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertOctagon, AlertTriangle, ArrowRight, Boxes, CheckCircle2, ClipboardCheck, Factory, FileText, Handshake, Info, ListChecks,
  PackageCheck, RefreshCw, Users, Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { fmtMoney, fmtNum, fmtShort } from '@/lib/format';
import { RISK } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Loading, Progress, Stat, cx } from '@/components/ui';

interface Alert { level: 'kritik' | 'uyari' | 'bilgi'; module: string; title: string; detail: string; link: string; action?: string }
interface Dash {
  alerts: Alert[];
  kpi: Record<string, number | null | undefined>;
  orders?: { id: string; no: string; customer: string; dueDate: string; progress: number; expected: number; risk: string; reason: string; remaining: number; dailyNeeded: number | null; daysLeft: number }[];
  todayByStage?: Record<string, number>;
  waitingByStage?: Record<string, number>;
  outputTrend?: { date: string; qty: number }[];
  shortages?: { material: { id: string; code: string; name: string; unit: string }; required: number; stock: number; shortage: number }[];
  finance?: { receivable?: number; payable?: number; chequesDue: number };
  tasks?: { id: string; title: string; assigneeName: string | null; dueDate: string | null; priority: number }[];
  attendanceEntered?: number;
}

const MODULES: Record<string, { label: string; icon: ReactNode }> = {
  siparis: { label: 'Sipariş', icon: <FileText /> },
  uretim: { label: 'Üretim', icon: <Factory /> },
  fason: { label: 'Fason', icon: <Handshake /> },
  depo: { label: 'Depo', icon: <Boxes /> },
  finans: { label: 'Finans', icon: <Wallet /> },
  personel: { label: 'Personel', icon: <Users /> },
  kalite: { label: 'Kalite', icon: <ClipboardCheck /> },
  gorev: { label: 'Görev', icon: <ListChecks /> },
};

const LEVEL = {
  kritik: { label: 'Kritik', cls: 'border-l-red-500 bg-red-50/40', icon: <AlertOctagon className="size-4 text-red-600" />, tone: 'red' as const },
  uyari: { label: 'Uyarı', cls: 'border-l-amber-400 bg-amber-50/30', icon: <AlertTriangle className="size-4 text-amber-600" />, tone: 'amber' as const },
  bilgi: { label: 'Bilgi', cls: 'border-l-sky-400', icon: <Info className="size-4 text-sky-600" />, tone: 'blue' as const },
};

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
}

export default function Dashboard() {
  const { me, can, stageLabel } = useSession();
  const nav = useNavigate();
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dash>('/dashboard'),
    refetchInterval: 60_000,
  });
  const [level, setLevel] = useState<'hepsi' | Alert['level']>('hepsi');
  const [mod, setMod] = useState<string>('hepsi');

  const counts = useMemo(() => {
    const c = { kritik: 0, uyari: 0, bilgi: 0 };
    data?.alerts.forEach((a) => c[a.level]++);
    return c;
  }, [data]);
  const modules = useMemo(() => [...new Set(data?.alerts.map((a) => a.module) ?? [])], [data]);
  const alerts = (data?.alerts ?? []).filter((a) => (level === 'hepsi' || a.level === level) && (mod === 'hepsi' || a.module === mod));

  if (isLoading) return <Loading text="Kontrol kulesi hazırlanıyor…" />;
  if (error || !data) return <ErrorBox error={error} />;
  const k = data.kpi;

  const today = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const waiting = Object.entries(data.waitingByStage ?? {}).filter(([, v]) => v > 0);
  const maxWaiting = Math.max(1, ...waiting.map(([, v]) => v));
  const trend = data.outputTrend ?? [];
  const maxTrend = Math.max(1, ...trend.map((t) => t.qty));
  const avgTrend = trend.length ? Math.round(trend.reduce((s, t) => s + t.qty, 0) / trend.filter((t) => t.qty > 0).length || 0) : 0;

  return (
    <div className="space-y-5">
      {/* Başlık ve günün özeti */}
      <div className="relative overflow-hidden rounded-3xl bg-brand-900 px-5 py-6 text-white sm:px-7">
        <div className="absolute -right-16 -top-24 size-72 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="absolute -bottom-24 right-40 size-60 rounded-full bg-thread-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-200">{today}</div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
              {greeting()}, {me.user.name.split(' ')[0]}
            </h1>
            <p className="mt-1 text-sm text-brand-100/90">
              {counts.kritik + counts.uyari === 0 ? (
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-emerald-400" /> Her şey yolunda görünüyor. Acil bir konu yok.</span>
              ) : (
                <>Bugün <b className="text-white">{counts.kritik} kritik</b> ve <b className="text-white">{counts.uyari} uyarı</b> dikkatinizi bekliyor.</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(['kritik', 'uyari', 'bilgi'] as const).map((l) => (
              <button key={l} onClick={() => setLevel(level === l ? 'hepsi' : l)} className={cx('rounded-2xl px-4 py-2 text-left ring-1 transition', level === l ? 'bg-white text-brand-900 ring-white' : 'bg-white/5 ring-white/15 hover:bg-white/10')}>
                <div className="num text-2xl font-extrabold leading-none">{counts[l]}</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">{LEVEL[l].label}</div>
              </button>
            ))}
            <button onClick={() => refetch()} className="rounded-xl p-2 text-brand-200 hover:bg-white/10" title={`Son güncelleme: ${new Date(dataUpdatedAt).toLocaleTimeString('tr-TR')}`} aria-label="Yenile">
              <RefreshCw className={cx('size-5', isFetching && 'animate-spin')} />
            </button>
          </div>
        </div>
      </div>

      {/* Göstergeler */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {k.openOrders !== undefined && (
          <Stat label="Açık sipariş" value={fmtNum(k.openOrders)} hint={`${fmtNum(k.openQty)} adet üretilecek`} icon={<FileText className="size-5" />} onClick={() => nav('/siparisler')} />
        )}
        {k.lateOrders !== undefined && (
          <Stat label="Geciken / riskli" value={<span><span className={k.lateOrders ? 'text-red-600' : ''}>{k.lateOrders}</span><span className="text-ink-300"> / </span><span className={k.riskyOrders ? 'text-amber-600' : ''}>{k.riskyOrders}</span></span>} hint="sipariş" tone={k.lateOrders ? 'red' : k.riskyOrders ? 'amber' : 'green'} icon={<AlertTriangle className="size-5" />} onClick={() => nav('/siparisler')} />
        )}
        {k.todayOutput !== undefined && (
          <Stat label="Bugün çıkan (paket)" value={fmtNum(k.todayOutput)} hint={avgTrend ? `günlük ort. ${fmtNum(avgTrend)}` : `${fmtNum(k.openWorkOrders)} açık iş emri`} tone="green" icon={<PackageCheck className="size-5" />} onClick={() => nav('/atolye')} />
        )}
        {k.fasonOpen !== undefined && (
          <Stat label="Fasonda bekleyen" value={fmtNum(k.fasonPendingQty)} hint={<>{k.fasonOpen} iş{k.fasonLate ? <b className="text-red-600"> · {k.fasonLate} gecikmede</b> : ''}</>} tone={k.fasonLate ? 'red' : 'violet'} icon={<Handshake className="size-5" />} onClick={() => nav('/fason')} />
        )}
        {k.criticalStock !== undefined && (
          <Stat label="Kritik / eksik malzeme" value={<span><span className={k.criticalStock ? 'text-amber-600' : ''}>{k.criticalStock}</span><span className="text-ink-300"> / </span><span className={k.materialShortage ? 'text-red-600' : ''}>{k.materialShortage}</span></span>} hint="min. altı / siparişe yetmeyen" tone={k.materialShortage ? 'red' : k.criticalStock ? 'amber' : 'green'} icon={<Boxes className="size-5" />} onClick={() => nav('/depo')} />
        )}
        {k.employees !== undefined && (
          <Stat label="Bugün personel" value={<span>{fmtNum(k.present)}<span className="text-base text-ink-400">/{fmtNum(k.employees)}</span></span>} hint={data.attendanceEntered ? `${k.absent} gelmedi` : 'puantaj girilmedi'} tone={data.attendanceEntered ? 'blue' : 'gray'} icon={<Users className="size-5" />} onClick={() => nav('/personel?tab=puantaj')} />
        )}
        {k.employees === undefined && k.qualityFailRate !== undefined && (
          <Stat label="Kalite hata oranı (7 gün)" value={k.qualityFailRate === null ? '—' : `%${fmtNum(k.qualityFailRate, 1)}`} tone="violet" icon={<ClipboardCheck className="size-5" />} onClick={() => nav('/kalite')} />
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        {/* Uyarı akışı */}
        <Card
          title="Dikkat gerektirenler"
          subtitle="Sistem, gecikme ve eksikleri sizin yerinize sürekli tarar."
          bodyClass="p-0"
          actions={
            <div className="flex flex-wrap gap-1">
              <button className={cx('btn-sm rounded-lg font-semibold', mod === 'hepsi' ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600')} onClick={() => setMod('hepsi')}>Tümü</button>
              {modules.map((m) => (
                <button key={m} className={cx('btn-sm rounded-lg font-semibold', mod === m ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600')} onClick={() => setMod(m)}>
                  {MODULES[m]?.label ?? m}
                </button>
              ))}
            </div>
          }
        >
          {alerts.length === 0 ? (
            <Empty icon={<CheckCircle2 className="size-6 text-emerald-500" />} title="Burada bekleyen bir şey yok" text="Yeni bir gecikme, eksik veya vade olduğunda burada göreceksiniz." />
          ) : (
            <ul className="max-h-[640px] divide-y divide-ink-100 overflow-y-auto">
              {alerts.map((a, i) => (
                <li key={i} className={cx('flex items-start gap-3 border-l-4 px-4 py-3', LEVEL[a.level].cls)}>
                  <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-white text-ink-500 ring-1 ring-ink-200 [&_svg]:size-4">{MODULES[a.module]?.icon ?? <Info />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {LEVEL[a.level].icon}
                      <span className="text-sm font-semibold text-ink-900">{a.title}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-ink-600">{a.detail}</p>
                  </div>
                  <Link to={a.link} className="btn-outline btn-sm shrink-0">
                    {a.action ?? 'Aç'} <ArrowRight className="size-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          {/* Termin takibi */}
          {data.orders && (
            <Card title="Termin takibi" subtitle="Dikey çizgi: bugün itibarıyla olması gereken ilerleme" actions={<Link to="/siparisler" className="btn-ghost btn-sm">Tümü <ArrowRight className="size-3.5" /></Link>}>
              {data.orders.length === 0 ? (
                <Empty title="Termin riski olan sipariş yok" icon={<CheckCircle2 className="size-6 text-emerald-500" />} />
              ) : (
                <ul className="space-y-3">
                  {data.orders.slice(0, 7).map((o) => (
                    <li key={o.id}>
                      <Link to={`/siparisler/${o.id}`} className="block rounded-xl p-2 -m-2 hover:bg-ink-50">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-ink-900">{o.no}</span>
                            <span className="ml-2 truncate text-xs text-ink-500">{o.customer}</span>
                          </div>
                          <Badge tone={RISK[o.risk]?.tone}>{RISK[o.risk]?.label}</Badge>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Progress value={o.progress} expected={o.expected} tone={o.risk === 'GECIKTI' ? 'red' : o.risk === 'RISKLI' ? 'amber' : undefined} />
                          <span className="num w-10 text-right text-xs font-semibold text-ink-700">%{o.progress}</span>
                        </div>
                        <div className="mt-1 flex justify-between text-[11px] text-ink-500">
                          <span>Termin {fmtShort(o.dueDate)} · {o.daysLeft < 0 ? `${-o.daysLeft} gün geçti` : `${o.daysLeft} gün kaldı`}</span>
                          {o.dailyNeeded ? <span className="font-semibold text-ink-700">günde {fmtNum(o.dailyNeeded)} adet</span> : <span>{fmtNum(o.remaining)} adet kaldı</span>}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {/* Darboğaz */}
          {data.waitingByStage && (
            <Card title="Aşamalarda bekleyen iş" subtitle="En uzun çubuk darboğazı gösterir" actions={<Link to="/atolye" className="btn-ghost btn-sm">Pano <ArrowRight className="size-3.5" /></Link>}>
              {waiting.length === 0 ? (
                <p className="text-sm text-ink-500">Açık iş emri yok.</p>
              ) : (
                <ul className="space-y-2">
                  {me.settings.stages.filter((s) => data.waitingByStage![s.code]).map((s) => {
                    const v = data.waitingByStage![s.code];
                    const top = v === maxWaiting;
                    return (
                      <li key={s.code} className="flex items-center gap-3 text-sm">
                        <span className="w-24 shrink-0 truncate text-ink-600">{s.label}</span>
                        <div className="h-5 flex-1 overflow-hidden rounded-md bg-ink-100">
                          <div className={cx('h-full rounded-md', top ? 'bg-thread-400' : 'bg-brand-400')} style={{ width: `${(v / maxWaiting) * 100}%` }} />
                        </div>
                        <span className="num w-14 text-right font-semibold">{fmtNum(v)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {data.todayByStage && Object.keys(data.todayByStage).length > 0 && (
                <div className="mt-4 border-t border-ink-100 pt-3">
                  <div className="mb-1.5 text-xs font-semibold text-ink-500">Bugün işlenen</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(data.todayByStage).map(([s, v]) => (
                      <Badge key={s} tone="brand">{stageLabel(s)}: {fmtNum(v)}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {/* Üretim eğilimi */}
        {trend.length > 0 && (
          <Card title="Son 14 gün çıkış" subtitle="Son aşamadan (paket) çıkan adet">
            <div className="flex h-40 items-end gap-1.5">
              {trend.map((t) => {
                const d = new Date(t.date);
                const weekend = d.getDay() === 0;
                return (
                  <div key={t.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <div className="num text-[10px] font-semibold text-ink-600 opacity-0 group-hover:opacity-100">{t.qty}</div>
                    <div className={cx('w-full rounded-t-md transition-all', t.qty ? 'bg-brand-500 group-hover:bg-brand-700' : 'bg-ink-100', weekend && !t.qty && 'bg-ink-50')} style={{ height: `${Math.max(3, (t.qty / maxTrend) * 100)}%` }} title={`${d.toLocaleDateString('tr-TR')}: ${t.qty}`} />
                    <div className="text-[9px] text-ink-400">{d.getDate()}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Malzeme eksiği */}
        {data.shortages && (
          <Card title="Siparişlere yetmeyen malzeme" actions={<Link to="/depo" className="btn-ghost btn-sm">Depo <ArrowRight className="size-3.5" /></Link>}>
            {data.shortages.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-ink-500"><CheckCircle2 className="size-4 text-emerald-500" /> Açık siparişler için kumaş ve malzeme yeterli.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {data.shortages.slice(0, 6).map((s) => (
                  <li key={s.material.id} className="flex items-center justify-between gap-2 py-2">
                    <Link to={`/depo/${s.material.id}`} className="min-w-0 text-sm hover:underline">
                      <div className="truncate font-semibold text-ink-900">{s.material.code} · {s.material.name}</div>
                      <div className="text-xs text-ink-500">Gerekli {fmtNum(s.required, 1)} · Stok {fmtNum(s.stock, 1)} {s.material.unit.toLocaleLowerCase('tr')}</div>
                    </Link>
                    <Badge tone="red">−{fmtNum(s.shortage, 1)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* Finans ve görevler */}
        <div className="space-y-5">
          {data.finance && can('finans:gor') && (
            <Card title="Cari durum" actions={<Link to="/finans" className="btn-ghost btn-sm">Finans <ArrowRight className="size-3.5" /></Link>}>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-emerald-50 p-3">
                  <div className="text-xs font-semibold text-emerald-700">Alacaklarımız</div>
                  <div className="num mt-0.5 text-lg font-bold text-emerald-800">{fmtMoney(data.finance.receivable)}</div>
                </div>
                <div className="rounded-xl bg-red-50 p-3">
                  <div className="text-xs font-semibold text-red-700">Borçlarımız</div>
                  <div className="num mt-0.5 text-lg font-bold text-red-800">{fmtMoney(data.finance.payable)}</div>
                </div>
              </div>
              {data.finance.chequesDue > 0 && <p className="mt-3 text-xs text-ink-600">Yakın vadeli <b>{data.finance.chequesDue}</b> çek/senet var.</p>}
            </Card>
          )}
          {data.tasks && (
            <Card title="Açık görevler" actions={<Link to="/gorevler" className="btn-ghost btn-sm">Tümü <ArrowRight className="size-3.5" /></Link>}>
              {data.tasks.length === 0 ? (
                <p className="text-sm text-ink-500">Açık görev yok.</p>
              ) : (
                <ul className="space-y-2">
                  {data.tasks.slice(0, 5).map((t) => (
                    <li key={t.id} className="flex items-start justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        <span className={cx('mr-1.5 inline-block size-2 rounded-full', t.priority === 1 ? 'bg-red-500' : t.priority === 2 ? 'bg-amber-400' : 'bg-ink-300')} />
                        <span className="font-medium text-ink-800">{t.title}</span>
                        {t.assigneeName && <span className="text-xs text-ink-500"> · {t.assigneeName}</span>}
                      </span>
                      {t.dueDate && <span className="shrink-0 text-xs text-ink-500">{fmtShort(t.dueDate)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
