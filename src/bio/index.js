// Unwrapped Bio: a "link in bio" page for creators at myunwrapped.com/@handle.
// No platform API, no social login: the owner edits with a private token
// (kept in their browser, re-sent by e-mail). Any active Unwrapped license
// unlocks Pro (unlimited links, no badge, per-link analytics).

import { siteUrl } from '../config.js';
import { getLicense, logEvent } from '../db.js';
import { emailEnabled } from '../email.js';
import { HttpError, fail, json, rateLimit, readJson, visitorId } from '../http.js';
import { DAY, escapeHtml, isEmail, normalizeLicenseKey } from '../util.js';
import { renderBioPage } from './render.js';

export const BIO_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS bio_pages (
    handle TEXT PRIMARY KEY,
    email TEXT,
    token_hash TEXT NOT NULL,
    data TEXT NOT NULL,
    license_key TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS bio_pages_email ON bio_pages (email)',
  'CREATE TABLE IF NOT EXISTS bio_stats (handle TEXT NOT NULL, day INTEGER NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (handle, day, key))',
  // Profile photos, resized in the browser to ~320px (a few dozen KB).
  'CREATE TABLE IF NOT EXISTS bio_avatars (handle TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL)',
  // Contacts a visitor chose to leave on the page's form (owner's own list).
  'CREATE TABLE IF NOT EXISTS bio_leads (id INTEGER PRIMARY KEY AUTOINCREMENT, handle TEXT NOT NULL, ts INTEGER NOT NULL, name TEXT, email TEXT, phone TEXT, source TEXT)',
  'CREATE INDEX IF NOT EXISTS bio_leads_handle ON bio_leads (handle, ts)',
];
const AVATAR_MAX = 180_000; // base64 characters
const MAGIC = { 'image/webp': (b) => b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50, 'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8, 'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 };

const ready = new WeakMap();
async function ensureBioSchema(env) {
  if (ready.get(env.DB)) return;
  await env.DB.batch(BIO_SCHEMA.map((sql) => env.DB.prepare(sql)));
  ready.set(env.DB, true);
}

export const FREE_LINKS = 5;
export const FREE_LEADS = 25;
export const MAX_LINKS = 30;
export const THEMES = ['midnight', 'aurora', 'sunset', 'mint', 'paper', 'mono'];
const HANDLE = /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/;
const RESERVED = new Set(['admin', 'api', 'assets', 'about', 'account', 'blog', 'bio', 'guides', 'help', 'pricing', 'tools', 'growth', 'success', 'support', 'unwrapped', 'myunwrapped', 'instagram', 'tiktok', 'facebook', 'linkedin', 'threads', 'twitter', 'x', 'login', 'signup', 'root', 'null', 'undefined']);
const SOCIALS = ['instagram', 'tiktok', 'x', 'youtube', 'telegram', 'whatsapp', 'facebook', 'linkedin', 'threads', 'email'];

const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const newToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
const today = () => Math.floor(Date.now() / DAY);

export function validHandle(h) {
  return HANDLE.test(h) && !RESERVED.has(h) && !h.includes('..');
}

// Only web, mail, phone and messenger links — never javascript: or data:.
export function safeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^(mailto:|tel:)/i.test(s)) return s.slice(0, 300);
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    return ['http:', 'https:', 'tg:'].includes(u.protocol) ? u.href.slice(0, 600) : '';
  } catch {
    return '';
  }
}

export function cleanData(input, pro) {
  const d = input && typeof input === 'object' ? input : {};
  const links = (Array.isArray(d.links) ? d.links : [])
    .map((l) => ({ id: String(l.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 12) || newToken().slice(0, 8), title: String(l.title || '').trim().slice(0, 80), url: safeUrl(l.url), on: l.on !== false }))
    .filter((l) => l.title && l.url)
    .slice(0, pro ? MAX_LINKS : FREE_LINKS);
  const socials = {};
  for (const k of SOCIALS) {
    const v = String(d.socials?.[k] || '').trim().slice(0, 200);
    if (v) socials[k] = v;
  }
  const ctaUrl = safeUrl(d.cta?.url);
  const lead = d.lead && d.lead.on ? { on: true, title: String(d.lead.title || '').trim().slice(0, 80) || 'Get updates', button: String(d.lead.button || '').trim().slice(0, 30) || 'Subscribe', phone: !!d.lead.phone } : null;
  return {
    lead,
    cta: ctaUrl ? { label: String(d.cta?.label || '').trim().slice(0, 60) || 'Join my channel', url: ctaUrl } : null,
    name: String(d.name || '').trim().slice(0, 60),
    bio: String(d.bio || '').trim().slice(0, 240),
    emoji: [...String(d.emoji || '').trim()].slice(0, 2).join(''),
    theme: THEMES.includes(d.theme) ? d.theme : 'midnight',
    links,
    socials,
  };
}

