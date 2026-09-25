import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Check, ListChecks, Plus, Trash2, UserRound } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { daysUntil, fmtDate, fmtDateTime } from '@/lib/format';
import type { Tone } from '@/lib/labels';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, Tabs, cx, useConfirm } from '@/components/ui';

interface Task {
  id: string;
  title: string;
  detail?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  dueDate?: string | null;
  status: 'ACIK' | 'TAMAM';
  priority: number;
  link?: string | null;
  createdBy?: string | null;
  createdAt: string;
  doneAt?: string | null;
}

type TabKey = 'acik' | 'tamam' | 'bana';

const PRIORITY: Record<number, { label: string; tone: Tone }> = {
  1: { label: 'Yüksek', tone: 'red' },
  2: { label: 'Normal', tone: 'blue' },
  3: { label: 'Düşük', tone: 'gray' },
};

function dueInfo(t: Task): { text: string; cls: string } | null {
  if (!t.dueDate) return null;
  const d = daysUntil(t.dueDate);
  if (t.status === 'TAMAM') return { text: fmtDate(t.dueDate), cls: 'text-ink-500' };
  if (d < 0) return { text: `${fmtDate(t.dueDate)} · ${-d} gün gecikti`, cls: 'text-red-600 font-semibold' };
  if (d === 0) return { text: 'Bugün', cls: 'text-amber-700 font-semibold' };
  if (d === 1) return { text: 'Yarın', cls: 'text-amber-700 font-semibold' };
  if (d <= 3) return { text: `${fmtDate(t.dueDate)} · ${d} gün kaldı`, cls: 'text-amber-700' };
  return { text: fmtDate(t.dueDate), cls: 'text-ink-600' };
}

