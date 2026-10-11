const intFmt = new Intl.NumberFormat('en-US');
const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });
const monthShortFmt = new Intl.DateTimeFormat('en-US', { month: 'short' });
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

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
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  return `${fmtInt(hours)} h`;
}

export const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
export const plural = (n, one, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;
export const yearsSince = (ts) => (ts ? Math.max(0, (Date.now() - ts) / (365.25 * 864e5)) : 0);
