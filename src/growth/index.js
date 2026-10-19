// Unwrapped Growth: official-API automations for creators (phase 1: Instagram
// comment-to-DM). Owners sign in with the platform's own OAuth; a random session
// token in their browser is the only "account" we keep.

import { siteUrl } from '../config.js';
import { logEvent } from '../db.js';
import { HttpError, fail, json, rateLimit, readJson, visitorId } from '../http.js';
import { DAY } from '../util.js';
import { seal, open, randomId } from './vault.js';
import * as ig from './instagram.js';

export const GROWTH_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS growth_accounts (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    ext_id TEXT NOT NULL,
    username TEXT,
    token_enc TEXT NOT NULL,
    token_expires INTEGER,
    token_refreshed INTEGER,
    session TEXT NOT NULL,
    paid_until INTEGER,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS growth_accounts_session ON growth_accounts (session)',
  // One trial per platform account, forever — survives disconnecting.
  'CREATE TABLE IF NOT EXISTS growth_trials (account_id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0)',
  // Paid time per platform account; like the trial it survives disconnecting.
  'CREATE TABLE IF NOT EXISTS growth_paid (account_id TEXT PRIMARY KEY, paid_until INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
  `CREATE TABLE IF NOT EXISTS growth_rules (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    keyword TEXT NOT NULL,
    dm_text TEXT NOT NULL,
    public_reply TEXT,
    media_id TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,
  // Every comment handled once (Meta may deliver a webhook twice).
  'CREATE TABLE IF NOT EXISTS growth_sent (account_id TEXT NOT NULL, comment_id TEXT NOT NULL, rule_id TEXT, ts INTEGER NOT NULL, ok INTEGER NOT NULL, PRIMARY KEY (account_id, comment_id))',
  'CREATE TABLE IF NOT EXISTS growth_states (state TEXT PRIMARY KEY, session TEXT NOT NULL, created_at INTEGER NOT NULL)',
];

const ready = new WeakMap();
export async function ensureGrowthSchema(env) {
  if (ready.get(env.DB)) return;
  await env.DB.batch(GROWTH_SCHEMA.map((sql) => env.DB.prepare(sql)));
  ready.set(env.DB, true);
}

export const TRIAL = { days: 7, messages: 100 };
const MAX_RULES = 20;

export function growthEnabled(env) {
  return ig.instagramEnabled(env);
}

// ---------- access ----------

export function access(account, trial, now = Date.now()) {
  if (account.paid_until && account.paid_until > now) return { ok: true, mode: 'paid', until: account.paid_until };
  if (!trial) return { ok: true, mode: 'trial', until: now + TRIAL.days * DAY, left: TRIAL.messages, fresh: true };
  const until = trial.started_at + TRIAL.days * DAY;
  const left = Math.max(0, TRIAL.messages - trial.sent);
  if (until > now && left > 0) return { ok: true, mode: 'trial', until, left };
  return { ok: false, mode: 'expired', until };
}

// Case-insensitive whole-word match; keyword "*" answers every comment.
export function matchRule(rules, text, mediaId) {
  const t = ` ${String(text).toLowerCase().normalize('NFKC')} `;
  for (const r of rules) {
    if (!r.active) continue;
    if (r.media_id && r.media_id !== mediaId) continue;
    const k = String(r.keyword).toLowerCase().normalize('NFKC').trim();
    if (k === '*') return r;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u');
    if (re.test(t)) return r;
  }
  return null;
}

async function sessionAccounts(env, request) {
  const session = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (session.length < 20) throw new HttpError(401, 'no_session');
  const { results } = await env.DB.prepare('SELECT * FROM growth_accounts WHERE session = ?').bind(session).all();
  if (!results.length) throw new HttpError(401, 'no_session');
  return { session, accounts: results };
}

// Adds paid days to an account (from today, or from the end of time already
// paid). Called once per paid order; returns the new end date.
export async function extendGrowth(env, accountId, days, now = Date.now()) {
  if (!accountId) throw new Error('growth order without an account');
  await ensureGrowthSchema(env);
  const row = await env.DB.prepare('SELECT paid_until FROM growth_paid WHERE account_id = ?').bind(accountId).first();
  const until = Math.max(now, row?.paid_until || 0) + days * DAY;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO growth_paid (account_id, paid_until, updated_at) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET paid_until = excluded.paid_until, updated_at = excluded.updated_at').bind(accountId, until, now),
    env.DB.prepare('UPDATE growth_accounts SET paid_until = ? WHERE id = ?').bind(until, accountId),
  ]);
  return until;
}

// The checkout uses this to make sure the buyer owns the account they pay for.
export async function growthAccountForCheckout(env, request, accountId) {
  if (!growthEnabled(env)) throw new HttpError(404, 'growth_disabled');
  await ensureGrowthSchema(env);
  const { accounts } = await sessionAccounts(env, request);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new HttpError(404, 'account_not_found');
  return account.id;
}

async function trialOf(env, accountId) {
  return env.DB.prepare('SELECT * FROM growth_trials WHERE account_id = ?').bind(accountId).first();
}

function publicAccount(a, trial, rules) {
  return { id: a.id, platform: a.platform, username: a.username, access: access(a, trial), rules: rules.map((r) => ({ id: r.id, keyword: r.keyword, dmText: r.dm_text, publicReply: r.public_reply || '', mediaId: r.media_id || '', active: !!r.active })) };
}

// ---------- routes ----------

export async function handleGrowth(request, env, url, ctx) {
  if (!growthEnabled(env)) return fail(404, 'growth_disabled');
  await ensureGrowthSchema(env);
  const route = `${request.method} ${url.pathname.replace(/\/+$/, '')}`;
  switch (route) {
    case 'GET /api/growth/ig/connect':
      return connectInstagram(request, env, url);
    case 'GET /api/growth/ig/callback':
      return instagramCallback(request, env, url);
    case 'GET /api/growth/webhook/instagram':
      return verifyWebhook(env, url);
    case 'POST /api/growth/webhook/instagram':
      return instagramWebhook(request, env, ctx);
    case 'GET /api/growth/me':
      return me(request, env);
    case 'POST /api/growth/rules':
      return saveRule(request, env);
    case 'POST /api/growth/rules/delete':
      return deleteRule(request, env);
    case 'POST /api/growth/data-deletion':
      return dataDeletion(request, env, url);
    case 'POST /api/growth/disconnect':
      return disconnect(request, env);
  }
  return fail(404, 'not_found');
}

async function connectInstagram(request, env, url) {
  await rateLimit(env, 'growth-connect', await visitorId(request, env), 30);
  // Re-use the browser's session so several accounts end up together.
  const session = /^[A-Za-z0-9_-]{20,64}$/.test(url.searchParams.get('s') || '') ? url.searchParams.get('s') : randomId();
  const state = randomId(18);
  await env.DB.prepare('INSERT INTO growth_states (state, session, created_at) VALUES (?, ?, ?)').bind(state, session, Date.now()).run();
  return Response.redirect(ig.authorizeUrl(env, `${siteUrl(env, request)}/api/growth/ig/callback`, state), 302);
}

async function instagramCallback(request, env, url) {
  const site = siteUrl(env, request);
  const back = (q) => Response.redirect(`${site}/growth/#${q}`, 302);
  const state = url.searchParams.get('state') || '';
  const row = await env.DB.prepare('SELECT * FROM growth_states WHERE state = ?').bind(state).first();
  if (!row || row.created_at < Date.now() - 15 * 60_000) return back('error=expired');
  await env.DB.prepare('DELETE FROM growth_states WHERE state = ?').bind(state).run();
  if (url.searchParams.get('error') || !url.searchParams.get('code')) return back('error=denied');
  let prof;
  try {
    prof = await ig.exchangeCode(env, url.searchParams.get('code'), `${site}/api/growth/ig/callback`);
    await ig.subscribe(prof.token);
  } catch (err) {
    await logEvent(env, 'growth.connect_failed', null, { error: String(err.message).slice(0, 300) });
    return back('error=connect');
  }
  const id = `ig:${prof.userId}`;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO growth_accounts (id, platform, ext_id, username, token_enc, token_expires, token_refreshed, session, paid_until, created_at)
     VALUES (?, 'instagram', ?, ?, ?, ?, ?, ?, (SELECT paid_until FROM growth_paid WHERE account_id = ?), ?)
     ON CONFLICT(id) DO UPDATE SET username = excluded.username, token_enc = excluded.token_enc, token_expires = excluded.token_expires, token_refreshed = excluded.token_refreshed, session = excluded.session`,
  )
    .bind(id, prof.userId, prof.username, await seal(env, prof.token), prof.expiresAt, now, row.session, id, now)
    .run();
  await logEvent(env, 'growth.connected', id, { username: prof.username });
  return back(`session=${row.session}`);
}

function verifyWebhook(env, url) {
  if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === env.IG_VERIFY_TOKEN) {
    return new Response(url.searchParams.get('hub.challenge') || '', { status: 200 });
  }
  return fail(403, 'bad_verify_token');
}

async function instagramWebhook(request, env, ctx) {
  const raw = await request.text();
  if (raw.length > 256_000) return fail(413, 'payload_too_large');
  if (!(await ig.verifySignature(env, raw, request.headers.get('x-hub-signature-256')))) return fail(401, 'bad_signature');
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, 'invalid_json');
  }
  // Answer Meta at once; the replies run in the background.
  ctx?.waitUntil?.(processComments(env, ig.commentEvents(body)).catch((err) => console.error('growth webhook', err)));
  return json({ ok: true });
}

export async function processComments(env, events) {
  const done = [];
  for (const e of events) {
    const account = await env.DB.prepare("SELECT * FROM growth_accounts WHERE platform = 'instagram' AND ext_id = ?").bind(e.accountExtId).first();
    if (!account || e.fromId === account.ext_id) continue; // our own replies come back as comments too
    const trial = await trialOf(env, account.id);
    const acc = access(account, trial);
    if (!acc.ok) continue;
    const { results: rules } = await env.DB.prepare('SELECT * FROM growth_rules WHERE account_id = ? AND active = 1 ORDER BY created_at').bind(account.id).all();
    const rule = matchRule(rules, e.text, e.mediaId);
    if (!rule) continue;
    const claimed = await env.DB.prepare('INSERT OR IGNORE INTO growth_sent (account_id, comment_id, rule_id, ts, ok) VALUES (?, ?, ?, ?, 0)').bind(account.id, e.commentId, rule.id, Date.now()).run();
    if (!claimed.meta?.changes) continue; // already handled
    const token = await open(env, account.token_enc);
    let ok = 0;
    try {
      const text = rule.dm_text.replaceAll('{name}', e.fromName ? `@${e.fromName}` : '');
      await ig.privateReply(token, account.ext_id, e.commentId, text);
      ok = 1;
      if (rule.public_reply) await ig.publicReply(token, e.commentId, rule.public_reply).catch(() => {});
    } catch (err) {
      await logEvent(env, 'growth.reply_failed', account.id, { error: String(err.message).slice(0, 300) });
    }
    await env.DB.prepare('UPDATE growth_sent SET ok = ? WHERE account_id = ? AND comment_id = ?').bind(ok, account.id, e.commentId).run();
    if (ok && acc.mode === 'trial') {
      await env.DB.prepare('INSERT INTO growth_trials (account_id, started_at, sent) VALUES (?, ?, 1) ON CONFLICT(account_id) DO UPDATE SET sent = sent + 1').bind(account.id, Date.now()).run();
    }
    done.push({ account: account.id, comment: e.commentId, ok });
  }
  return done;
}

async function me(request, env) {
  const { accounts } = await sessionAccounts(env, request);
  const out = [];
  for (const a of accounts) {
    const trial = await trialOf(env, a.id);
    const { results: rules } = await env.DB.prepare('SELECT * FROM growth_rules WHERE account_id = ? ORDER BY created_at').bind(a.id).all();
    const stats = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(ok) AS ok, SUM(CASE WHEN ts > ? THEN ok ELSE 0 END) AS week FROM growth_sent WHERE account_id = ?').bind(Date.now() - 7 * DAY, a.id).first();
    out.push({ ...publicAccount(a, trial, rules), stats: { total: stats?.ok || 0, week: stats?.week || 0 } });
  }
  return json({ ok: true, accounts: out, trial: TRIAL });
}

// Meta calls this when someone removes the app in Instagram or asks for their data
// to be deleted. Everything we keep for that account goes, except the one-trial marker.
async function dataDeletion(request, env, url) {
  const form = await request.formData().catch(() => null);
  const userId = await ig.parseSignedRequest(env, form?.get('signed_request'));
  if (!userId) return fail(400, 'bad_signed_request');
  const id = `ig:${userId}`;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM growth_rules WHERE account_id = ?').bind(id),
    env.DB.prepare('DELETE FROM growth_sent WHERE account_id = ?').bind(id),
    env.DB.prepare('DELETE FROM growth_accounts WHERE id = ?').bind(id),
  ]);
  await logEvent(env, 'growth.data_deleted', id, null);
  return json({ url: `${siteUrl(env, request)}/privacy/#growth-data`, confirmation_code: randomId(9) });
}

