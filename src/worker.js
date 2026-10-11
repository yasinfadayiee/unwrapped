// Cloudflare Worker entry. Static files in /public are served by Workers
// Static Assets; everything under /api/* is handled here.

import { PLANS, SETTINGS, brand, getPlan } from './config.js';
import { cleanup, ensureSchema, getLicense, getOrder, logEvent } from './db.js';
import { HttpError, fail, json, rateLimit, readJson, visitorId } from './http.js';
import { activateLicense, getSigningKeys } from './license.js';
import { fulfillOrder, getOrderForBuyer, publicOrder } from './orders.js';
import { checkTronPayments, claimTronTx, createTronOrder, tronEnabled } from './payments/tron.js';
import { createNowpaymentsOrder, handleNowpaymentsIpn, nowpaymentsEnabled } from './payments/nowpayments.js';
import { emailEnabled, sendRenewalReminders } from './email.js';
import { handleAdmin } from './admin.js';
import { isEmail, normalizeLicenseKey } from './util.js';

const PRO_FEATURES = [
  'Full lists — every account, no limits',
  'Who unfollowed you, snapshot after snapshot',
  'Unfollow queue with safe daily pacing',
  'Deep insights for TikTok, X, Facebook & LinkedIn',
  'Cross-platform overlap map',
  'Wrapped cards without watermark + all themes',
  'CSV export of any list',
];

async function enabledMethods(env) {
  const methods = [];
  if (await tronEnabled(env)) {
    methods.push({ id: 'tron', label: 'USDT · TRC20', detail: 'Direct to wallet · lowest fees · ~1 min' });
  }
  if (nowpaymentsEnabled(env)) {
    methods.push({ id: 'nowpayments', label: '150+ cryptocurrencies', detail: 'BTC, ETH, SOL, TON, LTC, BNB, USDT…' });
  }
  return methods;
}

async function getConfig(env) {
  const { publicJwk } = await getSigningKeys(env);
  return json({
    ok: true,
    brand: brand(env),
    plans: PLANS,
    features: PRO_FEATURES,
    methods: await enabledMethods(env),
    publicKey: publicJwk,
    freeListLimit: SETTINGS.freeListLimit,
    support: env.SUPPORT_CONTACT || null,
    email: emailEnabled(env),
    dev: env.DEV_MODE === '1',
  });
}

async function checkout(request, env) {
  const visitor = await visitorId(request, env);
  await rateLimit(env, 'checkout', visitor, SETTINGS.maxCheckoutsPerHour);
  const body = await readJson(request);

  const plan = getPlan(body.plan);
  if (!plan) throw new HttpError(400, 'unknown_plan');

  let email = null;
  if (body.email) {
    email = String(body.email).trim().toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, 'invalid_email');
  }

  let renewKey = body.renewKey ? normalizeLicenseKey(body.renewKey) : null;
  if (renewKey) {
    const current = await getLicense(env, renewKey);
    if (!current || current.status !== 'active') renewKey = null;
    else if (!current.expires_at) throw new HttpError(400, 'already_lifetime');
  }

  const methods = await enabledMethods(env);
  const methodId = body.method || (methods[0] && methods[0].id);
  if (!methods.some((m) => m.id === methodId)) throw new HttpError(400, 'method_unavailable');

  const args = { plan, email, renewKey, visitor };
  const order =
    methodId === 'tron' ? await createTronOrder(env, args) : await createNowpaymentsOrder(env, request, args);
  await logEvent(env, 'order.created', order.id, { plan: plan.id, method: methodId });
  return json({ ok: true, token: order.token, order: await publicOrder(env, order) });
}

async function orderStatus(env, ctx, url) {
  let order = await getOrderForBuyer(env, url.searchParams.get('id'), url.searchParams.get('t'));
  if (!order) return fail(404, 'order_not_found');
  if (order.method === 'tron' && order.status !== 'paid') {
    // Look at the blockchain in the background; the next poll sees the result.
    ctx.waitUntil(checkTronPayments(env, { minIntervalMs: 12_000 }).catch((err) => console.error('tron check', err)));
  }
  const view = await publicOrder(env, order);
  if (view.status === 'pending' && order.expires_at < Date.now()) view.status = 'expired';
  return json({ ok: true, order: view });
}

async function claim(request, env) {
  await rateLimit(env, 'claim', await visitorId(request, env), SETTINGS.maxClaimsPerHour);
  const body = await readJson(request);
  const order = await getOrderForBuyer(env, body.id, body.t);
  if (!order) return fail(404, 'order_not_found');
  if (order.method !== 'tron') return fail(400, 'not_a_tron_order');
  const result = await claimTronTx(env, order, body.txid);
  return json({ ...result, order: await publicOrder(env, await getOrder(env, order.id)) });
}

async function activate(request, env) {
  await rateLimit(env, 'activate', await visitorId(request, env), SETTINGS.maxActivationsPerHour);
  const body = await readJson(request);
  return json(await activateLicense(env, body.key, { count: !body.refresh }));
}

// Local testing only (DEV_MODE=1 in .dev.vars): pretend an order was paid.
async function devPay(request, env) {
  const body = await readJson(request);
  const order = await getOrder(env, body.id);
  if (!order) return fail(404, 'order_not_found');
  await fulfillOrder(env, order, { providerRef: 'dev-simulated', paidUnits: order.amount_units });
  return json({ ok: true, order: await publicOrder(env, await getOrder(env, order.id)) });
}

async function route(request, env, ctx, url) {
  const key = `${request.method} ${url.pathname.replace(/\/+$/, '') || '/'}`;
  switch (key) {
    case 'GET /api/config':
      return getConfig(env);
    case 'POST /api/checkout':
      return checkout(request, env);
    case 'GET /api/order':
      return orderStatus(env, ctx, url);
    case 'POST /api/order/claim':
      return claim(request, env);
    case 'POST /api/license/activate':
      return activate(request, env);
    case 'POST /api/webhook/nowpayments':
      return handleNowpaymentsIpn(request, env);
    case 'GET /api/health':
      return json({ ok: true, time: Date.now() });
    case 'POST /api/dev/pay':
      if (env.DEV_MODE === '1') return devPay(request, env);
      break;
  }
  if (url.pathname.startsWith('/api/admin/')) return handleAdmin(request, env, url);
  return fail(404, 'not_found');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      await ensureSchema(env);
      return await route(request, env, ctx, url);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message, err.extra);
      console.error(err);
      return fail(500, 'internal_error');
    }
  },

  async scheduled(controller, env, ctx) {
    await ensureSchema(env);
    if (controller.cron === '0 9 * * *') {
      ctx.waitUntil(sendRenewalReminders(env).catch((err) => console.error('reminders', err)));
      return;
    }
    ctx.waitUntil(
      (async () => {
        await cleanup(env);
        await checkTronPayments(env).catch((err) => console.error('tron check', err));
        await env.DB.prepare(
          "INSERT INTO meta (k, v) VALUES ('cron_last', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
        )
          .bind(String(Date.now()))
          .run();
      })(),
    );
  },
};
