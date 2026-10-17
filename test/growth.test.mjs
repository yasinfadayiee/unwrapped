import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { D1Shim } from '../server/d1-shim.js';
import { hmacHex } from '../src/util.js';
import { matchRule, access, TRIAL } from '../src/growth/index.js';

let env;
let pending;
let sentDMs; // private replies the fake Graph API received
const realFetch = globalThis.fetch;

beforeEach(() => {
  env = {
    DB: new D1Shim(':memory:'),
    ASSETS: { fetch: async () => new Response('static') },
    SITE_URL: 'https://shop.test',
    IG_APP_ID: '123',
    IG_APP_SECRET: 'app-secret',
    IG_VERIFY_TOKEN: 'verify-me',
    GROWTH_KEY: Buffer.from(new Uint8Array(32).fill(7)).toString('base64'),
  };
  pending = [];
  sentDMs = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.hostname === 'api.instagram.com') return Response.json({ access_token: 'short-token', user_id: 1784 });
    if (url.hostname === 'graph.instagram.com') {
      if (url.pathname === '/access_token') return Response.json({ access_token: 'LONG-SECRET-TOKEN', expires_in: 5184000 });
      if (url.pathname.endsWith('/me')) return Response.json({ user_id: '1784', username: 'nova.studio' });
      if (url.pathname.endsWith('/me/subscribed_apps')) return Response.json({ success: true });
      if (url.pathname.endsWith('/messages')) {
        sentDMs.push(JSON.parse(init.body));
        return Response.json({ recipient_id: 'x', message_id: 'm' });
      }
      if (url.pathname.endsWith('/replies')) return Response.json({ id: 'r' });
    }
    return realFetch(input, init);
  };
});

const ctx = () => ({ waitUntil: (p) => pending.push(p), passThroughOnException() {} });
async function raw(method, path, { body, headers = {} } = {}) {
  const res = await worker.fetch(new Request(`https://shop.test${path}`, { method, headers: { 'cf-connecting-ip': '203.0.113.9', ...headers }, body, redirect: 'manual' }), env, ctx());
  await Promise.all(pending.splice(0));
  return res;
}
const api = async (method, path, session, body) => {
  const res = await raw(method, path, { body: body && JSON.stringify(body), headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) } });
  return { status: res.status, body: await res.json() };
};
async function connect() {
  const start = await raw('GET', '/api/growth/ig/connect');
  assert.equal(start.status, 302);
  const auth = new URL(start.headers.get('location'));
  assert.equal(auth.hostname, 'www.instagram.com');
  assert.match(auth.searchParams.get('scope'), /instagram_business_manage_comments/);
  const back = await raw('GET', `/api/growth/ig/callback?code=abc&state=${auth.searchParams.get('state')}`);
  const loc = back.headers.get('location');
  assert.match(loc, /^https:\/\/shop\.test\/growth\/#session=/);
  return loc.split('session=')[1];
}
async function comment(text, { from = '999', id = String(Math.random()) } = {}) {
  const body = JSON.stringify({ object: 'instagram', entry: [{ id: '1784', time: 1, changes: [{ field: 'comments', value: { id, text, from: { id: from, username: 'fan' }, media: { id: '555' } } }] }] });
  const sig = await hmacHex('SHA-256', env.IG_APP_SECRET, body);
  return raw('POST', '/api/growth/webhook/instagram', { body, headers: { 'x-hub-signature-256': `sha256=${sig}` } });
}

test('rule matching is whole-word, case-insensitive and media-aware', () => {
  const rules = [{ id: 'a', keyword: 'LINK', active: 1 }, { id: 'b', keyword: 'guide', media_id: '1', active: 1 }];
  assert.equal(matchRule(rules, 'send me the link pls')?.id, 'a');
  assert.equal(matchRule(rules, 'blinking'), null);
  assert.equal(matchRule(rules, 'guide?', '2'), null);
  assert.equal(matchRule(rules, 'guide?', '1')?.id, 'b');
  assert.equal(matchRule([{ id: 'c', keyword: 'لینک', active: 1 }], 'لینک لطفا')?.id, 'c');
});

test('trial is granted once per platform account', () => {
  const now = Date.now();
  assert.equal(access({}, null, now).mode, 'trial');
  assert.equal(access({}, { started_at: now, sent: TRIAL.messages }, now).ok, false);
  assert.equal(access({}, { started_at: now - (TRIAL.days + 1) * 86_400_000, sent: 0 }, now).ok, false);
  assert.equal(access({ paid_until: now + 1000 }, { started_at: 0, sent: 999 }, now).mode, 'paid');
});

test('Instagram connect → rule → signed comment sends exactly one private reply', async () => {
  const session = await connect();
  const row = await env.DB.prepare('SELECT token_enc FROM growth_accounts').first();
  assert.ok(!row.token_enc.includes('LONG-SECRET-TOKEN'), 'token is stored encrypted');

  let me = await api('GET', '/api/growth/me', session);
  assert.equal(me.body.accounts[0].username, 'nova.studio');
  assert.equal(me.body.accounts[0].access.mode, 'trial');
  me = await api('POST', '/api/growth/rules', session, { accountId: 'ig:1784', keyword: 'link', dmText: 'Hi {name}! Here it is: https://x.test' });
  assert.equal(me.body.accounts[0].rules.length, 1);

  assert.equal((await raw('POST', '/api/growth/webhook/instagram', { body: '{}', headers: { 'x-hub-signature-256': 'sha256=bad' } })).status, 401);
  await comment('LINK please!', { id: 'c1' });
  await comment('LINK please!', { id: 'c1' }); // Meta retried the same webhook
  await comment('nice post', { id: 'c2' });
  await comment('link', { id: 'c3', from: '1784' }); // the account's own reply
  assert.equal(sentDMs.length, 1);
  assert.deepEqual(sentDMs[0].recipient, { comment_id: 'c1' });
  assert.match(sentDMs[0].message.text, /^Hi @fan!/);

  me = await api('GET', '/api/growth/me', session);
  assert.equal(me.body.accounts[0].stats.total, 1);
  assert.equal(me.body.accounts[0].access.left, TRIAL.messages - 1);

  // Trial used up → no more replies, even after reconnecting.
  await env.DB.prepare('UPDATE growth_trials SET sent = ?').bind(TRIAL.messages).run();
  await api('POST', '/api/growth/disconnect', session, { accountId: 'ig:1784' });
  const again = await connect();
  await api('POST', '/api/growth/rules', again, { accountId: 'ig:1784', keyword: 'link', dmText: 'x' });
  await comment('link', { id: 'c4' });
  assert.equal(sentDMs.length, 1);
  assert.equal((await api('GET', '/api/growth/me', again)).body.accounts[0].access.mode, 'expired');
});

test('webhook verification and session checks', async () => {
  const ok = await raw('GET', '/api/growth/webhook/instagram?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42');
  assert.equal(await ok.text(), '42');
  assert.equal((await raw('GET', '/api/growth/webhook/instagram?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42')).status, 403);
  assert.equal((await api('GET', '/api/growth/me', 'not-a-real-session-token-xx')).status, 401);
  const session = await connect();
  assert.equal((await api('POST', '/api/growth/rules', session, { accountId: 'ig:other', keyword: 'a', dmText: 'b' })).status, 404);
});