async function ownAccount(env, request, accountId) {
  const { accounts } = await sessionAccounts(env, request);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new HttpError(404, 'account_not_found');
  return account;
}

async function saveRule(request, env) {
  const body = await readJson(request);
  const account = await ownAccount(env, request, String(body.accountId || ''));
  const keyword = String(body.keyword || '').trim().slice(0, 40);
  const dmText = String(body.dmText || '').trim().slice(0, 900);
  if (!keyword || !dmText) throw new HttpError(400, 'missing_fields');
  const fields = [keyword, dmText, String(body.publicReply || '').trim().slice(0, 300) || null, String(body.mediaId || '').replace(/\D/g, '') || null, body.active === false ? 0 : 1];
  if (body.id) {
    const res = await env.DB.prepare('UPDATE growth_rules SET keyword = ?, dm_text = ?, public_reply = ?, media_id = ?, active = ? WHERE id = ? AND account_id = ?').bind(...fields, String(body.id), account.id).run();
    if (!res.meta?.changes) throw new HttpError(404, 'rule_not_found');
  } else {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM growth_rules WHERE account_id = ?').bind(account.id).first();
    if ((count?.n || 0) >= MAX_RULES) throw new HttpError(400, 'too_many_rules');
    await env.DB.prepare('INSERT INTO growth_rules (keyword, dm_text, public_reply, media_id, active, id, account_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(...fields, randomId(9), account.id, Date.now()).run();
  }
  return me(request, env);
}

async function deleteRule(request, env) {
  const body = await readJson(request);
  const account = await ownAccount(env, request, String(body.accountId || ''));
  await env.DB.prepare('DELETE FROM growth_rules WHERE id = ? AND account_id = ?').bind(String(body.id || ''), account.id).run();
  return me(request, env);
}

async function disconnect(request, env) {
  const body = await readJson(request);
  const account = await ownAccount(env, request, String(body.accountId || ''));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM growth_rules WHERE account_id = ?').bind(account.id),
    env.DB.prepare('DELETE FROM growth_accounts WHERE id = ?').bind(account.id),
  ]);
  await logEvent(env, 'growth.disconnected', account.id, null);
  return json({ ok: true });
}

// ---------- cron ----------

// Refresh tokens older than a week; drop stale OAuth states.
export async function growthMaintenance(env) {
  if (!growthEnabled(env)) return;
  await ensureGrowthSchema(env);
  const now = Date.now();
  await env.DB.prepare('DELETE FROM growth_states WHERE created_at < ?').bind(now - DAY).run();
  const { results } = await env.DB.prepare("SELECT * FROM growth_accounts WHERE platform = 'instagram' AND (token_refreshed IS NULL OR token_refreshed < ?) LIMIT 20").bind(now - 7 * DAY).all();
  for (const a of results) {
    try {
      const fresh = await ig.refreshToken(await open(env, a.token_enc));
      await env.DB.prepare('UPDATE growth_accounts SET token_enc = ?, token_expires = ?, token_refreshed = ? WHERE id = ?').bind(await seal(env, fresh.token), fresh.expiresAt, now, a.id).run();
    } catch (err) {
      await logEvent(env, 'growth.refresh_failed', a.id, { error: String(err.message).slice(0, 200) });
    }
  }
}
