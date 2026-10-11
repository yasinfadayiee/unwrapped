// Shared parsing helpers. Pure functions — no DOM — so they run in tests too.

// Meta (Instagram / Facebook / Threads) exports store UTF-8 bytes as \u00XX
// escapes, which turns "José 😀" into "JosÃ© Ã°Â...". This repairs it.
export function fixMeta(value) {
  if (typeof value !== 'string' || !/[\u0080-ÿ]/.test(value) || /[^\u0000-ÿ]/.test(value)) return value;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(value, (c) => c.charCodeAt(0)));
  } catch {
    return value;
  }
}

// Seconds or milliseconds → milliseconds.
export function toMs(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1e11 ? n * 1000 : n;
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Accepts ISO strings, "2024-01-31 23:59:59" (UTC, as TikTok writes them),
// "Jan 01, 2024 10:00 am" (Meta HTML exports) and X's
// "Wed Oct 10 20:19:24 +0000 2018".
export function parseDate(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return toMs(value);
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (m) {
    const [, y, mo, d, h, mi, se = '0', tz] = m;
    if (!tz || tz === 'Z') return Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
    return Date.parse(s.replace(' ', 'T')) || 0;
  }
  m = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i);
  if (m) {
    const [, mon, d, y, h, mi, ap] = m;
    let hour = +h % 12;
    if (!ap) hour = +h;
    else if (/p/i.test(ap)) hour += 12;
    const month = MONTHS[mon.toLowerCase()];
    if (month !== undefined) return new Date(+y, month, +d, hour, +mi).getTime();
  }
  m = s.match(/^[A-Za-z]{3} ([A-Za-z]{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) \+0000 (\d{4})$/);
  if (m) {
    const [, mon, d, h, mi, se, y] = m;
    return Date.UTC(+y, MONTHS[mon.toLowerCase()], +d, +h, +mi, +se);
  }
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Case-insensitive property access: get(item, 'Date') also finds item.date.
export function get(obj, ...names) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const name of names) {
    if (obj[name] !== undefined) return obj[name];
  }
  const lowered = names.map((n) => n.toLowerCase().replace(/[\s_]/g, ''));
  for (const key of Object.keys(obj)) {
    if (lowered.includes(key.toLowerCase().replace(/[\s_]/g, ''))) return obj[key];
  }
  return undefined;
}

// Depth-first walk that yields [key, value, parentKey] for every property.
export function* walk(node, parentKey = '', depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return;
  if (Array.isArray(node)) {
    for (const item of node) yield* walk(item, parentKey, depth + 1);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    yield [key, value, parentKey];
    if (value && typeof value === 'object') yield* walk(value, key, depth + 1);
  }
}

// RFC 4180 CSV parser (quotes, escaped quotes, newlines inside quotes).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// CSV with a header row; skips any preamble lines before `headerMatch`.
export function csvObjects(text, headerMatch) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const headerIndex = headerMatch ? rows.findIndex((r) => r.some((c) => headerMatch.test(c))) : 0;
  if (headerIndex < 0) return [];
  const header = rows[headerIndex].map((h) => h.trim());
  return rows
    .slice(headerIndex + 1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
}

// TikTok TXT exports: blocks of "Key: Value" lines separated by blank lines.
export function parseKeyValueBlocks(text) {
  const blocks = [];
  let current = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      if (Object.keys(current).length) blocks.push(current);
      current = {};
      continue;
    }
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      if (key in current) {
        blocks.push(current);
        current = {};
      }
      current[key] = line.slice(idx + 1).trim();
    }
  }
  if (Object.keys(current).length) blocks.push(current);
  return blocks;
}

// Very small user-agent summary for login/device lists.
export function describeUserAgent(ua) {
  if (!ua) return 'Unknown device';
  const s = String(ua);
  const os = /iPhone|iOS/i.test(s)
    ? 'iPhone'
    : /iPad/i.test(s)
      ? 'iPad'
      : /Android/i.test(s)
        ? 'Android'
        : /Windows/i.test(s)
          ? 'Windows'
          : /Mac OS X|Macintosh/i.test(s)
            ? 'Mac'
            : /Linux/i.test(s)
              ? 'Linux'
              : 'Device';
  const app = /Instagram/i.test(s)
    ? 'Instagram app'
    : /FBAN|FBAV|Facebook/i.test(s)
      ? 'Facebook app'
      : /Edg\//.test(s)
        ? 'Edge'
        : /Chrome\//.test(s)
          ? 'Chrome'
          : /Firefox\//.test(s)
            ? 'Firefox'
            : /Safari\//.test(s)
              ? 'Safari'
              : '';
  return app ? `${os} · ${app}` : os;
}

export function countBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (key == null || key === '') continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

export function topN(map, n = 10) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}