export default function Tasks() {
  const { can, me } = useSession();
  const [sp, setSp] = useSearchParams();
  const tab = (['acik', 'tamam', 'bana'].includes(sp.get('tab') ?? '') ? sp.get('tab') : 'acik') as TabKey;
  const [open, setOpen] = useState(false);
  const { confirm, node: confirmNode } = useConfirm();

  useEffect(() => {
    if (sp.get('yeni') === '1' && can('gorev:yaz')) {
      setOpen(true);
      const n = new URLSearchParams(sp);
      n.delete('yeni');
      setSp(n, { replace: true });
    }
  }, [sp, setSp, can]);

  const params = tab === 'acik' ? { status: 'ACIK' } : tab === 'tamam' ? { status: 'TAMAM' } : { status: 'hepsi', mine: '1' };
  const q = useQuery({ queryKey: ['tasks', params], queryFn: () => api.get<Task[]>(`/tasks${qs(params)}`) });

  const toggle = useAction((t: Task) => api.patch(`/tasks/${t.id}`, { status: t.status === 'ACIK' ? 'TAMAM' : 'ACIK' }), {
    success: 'Görev güncellendi.',
    invalidate: [['tasks']],
  });
  const remove = useAction((id: string) => api.del(`/tasks/${id}`), { success: 'Görev silindi.', invalidate: [['tasks']] });

  const setTab = (v: TabKey) => {
    const n = new URLSearchParams(sp);
    n.set('tab', v);
    setSp(n, { replace: true });
  };

  const list = q.data ?? [];
  const late = list.filter((t) => t.status === 'ACIK' && t.dueDate && daysUntil(t.dueDate) < 0).length;

  return (
    <div>
      <PageHeader
        title="Görevler"
        subtitle="Atölyede yapılacak işler, hatırlatmalar ve takip edilecek konular"
        actions={
          can('gorev:yaz') && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Yeni görev
            </button>
          )
        }
      />
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'acik', label: 'Açık' },
          { value: 'tamam', label: 'Tamamlanan' },
          { value: 'bana', label: 'Bana atanan' },
        ]}
      />
      {late > 0 && tab !== 'tamam' && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
          <CalendarClock className="size-4" /> {late} görevin tarihi geçti.
        </div>
      )}
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !list.length ? (
        <Card>
          <Empty
            icon={<ListChecks className="size-6" />}
            title={tab === 'tamam' ? 'Tamamlanan görev yok' : tab === 'bana' ? 'Size atanmış görev yok' : 'Açık görev yok'}
            text={tab === 'acik' ? 'Her şey yolunda görünüyor. Yeni bir iş çıktığında buradan görev açabilirsiniz.' : undefined}
            action={can('gorev:yaz') && tab !== 'tamam' ? <button className="btn-outline btn-sm" onClick={() => setOpen(true)}><Plus className="size-3.5" /> Görev ekle</button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((t) => {
            const due = dueInfo(t);
            const pr = PRIORITY[t.priority] ?? PRIORITY[2];
            const canToggle = can('gorev:yaz') || t.assigneeId === me.user.id;
            const done = t.status === 'TAMAM';
            return (
              <div key={t.id} className={cx('card flex items-start gap-3 p-3 sm:p-4', done && 'opacity-70')}>
                <button
                  type="button"
                  disabled={!canToggle || toggle.isPending}
                  onClick={() => toggle.mutate(t)}
                  className={cx(
                    'mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ring-2 transition',
                    done ? 'bg-emerald-500 text-white ring-emerald-500' : 'bg-white text-transparent ring-ink-300 hover:text-ink-300 hover:ring-brand-500',
                    !canToggle && 'cursor-not-allowed opacity-50',
                  )}
                  aria-label={done ? 'Yeniden aç' : 'Tamamlandı işaretle'}
                  title={done ? 'Yeniden aç' : 'Tamamlandı işaretle'}
                >
                  <Check className="size-4" strokeWidth={3} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx('text-sm font-semibold text-ink-900', done && 'line-through')}>{t.title}</span>
                    <Badge tone={pr.tone}>{pr.label}</Badge>
                  </div>
                  {t.detail && <p className="mt-1 whitespace-pre-line text-sm text-ink-600">{t.detail}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                    {due && (
                      <span className={cx('inline-flex items-center gap-1', due.cls)}>
                        <CalendarClock className="size-3.5" /> {due.text}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="size-3.5" /> {t.assigneeName ?? 'Atanmadı'}
                    </span>
                    {t.link && (
                      <Link to={t.link} className="font-semibold text-brand-700 hover:underline">
                        İlgili kayda git →
                      </Link>
                    )}
                    {done && t.doneAt && <span>Tamamlandı: {fmtDateTime(t.doneAt)}</span>}
                    {t.createdBy && <span>Açan: {t.createdBy}</span>}
                  </div>
                </div>
                {can('gorev:yaz') && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm text-ink-400 hover:text-red-600"
                    title="Sil"
                    onClick={async () => {
                      if (await confirm(`"${t.title}" görevi silinecek.`)) remove.mutate(t.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <TaskModal open={open} onClose={() => setOpen(false)} />
      {confirmNode}
    </div>
  );
}

function TaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const empty = { title: '', detail: '', assigneeId: '', dueDate: '', priority: '2' };
  const [f, setF] = useState(empty);
  const users = useQuery({ queryKey: ['users-basic'], queryFn: () => api.get<{ id: string; name: string }[]>('/admin/users/basic'), enabled: open });
  const save = useAction(
    () =>
      api.post('/tasks', {
        title: f.title,
        detail: f.detail || null,
        assigneeId: f.assigneeId || null,
        dueDate: f.dueDate || null,
        priority: Number(f.priority),
      }),
    {
      success: 'Görev oluşturuldu.',
      invalidate: [['tasks']],
      onDone: () => {
        setF(empty);
        onClose();
      },
    },
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Yeni görev"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Vazgeç</button>
          <button className="btn-primary" form="task-form" disabled={save.isPending || !f.title.trim()}>Kaydet</button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Görev" required className="sm:col-span-2">
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Örn. Nakışçıdan 250 adet dönüşü sor" autoFocus required maxLength={200} />
        </Field>
        <Field label="Açıklama" className="sm:col-span-2">
          <textarea className="input min-h-20" value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} maxLength={2000} />
        </Field>
        <Field label="Sorumlu">
          <Select value={f.assigneeId} onChange={(v) => setF({ ...f, assigneeId: v })} placeholder="— Atanmadı —" options={(users.data ?? []).map((u) => ({ value: u.id, label: u.name }))} />
        </Field>
        <Field label="Son tarih">
          <input type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        </Field>
        <Field label="Öncelik" className="sm:col-span-2">
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setF({ ...f, priority: String(p) })}
                className={cx('rounded-xl py-2 text-sm font-semibold ring-1 transition', f.priority === String(p) ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-ink-700 ring-ink-200 hover:bg-ink-50')}
              >
                {PRIORITY[p].label}
              </button>
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  );
}