async function licenseActive(env, key) {
  if (!key) return null;
  const lic = await getLicense(env, key);
  if (!lic || lic.status !== 'active') return null;
  if (lic.expires_at && lic.expires_at < Date.now()) return null;
  return lic;
}

// Anonymous visit facts — no IPs, no cookies, just daily counters.
const SOURCES = [['instagram', /instagram\.com/], ['tiktok', /tiktok\.com/], ['x', /(^|\.)t\.co$|twitter\.com|x\.com/], ['youtube', /youtube\.com|youtu\.be/], ['facebook', /facebook\.com|fb\.me/], ['telegram', /t\.me|telegram/], ['whatsapp', /whatsapp|wa\.me/], ['threads', /threads\.net/], ['linkedin', /linkedin\.com|lnkd\.in/], ['google', /google\./], ['bing', /bing\.com/]];
export function sourceOf(request) {
  const ref = request.headers.get('referer') || '';
  const ua = request.headers.get('user-agent') || '';
  // In-app browsers often send no referrer but name themselves in the UA.
  if (/Instagram/.test(ua)) return 'instagram';
  if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) return 'tiktok';
  if (/FBAN|FBAV/.test(ua)) return 'facebook';
  if (/Telegram/i.test(ua)) return 'telegram';
  let host = '';
  try {
    host = new URL(ref).hostname.replace(/^www\./, '');
  } catch {
    return 'direct';
  }
  if (host.endsWith('myunwrapped.com')) return 'direct';
  return (SOURCES.find(([, re]) => re.test(host)) || ['other'])[0];
}
const countryOf = (request) => (/^[A-Z]{2}$/.test(request.cf?.country || request.headers.get('cf-ipcountry') || '') ? request.cf?.country || request.headers.get('cf-ipcountry') : 'XX');
const deviceOf = (request) => (/Mobi|Android|iPhone|iPad/i.test(request.headers.get('user-agent') || '') ? 'mobile' : 'desktop');

async function bumpMany(env, handle, keys) {
  const stmt = env.DB.prepare('INSERT INTO bio_stats (handle, day, key, n) VALUES (?, ?, ?, 1) ON CONFLICT(handle, day, key) DO UPDATE SET n = n + 1');
  await env.DB.batch(keys.map((k) => stmt.bind(handle, today(), k)));
}

async function bump(env, handle, key) {
  await env.DB.prepare('INSERT INTO bio_stats (handle, day, key, n) VALUES (?, ?, ?, 1) ON CONFLICT(handle, day, key) DO UPDATE SET n = n + 1').bind(handle, today(), key).run();
}

async function owned(env, request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!/^[a-f0-9]{48}$/.test(token)) throw new HttpError(401, 'no_session');
  const page = await env.DB.prepare('SELECT * FROM bio_pages WHERE token_hash = ?').bind(await sha256(token)).first();
  if (!page) throw new HttpError(401, 'no_session');
  return page;
}

async function view(env, page) {
  const lic = await licenseActive(env, page.license_key);
  const since = today() - 29;
  const { results } = await env.DB.prepare('SELECT day, key, n FROM bio_stats WHERE handle = ? AND day >= ?').bind(page.handle, since).all();
  const views = results.filter((r) => r.key === 'view');
  const clicks = {};
  for (const r of results) if (r.key.startsWith('c:')) clicks[r.key.slice(2)] = (clicks[r.key.slice(2)] || 0) + r.n;
  const av = await env.DB.prepare('SELECT updated_at FROM bio_avatars WHERE handle = ?').bind(page.handle).first();
  const group = (prefix) => {
    const out = {};
    for (const r of results) if (r.key.startsWith(prefix)) out[r.key.slice(prefix.length)] = (out[r.key.slice(prefix.length)] || 0) + r.n;
    return Object.entries(out).sort((a, b) => b[1] - a[1]).map(([key, n]) => ({ key, n }));
  };
  const leads = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(CASE WHEN ts > ? THEN 1 ELSE 0 END) AS recent FROM bio_leads WHERE handle = ?').bind(Date.now() - 30 * DAY, page.handle).first();
  return {
    leads: { total: leads?.n || 0, recent: leads?.recent || 0, limit: lic ? null : FREE_LEADS },
    insights: lic ? { sources: group('src:'), countries: group('cc:').slice(0, 10), devices: group('dev:') } : null,
    avatar: av ? `/api/bio/avatar/${page.handle}?v=${av.updated_at}` : '',
    handle: page.handle,
    email: page.email ? page.email.replace(/^(.).*(@.*)$/, '$1***$2') : '',
    url: `/@${page.handle}`,
    data: JSON.parse(page.data),
    pro: lic ? { until: lic.expires_at, tier: lic.plan } : null,
    limits: { free: FREE_LINKS, max: MAX_LINKS },
    stats: { views30: views.reduce((s, r) => s + r.n, 0), daily: views.map((r) => ({ day: r.day * DAY, n: r.n })), clicks: lic ? clicks : null, clicks30: Object.values(clicks).reduce((s, n) => s + n, 0) },
  };
}

