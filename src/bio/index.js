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
];

const ready = new WeakMap();
async function ensureBioSchema(env) {
  if (ready.get(env.DB)) return;
  await env.DB.batch(BIO_SCHEMA.map((sql) => env.DB.prepare(sql)));
  ready.set(env.DB, true);
}

export const FREE_LINKS = 5;
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
  return {
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
  return {
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
  await env.DB.batch([env.DB.prepare('DELETE FROM bio_pages WHERE handle = ?').bind(page.handle), env.DB.prepare('DELETE FROM bio_stats WHERE handle = ?').bind(page.handle)]);
  await logEvent(env, 'bio.deleted', page.handle, null);
  return json({ ok: true });
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
  if (request.method === 'GET') await bump(env, handle, 'view').catch(() => {});
  return new Response(renderBioPage({ handle, data: JSON.parse(page.data), pro, site: siteUrl(env, request) }), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline' https://myunwrapped.com; img-src 'self' data: https:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}
