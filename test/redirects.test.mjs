import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MERGED, mergedTarget } from '../src/redirects.js';

const pub = path.resolve(import.meta.dirname, '../public');
const sitemap = readFileSync(path.join(pub, 'sitemap.xml'), 'utf8');

test('merged pages 301 to their target in every language', () => {
  assert.equal(mergedTarget('/blog/find-my-first-tweet/'), '/blog/search-your-old-tweets/');
  assert.equal(mergedTarget('/de/blog/find-my-first-tweet'), '/de/blog/search-your-old-tweets/');
  assert.equal(mergedTarget('/blog/search-your-old-tweets/'), null);
  assert.equal(mergedTarget('/es/'), null);
});

test('merged sources are gone from the build and targets exist', () => {
  for (const [from, to] of Object.entries(MERGED)) {
    assert.ok(!(from in MERGED && to in MERGED), `${to} is itself merged`);
    assert.ok(!existsSync(path.join(pub, from, 'index.html')), `${from} is still built`);
    assert.ok(existsSync(path.join(pub, to, 'index.html')), `${to} is missing`);
    assert.ok(!sitemap.includes(`${from}<`), `${from} is in the sitemap`);
  }
});