async function sendEditLink(env, request, page, token) {
  if (!emailEnabled(env) || !page.email) return false;
  const link = `${siteUrl(env, request)}/bio/#edit=${token}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [page.email],
      subject: `Edit your page myunwrapped.com/@${page.handle}`,
      text: `Your private edit link for myunwrapped.com/@${page.handle}:\n\n${link}\n\nAnyone with this link can edit your page — don't share it.`,
      html: `<p>Your private edit link for <b>myunwrapped.com/@${escapeHtml(page.handle)}</b>:</p><p><a href="${escapeHtml(link)}">Open the editor</a></p><p style="color:#888;font-size:13px">Anyone with this link can edit your page — don't share it.</p>`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  return res.ok;
}

// ---------- routes ----------

export async function handleBio(request, env, url) {
  await ensureBioSchema(env);
  const path = url.pathname.replace(/\/+$/, '');
  const route = `${request.method} ${path}`;
  if (request.method === 'GET' && path.startsWith('/api/bio/go/')) return go(env, path);
  if (request.method === 'GET' && path.startsWith('/api/bio/avatar/')) return avatar(env, path);
  if (request.method === 'POST' && path.startsWith('/api/bio/lead/')) return submitLead(request, env, path);
  switch (route) {
    case 'GET /api/bio/check':
      return check(env, url);
    case 'POST /api/bio/create':
      return create(request, env);
    case 'POST /api/bio/login':
      return login(request, env);
    case 'GET /api/bio/mine':
      return json({ ok: true, page: await view(env, await owned(env, request)) });
    case 'POST /api/bio/save':
      return save(request, env);
    case 'POST /api/bio/license':
      return attachLicense(request, env);
    case 'POST /api/bio/delete':
      return remove(request, env);
    case 'POST /api/bio/avatar':
      return uploadAvatar(request, env);
    case 'GET /api/bio/leads':
      return listLeads(request, env);
    case 'POST /api/bio/leads/delete':
      return deleteLead(request, env);
  }
  return fail(404, 'not_found');
}

async function check(env, url) {
  const h = String(url.searchParams.get('handle') || '').toLowerCase();
  if (!validHandle(h)) return json({ ok: true, available: false, reason: 'invalid' });
  const taken = await env.DB.prepare('SELECT 1 FROM bio_pages WHERE handle = ?').bind(h).first();
  return json({ ok: true, available: !taken });
}

