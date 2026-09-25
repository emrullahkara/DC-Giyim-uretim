import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Download, Inbox, Loader2, Search, X, XCircle } from 'lucide-react';
import type { Tone } from '@/lib/labels';
import { downloadCsv } from '@/lib/format';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const toneCls: Record<Tone, string> = {
  gray: 'bg-ink-100 text-ink-700 ring-ink-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
};

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap', toneCls[tone], className)}>{children}</span>;
}

export function Card({ title, actions, children, className, bodyClass, subtitle }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-ink-900">{title}</h3>}
            {subtitle && <p className="text-xs text-ink-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cx(bodyClass ?? 'p-4')}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="truncate text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'brand', icon, onClick }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: ReactNode; onClick?: () => void }) {
  const ring: Record<Tone, string> = { brand: 'bg-brand-50 text-brand-700', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-700', green: 'bg-emerald-50 text-emerald-700', blue: 'bg-sky-50 text-sky-700', violet: 'bg-violet-50 text-violet-700', gray: 'bg-ink-100 text-ink-600' };
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={cx('card flex w-full items-start gap-3 p-4 text-left transition', onClick && 'hover:ring-brand-300 hover:shadow-pop cursor-pointer')}>
      {icon && <div className={cx('grid size-10 shrink-0 place-items-center rounded-xl', ring[tone])}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-xs font-medium text-ink-500">{label}</div>
        <div className="num mt-0.5 text-2xl font-bold tracking-tight text-ink-900">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-ink-500">{hint}</div>}
      </div>
    </button>
  );
}

export function Progress({ value, expected, tone }: { value: number; expected?: number; tone?: Tone }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-500' : v >= 100 ? 'bg-emerald-500' : 'bg-brand-600';
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink-100" title={`%${v}`}>
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${v}%` }} />
      {expected !== undefined && expected > 0 && expected < 100 && <div className="absolute top-0 h-full w-0.5 bg-ink-800/60" style={{ left: `${expected}%` }} title={`Olması gereken: %${expected}`} />}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-brand-600', className)} />;
}

export function Loading({ text = 'Yükleniyor…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-500">
      <Spinner /> {text}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : 'Bir hata oluştu.';
  return (
    <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
      <XCircle className="size-4 shrink-0" /> {msg}
    </div>
  );
}

export function Empty({ title = 'Kayıt yok', text, action, icon }: { title?: string; text?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-ink-100 text-ink-400">{icon ?? <Inbox className="size-6" />}</div>
      <div className="text-sm font-semibold text-ink-700">{title}</div>
      {text && <div className="max-w-sm text-sm text-ink-500">{text}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ── Form alanları
export function Field({ label, children, hint, className, required }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-500">{hint}</span>}
    </label>
  );
}

export function Select({ value, onChange, options, placeholder, className, required, disabled }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] | Record<string, string>; placeholder?: string; className?: string; required?: boolean; disabled?: boolean }) {
  const opts = Array.isArray(options) ? options : Object.entries(options).map(([value, label]) => ({ value, label }));
  return (
    <select className={cx('input', className)} value={value} onChange={(e) => onChange(e.target.value)} required={required} disabled={disabled}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Ara…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
      <input className="input pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cx('flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition', value === t.value ? 'bg-brand-800 text-white shadow-sm' : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-100')}
        >
          {t.label}
          {t.count !== undefined && <span className={cx('rounded-full px-1.5 text-[10px]', value === t.value ? 'bg-white/20' : 'bg-ink-100')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Modal
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-pop sm:rounded-3xl', wide === 'xl' ? 'sm:max-w-5xl' : wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="text-base font-bold text-ink-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-ink-500 hover:bg-ink-100" aria-label="Kapat">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── Bildirimler (toast)
type ToastT = { id: number; kind: 'ok' | 'err'; text: string };
const ToastCtx = createContext<(kind: 'ok' | 'err', text: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastT[]>([]);
  const idRef = useRef(0);
  const push = useCallback((kind: 'ok' | 'err', text: string) => {
    const id = ++idRef.current;
    setList((l) => [...l, { id, kind, text }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), kind === 'err' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {list.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-pop', t.kind === 'ok' ? 'bg-ink-900 text-white' : 'bg-red-600 text-white')}>
            {t.kind === 'ok' ? <CheckCircle2 className="size-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="size-4 shrink-0" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ── Tablo
export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  csv?: (row: T) => string | number | null | undefined;
  className?: string;
  align?: 'right' | 'center';
}

export function Table<T>({ rows, columns, onRowClick, empty, csvName, rowKey, dense }: { rows: T[]; columns: Column<T>[]; onRowClick?: (r: T) => void; empty?: ReactNode; csvName?: string; rowKey: (r: T) => string; dense?: boolean }) {
  if (!rows.length) return <>{empty ?? <Empty />}</>;
  const exportCsv = () => {
    const cols = columns.filter((c) => c.csv);
    downloadCsv(csvName ?? 'liste', cols.map((c) => String(typeof c.header === 'string' ? c.header : c.key)), rows.map((r) => cols.map((c) => c.csv!(r))));
  };
  return (
    <div>
      {csvName && (
        <div className="no-print flex justify-end border-b border-ink-100 px-3 py-1.5">
          <button type="button" className="btn-ghost btn-sm" onClick={exportCsv}>
            <Download className="size-3.5" /> Excel'e aktar
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-ink-100">
          <thead className="bg-ink-50/60">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cx('th', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx(onRowClick && 'cursor-pointer hover:bg-brand-50/40')}>
                {columns.map((c) => (
                  <td key={c.key} className={cx('td', dense && 'py-1.5', c.align === 'right' && 'text-right num', c.align === 'center' && 'text-center', c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Beden asorti girişi
export function SizeGrid({ sizes, value, onChange, max }: { sizes: string[]; value: Record<string, number>; onChange: (v: Record<string, number>) => void; max?: Record<string, number> }) {
  const total = Object.values(value).reduce((a, b) => a + (Number(b) || 0), 0);
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-end gap-1.5">
        {sizes.map((s) => (
          <label key={s} className="w-16 text-center">
            <span className="mb-1 block text-[11px] font-bold text-ink-600">{s}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="input num px-1 text-center"
              value={value[s] || ''}
              placeholder="0"
              onChange={(e) => onChange({ ...value, [s]: Math.max(0, parseInt(e.target.value || '0', 10) || 0) })}
            />
            {max && <span className="mt-0.5 block text-[10px] text-ink-400">mevcut {max[s] ?? 0}</span>}
          </label>
        ))}
        <div className="w-20 pb-2 text-center">
          <span className="mb-1 block text-[11px] font-bold text-ink-600">TOPLAM</span>
          <div className="num rounded-xl bg-brand-50 py-2 text-sm font-bold text-brand-800">{total}</div>
        </div>
      </div>
    </div>
  );
}

export function SizeChips({ sizes }: { sizes: Record<string, number> | null | undefined }) {
  if (!sizes) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(sizes).filter(([, q]) => q).map(([s, q]) => (
        <span key={s} className="num rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-700">
          <b>{s}</b> {q}
        </span>
      ))}
    </div>
  );
}

// ── Onay penceresi
export function useConfirm() {
  const [state, setState] = useState<{ text: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = (text: string) => new Promise<boolean>((resolve) => setState({ text, resolve }));
  const node = (
    <Modal
      open={!!state}
      onClose={() => { state?.resolve(false); setState(null); }}
      title="Emin misiniz?"
      footer={
        <>
          <button className="btn-outline" onClick={() => { state?.resolve(false); setState(null); }}>Vazgeç</button>
          <button className="btn-danger" onClick={() => { state?.resolve(true); setState(null); }}>Evet, devam et</button>
        </>
      }
    >
      <p className="text-sm text-ink-700">{state?.text}</p>
    </Modal>
  );
  return { confirm, node };
}
