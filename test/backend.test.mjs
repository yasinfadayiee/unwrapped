import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { D1Shim } from '../server/d1-shim.js';
import { isValidTronAddress, USDT_CONTRACT } from '../src/payments/tron.js';
import { signIpnBody } from '../src/payments/nowpayments.js';
import { b64urlDecode } from '../src/util.js';

const WALLET = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
let env;
let pending;
let chain; // fake TRON transfers
let npPayments; // fake NOWPayments payment records
const realFetch = globalThis.fetch;

beforeEach(() => {
  env = {
    DB: new D1Shim(':memory:'),
    ASSETS: { fetch: async () => new Response('static') },
    SITE_URL: 'https://shop.test',
    TRON_ADDRESS: WALLET,
    NOWPAYMENTS_API_KEY: 'np-key',
    NOWPAYMENTS_IPN_SECRET: 'ipn-secret',
    ADMIN_TOKEN: 'admin-token-123456',
  };
  pending = [];
  chain = [];
  npPayments = {};
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.hostname === 'api.trongrid.io') {
      const min = Number(url.searchParams.get('min_timestamp') || 0);
      return Response.json({ data: chain.filter((t) => t.block_timestamp >= min), success: true, meta: {} });
    }
    if (url.hostname === 'api.nowpayments.io' && url.pathname === '/v1/invoice') {
      const body = JSON.parse(init.body);
      return Response.json({ id: `inv_${body.order_id}`, invoice_url: `https://nowpayments.io/payment/?iid=${body.order_id}` }, { status: 201 });
    }
    if (url.hostname === 'api.nowpayments.io' && url.pathname.startsWith('/v1/payment/')) {
      const p = npPayments[url.pathname.split('/').pop()];
      return p ? Response.json(p) : new Response('nope', { status: 404 });
    }
    return realFetch(input, init);
  };
});

const ctx = () => ({ waitUntil: (p) => pending.push(p), passThroughOnException() {} });

