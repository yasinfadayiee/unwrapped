// Paying for Growth: a paid order adds its days to one Instagram account.
// Paid time is kept in growth_paid so it survives disconnecting and
// reconnecting; growth_accounts.paid_until mirrors it for quick access checks.

import { logEvent } from '../db.js';
import { DAY } from '../util.js';
import { ensureGrowthSchema } from './schema.js';

export async function fulfillGrowthOrder(env, order, plan, now = Date.now()) {
  await ensureGrowthSchema(env);
  const link = await env.DB.prepare('SELECT account_id FROM growth_orders WHERE order_id = ?').bind(order.id).first();
  if (!link) {
    await logEvent(env, 'growth.order_orphan', order.id, { plan: plan.id });
    return null;
  }
  const current = await env.DB.prepare('SELECT paid_until FROM growth_paid WHERE account_id = ?').bind(link.account_id).first();
  // Renewing early adds on top of the time left; after a lapse it starts today.
  const paidUntil = Math.max(now, current?.paid_until || 0) + plan.days * DAY;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO growth_paid (account_id, paid_until) VALUES (?, ?) ON CONFLICT(account_id) DO UPDATE SET paid_until = excluded.paid_until').bind(link.account_id, paidUntil),
    env.DB.prepare('UPDATE growth_accounts SET paid_until = ? WHERE id = ?').bind(paidUntil, link.account_id),
  ]);
  await logEvent(env, 'growth.paid', link.account_id, { order: order.id, plan: plan.id, paidUntil });
  return paidUntil;
}
