// Accounts without passwords. People sign up and sign in with their e-mail:
// we send a 6-digit code (and a one-tap link), and a verified code opens a
// session kept in an HttpOnly cookie (tables: users, login_codes, sessions in
// src/db.js). An account only gathers what is already tied to that e-mail
// (licenses and orders); export data never leaves the device.

import { brand, getPlan, siteUrl } from './config.js';
import { getLicense, logEvent } from './db.js';
import { layout, send, emailEnabled } from './email.js';
import { HttpError, json, rateLimit, readJson, visitorId } from './http.js';
import { getReferralForLicense } from './referrals.js';
import { DAY, MINUTE, escapeHtml, isEmail, normalizeLicenseKey, randomId, sha256Hex, timingSafeEqual } from './util.js';

const COOKIE = 'uw_session';
const SESSION_DAYS = 60;
const CODE_TTL = 15 * MINUTE;
const MAX_ATTEMPTS = 5;
const LANG = /^[a-z]{2}$/;
const HOUR_MS = 60 * MINUTE;

const cleanName = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 60) || null;
const codeHash = (email, code) => sha256Hex(`login|${email}|${code}`);

function sixDigits() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

function readEmail(body) {
  const email = String(body.email || '').trim().toLowerCase();
  if (!isEmail(email)) throw new HttpError(400, 'invalid_email');
  return email;
}

function sessionCookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function cookieToken(request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9]+)`));
  return m ? m[1] : null;
}

// The signed-in user, or null. Sliding expiry: active sessions stay alive.
export async function currentUser(request, env) {
  const token = cookieToken(request);
  if (!token) return null;
  const hash = await sha256Hex(token);
  const now = Date.now();
  const row = await env.DB.prepare(
    'SELECT u.*, s.last_seen FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
  )
    .bind(hash, now)
    .first();
  if (!row) return null;
  if (now - row.last_seen > HOUR_MS) {
    await env.DB.prepare('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?')
      .bind(now, now + SESSION_DAYS * DAY, hash)
      .run();
  }
  return row;
}
async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, 'signed_out');
  return user;
}

async function sendCode(env, email, code, isNew) {
  const name = brand(env);
  const link = `${siteUrl(env)}/account/#login=${encodeURIComponent(email)}:${code}`;
  const title = isNew ? `Welcome to ${escapeHtml(name)}` : `Your ${escapeHtml(name)} sign-in code`;
  const html = layout(
    env,
    title,
    `<p style="color:#b9b9c6;line-height:1.6;margin:0 0 18px">Enter this code to ${isNew ? 'finish creating your account' : 'sign in'}. It works for 15 minutes.</p>
     <div style="font-family:JetBrains Mono,Consolas,monospace;font-size:30px;letter-spacing:8px;background:#0b0b10;border:1px dashed #3a3a46;border-radius:12px;padding:14px 16px;text-align:center;color:#d7ff3a">${code}</div>
     <p style="margin:20px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#d7ff3a;color:#0b0b10;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">Sign in with one tap</a></p>`,
    `You received this e-mail because someone entered this address at ${escapeHtml(siteUrl(env).replace(/^https?:\/\//, ''))}. If it wasn't you, ignore it: nothing happens without the code.`,
  );
  const text = `Your ${name} code: ${code}\n\nIt works for 15 minutes. Or sign in with one tap: ${link}\n\nIf you didn't ask for this, ignore this e-mail.`;
  return send(env, { to: email, subject: `${code} is your ${name} code`, html, text });
}

// Step 1: e-mail in, code out. The same call signs up and signs in.
async function start(request, env) {
  const visitor = await visitorId(request, env);
  await rateLimit(env, 'auth-start', visitor, 10);
  const body = await readJson(request);
  const email = readEmail(body);
  await rateLimit(env, 'auth-mail', await sha256Hex(email), 5);
  if (!emailEnabled(env) && env.DEV_MODE !== '1') throw new HttpError(503, 'email_disabled');
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  const code = sixDigits();
  const lang = LANG.test(String(body.lang || '')) ? String(body.lang) : null;
  await env.DB.prepare(
    `INSERT INTO login_codes (email, code_hash, name, lang, attempts, expires_at) VALUES (?, ?, ?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, name = excluded.name, lang = excluded.lang, attempts = 0, expires_at = excluded.expires_at`,
  )
    .bind(email, await codeHash(email, code), cleanName(body.name), lang, Date.now() + CODE_TTL)
    .run();
  if (emailEnabled(env)) await sendCode(env, email, code, !existing);
  return json({ ok: true, isNew: !existing, ...(env.DEV_MODE === '1' ? { devCode: code } : {}) });
}

