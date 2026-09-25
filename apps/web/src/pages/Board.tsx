import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Handshake, PlusCircle, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { fmtNum, fmtShort } from '@/lib/format';
import { Badge, Empty, ErrorBox, Loading, PageHeader, Progress, Tabs, cx } from '@/components/ui';
import { ProgressEntry } from '@/components/ProgressEntry';

interface Item { id: string; no: string; model: { code: string; name: string }; order: { no: string; customer: { name: string } } | null; color: string; plannedQty: number; dueDate: string; stageId: string; stageDone: number; outsourced: boolean; waiting: number; progress: number; overdue: boolean }

export default function Board() {
  const { can } = useSession();
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ['board'], queryFn: () => api.get<{ stages: { code: string; label: string }[]; columns: Record<string, Item[]> }>('/production/board'), refetchInterval: 30_000 });
  const [entry, setEntry] = useState<{ wo: string; stage: string } | null>(null);
  const [mobileStage, setMobileStage] = useState<string>('');

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const used = data.stages.filter((s) => data.columns[s.code]?.length);
  const active = mobileStage || used[0]?.code || '';
  const total = Object.values(data.columns).reduce((s, c) => s + c.length, 0);

  const card = (it: Item) => (
    <div key={it.id} className={cx('rounded-2xl bg-white p-3 shadow-card ring-1', it.overdue ? 'ring-red-300' : 'ring-ink-200/70')}>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/uretim/${it.id}`} className="min-w-0">
          <div className="truncate text-sm font-bold text-ink-900">{it.model.code} <span className="font-medium text-ink-600">· {it.color}</span></div>
          <div className="truncate text-xs text-ink-500">{it.no}{it.order && <> · {it.order.customer.name}</>}</div>
        </Link>
        {it.outsourced ? <Badge tone="violet"><Handshake className="size-3" /> Fasonda</Badge> : it.overdue ? <Badge tone="red"><AlertTriangle className="size-3" /> Gecikti</Badge> : null}
      </div>
      <div className="mt-2.5 flex items-end justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Bekleyen</div>
          <div className="num text-2xl font-extrabold leading-none text-brand-800">{fmtNum(it.waiting)}</div>
        </div>
        <div className="text-right text-xs text-ink-500">
          <div>Yapılan <b className="num text-ink-800">{fmtNum(it.stageDone)}</b>/{fmtNum(it.plannedQty)}</div>
          <div className={it.overdue ? 'font-semibold text-red-600' : ''}>Termin {fmtShort(it.dueDate)}</div>
        </div>
      </div>
      <div className="mt-2"><Progress value={it.progress} /></div>
      {can('uretim:kayit') && it.waiting > 0 && (
        <button className="btn-primary mt-3 w-full py-2" onClick={() => setEntry({ wo: it.id, stage: it.stageId })}>
          <PlusCircle className="size-4" /> Kayıt gir
        </button>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Atölye Panosu"
        subtitle="Her iş emri şu an hangi aşamada ve orada kaç adet bekliyor — 30 sn'de bir kendini yeniler"
        actions={<button className="btn-outline" onClick={() => refetch()}><RefreshCw className={cx('size-4', isFetching && 'animate-spin')} /> Yenile</button>}
      />
      {total === 0 ? (
        <Empty title="Atölyede açık iş yok" text="Siparişten iş emri oluşturduğunuzda işler burada aşama aşama görünür." action={<Link to="/siparisler" className="btn-primary">Siparişlere git</Link>} />
      ) : (
        <>
          {/* Telefon: aşama sekmeleri */}
          <div className="lg:hidden">
            <Tabs value={active} onChange={setMobileStage} tabs={used.map((s) => ({ value: s.code, label: s.label, count: data.columns[s.code].length }))} />
            <div className="space-y-3">{(data.columns[active] ?? []).map(card)}</div>
          </div>
          {/* Masaüstü: kanban */}
          <div className="hidden gap-4 overflow-x-auto pb-4 lg:flex">
            {used.map((s) => {
              const items = data.columns[s.code];
              const waiting = items.reduce((a, i) => a + i.waiting, 0);
              return (
                <div key={s.code} className="w-72 shrink-0">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <div className="text-sm font-bold text-ink-800">{s.label} <span className="ml-1 rounded-full bg-ink-200 px-1.5 text-[11px]">{items.length}</span></div>
                    <div className="num text-xs font-semibold text-ink-500">{fmtNum(waiting)} adet</div>
                  </div>
                  <div className="space-y-3 rounded-2xl bg-ink-100/70 p-2">{items.map(card)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {entry && <ProgressEntry workOrderId={entry.wo} stageId={entry.stage} onClose={() => setEntry(null)} />}
    </div>
  );
}
