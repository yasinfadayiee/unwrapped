import { SETTINGS, getGrowthPlan, getPlan } from './config.js';
import { getOrder, getLicense, logEvent } from './db.js';
import { grantLicense, issueToken, licenseView } from './license.js';
import { sendLicenseEmail } from './email.js';
import { creditReferral } from './referrals.js';
import { fulfillGrowthOrder } from './growth/billing.js';
import { MINUTE, randomId, formatUsdt, timingSafeEqual } from './util.js';

export async function insertOrder(env, fields) {
  const now = Date.now();
  const order = {
    id: randomId(14),
    token: randomId(24),
    status: 'pending',
    created_at: now,
    expires_at: now + SETTINGS.orderTtlMinutes * MINUTE,
    amount_units: null,
    pay_address: null,
    email: null,
    renew_key: null,
    visitor: null,
    ...fields,
  };
  await env.DB.prepare(
    `INSERT INTO orders (id, token, plan, price_usd, method, status, amount_units, pay_address, email, renew_key, visitor, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      order.id,
      order.token,
      order.plan,
      order.price_usd,
      order.method,
      order.status,
      order.amount_units,
      order.pay_address,
      order.email,
      order.renew_key,
      order.visitor,
      order.created_at,
      order.expires_at,
    )
    .run();
  return order;
}

// Marks an order paid and grants (or extends) its license. Safe to call more
// than once: only the first call that flips the status does any work.
export async function fulfillOrder(env, order, { providerRef = null, paidUnits = null } = {}) {
  const now = Date.now();
  const flipped = await env.DB.prepare(
    `UPDATE orders SET status = 'paid', paid_at = ?, provider_ref = COALESCE(?, provider_ref), paid_units = COALESCE(?, paid_units)
     WHERE id = ? AND status IN ('pending', 'expired')`,
  )
    .bind(now, providerRef, paidUnits, order.id)
    .run();
  if (!flipped.meta || !flipped.meta.changes) return null;

  const growth = getGrowthPlan(order.plan);
  if (growth) {
    const paidUntil = await fulfillGrowthOrder(env, order, growth);
    await logEvent(env, 'order.paid', order.id, { method: order.method, plan: order.plan, providerRef, paidUntil });
    return { growth: true, paidUntil };
  }

  const plan = getPlan(order.plan);
  const license = await grantLicense(env, {
    plan: order.plan,
    days: plan ? plan.days : 30,
    email: order.email,
    orderId: order.id,
    renewKey: order.renew_key,
  });
  await env.DB.prepare('UPDATE orders SET license_key = ? WHERE id = ?').bind(license.key, order.id).run();
  await logEvent(env, 'order.paid', order.id, { method: order.method, plan: order.plan, providerRef });
  try {
    await creditReferral(env, order, license.key);
  } catch (err) {
    console.error('referral credit failed', err);
  }

  if (order.email) {
    try {
      await sendLicenseEmail(env, { to: order.email, license, plan });
    } catch (err) {
      console.error('license email failed', err);
    }
  }
  return license;
}

// What the buyer's browser is allowed to see about an order.
export async function publicOrder(env, order) {
  const view = {
    id: order.id,
    status: order.status,
    plan: order.plan,
    method: order.method,
    priceUsd: order.price_usd,
    createdAt: order.created_at,
    expiresAt: order.expires_at,
    paidAt: order.paid_at ?? null,
  };
  if (order.method === 'tron') {
    view.address = order.pay_address;
    view.amount = formatUsdt(order.amount_units);
    view.amountUnits = order.amount_units;
    view.asset = 'USDT';
    view.network = 'TRON (TRC20)';
    if (order.paid_units) view.paid = formatUsdt(order.paid_units);
  }
  if (order.redirect_url) view.redirectUrl = order.redirect_url;
  if (order.status === 'paid' && order.license_key) {
    const license = await getLicense(env, order.license_key);
    if (license) {
      view.license = licenseView(license);
      if (license.status === 'active' && (!license.expires_at || license.expires_at > Date.now())) {
        view.token = await issueToken(env, license);
      }
    }
  }
  return view;
}

export async function getOrderForBuyer(env, id, token) {
  const order = await getOrder(env, id);
  if (!order || !token || !timingSafeEqual(order.token, token)) return null;
  return order;
}
