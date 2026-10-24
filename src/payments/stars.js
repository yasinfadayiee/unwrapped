// Telegram Stars invoices for digital goods. No card or export data reaches us.
import { SETTINGS, brand, getGrowthPlan, getPlan, siteUrl } from '../config.js';
import { getOrder, logEvent } from '../db.js';
import { HttpError, fail, json } from '../http.js';
import { fulfillOrder, insertOrder } from '../orders.js';
import { timingSafeEqual } from '../util.js';

export function starsEnabled(env) {
  return Boolean(env.TELEGRAM_STARS_BOT_TOKEN && env.TELEGRAM_STARS_WEBHOOK_SECRET);
}

async function tg(env, method, body) {
  // Keep provider errors generic: fetch errors can contain the token-bearing URL.
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_STARS_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error();
    return data.result;
  } catch {
    throw new Error('telegram_api_unavailable');
  }
}

export async function createStarsOrder(env, request, { plan, priceUsd = plan.priceUsd, email, renewKey, visitor, growthAccount = null }) {
  const order = await insertOrder(env, {
    plan: plan.id,
    price_usd: priceUsd,
    method: 'stars',
    amount_units: Math.ceil(priceUsd * SETTINGS.starsPerUsd),
    email,
    renew_key: renewKey,
    visitor,
    growth_account: growthAccount,
  });
  let link;
  try {
    link = await tg(env, 'createInvoiceLink', {
      title: `${brand(env)} ${plan.name}`.slice(0, 32),
      description: `Unlocks ${plan.name} on ${new URL(siteUrl(env, request)).hostname}. Your license key arrives here and on the site.`.slice(0, 255),
      payload: order.id,
      currency: 'XTR',
      prices: [{ label: plan.name, amount: order.amount_units }],
    });
    if (typeof link !== 'string' || !link.startsWith('https://t.me/$')) throw new Error();
  } catch {
    await env.DB.prepare("UPDATE orders SET status = 'failed' WHERE id = ?").bind(order.id).run();
    await logEvent(env, 'stars.invoice_failed', order.id, null);
    throw new HttpError(502, 'payment_provider_unavailable');
  }
  await env.DB.prepare('UPDATE orders SET redirect_url = ? WHERE id = ?').bind(link, order.id).run();
  return { ...order, redirect_url: link };
}

function matches(order, payment) {
  return payment.currency === 'XTR' && payment.total_amount === order.amount_units;
}

async function sendMessage(env, chatId, text, orderId = null) {
  if (chatId == null) return;
  try {
    await tg(env, 'sendMessage', { chat_id: chatId, text });
  } catch {
    await logEvent(env, 'stars.message_failed', orderId, null);
  }
}

export async function handleStarsWebhook(request, env) {
  if (!starsEnabled(env)) return fail(404, 'not_enabled');
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!timingSafeEqual(secret, env.TELEGRAM_STARS_WEBHOOK_SECRET)) return fail(401, 'bad_secret');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 64_000) return fail(413, 'payload_too_large');
  let body;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch {
    return fail(400, 'invalid_json');
  }
  const site = siteUrl(env, request);

  if (body.pre_checkout_query) {
    const query = body.pre_checkout_query;
    let ok = false;
    try {
      const order = await getOrder(env, query.invoice_payload);
      ok = Boolean(order && order.method === 'stars' && ['pending', 'expired'].includes(order.status) && matches(order, query));
    } catch {
      // Still answer the query if the order lookup fails.
    }
    try {
      await tg(env, 'answerPreCheckoutQuery', {
        pre_checkout_query_id: query.id,
        ok,
        ...(!ok ? { error_message: 'This order cannot be paid. Please start a new checkout on the site.' } : {}),
      });
    } catch {
      await logEvent(env, 'stars.pre_checkout_failed', null, null);
    }
  } else if (body.message?.successful_payment) {
    const message = body.message;
    const payment = message.successful_payment;
    const order = await getOrder(env, payment.invoice_payload);
    if (!order || order.method !== 'stars' || !['pending', 'expired', 'paid'].includes(order.status)) return json({ ok: true });
    if (order.status === 'paid') return json({ ok: true });
    if (!matches(order, payment)) {
      await logEvent(env, 'stars.amount_mismatch', order.id, { currency: payment.currency, total_amount: payment.total_amount });
      await sendMessage(env, message.chat?.id, `Payment details do not match order ${order.id}. Please contact support at ${site}/help/.`, order.id);
      return json({ ok: true });
    }
    if (!payment.telegram_payment_charge_id) return json({ ok: true });
    const result = await fulfillOrder(env, order, {
      providerRef: payment.telegram_payment_charge_id,
      paidUnits: payment.total_amount,
    });
    // fulfillOrder atomically claims the order; concurrent deliveries get null.
    if (result) {
      const plan = getGrowthPlan(order.plan) || getPlan(order.plan);
      const text = result.growthUntil
        ? `${plan.name}\nGrowth is active until ${new Date(result.growthUntil).toISOString().slice(0, 10)}.\n${site}/growth/`
        : `${plan.name}${result.key ? `\nLicense key: ${result.key}` : ''}\nActivate on this device: ${site}/success/?order=${order.id}&t=${order.token}`;
      await sendMessage(env, message.chat?.id, text, order.id);
      await logEvent(env, 'stars.paid', order.id, { charge_id: payment.telegram_payment_charge_id });
    }
  } else if (typeof body.message?.text === 'string' && /^\/start(?:@\w+)?(?:\s|$)/.test(body.message.text)) {
    await sendMessage(env, body.message.chat?.id, `${brand(env)} analyzes your social media exports privately on your device. ${site}/#pricing`);
  }
  return json({ ok: true });
}

export async function ensureStarsWebhook(env) {
  if (!starsEnabled(env) || !env.SITE_URL) return;
  try {
    const url = `${siteUrl(env)}/api/webhook/telegram-stars`;
    const info = await tg(env, 'getWebhookInfo', {});
    if (info.url !== url) {
      await tg(env, 'setWebhook', {
        url,
        secret_token: env.TELEGRAM_STARS_WEBHOOK_SECRET,
        allowed_updates: ['message', 'pre_checkout_query'],
      });
    }
  } catch {
    await logEvent(env, 'stars.webhook_failed', null, null);
  }
}
