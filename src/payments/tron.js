// Direct USDT (TRC20) payments to the owner's own wallet — no gateway, no
// middleman, no KYC. Every checkout gets a unique amount (a few cents below
// the list price), and the blockchain is watched through TronGrid for a
// transfer of exactly that amount. Buyers can also paste their transaction
// hash, which covers exchange fees and other edge cases automatically.

import { SETTINGS } from '../config.js';
import { getOrder } from '../db.js';
import { HttpError } from '../http.js';
import { fulfillOrder, insertOrder } from '../orders.js';
import { MINUTE, formatUsdt } from '../util.js';

// Official Tether USD (USDT) TRC20 contract on TRON mainnet.
export const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(str) {
  const bytes = [0];
  for (const ch of str) {
    let carry = B58.indexOf(ch);
    if (carry < 0) return null;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of str) {
    if (ch !== '1') break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

// Full Base58Check validation, so a typo in TRON_ADDRESS can never send
// customers' money to a wrong address.
export async function isValidTronAddress(address) {
  if (typeof address !== 'string' || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return false;
  const raw = base58Decode(address);
  if (!raw || raw.length !== 25 || raw[0] !== 0x41) return false;
  const payload = raw.slice(0, 21);
  const h1 = await crypto.subtle.digest('SHA-256', payload);
  const h2 = new Uint8Array(await crypto.subtle.digest('SHA-256', h1));
  return h2[0] === raw[21] && h2[1] === raw[22] && h2[2] === raw[23] && h2[3] === raw[24];
}

const validity = new Map();
export async function tronEnabled(env) {
  const address = (env.TRON_ADDRESS || '').trim();
  if (!address) return false;
  if (!validity.has(address)) validity.set(address, await isValidTronAddress(address));
  return validity.get(address);
}

const toleranceUnits = () => Math.round(SETTINGS.tronToleranceUsdt * 1e6);
const reserveWindow = () => (SETTINGS.orderTtlMinutes + SETTINGS.tronGraceMinutes) * MINUTE;

export async function allocateAmountUnits(env, priceUsd) {
  const { results } = await env.DB.prepare("SELECT amount_units FROM orders WHERE method = 'tron' AND created_at > ?")
    .bind(Date.now() - reserveWindow())
    .all();
  const taken = new Set(results.map((r) => r.amount_units));
  const base = Math.round(priceUsd * 1e6);
  const pick = (units) => units > base / 2 && !taken.has(units);

  // Prefer two decimals (every exchange supports them): price − 0.01 … 0.49.
  const cents = Array.from({ length: 49 }, (_, i) => base - (i + 1) * 10_000);
  for (let i = cents.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [cents[i], cents[j]] = [cents[j], cents[i]];
  }
  for (const units of cents) if (pick(units)) return units;
  // Very busy hour: fall back to three decimals.
  for (let i = 0; i < 500; i++) {
    const units = base - (1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 999)) * 1_000;
    if (pick(units)) return units;
  }
  throw new HttpError(503, 'busy_try_again');
}

export async function createTronOrder(env, { plan, priceUsd = plan.priceUsd, email, renewKey, visitor }) {
  const amountUnits = await allocateAmountUnits(env, priceUsd);
  return insertOrder(env, {
    plan: plan.id,
    price_usd: priceUsd,
    method: 'tron',
    amount_units: amountUnits,
    pay_address: env.TRON_ADDRESS.trim(),
    email,
    renew_key: renewKey,
    visitor,
  });
}

function tronHeaders(env) {
  const headers = { accept: 'application/json' };
  if (env.TRONGRID_API_KEY) headers['TRON-PRO-API-KEY'] = env.TRONGRID_API_KEY;
  return headers;
}

export async function fetchIncomingTransfers(env, minTimestamp) {
  const base = (env.TRONGRID_URL || 'https://api.trongrid.io').replace(/\/+$/, '');
  const contract = env.TRON_USDT_CONTRACT || USDT_CONTRACT;
  const address = env.TRON_ADDRESS.trim();
  const out = [];
  let fingerprint = null;
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({
      only_to: 'true',
      only_confirmed: 'true',
      limit: '200',
      contract_address: contract,
      min_timestamp: String(Math.max(0, Math.floor(minTimestamp))),
      order_by: 'block_timestamp,asc',
    });
    if (fingerprint) qs.set('fingerprint', fingerprint);
    const res = await fetch(`${base}/v1/accounts/${address}/transactions/trc20?${qs}`, {
      headers: tronHeaders(env),
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) throw new Error(`TronGrid responded ${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data.data) ? data.data : [];
    out.push(...rows);
    fingerprint = data.meta && data.meta.fingerprint;
    if (!fingerprint || rows.length < 200) break;
  }
  return out;
}

// Returns the transfer value in micro-USDT, or null when the row is not a
// USDT transfer into the configured wallet.
export function transferUnits(env, tr) {
  const contract = env.TRON_USDT_CONTRACT || USDT_CONTRACT;
  if (!tr || tr.type !== 'Transfer') return null;
  if (!tr.token_info || tr.token_info.address !== contract) return null;
  if (tr.to !== env.TRON_ADDRESS.trim()) return null;
  const decimals = Number(tr.token_info.decimals ?? 6);
  const raw = Number(tr.value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const units = Math.round(decimals === 6 ? raw : raw * 10 ** (6 - decimals));
  if (units < SETTINGS.tronDustUsdt * 1e6) return null;
  return units;
}

export function matchTransfer(openOrders, units, blockTs) {
  const grace = SETTINGS.tronGraceMinutes * MINUTE;
  const live = openOrders.filter(
    (o) => o.status !== 'paid' && blockTs >= o.created_at - 2 * MINUTE && blockTs <= o.expires_at + grace,
  );
  const exact = live.filter((o) => o.amount_units === units).sort((a, b) => a.created_at - b.created_at);
  if (exact.length) return exact[0];
  const tol = toleranceUnits();
  const near = live.filter((o) => units >= o.amount_units - tol && units <= o.amount_units * 3);
  return near.length === 1 ? near[0] : null;
}

async function knownTxids(env, txids) {
  const known = new Set();
  for (let i = 0; i < txids.length; i += 80) {
    const chunk = txids.slice(i, i + 80);
    const { results } = await env.DB.prepare(
      `SELECT txid FROM tron_txs WHERE txid IN (${chunk.map(() => '?').join(',')})`,
    )
      .bind(...chunk)
      .all();
    for (const r of results) known.add(r.txid);
  }
  return known;
}

// Records a transfer and binds it to an order. Returns false when the
// transfer already belongs to a different order.
async function attachTx(env, tr, units, orderId) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO tron_txs (txid, order_id, from_addr, value_units, block_ts, seen_at) VALUES (?, NULL, ?, ?, ?, ?)',
  )
    .bind(tr.transaction_id, tr.from || null, units, tr.block_timestamp || 0, Date.now())
    .run();
  if (!orderId) return true;
  const res = await env.DB.prepare('UPDATE tron_txs SET order_id = ? WHERE txid = ? AND order_id IS NULL')
    .bind(orderId, tr.transaction_id)
    .run();
  return Boolean(res.meta && res.meta.changes);
}

const lastCheck = new WeakMap();

export async function checkTronPayments(env, { minIntervalMs = 0 } = {}) {
  if (!(await tronEnabled(env))) return { skipped: 'not_configured' };
  const now = Date.now();
  if (minIntervalMs && now - (lastCheck.get(env.DB) || 0) < minIntervalMs) return { skipped: 'throttled' };
  lastCheck.set(env.DB, now);

  const { results: open } = await env.DB.prepare(
    "SELECT * FROM orders WHERE method = 'tron' AND status IN ('pending', 'expired') AND created_at > ?",
  )
    .bind(now - reserveWindow())
    .all();
  if (!open.length) return { open: 0, transfers: 0, matched: 0 };

  const since = Math.min(...open.map((o) => o.created_at)) - 2 * MINUTE;
  const transfers = await fetchIncomingTransfers(env, since);
  const known = await knownTxids(
    env,
    transfers.map((t) => t.transaction_id),
  );

  let matched = 0;
  for (const tr of transfers) {
    if (!tr.transaction_id || known.has(tr.transaction_id)) continue;
    const units = transferUnits(env, tr);
    if (units === null) continue;
    const order = matchTransfer(open, units, tr.block_timestamp);
    const bound = await attachTx(env, tr, units, order ? order.id : null);
    if (order && bound) {
      await fulfillOrder(env, order, { providerRef: tr.transaction_id, paidUnits: units });
      order.status = 'paid';
      matched++;
    }
  }
  return { open: open.length, transfers: transfers.length, matched };
}

// "I already paid" — the buyer pastes a transaction hash. Several transfers
// can be added to one order, so a buyer who sent too little can top up.
export async function claimTronTx(env, order, rawTxid) {
  const txid = String(rawTxid || '')
    .trim()
    .toLowerCase()
    .replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(txid)) return { ok: false, reason: 'invalid_txid' };
  if (order.status === 'paid') return { ok: true, status: 'paid' };

  // Let automatic matching run first so exact payments reach their owner.
  await checkTronPayments(env);
  const current = await getOrder(env, order.id);
  if (current.status === 'paid') return { ok: true, status: 'paid' };

  const prior = await env.DB.prepare('SELECT order_id FROM tron_txs WHERE txid = ?').bind(txid).first();
  if (prior && prior.order_id && prior.order_id !== order.id) return { ok: false, reason: 'already_used' };

  const transfers = await fetchIncomingTransfers(env, current.created_at - 2 * MINUTE);
  const tr = transfers.find((t) => t.transaction_id === txid);
  if (!tr) return { ok: false, reason: 'not_found' };
  const units = transferUnits(env, tr);
  if (units === null) return { ok: false, reason: 'not_usdt' };

  if (!prior || !prior.order_id) {
    const bound = await attachTx(env, tr, units, current.id);
    if (!bound) return { ok: false, reason: 'already_used' };
  }

  const sum = await env.DB.prepare('SELECT COALESCE(SUM(value_units), 0) AS total FROM tron_txs WHERE order_id = ?')
    .bind(current.id)
    .first();
  const total = Number(sum.total);
  if (total >= current.amount_units - toleranceUnits()) {
    await fulfillOrder(env, current, { providerRef: txid, paidUnits: total });
    return { ok: true, status: 'paid' };
  }
  await env.DB.prepare('UPDATE orders SET paid_units = ? WHERE id = ?').bind(total, current.id).run();
  return {
    ok: false,
    reason: 'underpaid',
    received: formatUsdt(total),
    required: formatUsdt(current.amount_units),
    remaining: formatUsdt(current.amount_units - total),
  };
}
