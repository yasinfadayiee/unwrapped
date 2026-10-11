// The schema is created automatically on first use, so a fresh D1 database
// needs no manual migration step.

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    plan TEXT NOT NULL,
    price_usd REAL NOT NULL,
    method TEXT NOT NULL,
    status TEXT NOT NULL,
    amount_units INTEGER,
    pay_address TEXT,
    paid_units INTEGER,
    email TEXT,
    renew_key TEXT,
    license_key TEXT,
    provider_ref TEXT,
    redirect_url TEXT,
    visitor TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    paid_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS orders_open ON orders (method, status, created_at)`,
  `CREATE INDEX IF NOT EXISTS orders_paid ON orders (status, paid_at)`,
  `CREATE TABLE IF NOT EXISTS licenses (
    key TEXT PRIMARY KEY,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    email TEXT,
    note TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    last_order_id TEXT,
    activations INTEGER NOT NULL DEFAULT 0,
    reminded_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS licenses_expiry ON licenses (status, expires_at)`,
  `CREATE TABLE IF NOT EXISTS tron_txs (
    txid TEXT PRIMARY KEY,
    order_id TEXT,
    from_addr TEXT,
    value_units INTEGER NOT NULL,
    block_ts INTEGER NOT NULL,
    seen_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    kind TEXT NOT NULL,
    ref TEXT,
    data TEXT
  )`,
];

const ready = new WeakMap();

export async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding "DB" is missing — check wrangler.jsonc');
  if (ready.get(env.DB)) return;
  await env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql)));
  ready.set(env.DB, true);
}

export async function logEvent(env, kind, ref, data) {
  try {
    await env.DB.prepare('INSERT INTO events (ts, kind, ref, data) VALUES (?, ?, ?, ?)')
      .bind(Date.now(), kind, ref ?? null, data === undefined ? null : JSON.stringify(data).slice(0, 4000))
      .run();
  } catch (err) {
    console.error('logEvent failed', err);
  }
}

export function getOrder(env, id) {
  return env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(String(id || '')).first();
}

export function getLicense(env, key) {
  return env.DB.prepare('SELECT * FROM licenses WHERE key = ?').bind(String(key || '')).first();
}

// Housekeeping that runs with the cron trigger.
export async function cleanup(env) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = 'expired' WHERE status = 'pending' AND expires_at < ?").bind(now),
    env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(now),
    env.DB.prepare('DELETE FROM events WHERE ts < ?').bind(now - 90 * 86_400_000),
  ]);
}