async function create(request, env) {
  await rateLimit(env, 'bio-create', await visitorId(request, env), 5);
  const body = await readJson(request);
  const handle = String(body.handle || '').toLowerCase().trim();
  if (!validHandle(handle)) throw new HttpError(400, 'invalid_handle');
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  if (email && !isEmail(email)) throw new HttpError(400, 'invalid_email');
  const token = newToken();
  const now = Date.now();
  const data = cleanData({ name: body.name || handle, theme: body.theme, links: body.links }, false);
  const res = await env.DB.prepare('INSERT OR IGNORE INTO bio_pages (handle, email, token_hash, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(handle, email, await sha256(token), JSON.stringify(data), now, now)
    .run();
  if (!res.meta?.changes) throw new HttpError(409, 'handle_taken');
  await logEvent(env, 'bio.created', handle, null);
  const page = await env.DB.prepare('SELECT * FROM bio_pages WHERE handle = ?').bind(handle).first();
  const mailed = await sendEditLink(env, request, page, token).catch(() => false);
  return json({ ok: true, token, mailed, page: await view(env, page) });
}

// Lost the token? A fresh edit link goes to the page's e-mail (old one stops working).
async function login(request, env) {
  await rateLimit(env, 'bio-login', await visitorId(request, env), 5);
  const body = await readJson(request);
  const email = String(body.email || '').trim().toLowerCase();
  if (!isEmail(email)) throw new HttpError(400, 'invalid_email');
  const handle = String(body.handle || '').toLowerCase().trim();
  const page = await env.DB.prepare('SELECT * FROM bio_pages WHERE handle = ? AND email = ?').bind(handle, email).first();
  // Same answer either way, so the form can't be used to discover e-mails.
  if (page && emailEnabled(env)) {
    const token = newToken();
    await env.DB.prepare('UPDATE bio_pages SET token_hash = ? WHERE handle = ?').bind(await sha256(token), handle).run();
    await sendEditLink(env, request, page, token).catch(() => false);
  }
  return json({ ok: true });
}

async function save(request, env) {
  const page = await owned(env, request);
  const body = await readJson(request, 32_768);
  const pro = !!(await licenseActive(env, page.license_key));
  const data = cleanData(body.data, pro);
  const email = body.email === undefined ? page.email : body.email ? String(body.email).trim().toLowerCase() : null;
  if (email && !isEmail(email)) throw new HttpError(400, 'invalid_email');
  await env.DB.prepare('UPDATE bio_pages SET data = ?, email = ?, updated_at = ? WHERE handle = ?').bind(JSON.stringify(data), email, Date.now(), page.handle).run();
  return json({ ok: true, page: await view(env, await env.DB.prepare('SELECT * FROM bio_pages WHERE handle = ?').bind(page.handle).first()) });
}

async function attachLicense(request, env) {
  const page = await owned(env, request);
  const body = await readJson(request);
  const key = normalizeLicenseKey(body.key);
  if (!(await licenseActive(env, key))) throw new HttpError(400, 'license_invalid');
  await env.DB.prepare('UPDATE bio_pages SET license_key = ? WHERE handle = ?').bind(key, page.handle).run();
  return json({ ok: true, page: await view(env, await env.DB.prepare('SELECT * FROM bio_pages WHERE handle = ?').bind(page.handle).first()) });
}

async function remove(request, env) {
  const page = await owned(env, request);
  await env.DB.batch(['bio_pages', 'bio_stats', 'bio_avatars', 'bio_leads'].map((tbl) => env.DB.prepare(`DELETE FROM ${tbl} WHERE handle = ?`).bind(page.handle)));
  await logEvent(env, 'bio.deleted', page.handle, null);
  return json({ ok: true });
}

// Photo arrives as a small data: URL; we check the type by its magic bytes.
async function uploadAvatar(request, env) {
  const page = await owned(env, request);
  const body = await readJson(request, 200_000);
  if (body.remove) {
    await env.DB.prepare('DELETE FROM bio_avatars WHERE handle = ?').bind(page.handle).run();
    return json({ ok: true, page: await view(env, page) });
  }
  const m = String(body.data || '').match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[2].length > AVATAR_MAX) throw new HttpError(400, 'bad_image');
  const head = Uint8Array.from(atob(m[2].slice(0, 32)), (c) => c.charCodeAt(0));
  if (!MAGIC[m[1]](head)) throw new HttpError(400, 'bad_image');
  await env.DB.prepare('INSERT INTO bio_avatars (handle, mime, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(handle) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at').bind(page.handle, m[1], m[2], Date.now()).run();
  return json({ ok: true, page: await view(env, page) });
}

