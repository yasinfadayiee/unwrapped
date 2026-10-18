// Cloudflare Worker entry. Static files in /public are served by Workers
// Static Assets; everything under /api/* is handled here.

import { PLANS, SETTINGS, TIERS, brand, getPlan, tierRank } from './config.js';
import { cleanup, ensureSchema, getLicense, getOrder, logEvent } from './db.js';
import { HttpError, fail, json, rateLimit, readJson, visitorId } from './http.js';
import { activateLicense, getSigningKeys, lifetimeTier } from './license.js';
import { fulfillOrder, getOrderForBuyer, publicOrder } from './orders.js';
import { checkTronPayments, claimTronTx, createTronOrder, tronEnabled } from './payments/tron.js';
import { checkNowpaymentsPayments, createNowpaymentsOrder, handleNowpaymentsIpn, nowpaymentsEnabled } from './payments/nowpayments.js';
import { growthMaintenance, handleGrowth } from './growth/index.js';
import { handleBio, servePublicBio } from './bio/index.js';
import { emailEnabled, sendRenewalReminders } from './email.js';
import { handleAdmin } from './admin.js';
import { attachReferral, discounted, getReferralForLicense, validReferral } from './referrals.js';
import { isEmail, normalizeLicenseKey } from './util.js';
import { publicStats, recordHit } from './stats.js';
import { submitFeedback, testimonials } from './feedback.js';

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
    tiers: TIERS,
    methods: await enabledMethods(env),
    publicKey: publicJwk,
    freeListLimit: SETTINGS.freeListLimit,
    referral: { discount: SETTINGS.referralDiscount, rewardDays: SETTINGS.referralRewardDays },
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
    else {
      // A lifetime license can only buy time on a higher tier.
      const keeps = lifetimeTier(current);
      if (keeps && (!plan.days || tierRank(plan.tier) <= tierRank(keeps))) throw new HttpError(400, 'already_lifetime');
    }
  }

  const methods = await enabledMethods(env);
  const methodId = body.method || (methods[0] && methods[0].id);
  if (!methods.some((m) => m.id === methodId)) throw new HttpError(400, 'method_unavailable');

  const referral = body.ref ? await validReferral(env, body.ref, renewKey) : null;
  const priceUsd = referral ? discounted(plan.priceUsd) : plan.priceUsd;

  const args = { plan, priceUsd, email, renewKey, visitor };
  const order =
    methodId === 'tron' ? await createTronOrder(env, args) : await createNowpaymentsOrder(env, request, args);
  if (referral) await attachReferral(env, order.id, referral.code);
  await logEvent(env, 'order.created', order.id, { plan: plan.id, method: methodId, ref: referral ? referral.code : null });
  const view = await publicOrder(env, order);
  view.listPriceUsd = plan.priceUsd;
  view.referral = Boolean(referral);
  return json({ ok: true, token: order.token, order: view });
}

async function referralInfo(request, env) {
  await rateLimit(env, 'activate', await visitorId(request, env), SETTINGS.maxActivationsPerHour);
  const body = await readJson(request);
  return json(await getReferralForLicense(env, body.key));
}

async function referralCheck(env, url) {
  const row = await validReferral(env, url.searchParams.get('code'), null);
  return json({ ok: Boolean(row), discount: SETTINGS.referralDiscount });
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
    case 'POST /api/referral':
      return referralInfo(request, env);
    case 'GET /api/referral/check':
      return referralCheck(env, url);
    case 'POST /api/webhook/nowpayments':
      return handleNowpaymentsIpn(request, env);
    case 'POST /api/hit':
      return recordHit(request, env);
    case 'POST /api/feedback':
      return submitFeedback(request, env);
    case 'GET /api/testimonials':
      return testimonials(env, url);
    case 'GET /api/stats':
      return publicStats(env);
    case 'GET /api/health':
      return json({ ok: true, time: Date.now() });
    case 'POST /api/dev/pay':
      if (env.DEV_MODE === '1') return devPay(request, env);
      break;
  }
  if (url.pathname.startsWith('/api/admin/')) return handleAdmin(request, env, url);
  if (url.pathname.startsWith('/api/growth/')) return handleGrowth(request, env, url, ctx);
  if (url.pathname.startsWith('/api/bio/')) return handleBio(request, env, url);
  return fail(404, 'not_found');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Once SITE_URL is a custom domain, pages on the old workers.dev address
    // move there permanently (301), so search engines carry rankings over.
    // API calls keep working on both addresses (payment webhooks).
    const canonical = (env.SITE_URL || '').replace(/\/+$/, '');
    if (canonical && !url.pathname.startsWith('/api/')) {
      const target = new URL(canonical);
      const alias = url.hostname.endsWith('.workers.dev') || url.hostname === `www.${target.hostname}`;
      if (alias && target.hostname !== url.hostname) return Response.redirect(`${target.origin}${url.pathname}${url.search}`, 301);
    }
    // Public "link in bio" pages: /@handle
    const bio = url.pathname.match(/^\/@([a-z0-9._]{3,30})\/?$/i);
    if (bio && (request.method === 'GET' || request.method === 'HEAD')) {
      try {
        await ensureSchema(env);
        const res = await servePublicBio(request, env, bio[1].toLowerCase());
        if (res) return res;
      } catch (err) {
        console.error('bio page', err);
      }
    }
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
      ctx.waitUntil(growthMaintenance(env).catch((err) => console.error('growth', err)));
      return;
    }
    ctx.waitUntil(
      (async () => {
        await cleanup(env);
        await checkTronPayments(env).catch((err) => console.error('tron check', err));
        await checkNowpaymentsPayments(env).catch((err) => console.error('nowpayments check', err));
        await env.DB.prepare(
          "INSERT INTO meta (k, v) VALUES ('cron_last', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
        )
          .bind(String(Date.now()))
          .run();
      })(),
    );
  },
};
