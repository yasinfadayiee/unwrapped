// Lemon Squeezy hosted checkout: card, Apple Pay, Google Pay and PayPal.
// Lemon Squeezy is the merchant of record (it handles sales tax / VAT and
// chargebacks) and pays out to the seller's bank. One "pay what you want"
// variant is reused for every plan: the price is set per checkout.
// Activation is driven by the signed order_created webhook.

import { brand, siteUrl } from '../config.js';
import { getOrder, logEvent } from '../db.js';
import { HttpError, fail, json } from '../http.js';
import { fulfillOrder, insertOrder } from '../orders.js';
import { hmacHex, timingSafeEqual } from '../util.js';

const API = 'https://api.lemonsqueezy.com/v1';

export function lemonsqueezyEnabled(env) {
  return Boolean(env.LEMONSQUEEZY_API_KEY && env.LEMONSQUEEZY_STORE_ID && env.LEMONSQUEEZY_VARIANT_ID && env.LEMONSQUEEZY_WEBHOOK_SECRET);
}

export async function signWebhookBody(secret, raw) {
  return hmacHex('SHA-256', String(secret).trim(), raw);
}

export async function createLemonsqueezyOrder(env, request, { plan, priceUsd = plan.priceUsd, email, renewKey, visitor, growthAccount = null }) {
  const order = await insertOrder(env, {
    plan: plan.id,
    price_usd: priceUsd,
    method: 'lemonsqueezy',
    email,
    renew_key: renewKey,
    visitor,
    growth_account: growthAccount,
  });
  const site = siteUrl(env, request);
  const success = growthAccount ? `${site}/growth/#paid=1` : `${site}/success/?order=${order.id}&t=${order.token}`;
  const res = await fetch(`${API}/checkouts`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.LEMONSQUEEZY_API_KEY}`,
      accept: 'application/vnd.api+json',
      'content-type': 'application/vnd.api+json',
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          custom_price: Math.round(priceUsd * 100),
          product_options: { name: `${brand(env)} ${plan.name}`, redirect_url: success, enabled_variants: [Number(env.LEMONSQUEEZY_VARIANT_ID)] },
          checkout_data: { ...(email ? { email } : {}), custom: { order_id: order.id } },
          checkout_options: { embed: false },
          expires_at: new Date(order.expires_at || Date.now() + 86_400_000).toISOString(),
        },
        relationships: {
          store: { data: { type: 'stores', id: String(env.LEMONSQUEEZY_STORE_ID) } },
          variant: { data: { type: 'variants', id: String(env.LEMONSQUEEZY_VARIANT_ID) } },
        },
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  const url = data?.data?.attributes?.url;
  if (!res.ok || !url) {
    await logEvent(env, 'lemonsqueezy.checkout_failed', order.id, { status: res.status, errors: data?.errors });
    await env.DB.prepare("UPDATE orders SET status = 'failed' WHERE id = ?").bind(order.id).run();
    throw new HttpError(502, 'payment_provider_unavailable');
  }
  const ref = String(data.data.id || '');
  await env.DB.prepare('UPDATE orders SET provider_ref = ?, redirect_url = ? WHERE id = ?').bind(ref, url, order.id).run();
  return { ...order, provider_ref: ref, redirect_url: url };
}

export async function handleLemonsqueezyWebhook(request, env) {
  if (!lemonsqueezyEnabled(env)) return fail(404, 'not_enabled');
  const raw = await request.text();
  if (raw.length > 256_000) return fail(413, 'payload_too_large');
  const signature = String(request.headers.get('x-signature') || '').toLowerCase();
  const expected = await signWebhookBody(env.LEMONSQUEEZY_WEBHOOK_SECRET, raw);
  if (!signature || !timingSafeEqual(expected, signature)) {
    await logEvent(env, 'lemonsqueezy.bad_signature', '', null);
    return fail(401, 'bad_signature');
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, 'invalid_json');
  }
  const event = String(body?.meta?.event_name || '');
  const orderId = String(body?.meta?.custom_data?.order_id || '');
  const attrs = body?.data?.attributes || {};
  await logEvent(env, 'lemonsqueezy.webhook', orderId, { event, ls_order: body?.data?.id, status: attrs.status, test: attrs.test_mode });
  if (event !== 'order_created') return json({ ok: true, ignored: event });
  if (attrs.test_mode && env.LEMONSQUEEZY_ALLOW_TEST !== '1') return json({ ok: true, ignored: 'test_mode' });

  const order = await getOrder(env, orderId);
  if (!order || order.method !== 'lemonsqueezy') return json({ ok: true, ignored: 'unknown_order' });
  if (order.status === 'paid') return json({ ok: true, already: true });
  if (attrs.status !== 'paid') return json({ ok: true, waiting: attrs.status });

  // Subtotal is before tax, in US cents whatever currency the buyer paid in.
  const paidCents = Number(attrs.subtotal_usd || 0);
  if (paidCents < Math.round(order.price_usd * 100) - 1) {
    await logEvent(env, 'lemonsqueezy.price_mismatch', order.id, { subtotal_usd: attrs.subtotal_usd });
    return json({ ok: true, ignored: 'price_mismatch' });
  }
  await fulfillOrder(env, order, { providerRef: `ls:${body.data.id}` });
  return json({ ok: true, fulfilled: true });
}
