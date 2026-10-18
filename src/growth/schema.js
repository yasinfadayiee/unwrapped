// Unwrapped Growth tables. Kept apart from the routes so payment code can
// make sure they exist without importing the whole Growth module.

export const GROWTH_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS growth_accounts (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    ext_id TEXT NOT NULL,
    username TEXT,
    token_enc TEXT NOT NULL,
    token_expires INTEGER,
    token_refreshed INTEGER,
    session TEXT NOT NULL,
    paid_until INTEGER,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS growth_accounts_session ON growth_accounts (session)',
  // One trial per platform account, forever — survives disconnecting.
  'CREATE TABLE IF NOT EXISTS growth_trials (account_id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0)',
  `CREATE TABLE IF NOT EXISTS growth_rules (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    keyword TEXT NOT NULL,
    dm_text TEXT NOT NULL,
    public_reply TEXT,
    media_id TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,
  // Every comment handled once (Meta may deliver a webhook twice).
  'CREATE TABLE IF NOT EXISTS growth_sent (account_id TEXT NOT NULL, comment_id TEXT NOT NULL, rule_id TEXT, ts INTEGER NOT NULL, ok INTEGER NOT NULL, PRIMARY KEY (account_id, comment_id))',
  'CREATE TABLE IF NOT EXISTS growth_states (state TEXT PRIMARY KEY, session TEXT NOT NULL, created_at INTEGER NOT NULL)',
  // Paid time per platform account, kept after disconnecting (like trials).
  'CREATE TABLE IF NOT EXISTS growth_paid (account_id TEXT PRIMARY KEY, paid_until INTEGER NOT NULL)',
  // Which account a Growth checkout pays for.
  'CREATE TABLE IF NOT EXISTS growth_orders (order_id TEXT PRIMARY KEY, account_id TEXT NOT NULL)',
];

const ready = new WeakMap();
export async function ensureGrowthSchema(env) {
  if (ready.get(env.DB)) return;
  await env.DB.batch(GROWTH_SCHEMA.map((sql) => env.DB.prepare(sql)));
  ready.set(env.DB, true);
}