async function avatar(env, path) {
  const handle = path.split('/')[4] || '';
  const row = await env.DB.prepare('SELECT mime, data FROM bio_avatars WHERE handle = ?').bind(handle).first();
  if (!row) return fail(404, 'not_found');
  return new Response(Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0)), { headers: { 'content-type': row.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}

// ---------- lead form ----------

// Public form post (no JS): /api/bio/lead/<handle> → back to the page.
async function submitLead(request, env, path) {
  const handle = path.split('/')[4] || '';
  const page = await env.DB.prepare('SELECT * FROM bio_pages WHERE handle = ?').bind(handle).first();
  const back = (q) => new Response(null, { status: 303, headers: { location: `/@${handle}?${q}#lead`, 'cache-control': 'no-store' } });
  if (!page) return fail(404, 'not_found');
  const cfg = JSON.parse(page.data).lead;
  if (!cfg?.on) return back('lead=off');
  const form = await request.formData().catch(() => null);
  if (!form) return back('lead=error');
  if (String(form.get('website') || '')) return back('thanks=1'); // honeypot: bots fill every field
  try {
    await rateLimit(env, 'bio-lead', await visitorId(request, env), 8);
  } catch {
    return back('lead=slow');
  }
  const email = String(form.get('email') || '').trim().toLowerCase().slice(0, 200);
  const phone = cfg.phone ? String(form.get('phone') || '').replace(/[^\d+]/g, '').slice(0, 20) : '';
  const name = String(form.get('name') || '').trim().slice(0, 80);
  if (!isEmail(email) && phone.replace(/\D/g, '').length < 7) return back('lead=invalid');
  await env.DB.prepare('INSERT INTO bio_leads (handle, ts, name, email, phone, source) VALUES (?, ?, ?, ?, ?, ?)').bind(handle, Date.now(), name || null, isEmail(email) ? email : null, phone || null, sourceOf(request)).run();
  await bump(env, handle, 'lead').catch(() => {});
  await notifyLead(env, request, page, { name, email, phone }).catch(() => {});
  return back('thanks=1');
}

// One e-mail per new lead, at most 20 a day per page.
async function notifyLead(env, request, page, lead) {
  if (!emailEnabled(env) || !page.email) return;
  const sent = await env.DB.prepare("SELECT n FROM bio_stats WHERE handle = ? AND day = ? AND key = 'leadmail'").bind(page.handle, today()).first();
  if ((sent?.n || 0) >= 20) return;
  await bump(env, page.handle, 'leadmail');
  const who = [lead.name, lead.email, lead.phone].filter(Boolean).map(escapeHtml).join(' · ');
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [page.email], subject: `New contact on myunwrapped.com/@${page.handle}`, text: `New contact from your page: ${[lead.name, lead.email, lead.phone].filter(Boolean).join(' · ')}\n\nSee all: ${siteUrl(env, request)}/bio/`, html: `<p>New contact from your page <b>@${escapeHtml(page.handle)}</b>:</p><p style="font-size:16px"><b>${who}</b></p><p><a href="${escapeHtml(siteUrl(env, request))}/bio/">See all contacts</a></p>` }),
    signal: AbortSignal.timeout(10000),
  });
}

async function listLeads(request, env) {
  const page = await owned(env, request);
  const pro = !!(await licenseActive(env, page.license_key));
  const { results } = await env.DB.prepare(`SELECT id, ts, name, email, phone, source FROM bio_leads WHERE handle = ? ORDER BY ts ${pro ? 'DESC LIMIT 2000' : `ASC LIMIT ${FREE_LEADS}`}`).bind(page.handle).all();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM bio_leads WHERE handle = ?').bind(page.handle).first();
  return json({ ok: true, pro, total: total?.n || 0, leads: pro ? results : results.reverse() });
}

async function deleteLead(request, env) {
  const page = await owned(env, request);
  const body = await readJson(request);
  await env.DB.prepare('DELETE FROM bio_leads WHERE id = ? AND handle = ?').bind(Number(body.id) || 0, page.handle).run();
  return listLeads(request, env);
}

// Click tracking: /api/bio/go/<handle>/<linkId> → 302 to the link.
async function go(env, path) {
  const [, , , , handle, id] = path.split('/');
  const page = handle && (await env.DB.prepare('SELECT data FROM bio_pages WHERE handle = ?').bind(handle).first());
  const link = page && JSON.parse(page.data).links.find((l) => l.id === id && l.on);
  if (!link) return fail(404, 'not_found');
  await bump(env, handle, `c:${id}`);
  return new Response(null, { status: 302, headers: { location: link.url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer-when-downgrade' } });
}

// ---------- public page ----------

export async function servePublicBio(request, env, handle) {
  await ensureBioSchema(env);
  const page = await env.DB.prepare('SELECT * FROM bio_pages WHERE handle = ?').bind(handle).first();
  if (!page) return null;
  const pro = !!(await licenseActive(env, page.license_key));
  if (request.method === 'GET' && !/bot|crawl|spider|preview|facebookexternalhit/i.test(request.headers.get('user-agent') || '')) {
    await bumpMany(env, handle, ['view', `src:${sourceOf(request)}`, `cc:${countryOf(request)}`, `dev:${deviceOf(request)}`]).catch(() => {});
  }
  const av = await env.DB.prepare('SELECT updated_at FROM bio_avatars WHERE handle = ?').bind(handle).first();
  const avatarUrl = av ? `/api/bio/avatar/${handle}?v=${av.updated_at}` : '';
  const q = new URL(request.url).searchParams;
  const leadState = q.get('thanks') === '1' ? 'thanks' : ['invalid', 'slow', 'error'].includes(q.get('lead')) ? q.get('lead') : '';
  return new Response(renderBioPage({ handle, data: JSON.parse(page.data), pro, site: siteUrl(env, request), avatarUrl, leadState }), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline' https://myunwrapped.com; img-src 'self' data: https:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}
