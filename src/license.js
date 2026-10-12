import { SETTINGS, dailyValue, tierOf, tierRank } from './config.js';
import { getLicense } from './db.js';
import { DAY, b64url, sha256Hex, newLicenseKey, normalizeLicenseKey } from './util.js';

// Licenses are proven to the browser with ECDSA P-256 signed tokens. The key
// pair is generated on first use and kept in the D1 `meta` table, so there is
// nothing to configure. Browsers verify tokens with the public half, which
// means a token can't be forged by editing localStorage.

const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };
const keyCache = new WeakMap();
const enc = new TextEncoder();

export async function getSigningKeys(env) {
  const cached = keyCache.get(env.DB);
  if (cached) return cached;

  const read = () => env.DB.prepare("SELECT v FROM meta WHERE k = 'signing_jwk'").first();
  let row = await read();
  if (!row) {
    const pair = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    // INSERT OR IGNORE + re-read keeps concurrent first requests consistent.
    await env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('signing_jwk', ?)").bind(JSON.stringify(jwk)).run();
    row = await read();
  }
  const jwk = JSON.parse(row.v);
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d },
    ALG,
    false,
    ['sign'],
  );
  const keys = { privateKey, publicJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } };
  keyCache.set(env.DB, keys);
  return keys;
}

// The tier this license keeps forever, if any: its own plan when it is
// lifetime, or the lifetime plan it falls back to after higher-tier time.
export function lifetimeTier(license) {
  if (!license.expires_at) return tierOf(license.plan);
  return license.base_plan ? tierOf(license.base_plan) : null;
}

export async function issueToken(env, license) {
  const { privateKey } = await getSigningKeys(env);
  const iat = Date.now();
  const cap = iat + (license.expires_at ? SETTINGS.tokenTtlDays : 30) * DAY;
  const payload = {
    v: 1,
    k: (await sha256Hex(license.key)).slice(0, 16),
    p: license.plan,
    t: tierOf(license.plan),
    lt: lifetimeTier(license),
    e: license.expires_at ?? null,
    iat,
    x: license.expires_at ? Math.min(license.expires_at, cap) : cap,
  };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign(SIGN, privateKey, enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export function licenseView(license) {
  return {
    key: license.key,
    plan: license.plan,
    tier: tierOf(license.plan),
    lifetimeTier: lifetimeTier(license),
    status: license.status,
    expiresAt: license.expires_at ?? null,
    lifetime: !license.expires_at,
  };
}

export async function activateLicense(env, rawKey, { count = true } = {}) {
  const key = normalizeLicenseKey(rawKey);
  if (!key) return { ok: false, reason: 'missing_key' };
  let license = await getLicense(env, key);
  if (!license) return { ok: false, reason: 'not_found' };
  if (license.status !== 'active') return { ok: false, reason: 'revoked' };
  if (license.base_plan && license.expires_at && license.expires_at < Date.now()) {
    // Higher-tier time ran out before the cron got to it.
    await env.DB.prepare('UPDATE licenses SET plan = base_plan, expires_at = NULL, base_plan = NULL, reminded_at = NULL WHERE key = ?').bind(key).run();
    license = await getLicense(env, key);
  }
  if (license.expires_at && license.expires_at < Date.now()) {
    return { ok: false, reason: 'expired', license: licenseView(license) };
  }
  if (count) {
    await env.DB.prepare('UPDATE licenses SET activations = activations + 1 WHERE key = ?').bind(key).run();
  }
  return { ok: true, license: licenseView(license), token: await issueToken(env, license) };
}

// Time left on a license, re-valued for another tier: 100 days of Plus become
// fewer days of Pro (and more days on a downgrade), so nothing paid is lost.
export function carriedMs(current, toTier, now = Date.now()) {
  const remaining = Math.max(0, (current.expires_at || 0) - now);
  const from = tierOf(current.plan);
  if (from === toTier || !dailyValue(from) || !dailyValue(toTier)) return remaining;
  return Math.round((remaining * dailyValue(from)) / dailyValue(toTier));
}

// Creates a license, or extends/upgrades `renewKey` when it is still active.
export async function grantLicense(env, { plan, days, email, orderId, renewKey, note }) {
  const now = Date.now();
  const tier = tierOf(plan);
  if (renewKey) {
    const current = await getLicense(env, normalizeLicenseKey(renewKey));
    const keeps = current ? lifetimeTier(current) : null;
    const upgradesLifetime = keeps && days && tierRank(tier) > tierRank(keeps);
    if (current && current.status === 'active' && (current.expires_at || upgradesLifetime)) {
      let expiresAt = null;
      let basePlan = current.base_plan ?? null;
      if (!current.expires_at) {
        // Lifetime license buying time on a higher tier: it runs on top and
        // then falls back to the lifetime plan.
        basePlan = current.plan;
        expiresAt = now + days * DAY;
      } else if (days) {
        expiresAt = now + carriedMs(current, tier, now) + days * DAY;
      } else {
        basePlan = null; // bought lifetime
      }
      await env.DB.prepare(
        'UPDATE licenses SET plan = ?, expires_at = ?, base_plan = ?, last_order_id = ?, reminded_at = NULL, email = COALESCE(email, ?) WHERE key = ?',
      )
        .bind(plan, expiresAt, basePlan, orderId ?? null, email ?? null, current.key)
        .run();
      return { ...current, plan, expires_at: expiresAt, base_plan: basePlan, last_order_id: orderId ?? null };
    }
  }
  const license = {
    key: newLicenseKey(SETTINGS.licensePrefix),
    plan,
    status: 'active',
    email: email ?? null,
    note: note ?? null,
    created_at: now,
    expires_at: days ? now + days * DAY : null,
    last_order_id: orderId ?? null,
  };
  await env.DB.prepare(
    'INSERT INTO licenses (key, plan, status, email, note, created_at, expires_at, last_order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(license.key, plan, 'active', license.email, license.note, now, license.expires_at, license.last_order_id)
    .run();
  return license;
}
