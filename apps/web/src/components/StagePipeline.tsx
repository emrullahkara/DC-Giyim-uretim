import { Check, Handshake } from 'lucide-react';
import { useSession } from '@/lib/session';
import { fmtNum } from '@/lib/format';
import { cx } from './ui';

export interface StageLite { id: string; stage: string; status: string; doneQty: number; defectQty: number; outsourced: boolean; sequence: number }

/** İş emrinin aşamalarını zincir olarak gösterir: her aşamada çıkan / planlanan */
export function StagePipeline({ stages, planned, compact, onStageClick, activeId }: { stages: StageLite[]; planned: number; compact?: boolean; onStageClick?: (s: StageLite) => void; activeId?: string }) {
  const { stageLabel } = useSession();
  return (
    <div className="flex items-stretch overflow-x-auto pb-1">
      {stages.map((s, i) => {
        const pct = planned ? Math.min(100, Math.round(((s.doneQty + s.defectQty) / planned) * 100)) : 0;
        const done = s.status === 'TAMAM';
        const active = s.status === 'DEVAM';
        return (
          <div key={s.id} className="flex items-center">
            <button
              type="button"
              disabled={!onStageClick}
              onClick={() => onStageClick?.(s)}
              className={cx(
                'relative min-w-[92px] overflow-hidden rounded-xl px-2.5 text-left ring-1 transition',
                compact ? 'py-1.5' : 'py-2.5',
                done ? 'bg-emerald-50 ring-emerald-200' : active ? 'bg-brand-50 ring-brand-300' : 'bg-white ring-ink-200',
                onStageClick && 'hover:ring-brand-500 cursor-pointer',
                activeId === s.id && 'ring-2 ring-brand-600',
              )}
            >
              <div className="absolute inset-x-0 bottom-0 h-1 bg-ink-100">
                <div className={cx('h-full', done ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-ink-600">
                {done && <Check className="size-3 text-emerald-600" strokeWidth={3} />}
                {s.outsourced && <Handshake className="size-3 text-violet-600" />}
                <span className="truncate">{stageLabel(s.stage)}</span>
              </div>
              <div className={cx('num font-bold text-ink-900', compact ? 'text-sm' : 'text-base')}>
                {fmtNum(s.doneQty)}
                <span className="text-xs font-medium text-ink-400">/{fmtNum(planned)}</span>
              </div>
              {!compact && s.defectQty > 0 && <div className="text-[10px] font-semibold text-red-600">fire {s.defectQty}</div>}
            </button>
            {i < stages.length - 1 && <div className={cx('h-0.5 w-3 shrink-0', done ? 'bg-emerald-400' : 'bg-ink-200')} />}
          </div>
        );
      })}
    </div>
  );
}
