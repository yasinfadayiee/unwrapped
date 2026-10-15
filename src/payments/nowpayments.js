// NOWPayments hosted invoices: buyers can pay with 150+ coins (BTC, ETH, SOL,
// LTC, TON, BNB, USDT on many chains…). Activation is driven by the signed IPN
// webhook, double-checked against the NOWPayments API.

import { SETTINGS, brand, siteUrl } from '../config.js';
import { getOrder, logEvent } from '../db.js';
import { HttpError, fail, json } from '../http.js';
import { fulfillOrder, insertOrder } from '../orders.js';
import { hmacHex, timingSafeEqual } from '../util.js';

const API = 'https://api.nowpayments.io/v1';

export function nowpaymentsEnabled(env) {
  return Boolean(env.NOWPAYMENTS_API_KEY && env.NOWPAYMENTS_IPN_SECRET);
}

// Recursive key sort, exactly as in the NOWPayments IPN documentation.
export function sortObject(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((result, key) => {
      result[key] = obj[key] && typeof obj[key] === 'object' ? sortObject(obj[key]) : obj[key];
      return result;
    }, {});
}

export async function signIpnBody(secret, body) {
  return hmacHex('SHA-512', String(secret).trim(), JSON.stringify(sortObject(body)));
}

export async function createNowpaymentsOrder(env, request, { plan, priceUsd = plan.priceUsd, email, renewKey, visitor }) {
  const order = await insertOrder(env, {
    plan: plan.id,
    price_usd: priceUsd,
    method: 'nowpayments',
    email,
    renew_key: renewKey,
    visitor,
  });
  const site = siteUrl(env, request);
  const res = await fetch(`${API}/invoice`, {
    method: 'POST',
    headers: { 'x-api-key': env.NOWPAYMENTS_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      price_amount: priceUsd,
      price_currency: 'usd',
      order_id: order.id,
      order_description: `${brand(env)} ${plan.name}`,
      ipn_callback_url: `${site}/api/webhook/nowpayments`,
      success_url: `${site}/success/?order=${order.id}&t=${order.token}`,
      cancel_url: `${site}/#pricing`,
      // Fixed-rate quotes raise NOWPayments' per-coin minimums above our $5 plans.
      is_fixed_rate: false,
      is_fee_paid_by_user: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.invoice_url) {
    await logEvent(env, 'nowpayments.invoice_failed', order.id, { status: res.status, data });
    await env.DB.prepare("UPDATE orders SET status = 'failed' WHERE id = ?").bind(order.id).run();
    throw new HttpError(502, 'payment_provider_unavailable');
  }
  await env.DB.prepare('UPDATE orders SET provider_ref = ?, redirect_url = ? WHERE id = ?')
    .bind(String(data.id || ''), data.invoice_url, order.id)
    .run();
  return { ...order, provider_ref: String(data.id || ''), redirect_url: data.invoice_url };
}

async function fetchPayment(env, paymentId) {
  const res = await fetch(`${API}/payment/${encodeURIComponent(paymentId)}`, {
    headers: { 'x-api-key': env.NOWPAYMENTS_API_KEY },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  return res.json();
}

function decide(env, order, payment) {
  const status = String(payment.payment_status || '');
  if (status === 'finished') return true;
  if (status === 'confirmed' && env.NOWPAYMENTS_ACCEPT_CONFIRMED === '1') return true;
  if (status === 'partially_paid') {
    const paidFiat = Number(payment.actually_paid_at_fiat || 0);
    return paidFiat >= order.price_usd * SETTINGS.partialAcceptRatio;
  }
  return false;
}

export async function handleNowpaymentsIpn(request, env) {
  if (!nowpaymentsEnabled(env)) return fail(404, 'not_enabled');
  const raw = await request.text();
  if (raw.length > 64_000) return fail(413, 'payload_too_large');
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, 'invalid_json');
  }
  const signature = String(request.headers.get('x-nowpayments-sig') || '').toLowerCase();
  const expected = await signIpnBody(env.NOWPAYMENTS_IPN_SECRET, body);
  if (!signature || !timingSafeEqual(expected, signature)) {
    await logEvent(env, 'nowpayments.bad_signature', String(body.order_id || ''), null);
    // Unsigned or mis-signed (e.g. a rotated IPN secret): trust nothing from the
    // body except the payment id, and take every field from the API instead.
    const verified = body.payment_id ? await fetchPayment(env, body.payment_id).catch(() => null) : null;
    if (!verified || !verified.order_id) return fail(401, 'bad_signature');
    body = verified;
  }
  await logEvent(env, 'nowpayments.ipn', String(body.order_id || ''), {
    payment_id: body.payment_id,
    status: body.payment_status,
    pay_currency: body.pay_currency,
    actually_paid: body.actually_paid,
  });

  const order = await getOrder(env, String(body.order_id || ''));
  if (!order || order.method !== 'nowpayments') return json({ ok: true, ignored: 'unknown_order' });
  if (order.status === 'paid') return json({ ok: true, already: true });

  const priceOk =
    Math.abs(Number(body.price_amount) - order.price_usd) < 0.01 &&
    String(body.price_currency || '').toLowerCase() === 'usd';
  if (!priceOk) {
    await logEvent(env, 'nowpayments.price_mismatch', order.id, { price_amount: body.price_amount });
    return json({ ok: true, ignored: 'price_mismatch' });
  }
  if (!decide(env, order, body)) return json({ ok: true, waiting: body.payment_status });

  // Defense in depth: confirm the payment with the API before activating.
  if (body.payment_id && env.NOWPAYMENTS_VERIFY !== '0') {
    const verified = await fetchPayment(env, body.payment_id).catch(() => null);
    // API unreachable: answer 503 so NOWPayments delivers the IPN again later.
    if (!verified) return fail(503, 'verification_unavailable');
    if (String(verified.order_id) !== order.id || !decide(env, order, { ...body, ...verified })) {
      await logEvent(env, 'nowpayments.verify_mismatch', order.id, { payment_id: body.payment_id });
      return json({ ok: true, waiting: 'verification' });
    }
  }
  await fulfillOrder(env, order, { providerRef: String(body.payment_id || order.provider_ref || '') });
  return json({ ok: true, fulfilled: true });
}