// Step 2: a correct code creates the account if needed and opens a session.
async function verify(request, env) {
  await rateLimit(env, 'auth-verify', await visitorId(request, env), 30);
  const body = await readJson(request);
  const email = readEmail(body);
  const code = String(body.code || '').replace(/\D/g, '');
  const row = await env.DB.prepare('SELECT * FROM login_codes WHERE email = ?').bind(email).first();
  const now = Date.now();
  if (!row || row.expires_at < now || row.attempts >= MAX_ATTEMPTS) throw new HttpError(400, 'code_expired');
  if (code.length !== 6 || !timingSafeEqual(await codeHash(email, code), row.code_hash)) {
    await env.DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
    throw new HttpError(400, 'wrong_code', { left: Math.max(0, MAX_ATTEMPTS - row.attempts - 1) });
  }
  await env.DB.prepare('DELETE FROM login_codes WHERE email = ?').bind(email).run();

  let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  const isNew = !user;
  if (isNew) {
    user = { id: randomId(16), email, name: row.name, lang: row.lang, created_at: now };
    await env.DB.prepare('INSERT INTO users (id, email, name, lang, created_at, last_login_at, logins) VALUES (?, ?, ?, ?, ?, ?, 1)')
      .bind(user.id, email, user.name, user.lang, now, now)
      .run();
    await logEvent(env, 'user.signup', user.id, { lang: user.lang });
  } else {
    await env.DB.prepare('UPDATE users SET last_login_at = ?, logins = logins + 1, name = COALESCE(name, ?) WHERE id = ?')
      .bind(now, row.name, user.id)
      .run();
  }

  const token = randomId(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)').bind(
      await sha256Hex(token),
      user.id,
      now,
      now + SESSION_DAYS * DAY,
      now,
    ),
  ]);
  return json({ ok: true, isNew }, 200, { 'set-cookie': sessionCookie(request, token, SESSION_DAYS * 86400) });
}

async function logout(request, env) {
  const token = cookieToken(request);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, '', 0) });
}

function licenseView(row, now) {
  const plan = getPlan(row.plan);
  const live = row.status === 'active' && (!row.expires_at || row.expires_at > now);
  return {
    key: row.key,
    plan: row.plan,
    planName: plan ? plan.name : row.plan,
    tier: plan ? plan.tier : null,
    status: live ? 'active' : row.status === 'active' ? 'expired' : row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lifetime: !row.expires_at,
  };
}

// Everything the account owns: licenses and orders under its e-mail, plus
// the free days earned by inviting friends.
async function me(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ ok: true, user: null });
  const now = Date.now();
  const [licenses, orders] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM licenses WHERE email = ? ORDER BY created_at DESC LIMIT 50').bind(user.email),
    env.DB.prepare(
      "SELECT id, plan, price_usd, method, status, created_at, paid_at FROM orders WHERE email = ? AND status IN ('paid', 'pending') ORDER BY created_at DESC LIMIT 50",
    ).bind(user.email),
  ]);
  const views = licenses.results.map((r) => licenseView(r, now));
  let invites = { friends: 0, earnedDays: 0 };
  for (const l of views.filter((v) => v.status === 'active')) {
    const ref = await getReferralForLicense(env, l.key).catch(() => null);
    if (ref && ref.ok) {
      invites = { friends: invites.friends + (ref.uses || 0), earnedDays: invites.earnedDays + (ref.earnedDays || 0) };
    }
  }
  return json({
    ok: true,
    user: { email: user.email, name: user.name, createdAt: user.created_at, logins: user.logins },
    licenses: views,
    orders: orders.results.map((o) => ({
      id: o.id,
      plan: o.plan,
      planName: getPlan(o.plan)?.name || o.plan,
      priceUsd: o.price_usd,
      method: o.method,
      status: o.status === 'pending' && o.created_at < now - DAY ? 'expired' : o.status,
      createdAt: o.created_at,
      paidAt: o.paid_at,
    })),
    invites,
  });
}

