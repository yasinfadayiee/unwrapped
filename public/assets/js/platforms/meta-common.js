// Readers for the record shapes Meta uses across Instagram, Threads and
// Facebook exports (old string_list_data / string_map_data style and the
// newer label_values style).

import { fixMeta, toMs, parseDate } from '../core/text.js';

const RESERVED = new Set([
  'accounts', 'explore', 'p', 'reel', 'reels', 'stories', 'direct', 'about', 'legal', 'developer', 'help',
  'privacy', 'terms', 'web', '_u', 'tv', 'challenge', 'emails', 'session', 'oauth', 'ar', 'lite',
]);
const USER_RE = /^[A-Za-z0-9._]{1,30}$/;

export function usernameFromHref(href) {
  if (!href) return '';
  const m = String(href).match(
    /^(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|threads\.(?:net|com))\/(?:_u\/)?@?([A-Za-z0-9._]{1,30})\/?(?:[?#]|$)/i,
  );
  if (!m || RESERVED.has(m[1].toLowerCase())) return '';
  return m[1];
}

export function pickUser(...candidates) {
  for (const c of candidates) {
    const s = String(c || '').trim().replace(/^@/, '');
    if (USER_RE.test(s) && !RESERVED.has(s.toLowerCase())) return s;
  }
  return '';
}

export function firstArray(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  for (const value of Object.values(json)) if (Array.isArray(value)) return value;
  return [];
}

// Normalizes any Meta list item into { title, value, href, ts, values }.
export function metaRecords(json) {
  return firstArray(json)
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const rec = { title: fixMeta(item.title || item.name || ''), value: '', href: '', ts: toMs(item.timestamp), values: {} };
      for (const d of item.string_list_data || []) {
        if (d.value && !rec.value) rec.value = fixMeta(String(d.value));
        if (d.href && !rec.href) rec.href = d.href;
        if (d.timestamp && !rec.ts) rec.ts = toMs(d.timestamp);
      }
      for (const [key, d] of Object.entries(item.string_map_data || {})) {
        if (!d || typeof d !== 'object') continue;
        rec.values[key] = fixMeta(String(d.value ?? d.href ?? ''));
        if (d.timestamp && !rec.ts) rec.ts = toMs(d.timestamp);
        if (d.href && !rec.href) rec.href = d.href;
      }
      for (const lv of item.label_values || []) {
        if (!lv || !lv.label) continue;
        const v = lv.value ?? lv.href ?? (Array.isArray(lv.vec) ? lv.vec.map((x) => x.value).join(', ') : '');
        rec.values[lv.label] = fixMeta(String(v ?? ''));
        if (lv.href && !rec.href) rec.href = lv.href;
        if (/time|date/i.test(lv.label) && !rec.ts) rec.ts = toMs(lv.timestamp_value || lv.timestamp) || parseDate(lv.value);
      }
      if (!rec.ts && /^\d{4}-\d{2}-\d{2}T/.test(rec.title)) rec.ts = parseDate(rec.title);
      return rec;
    });
}

// Relationship lists (followers, following, blocked, …) from JSON.
export function relationshipsFromJson(json) {
  const out = [];
  for (const r of metaRecords(json)) {
    const u = pickUser(
      r.value,
      r.title,
      usernameFromHref(r.href),
      r.values.Username,
      usernameFromHref(r.values.URL || r.values.Url),
    );
    if (u) out.push({ u, ts: r.ts });
  }
  return out;
}

// Relationship lists from the HTML flavour of the export.
export function relationshipsFromHtml(html) {
  const out = [];
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const fromHref = usernameFromHref(m[1].replace(/&amp;/g, '&'));
    if (!fromHref) continue;
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    const next = html.indexOf('<a', re.lastIndex);
    const after = html
      .slice(re.lastIndex, next < 0 ? re.lastIndex + 400 : Math.min(next, re.lastIndex + 400))
      .replace(/<[^>]+>/g, ' ');
    const dm = after.match(/([A-Z][a-z]{2}[a-z]*\.? \d{1,2},? \d{4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)/i);
    out.push({ u: pickUser(text, fromHref) || fromHref, ts: dm ? parseDate(dm[1]) : 0 });
  }
  return out;
}

export function dedupeUsers(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.u.toLowerCase();
    const prev = map.get(key);
    if (!prev || (item.ts && (!prev.ts || item.ts < prev.ts))) map.set(key, { u: item.u, ts: item.ts || prev?.ts || 0 });
  }
  return [...map.values()];
}

export function stripExt(name) {
  return name.replace(/\.(json|html?)$/i, '').toLowerCase().replace(/[’']/g, "'");
}