async function call(method, path, body, headers = {}) {
  const res = await worker.fetch(
    new Request(`https://shop.test${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
    ctx(),
  );
  await Promise.all(pending.splice(0));
  return { status: res.status, body: await res.json() };
}

function transfer(units, { to = WALLET, ts = Date.now(), txid } = {}) {
  const tx = {
    transaction_id: txid || [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join(''),
    token_info: { symbol: 'USDT', address: USDT_CONTRACT, decimals: 6, name: 'Tether USD' },
    block_timestamp: ts,
    from: 'TXyzSenderAddress000000000000000000',
    to,
    type: 'Transfer',
    value: String(units),
  };
  chain.push(tx);
  return tx;
}

async function verifyToken(token, publicKey) {
  const [body, sig] = token.split('.');
  const key = await crypto.subtle.importKey('jwk', publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlDecode(sig), new TextEncoder().encode(body));
  return ok ? JSON.parse(new TextDecoder().decode(b64urlDecode(body))) : null;
}

test('TRON addresses are validated with their checksum', async () => {
  assert.equal(await isValidTronAddress(WALLET), true);
  assert.equal(await isValidTronAddress(USDT_CONTRACT), true);
  assert.equal(await isValidTronAddress('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwc'), false);
  assert.equal(await isValidTronAddress('0x1234'), false);
});

test('config exposes plans, enabled methods and a public key', async () => {
  const { body } = await call('GET', '/api/config');
  assert.equal(body.ok, true);
  assert.deepEqual(body.methods.map((m) => m.id), ['tron', 'nowpayments']);
  assert.equal(body.publicKey.kty, 'EC');
  assert.equal(body.publicKey.d, undefined, 'private part must never leak');
  env.TRON_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwc';
  const again = await call('GET', '/api/config');
  assert.deepEqual(again.body.methods.map((m) => m.id), ['nowpayments']);
});

test('TRON checkout gets unique amounts just below the price', async () => {
  const amounts = new Set();
  for (let i = 0; i < 8; i++) {
    const { body } = await call('POST', '/api/checkout', { plan: 'month', method: 'tron' }, { 'cf-connecting-ip': `198.51.100.${i}` });
    assert.equal(body.ok, true);
    assert.equal(body.order.plan, 'pro-month', 'legacy plan ids buy today’s Pro plans');
    const units = body.order.amountUnits;
    assert.ok(units < 9_000_000 && units >= 8_510_000, `amount ${units}`);
    amounts.add(units);
  }
  assert.equal(amounts.size, 8);
});

test('an exact TRON transfer activates the order automatically', async () => {
  const { body: co } = await call('POST', '/api/checkout', { plan: 'year', method: 'tron', email: 'Buyer@Example.com' });
  const { id } = co.order;
  let status = await call('GET', `/api/order?id=${id}&t=${co.token}`);
  assert.equal(status.body.order.status, 'pending');
  assert.equal(status.body.order.address, WALLET);

  transfer(co.order.amountUnits);
  transfer(co.order.amountUnits, { to: 'TSomeoneElse0000000000000000000000' }); // ignored: not our wallet
  await worker.scheduled({ cron: '* * * * *' }, env, ctx());
  await Promise.all(pending.splice(0));

  status = await call('GET', `/api/order?id=${id}&t=${co.token}`);
  assert.equal(status.body.order.status, 'paid');
  assert.match(status.body.order.license.key, /^UNW-[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
  const { body: config } = await call('GET', '/api/config');
  const payload = await verifyToken(status.body.order.token, config.publicKey);
  assert.equal(payload.p, 'pro-year');
  assert.equal(payload.t, 'pro');
  assert.equal(payload.lt, null);
  assert.ok(payload.e > Date.now() + 360 * 86_400_000);

  // A wrong token reveals nothing.
  const wrong = await call('GET', `/api/order?id=${id}&t=nope`);
  assert.equal(wrong.status, 404);
});

test('exchange fee deductions are tolerated when unambiguous', async () => {
  const { body: co } = await call('POST', '/api/checkout', { plan: 'month', method: 'tron' });
  transfer(co.order.amountUnits - 1_000_000); // exchange kept 1 USDT
  await worker.scheduled({ cron: '* * * * *' }, env, ctx());
  await Promise.all(pending.splice(0));
  const status = await call('GET', `/api/order?id=${co.order.id}&t=${co.token}`);
  assert.equal(status.body.order.status, 'paid');
});

test('claiming by hash supports top-ups and blocks reuse', async () => {
  const a = (await call('POST', '/api/checkout', { plan: 'year', method: 'tron' })).body;
  const b = (await call('POST', '/api/checkout', { plan: 'year', method: 'tron' })).body;
  const short = transfer(a.order.amountUnits - 10_000_000); // 10 USDT short: no auto-match
  await worker.scheduled({ cron: '* * * * *' }, env, ctx());
  await Promise.all(pending.splice(0));

  let res = await call('POST', '/api/order/claim', { id: a.order.id, t: a.token, txid: short.transaction_id });
  assert.equal(res.body.reason, 'underpaid');
  assert.equal(res.body.remaining, '10.00');

  const reuse = await call('POST', '/api/order/claim', { id: b.order.id, t: b.token, txid: short.transaction_id });
  assert.equal(reuse.body.reason, 'already_used');

  const topUp = transfer(10_000_000);
  res = await call('POST', '/api/order/claim', { id: a.order.id, t: a.token, txid: topUp.transaction_id });
  assert.equal(res.body.ok, true);
  assert.equal(res.body.order.status, 'paid');

  const bad = await call('POST', '/api/order/claim', { id: b.order.id, t: b.token, txid: 'xyz' });
  assert.equal(bad.body.reason, 'invalid_txid');
});

test('NOWPayments IPN is verified, double-checked and idempotent', async () => {
  const { body: co } = await call('POST', '/api/checkout', { plan: 'life', method: 'nowpayments' });
  assert.match(co.order.redirectUrl, /^https:\/\/nowpayments\.io\/payment/);
  const ipn = {
    payment_id: 5551,
    payment_status: 'finished',
    price_amount: 99,
    price_currency: 'usd',
    pay_amount: 0.0009,
    actually_paid: 0.0009,
    pay_currency: 'btc',
    order_id: co.order.id,
    fee: { currency: 'btc', depositFee: 0, withdrawalFee: 0, serviceFee: 0 },
  };
  npPayments['5551'] = { ...ipn };

  // A bad signature for a payment the API doesn't know is rejected outright.
  const forged = await call('POST', '/api/webhook/nowpayments', { ...ipn, payment_id: 9999 }, { 'x-nowpayments-sig': 'deadbeef' });
  assert.equal(forged.status, 401);
  // A forged body can't lie about the price: unsigned IPNs use only the API's data.
  npPayments['5552'] = { ...ipn, payment_id: 5552, payment_status: 'waiting' };
  const lying = await call('POST', '/api/webhook/nowpayments', { ...ipn, payment_id: 5552 }, { 'x-nowpayments-sig': 'deadbeef' });
  assert.equal(lying.body.waiting, 'waiting');

  const sig = await signIpnBody(env.NOWPAYMENTS_IPN_SECRET, ipn);
  const ok = await call('POST', '/api/webhook/nowpayments', JSON.stringify(ipn), { 'x-nowpayments-sig': sig });
  assert.equal(ok.body.fulfilled, true);
  const again = await call('POST', '/api/webhook/nowpayments', JSON.stringify(ipn), { 'x-nowpayments-sig': sig });
  assert.equal(again.body.already, true);

  const status = await call('GET', `/api/order?id=${co.order.id}&t=${co.token}`);
  assert.equal(status.body.order.status, 'paid');
  assert.equal(status.body.order.license.lifetime, true);
});

test('NOWPayments orders finish from the cron when the final IPN never arrives', async () => {
  const { body: co } = await call('POST', '/api/checkout', { plan: 'life', method: 'nowpayments' });
  const ipn = { payment_id: 6661, payment_status: 'confirming', price_amount: 99, price_currency: 'usd', order_id: co.order.id };
  npPayments['6661'] = { ...ipn };
  const sig = await signIpnBody(env.NOWPAYMENTS_IPN_SECRET, ipn);
  const first = await call('POST', '/api/webhook/nowpayments', JSON.stringify(ipn), { 'x-nowpayments-sig': sig });
  assert.equal(first.body.waiting, 'confirming');

  npPayments['6661'].payment_status = 'finished'; // ...and the "finished" IPN is lost
  await worker.scheduled({ cron: '* * * * *' }, env, ctx());
  await Promise.all(pending.splice(0));
  const status = await call('GET', `/api/order?id=${co.order.id}&t=${co.token}`);
  assert.equal(status.body.order.status, 'paid');
});

test('NOWPayments price mismatches and unfinished payments do not activate', async () => {
  const { body: co } = await call('POST', '/api/checkout', { plan: 'month', method: 'nowpayments' });
  const base = { payment_id: 77, price_currency: 'usd', order_id: co.order.id };
  for (const ipn of [
    { ...base, payment_status: 'finished', price_amount: 1 },
    { ...base, payment_status: 'waiting', price_amount: 9 },
    { ...base, payment_status: 'partially_paid', price_amount: 9, actually_paid_at_fiat: 3 },
  ]) {
    const sig = await signIpnBody(env.NOWPAYMENTS_IPN_SECRET, ipn);
    await call('POST', '/api/webhook/nowpayments', JSON.stringify(ipn), { 'x-nowpayments-sig': sig });
  }
  const status = await call('GET', `/api/order?id=${co.order.id}&t=${co.token}`);
  assert.equal(status.body.order.status, 'pending');
});

test('licenses activate, renew on top of remaining time, and can be revoked', async () => {
  const first = (await call('POST', '/api/checkout', { plan: 'month', method: 'tron' })).body;
  transfer(first.order.amountUnits);
  await worker.scheduled({ cron: '* * * * *' }, env, ctx());
  await Promise.all(pending.splice(0));
  const key = (await call('GET', `/api/order?id=${first.order.id}&t=${first.token}`)).body.order.license.key;

  const act = await call('POST', '/api/license/activate', { key: key.toLowerCase() });
  assert.equal(act.body.ok, true);
  const firstExpiry = act.body.license.expiresAt;

  const renewal = (await call('POST', '/api/checkout', { plan: 'month', method: 'tron', renewKey: key })).body;
  transfer(renewal.order.amountUnits);
  await worker.scheduled({ cron: '* * * * *' }, env, ctx());
  await Promise.all(pending.splice(0));
  const renewed = await call('POST', '/api/license/activate', { key, refresh: true });
  assert.equal(renewed.body.license.key, key);
  assert.ok(Math.abs(renewed.body.license.expiresAt - (firstExpiry + 30 * 86_400_000)) < 5000);

  const denied = await call('POST', '/api/admin/licenses/revoke', { key }, { authorization: 'Bearer wrong-token-000' });
  assert.equal(denied.status, 401);
  await call('POST', '/api/admin/licenses/revoke', { key }, { authorization: `Bearer ${env.ADMIN_TOKEN}` });
  const revoked = await call('POST', '/api/license/activate', { key });
  assert.equal(revoked.body.reason, 'revoked');
  const missing = await call('POST', '/api/license/activate', { key: 'UNW-AAAA-BBBB-CCCC-DDDD' });
  assert.equal(missing.body.reason, 'not_found');
});

test('the old workers.dev address redirects pages to the custom domain, not the API', async () => {
  const res = await worker.fetch(new Request('https://unwrapped.someone.workers.dev/es/pricing/?a=1'), env, ctx());
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://shop.test/es/pricing/?a=1');
  const api = await worker.fetch(new Request('https://unwrapped.someone.workers.dev/api/config'), env, ctx());
  assert.equal(api.status, 200);
  const www = await worker.fetch(new Request('https://www.shop.test/blog/'), env, ctx());
  assert.equal(www.headers.get('location'), 'https://shop.test/blog/');
});

test('anonymous site stats count views, referrers and funnel events', async () => {
  const hit = (body) => worker.fetch(new Request('https://shop.test/api/hit', { method: 'POST', body: JSON.stringify(body) }), env, ctx());
  assert.equal((await hit({ k: 'view', p: '/es/pricing/', r: 'www.google.com', l: 'es' })).status, 204);
  await hit({ k: 'view', p: '/es/pricing/', r: 'shop.test', l: 'es' });
  await hit({ k: 'analyze' });
  for (let i = 0; i < 12; i++) await hit({ k: 'analyze' }); // the public count can't be pumped
  assert.equal((await hit({ k: 'view', p: 'javascript:alert(1)' })).status, 400);
  assert.equal((await hit({ k: 'nope' })).status, 400);
  assert.equal((await hit({ k: 'tool', t: 'timeline' })).status, 204);
  assert.equal((await hit({ k: 'tool', t: '../x' })).status, 400);
  const { body } = await call('GET', '/api/admin/stats', undefined, { authorization: `Bearer ${env.ADMIN_TOKEN}` });
  assert.equal(body.events.view, 2);
  assert.equal(body.events.analyze, 10);
  assert.deepEqual(body.pages, [{ key: '/es/pricing/', n: 2 }]);
  assert.deepEqual(body.tools, [{ key: 'timeline', n: 1 }]);
  assert.deepEqual(body.refs.map((r) => r.key).sort(), ['(direct)', 'google.com']);
  assert.equal((await call('GET', '/api/admin/stats')).status, 401);
});

test('admin summary reports revenue', async () => {
  const co = (await call('POST', '/api/checkout', { plan: 'year', method: 'tron' })).body;
  transfer(co.order.amountUnits);
  await worker.scheduled({ cron: '* * * * *' }, env, ctx());
  await Promise.all(pending.splice(0));
  const { body } = await call('GET', '/api/admin/summary', undefined, { authorization: `Bearer ${env.ADMIN_TOKEN}` });
  assert.equal(body.ok, true);
  assert.equal(body.revenue.total, 49);
  assert.equal(body.revenue.today, 49);
  assert.equal(body.activeLicenses, 1);
  assert.equal(body.health.tron, true);
  assert.ok(body.health.cronLastRun > 0);
  const manual = await call('POST', '/api/admin/licenses', { plan: 'life', note: 'influencer' }, { authorization: `Bearer ${env.ADMIN_TOKEN}` });
  assert.equal(manual.body.license.expires_at, null);
});

test('referrals give the buyer a discount and the inviter free days', async () => {
  const pay = async (body, ip) => {
    const co = (await call('POST', '/api/checkout', body, { 'cf-connecting-ip': ip })).body;
    transfer(co.order.amountUnits);
    await worker.scheduled({ cron: '* * * * *' }, env, ctx());
    await Promise.all(pending.splice(0));
    return co;
  };
  const first = await pay({ plan: 'month', method: 'tron' }, '10.0.0.1');
  const inviterKey = (await call('GET', `/api/order?id=${first.order.id}&t=${first.token}`)).body.order.license.key;
  const before = (await call('POST', '/api/license/activate', { key: inviterKey, refresh: true })).body.license.expiresAt;

  const ref = (await call('POST', '/api/referral', { key: inviterKey })).body;
  assert.equal(ref.ok, true);
  assert.match(ref.code, /^[2-9A-Z]{7}$/);
  assert.equal((await call('POST', '/api/referral', { key: inviterKey })).body.code, ref.code, 'code is stable');
  assert.equal((await call('GET', `/api/referral/check?code=${ref.code.toLowerCase()}`)).body.ok, true);
  assert.equal((await call('GET', '/api/referral/check?code=NOPE123')).body.ok, false);

  const friend = await pay({ plan: 'year', method: 'tron', ref: ref.code }, '10.0.0.2');
  assert.equal(friend.order.priceUsd, 44.1);
  assert.equal(friend.order.listPriceUsd, 49);
  assert.ok(friend.order.amountUnits < 44_100_000);
  const after = (await call('POST', '/api/license/activate', { key: inviterKey, refresh: true })).body.license.expiresAt;
  assert.ok(Math.abs(after - (before + 30 * 86_400_000)) < 5000);
  assert.equal((await call('POST', '/api/referral', { key: inviterKey })).body.uses, 1);

  // Using your own code when renewing earns nothing and gives no discount.
  const self = (await call('POST', '/api/checkout', { plan: 'month', method: 'tron', ref: ref.code, renewKey: inviterKey }, { 'cf-connecting-ip': '10.0.0.3' })).body;
  assert.equal(self.order.referral, false);
  assert.equal(self.order.priceUsd, 9);
});

async function buy(body, ip = '10.1.0.1') {
  const co = (await call('POST', '/api/checkout', body, { 'cf-connecting-ip': ip })).body;
  assert.equal(co.ok, true, JSON.stringify(co));
  transfer(co.order.amountUnits);
  await worker.scheduled({ cron: '* * * * *' }, env, ctx());
  await Promise.all(pending.splice(0));
  return (await call('GET', `/api/order?id=${co.order.id}&t=${co.token}`)).body.order;
}

test('config lists the three paid tiers and their plans', async () => {
  const { body } = await call('GET', '/api/config');
  assert.deepEqual(body.tiers.map((t) => t.id), ['plus', 'pro', 'creator']);
  for (const p of body.plans) assert.ok(body.tiers.some((t) => t.id === p.tier), p.id);
  assert.equal(body.plans.filter((p) => p.days === null).length, 1, 'only Pro has a lifetime plan');
});

test('upgrading converts the time left at fair value', async () => {
  const plus = await buy({ plan: 'plus-year', method: 'tron' });
  const key = plus.license.key;
  assert.equal(plus.license.tier, 'plus');
  const plusExpiry = plus.license.expiresAt;

  const pro = await buy({ plan: 'pro-month', method: 'tron', renewKey: key }, '10.1.0.2');
  assert.equal(pro.license.key, key, 'the key stays the same');
  assert.equal(pro.license.tier, 'pro');
  const left = plusExpiry - Date.now();
  const expected = Date.now() + (left * 29) / 49 + 30 * 86_400_000;
  assert.ok(Math.abs(pro.license.expiresAt - expected) < 60_000, 'remaining Plus time becomes fewer, fairly valued Pro days');

  const { body: config } = await call('GET', '/api/config');
  const payload = await verifyToken(pro.token, config.publicKey);
  assert.equal(payload.t, 'pro');
});

test('lifetime Pro can add Creator time and falls back to lifetime afterwards', async () => {
  const life = await buy({ plan: 'pro-life', method: 'tron' });
  const key = life.license.key;
  assert.equal(life.license.lifetime, true);

  const same = await call('POST', '/api/checkout', { plan: 'pro-month', method: 'tron', renewKey: key }, { 'cf-connecting-ip': '10.1.0.3' });
  assert.equal(same.status, 400);
  assert.equal(same.body.error, 'already_lifetime');

  const creator = await buy({ plan: 'creator-month', method: 'tron', renewKey: key }, '10.1.0.4');
  assert.equal(creator.license.tier, 'creator');
  assert.equal(creator.license.lifetimeTier, 'pro');
  assert.ok(Math.abs(creator.license.expiresAt - (Date.now() + 30 * 86_400_000)) < 60_000);

  // The Creator month runs out: the license is lifetime Pro again.
  await env.DB.prepare('UPDATE licenses SET expires_at = ? WHERE key = ?').bind(Date.now() - 1000, key).run();
  const after = await call('POST', '/api/license/activate', { key, refresh: true });
  assert.equal(after.body.ok, true);
  assert.equal(after.body.license.tier, 'pro');
  assert.equal(after.body.license.lifetime, true);
});

test('cheap plans only tolerate a small shortfall', async () => {
  const { body: co } = await call('POST', '/api/checkout', { plan: 'plus-month', method: 'tron' });
  transfer(co.order.amountUnits - 1_000_000); // 1 USDT short on a $5 plan is 20%
  await worker.scheduled({ cron: '* * * * *' }, env, ctx());
  await Promise.all(pending.splice(0));
  const status = await call('GET', `/api/order?id=${co.order.id}&t=${co.token}`);
  assert.equal(status.body.order.status, 'pending');
});

test('checkout is rate limited per visitor and validates input', async () => {
  assert.equal((await call('POST', '/api/checkout', { plan: 'nope', method: 'tron' })).status, 400);
  assert.equal((await call('POST', '/api/checkout', { plan: 'month', method: 'tron', email: 'bad' })).status, 400);
  assert.equal((await call('POST', '/api/checkout', '{not json')).status, 400);
  let last;
  for (let i = 0; i < 9; i++) last = await call('POST', '/api/checkout', { plan: 'month', method: 'tron' }, { 'cf-connecting-ip': '192.0.2.50' });
  assert.equal(last.status, 429);
});

test('public stats show analyses only once there are enough of them', async () => {
  const { body: few } = await call('GET', '/api/stats');
  assert.equal(few.analyzed30d, null);
  const day = Math.floor(Date.now() / 86_400_000);
  await env.DB.prepare("INSERT INTO stats (day, kind, key, n) VALUES (?, 'event', 'analyze', 140), (?, 'event', 'analyze', 60), (?, 'event', 'analyze', 999)").bind(day, day - 3, day - 40).run();
  const { body } = await call('GET', '/api/stats');
  assert.equal(body.analyzed30d, 200);
});

test('feedback: only public, approved, good ratings become testimonials', async () => {
  assert.equal((await call('POST', '/api/feedback', { rating: 9 })).status, 400);
  await call('POST', '/api/feedback', { rating: 5, text: 'Finally saw who unfollowed me', name: 'Sam', public: true, platform: 'instagram', lang: 'en' });
  await call('POST', '/api/feedback', { rating: 5, text: 'Keep this private', public: false });
  await call('POST', '/api/feedback', { rating: 2, text: 'Too slow', public: true });
  assert.deepEqual((await call('GET', '/api/testimonials')).body.items, []);
  env.ADMIN_TOKEN = 'admin-token-123456';
  const admin = { authorization: 'Bearer admin-token-123456' };
  const list = (await call('GET', '/api/admin/feedback', undefined, admin)).body;
  assert.equal(list.count, 3);
  const pub = list.items.find((f) => f.name === 'Sam');
  const priv = list.items.find((f) => f.text === 'Keep this private');
  assert.equal((await call('POST', '/api/admin/feedback/approve', { id: priv.id, approved: true }, admin)).status, 404);
  await call('POST', '/api/admin/feedback/approve', { id: pub.id, approved: true }, admin);
  const { items } = (await call('GET', '/api/testimonials?lang=en')).body;
  assert.deepEqual(items, [{ text: 'Finally saw who unfollowed me', name: 'Sam', rating: 5, platform: 'instagram' }]);
});
