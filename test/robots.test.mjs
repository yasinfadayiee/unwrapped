import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { robotsText } from '../src/seo.js';

test('robots stays available without database or static assets', async () => {
  const env = { SITE_URL: 'https://myunwrapped.com', ASSETS: { fetch: () => { throw Error('assets down'); } } };
  const res = await worker.fetch(new Request('https://myunwrapped.com/robots.txt'), env, {});
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/plain/);
  assert.equal(await res.text(), robotsText(env.SITE_URL));
  assert.doesNotMatch(robotsText(env.SITE_URL), /Disallow: \/\n/);
  const head = await worker.fetch(new Request('https://myunwrapped.com/robots.txt', { method: 'HEAD' }), env, {});
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('old hosts redirect robots to the canonical host before serving policy', async () => {
  const res = await worker.fetch(new Request('https://unwrapped.unwrapped.workers.dev/robots.txt'), { SITE_URL: 'https://myunwrapped.com' }, {});
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://myunwrapped.com/robots.txt');
});