async function updateProfile(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(cleanName(body.name), user.id).run();
  return json({ ok: true });
}

// Knowing a license key proves you own it; it moves under this account's
// e-mail unless another address already holds it.
async function linkLicense(request, env) {
  const user = await requireUser(request, env);
  await rateLimit(env, 'activate', await visitorId(request, env), 20);
  const body = await readJson(request);
  const license = await getLicense(env, normalizeLicenseKey(body.key));
  if (!license) throw new HttpError(404, 'not_found');
  if (license.email && license.email !== user.email) throw new HttpError(409, 'linked_elsewhere');
  await env.DB.prepare('UPDATE licenses SET email = ? WHERE key = ?').bind(user.email, license.key).run();
  return json({ ok: true });
}

// Deleting the account removes the login, never the licenses people paid for.
async function deleteAccount(request, env) {
  const user = await requireUser(request, env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  await logEvent(env, 'user.deleted', user.id);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, '', 0) });
}

export function handleUsers(request, env, url) {
  const key = `${request.method} ${url.pathname.replace(/\/+$/, '')}`;
  switch (key) {
    case 'POST /api/auth/start':
      return start(request, env);
    case 'POST /api/auth/verify':
      return verify(request, env);
    case 'POST /api/auth/logout':
      return logout(request, env);
    case 'GET /api/me':
      return me(request, env);
    case 'POST /api/me/profile':
      return updateProfile(request, env);
    case 'POST /api/me/link-license':
      return linkLicense(request, env);
    case 'POST /api/me/delete':
      return deleteAccount(request, env);
  }
  return null;
}

// Owner dashboard: sign-ups over time, activity and the newest accounts.
export async function adminUsers(env, url) {
  const now = Date.now();
  const today = Math.floor(now / DAY) * DAY;
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 100);
  const db = env.DB;
  const [totals, daily, langs, list] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS today,
           COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS d7,
           COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS d30,
           COALESCE(SUM(CASE WHEN last_login_at >= ? THEN 1 ELSE 0 END), 0) AS active7,
           COALESCE(SUM(CASE WHEN last_login_at >= ? THEN 1 ELSE 0 END), 0) AS active30,
           (SELECT COUNT(DISTINCT u.id) FROM users u JOIN licenses l ON l.email = u.email WHERE l.status = 'active' AND (l.expires_at IS NULL OR l.expires_at > ?)) AS paying
         FROM users`,
      )
      .bind(today, now - 7 * DAY, now - 30 * DAY, now - 7 * DAY, now - 30 * DAY, now),
    db.prepare('SELECT (created_at / 86400000) AS day, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY day ORDER BY day').bind(today - 29 * DAY),
    db.prepare("SELECT COALESCE(lang, '?') AS lang, COUNT(*) AS n FROM users GROUP BY lang ORDER BY n DESC"),
    db
      .prepare(
        `SELECT u.id, u.email, u.name, u.lang, u.created_at, u.last_login_at, u.logins,
           (SELECT COUNT(*) FROM licenses l WHERE l.email = u.email AND l.status = 'active' AND (l.expires_at IS NULL OR l.expires_at > ?)) AS licenses,
           (SELECT COALESCE(SUM(price_usd), 0) FROM orders o WHERE o.email = u.email AND o.status = 'paid') AS spent
         FROM users u WHERE (? = '' OR u.email LIKE ? OR LOWER(COALESCE(u.name, '')) LIKE ?)
         ORDER BY u.created_at DESC LIMIT 100`,
      )
      .bind(now, q, `%${q}%`, `%${q}%`),
  ]);
  return json({
    ok: true,
    totals: totals.results[0],
    daily: daily.results.map((r) => ({ day: r.day * DAY, n: r.n })),
    langs: langs.results,
    users: list.results,
  });
}
