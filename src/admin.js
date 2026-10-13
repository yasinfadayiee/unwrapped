// Owner dashboard API. Every route needs `Authorization: Bearer <ADMIN_TOKEN>`.

import { PLANS, getPlan, siteUrl } from './config.js';
import { getLicense, getOrder, logEvent } from './db.js';
import { HttpError, fail, json, rateLimit, readJson, visitorId } from './http.js';
import { grantLicense } from './license.js';
import { fulfillOrder } from './orders.js';
import { tronEnabled } from './payments/tron.js';
import { nowpaymentsEnabled } from './payments/nowpayments.js';
import { emailEnabled } from './email.js';
import { statsSummary } from './stats.js';
import { DAY, formatUsdt, isEmail, maskEmail, normalizeLicenseKey, timingSafeEqual } from './util.js';

function authorized(request, env) {
  const token = String(env.ADMIN_TOKEN || '').trim();
  if (token.length < 12) return false;
  const header = request.headers.get('authorization') || '';
  return timingSafeEqual(header.replace(/^Bearer\s+/i, '').trim(), token);
}

export async function handleAdmin(request, env, url) {
  if (!String(env.ADMIN_TOKEN || '').trim()) return fail(403, 'admin_disabled');
  if (!authorized(request, env)) {
    await rateLimit(env, 'admin-fail', await visitorId(request, env), 20);
    return fail(401, 'unauthorized');
  }
  const route = `${request.method} ${url.pathname.replace(/\/+$/, '')}`;
  switch (route) {
    case 'GET /api/admin/summary':
      return summary(env, request);
    case 'GET /api/admin/orders':
      return listOrders(env, url);
    case 'POST /api/admin/licenses':
      return createLicense(env, await readJson(request));
    case 'POST /api/admin/licenses/revoke':
      return revokeLicense(env, await readJson(request));
    case 'POST /api/admin/orders/mark-paid':
      return markPaid(env, await readJson(request));
    case 'GET /api/admin/events':
      return listEvents(env);
    case 'GET /api/admin/stats':
      return statsSummary(env);
    default:
      return fail(404, 'not_found');
  }
}

async function summary(env, request) {
  const now = Date.now();
  const today = Math.floor(now / DAY) * DAY;
  const db = env.DB;
  const [revenue, statuses, active, daily, mix, funnel, cron] = await db.batch([
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN paid_at >= ? THEN price_usd END), 0) AS today,
           COALESCE(SUM(CASE WHEN paid_at >= ? THEN price_usd END), 0) AS d7,
           COALESCE(SUM(CASE WHEN paid_at >= ? THEN price_usd END), 0) AS d30,
           COALESCE(SUM(price_usd), 0) AS total,
           COUNT(*) AS paid
         FROM orders WHERE status = 'paid'`,
      )
      .bind(today, now - 7 * DAY, now - 30 * DAY),
    db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status'),
    db
      .prepare("SELECT COUNT(*) AS n FROM licenses WHERE status = 'active' AND (expires_at IS NULL OR expires_at > ?)")
      .bind(now),
    db
      .prepare(
        `SELECT (paid_at / 86400000) AS day, SUM(price_usd) AS usd, COUNT(*) AS n
         FROM orders WHERE status = 'paid' AND paid_at >= ? GROUP BY day ORDER BY day`,
      )
      .bind(today - 29 * DAY),
    db.prepare(
      "SELECT plan, method, COUNT(*) AS n, SUM(price_usd) AS usd FROM orders WHERE status = 'paid' GROUP BY plan, method",
    ),
    db
      .prepare(
        "SELECT COUNT(*) AS created, COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0) AS paid FROM orders WHERE created_at >= ?",
      )
      .bind(now - 30 * DAY),
    db.prepare("SELECT v FROM meta WHERE k = 'cron_last'"),
  ]);

  return json({
    ok: true,
    revenue: revenue.results[0],
    statuses: Object.fromEntries(statuses.results.map((r) => [r.status, r.n])),
    activeLicenses: active.results[0].n,
    daily: daily.results.map((r) => ({ day: r.day * DAY, usd: r.usd, n: r.n })),
    mix: mix.results,
    funnel30d: funnel.results[0],
    health: {
      siteUrl: siteUrl(env, request),
      tron: await tronEnabled(env),
      tronAddress: env.TRON_ADDRESS || null,
      tronApiKey: Boolean(env.TRONGRID_API_KEY),
      nowpayments: nowpaymentsEnabled(env),
      email: emailEnabled(env),
      cronLastRun: cron.results[0] ? Number(cron.results[0].v) : null,
      devMode: env.DEV_MODE === '1',
    },
    plans: PLANS,
  });
}

async function listOrders(env, url) {
  const status = url.searchParams.get('status');
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const stmt = status
    ? env.DB.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ?').bind(status, limit)
    : env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').bind(limit);
  const { results } = await stmt.all();
  return json({
    ok: true,
    orders: results.map((o) => ({
      id: o.id,
      plan: o.plan,
      priceUsd: o.price_usd,
      method: o.method,
      status: o.status,
      amount: o.amount_units ? formatUsdt(o.amount_units) : null,
      paid: o.paid_units ? formatUsdt(o.paid_units) : null,
      email: maskEmail(o.email),
      licenseKey: o.license_key,
      providerRef: o.provider_ref,
      createdAt: o.created_at,
      paidAt: o.paid_at,
    })),
  });
}

async function createLicense(env, body) {
  const plan = getPlan(body.plan) || getPlan('pro-month');
  const days = body.days === null || body.days === 'lifetime' ? null : Number(body.days) || plan.days;
  const email = body.email && isEmail(String(body.email)) ? String(body.email).toLowerCase() : null;
  const license = await grantLicense(env, {
    // The plan id carries the tier; expires_at alone decides lifetime.
    plan: plan.id,
    days,
    email,
    note: String(body.note || 'manual').slice(0, 200),
  });
  await logEvent(env, 'license.manual', license.key, { days, note: body.note || null });
  return json({ ok: true, license });
}

async function revokeLicense(env, body) {
  const key = normalizeLicenseKey(body.key);
  const license = await getLicense(env, key);
  if (!license) throw new HttpError(404, 'license_not_found');
  await env.DB.prepare("UPDATE licenses SET status = 'revoked' WHERE key = ?").bind(key).run();
  await logEvent(env, 'license.revoked', key, null);
  return json({ ok: true });
}

async function markPaid(env, body) {
  const order = await getOrder(env, body.id);
  if (!order) throw new HttpError(404, 'order_not_found');
  const license = await fulfillOrder(env, order, { providerRef: 'manual' });
  await logEvent(env, 'order.manual_paid', order.id, null);
  return json({ ok: true, license });
}

async function listEvents(env) {
  const { results } = await env.DB.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 100').all();
  return json({ ok: true, events: results });
}
