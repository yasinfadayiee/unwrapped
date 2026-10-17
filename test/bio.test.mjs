import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { D1Shim } from '../server/d1-shim.js';
import { safeUrl, validHandle, FREE_LINKS } from '../src/bio/index.js';

let env;
beforeEach(() => {
  env = { DB: new D1Shim(':memory:'), ASSETS: { fetch: async () => new Response('static', { status: 404 }) }, SITE_URL: 'https://shop.test', ADMIN_TOKEN: 'admin-token-123456' };
});

async function raw(method, path, { body, headers = {} } = {}) {
  return worker.fetch(new Request(`https://shop.test${path}`, { method, headers: { 'cf-connecting-ip': '203.0.113.5', 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body), redirect: 'manual' }), env, { waitUntil() {}, passThroughOnException() {} });
}
const api = async (method, path, body, token) => {
  const res = await raw(method, path, { body, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json() };
};

test('handles and links are validated', () => {
  assert.ok(validHandle('nova.studio'));
  assert.ok(!validHandle('ab'));
  assert.ok(!validHandle('admin'));
  assert.ok(!validHandle('Bad Handle'));
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,hi'), '');
  assert.equal(safeUrl('shop.test/x'), 'https://shop.test/x');
  assert.equal(safeUrl('mailto:a@b.co'), 'mailto:a@b.co');
});

test('lead form collects contacts, blocks bots, and analytics see the source', async () => {
  const { body } = await api('POST', '/api/bio/create', { handle: 'shop.owner' });
  const token = body.token;
  await api('POST', '/api/bio/save', { data: { name: 'Shop', links: [], lead: { on: true, title: 'Join the list', button: 'Join', phone: true } } }, token);
  const page = await (await raw('GET', '/@shop.owner', { headers: { 'user-agent': 'Mozilla/5.0 (iPhone) Instagram 300.0' } })).text();
  assert.match(page, /<form method="post" action="\/api\/bio\/lead\/shop\.owner">/);
  const post = (fields) => worker.fetch(new Request('https://shop.test/api/bio/lead/shop.owner', { method: 'POST', body: new URLSearchParams(fields), headers: { 'cf-connecting-ip': '203.0.113.77' }, redirect: 'manual' }), env, { waitUntil() {}, passThroughOnException() {} });
  let res = await post({ name: 'Ana', email: 'ana@example.com' });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /thanks=1/);
  assert.match(await (await raw('GET', '/@shop.owner?thanks=1')).text(), /you’re on the list/);
  assert.match((await post({ email: 'nope' })).headers.get('location'), /lead=invalid/);
  await post({ email: 'bot@spam.co', website: 'http://spam' }); // honeypot → silently dropped
  await post({ phone: '+90 555 123 4567' });
  const leads = await api('GET', '/api/bio/leads', undefined, token);
  assert.equal(leads.body.total, 2);
  assert.deepEqual(leads.body.leads.map((l) => l.email || l.phone).sort(), ['+905551234567', 'ana@example.com']);
  const mine = await api('GET', '/api/bio/mine', undefined, token);
  assert.equal(mine.body.page.leads.total, 2);
  assert.equal(mine.body.page.insights, null); // detailed analytics are Pro
  const lic = await api('POST', '/api/admin/licenses', { plan: 'plus-month' }, 'admin-token-123456');
  const pro = await api('POST', '/api/bio/license', { key: lic.body.license.key }, token);
  const src = Object.fromEntries(pro.body.page.insights.sources.map((s) => [s.key, s.n]));
  assert.deepEqual(src, { instagram: 1, direct: 1 }); // in-app browser seen by its user agent
  const dev = Object.fromEntries(pro.body.page.insights.devices.map((s) => [s.key, s.n]));
  assert.deepEqual(dev, { mobile: 1, desktop: 1 });
});

test('create → edit → public page → click tracking → Pro via license', async () => {
  const made = await api('POST', '/api/bio/create', { handle: 'nova.studio', name: 'Nova <Studio>' });
  assert.equal(made.status, 200);
  const token = made.body.token;
  assert.equal((await api('POST', '/api/bio/create', { handle: 'nova.studio' })).status, 409);
  assert.equal((await api('GET', '/api/bio/check?handle=nova.studio')).body.available, false);

  const links = Array.from({ length: 8 }, (_, i) => ({ title: `Link ${i}`, url: i === 1 ? 'javascript:alert(1)' : `https://example.com/${i}` }));
  let saved = await api('POST', '/api/bio/save', { data: { name: 'Nova <Studio>', bio: 'Hi', links, socials: { instagram: '@nova' }, theme: 'sunset' } }, token);
  assert.equal(saved.body.page.data.links.length, FREE_LINKS); // free limit, javascript: dropped
  assert.ok(saved.body.page.data.links.every((l) => l.url.startsWith('https://')));

  const pub = await raw('GET', '/@nova.studio');
  const html = await pub.text();
  assert.equal(pub.status, 200);
  assert.match(html, /Nova &lt;Studio&gt;/); // escaped
  assert.match(html, /instagram\.com\/nova/);
  assert.match(html, /Made with <b>Unwrapped Bio<\/b>/);
  assert.match(pub.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal((await raw('GET', '/@nobody.here')).status, 404);

  const id = saved.body.page.data.links[0].id;
  const click = await raw('GET', `/api/bio/go/nova.studio/${id}`);
  assert.equal(click.status, 302);
  assert.equal(click.headers.get('location'), 'https://example.com/0');

  let mine = await api('GET', '/api/bio/mine', undefined, token);
  assert.equal(mine.body.page.stats.views30, 1);
  assert.equal(mine.body.page.stats.clicks, null); // per-link analytics are Pro
  assert.equal(mine.body.page.stats.clicks30, 1);

  assert.equal((await api('POST', '/api/bio/license', { key: 'UNW-NOPE-NOPE-NOPE-NOPE' }, token)).status, 400);
  const lic = await api('POST', '/api/admin/licenses', { plan: 'plus-month' }, 'admin-token-123456');
  const pro = await api('POST', '/api/bio/license', { key: lic.body.license.key }, token);
  assert.ok(pro.body.page.pro);
  saved = await api('POST', '/api/bio/save', { data: { name: 'Nova', links } }, token);
  assert.equal(saved.body.page.data.links.length, 7);
  assert.doesNotMatch(await (await raw('GET', '/@nova.studio')).text(), /Made with/);
  mine = await api('GET', '/api/bio/mine', undefined, token);
  assert.deepEqual(mine.body.page.stats.clicks, { [id]: 1 });

  // Photo: only real images by magic bytes, served back with long caching.
  const fake = `data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`;
  assert.equal((await api('POST', '/api/bio/avatar', { data: fake }, token)).status, 400);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = await api('POST', '/api/bio/avatar', { data: `data:image/png;base64,${png}` }, token);
  assert.match(up.body.page.avatar, /^\/api\/bio\/avatar\/nova\.studio\?v=\d+$/);
  const img = await raw('GET', up.body.page.avatar);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.match(await (await raw('GET', '/@nova.studio')).text(), /<img class="av"/);

  assert.equal((await api('GET', '/api/bio/mine', undefined, 'f'.repeat(48))).status, 401);
  assert.equal((await api('POST', '/api/bio/login', { handle: 'nova.studio', email: 'who@x.co' })).status, 200);
  await api('POST', '/api/bio/delete', {}, token);
  assert.equal((await raw('GET', '/@nova.studio')).status, 404);
});
