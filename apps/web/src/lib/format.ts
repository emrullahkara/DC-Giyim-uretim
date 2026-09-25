export const fmtNum = (v: unknown, d = 0) =>
  v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtQty = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
};

export const fmtMoney = (v: unknown, cur = 'TRY') => {
  if (v === null || v === undefined || v === '') return '—';
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`;
};

export const fmtDate = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
export const fmtShort = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '—');
export const fmtDateTime = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export const toInputDate = (v?: unknown) => {
  const d = v ? new Date(String(v)) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDaysInput = (n: number) => toInputDate(new Date(Date.now() + n * 86400_000));

export const daysUntil = (v: unknown) => {
  const d = new Date(String(v));
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400_000);
};

export const sizesText = (m: Record<string, number> | null | undefined) =>
  m ? Object.entries(m).filter(([, q]) => q).map(([s, q]) => `${s}:${q}`).join(' ') : '';

/** Excel uyumlu CSV (Türkçe Excel için ; ayırıcı ve BOM) */
export function downloadCsv(name: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    // CSV/Excel formül enjeksiyonunu engelle
    const safe = /^[=+\-@\t\r]/.test(s) && isNaN(Number(s)) ? `'${s}` : s;
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${toInputDate()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
