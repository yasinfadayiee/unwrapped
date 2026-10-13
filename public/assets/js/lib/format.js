import { t } from './i18n.js';

// Numbers and dates follow the page language (<html lang>).
const LOC = globalThis.document?.documentElement?.lang || 'en-US';
const intFmt = new Intl.NumberFormat(LOC);
const compactFmt = new Intl.NumberFormat(LOC, { notation: 'compact', maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat(LOC, { month: 'short', day: 'numeric', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat(LOC, { month: 'short', year: 'numeric' });
const monthShortFmt = new Intl.DateTimeFormat(LOC, { month: 'short' });
const rtf = new Intl.RelativeTimeFormat(LOC, { numeric: 'auto' });
// 12-hour locales read best as "9 PM"; 24-hour locales need "21:00", since a bare "0" is unclear.
const hour12 = new Intl.DateTimeFormat(LOC, { hour: 'numeric' }).resolvedOptions().hour12;
const hourFmt = new Intl.DateTimeFormat(LOC, hour12 ? { hour: 'numeric' } : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export const fmtInt = (n) => intFmt.format(Math.round(n || 0));
export const compact = (n) => (Math.abs(n) < 10_000 ? fmtInt(n) : compactFmt.format(n));
export const pct = (x, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export const dateShort = (ts) => (ts ? dateFmt.format(new Date(ts)) : '—');
export const monthLabel = (key, short = false) => {
  const [y, m] = key.split('-').map(Number);
  return (short ? monthShortFmt : monthFmt).format(new Date(y, m - 1, 1));
};

export function relTime(ts) {
  if (!ts) return '';
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const units = [
    ['year', 365 * 864e5],
    ['month', 30 * 864e5],
    ['week', 7 * 864e5],
    ['day', 864e5],
    ['hour', 36e5],
    ['minute', 6e4],
  ];
  for (const [unit, ms] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  return 'just now';
}

export function duration(ms) {
  const minutes = Math.round(ms / 60_000);
  const m = t('min');
  const hr = t('h');
  if (minutes < 60) return `${minutes} ${m}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest ? `${hours} ${hr} ${rest} ${m}` : `${hours} ${hr}`;
  return `${fmtInt(hours)} ${hr}`;
}

export const hourLabel = (h) => hourFmt.format(new Date(2026, 0, 1, h));
export const plural = (n, one, many = `${one}s`) => `${fmtInt(n)} ${t(n === 1 ? one : many)}`;
export const yearsSince = (ts) => (ts ? Math.max(0, (Date.now() - ts) / (365.25 * 864e5)) : 0);
