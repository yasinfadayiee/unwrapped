// Creem hosted checkout: card, Apple Pay and Google Pay. Creem is the merchant
// of record (sales tax / VAT, chargebacks) and pays the seller out to a bank
// or in USDC. One one-time product is reused for every plan: the price is set
// per checkout with custom_price. Activation is driven by the signed
// checkout.completed webhook. Keys starting with creem_test_ use the test API.

import { brand, siteUrl } from '../config.js';
import { getOrder, logEvent } from '../db.js';
import { HttpError, fail, json } from '../http.js';
import { fulfillOrder, insertOrder } from '../orders.js';
import { hmacHex, timingSafeEqual } from '../util.js';

const api = (env) => (String(env.CREEM_API_KEY).startsWith('creem_test_') ? 'https://test-api.creem.io/v1' : 'https://api.creem.io/v1');

export function creemEnabled(env) {
  return Boolean(env.CREEM_API_KEY && env.CREEM_PRODUCT_ID && env.CREEM_WEBHOOK_SECRET);
}

export async function signCreemBody(secret, raw) {
  return hmacHex('SHA-256', String(secret).trim(), raw);
}

export async function createCreemOrder(env, request, { plan, priceUsd = plan.priceUsd, email, renewKey, visitor, growthAccount = null }) {
  const order = await insertOrder(env, {
    plan: plan.id,
    price_usd: priceUsd,
    method: 'creem',
    email,
    renew_key: renewKey,
    visitor,
    growth_account: growthAccount,
  });
  const site = siteUrl(env, request);
  const success = growthAccount ? `${site}/growth/#paid=1` : `${site}/success/?order=${order.id}&t=${order.token}`;
  const res = await fetch(`${api(env)}/checkouts`, {
    method: 'POST',
    headers: { 'x-api-key': env.CREEM_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      product_id: env.CREEM_PRODUCT_ID,
      request_id: order.id,
      units: 1,
      custom_price: Math.round(priceUsd * 100),
      success_url: success,
      ...(email ? { customer: { email } } : {}),
      metadata: { order_id: order.id, plan: plan.id, brand: brand(env) },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  const url = data?.checkout_url;
  if (!res.ok || !url) {
    await logEvent(env, 'creem.checkout_failed', order.id, { status: res.status, error: data?.message || data?.error || null });
    await env.DB.prepare("UPDATE orders SET status = 'failed' WHERE id = ?").bind(order.id).run();
    throw new HttpError(502, 'payment_provider_unavailable');
  }
  const ref = String(data.id || '');
  await env.DB.prepare('UPDATE orders SET provider_ref = ?, redirect_url = ? WHERE id = ?').bind(ref, url, order.id).run();
  return { ...order, provider_ref: ref, redirect_url: url };
}

export async function handleCreemWebhook(request, env) {
  if (!creemEnabled(env)) return fail(404, 'not_enabled');
  const raw = await request.text();
  if (raw.length > 256_000) return fail(413, 'payload_too_large');
  const signature = String(request.headers.get('creem-signature') || '').toLowerCase();
  const expected = await signCreemBody(env.CREEM_WEBHOOK_SECRET, raw);
  if (!signature || !timingSafeEqual(expected, signature)) {
    await logEvent(env, 'creem.bad_signature', '', null);
    return fail(401, 'bad_signature');
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, 'invalid_json');
  }
  const event = String(body?.eventType || '');
  const checkout = body?.object || {};
  const paid = checkout.order || {};
  const orderId = String(checkout.metadata?.order_id || checkout.request_id || '');
  await logEvent(env, 'creem.webhook', orderId, { event, checkout: checkout.id, status: paid.status, mode: checkout.mode || paid.mode });
  if (event !== 'checkout.completed') return json({ ok: true, ignored: event });
  const mode = String(checkout.mode || paid.mode || '');
  if (mode !== 'prod' && env.CREEM_ALLOW_TEST !== '1') return json({ ok: true, ignored: 'test_mode' });

  const order = await getOrder(env, orderId);
  if (!order || order.method !== 'creem') return json({ ok: true, ignored: 'unknown_order' });
  if (order.status === 'paid') return json({ ok: true, already: true });
  if (paid.status !== 'paid') return json({ ok: true, waiting: paid.status || null });

  // Before tax, in the product's currency (the product is set up in USD).
  const cents = Number(paid.sub_total ?? paid.amount ?? 0);
  if (String(paid.currency || '').toUpperCase() !== 'USD' || cents < Math.round(order.price_usd * 100) - 1) {
    await logEvent(env, 'creem.price_mismatch', order.id, { sub_total: paid.sub_total, currency: paid.currency });
    return json({ ok: true, ignored: 'price_mismatch' });
  }
  await fulfillOrder(env, order, { providerRef: `creem:${paid.id || checkout.id}` });
  return json({ ok: true, fulfilled: true });
}
