// Referral program. Every active license can get a short invite code.
// A buyer using the code gets SETTINGS.referralDiscount off; when that order
// is paid, the inviter's license gains SETTINGS.referralRewardDays.

import { SETTINGS } from './config.js';
import { getLicense, logEvent } from './db.js';
import { DAY, normalizeLicenseKey, randomId } from './util.js';

export function normalizeRefCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 12);
}

export async function getReferralForLicense(env, rawKey) {
  const key = normalizeLicenseKey(rawKey);
  const license = await getLicense(env, key);
  if (!license || license.status !== 'active') return { ok: false, reason: 'not_found' };
  if (license.expires_at && license.expires_at < Date.now()) return { ok: false, reason: 'expired' };

  let row = await env.DB.prepare('SELECT * FROM referrals WHERE license_key = ?').bind(key).first();
  if (!row) {
    for (let i = 0; i < 5 && !row; i++) {
      await env.DB.prepare('INSERT OR IGNORE INTO referrals (code, license_key, created_at) VALUES (?, ?, ?)')
        .bind(randomId(7), key, Date.now())
        .run();
      row = await env.DB.prepare('SELECT * FROM referrals WHERE license_key = ?').bind(key).first();
    }
  }
  return {
    ok: true,
    code: row.code,
    uses: row.uses,
    earnedDays: row.earned_days,
    discount: SETTINGS.referralDiscount,
    rewardDays: SETTINGS.referralRewardDays,
  };
}

// Returns the referral row if `code` is usable for this checkout.
export async function validReferral(env, rawCode, renewKey) {
  const code = normalizeRefCode(rawCode);
  if (!code) return null;
  const row = await env.DB.prepare('SELECT * FROM referrals WHERE code = ?').bind(code).first();
  if (!row) return null;
  if (renewKey && row.license_key === renewKey) return null; // no self-referrals
  const license = await getLicense(env, row.license_key);
  if (!license || license.status !== 'active') return null;
  return row;
}

export function discounted(price) {
  return Math.round(price * (1 - SETTINGS.referralDiscount) * 100) / 100;
}

export async function attachReferral(env, orderId, code) {
  await env.DB.prepare('INSERT OR IGNORE INTO order_refs (order_id, code) VALUES (?, ?)').bind(orderId, code).run();
}

// Called once, after an order flips to paid.
export async function creditReferral(env, order, buyerLicenseKey) {
  const ref = await env.DB.prepare('SELECT * FROM order_refs WHERE order_id = ? AND credited = 0').bind(order.id).first();
  if (!ref) return null;
  const flipped = await env.DB.prepare('UPDATE order_refs SET credited = 1 WHERE order_id = ? AND credited = 0').bind(order.id).run();
  if (!flipped.meta || !flipped.meta.changes) return null;
  const row = await env.DB.prepare('SELECT * FROM referrals WHERE code = ?').bind(ref.code).first();
  if (!row || row.license_key === buyerLicenseKey) return null;
  const inviter = await getLicense(env, row.license_key);
  if (!inviter || inviter.status !== 'active') return null;

  const days = SETTINGS.referralRewardDays;
  const now = Date.now();
  let credited = 0;
  if (inviter.expires_at) {
    const base = Math.max(now, inviter.expires_at);
    await env.DB.prepare('UPDATE licenses SET expires_at = ?, reminded_at = NULL WHERE key = ?').bind(base + days * DAY, inviter.key).run();
    credited = days;
  }
  await env.DB.prepare('UPDATE referrals SET uses = uses + 1, earned_days = earned_days + ? WHERE code = ?').bind(credited, row.code).run();
  await logEvent(env, 'referral.credited', row.code, { order: order.id, days: credited });
  return { code: row.code, days: credited };
}
