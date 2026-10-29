// Card payment through the owner's own payment link (Wise / PayPal), confirmed
// by hand. Bridges the gap until an automatic card processor is approved.
// The buyer pays the order's price on the link with the order reference in the
// note, then taps "I've paid"; the owner is told by e-mail (and Telegram when
// linked), checks the payment and unlocks it from /admin/ or by replying
// "paid" to the Telegram message. The license then goes out by e-mail.

import { brand, siteUrl } from '../config.js';
import { logEvent } from '../db.js';
import { HttpError } from '../http.js';
import { insertOrder } from '../orders.js';
import { emailEnabled, layout, send } from '../email.js';
import { escapeHtml } from '../util.js';
import { notifyOwner } from './stars.js';

const HOSTS = /^(?:[a-z0-9-]+\.)*(?:wise\.com|paypal\.me|paypal\.com)$/i;
// Hand confirmation can take a while; keep the order open for three days.
const TTL_MS = 3 * 86_400_000;

export function manualPayUrl(env) {
  try {
    const url = new URL(String(env.MANUAL_PAY_URL || '').trim());
    return url.protocol === 'https:' && HOSTS.test(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

export const manualEnabled = (env) => Boolean(manualPayUrl(env));

// "UW-" + the first 6 characters of the order id, typed into the payment note.
export const manualRef = (order) => `UW-${String(order.id).slice(0, 6).toUpperCase()}`;

export async function createManualOrder(env, { plan, priceUsd = plan.priceUsd, email, renewKey, visitor, growthAccount = null }) {
  // The key can only reach the buyer by e-mail.
  if (!email) throw new HttpError(400, 'email_required');
  return insertOrder(env, {
    plan: plan.id,
    price_usd: priceUsd,
    method: 'manual',
    email,
    renew_key: renewKey,
    visitor,
    growth_account: growthAccount,
    expires_at: Date.now() + TTL_MS,
  });
}

// Buyer says they paid: tell the owner once, and keep the order open while it is checked.
export async function claimManualPayment(env, order) {
  if (order.status === 'paid') return { ok: true, already: true };
  if (order.provider_ref === 'claimed') return { ok: true, claimed: true };
  await env.DB.prepare("UPDATE orders SET provider_ref = 'claimed', status = 'pending', expires_at = MAX(expires_at, ?) WHERE id = ? AND status != 'paid'")
    .bind(Date.now() + TTL_MS, order.id)
    .run();
  await logEvent(env, 'manual.claimed', order.id, { plan: order.plan, usd: order.price_usd });
  const site = siteUrl(env);
  const ref = manualRef(order);
  const facts = `Plan: ${order.plan}\nAmount: $${order.price_usd}\nBuyer: ${order.email}\nReference: ${ref}`;
  await Promise.allSettled([
    notifyOwner(env, `💳 Card payment to check #O${order.id}\n${facts}\n\nCheck Wise/PayPal for $${order.price_usd} with note ${ref}. Reply "paid" to this message to unlock it and e-mail the key.`),
    emailEnabled(env)
      ? send(env, {
          to: env.SUPPORT_EMAIL || 'support@myunwrapped.com',
          replyTo: order.email,
          subject: `💳 Check payment ${ref}: $${order.price_usd} (${order.plan})`,
          text: `A buyer says they paid by card.\n\n${facts}\nOrder: ${order.id}\n\nWhen the money is in your Wise/PayPal, open ${site}/admin/ → Orders → "Mark paid" on order ${order.id}. The license key is then e-mailed to the buyer automatically.`,
          html: layout(env, `Check payment ${escapeHtml(ref)}`, `<p style="color:#b9b9c6;line-height:1.6;white-space:pre-wrap">${escapeHtml(facts)}\nOrder: ${escapeHtml(order.id)}</p><p style="color:#b9b9c6;line-height:1.6">When the money is in your Wise/PayPal, open <a href="${site}/admin/" style="color:#a78bfa">the admin panel</a> → Orders → “Mark paid”. The key is then e-mailed to the buyer automatically.</p>`, `${escapeHtml(brand(env))} manual card payments.`),
        })
      : Promise.resolve(),
  ]);
  return { ok: true, claimed: true };
}
