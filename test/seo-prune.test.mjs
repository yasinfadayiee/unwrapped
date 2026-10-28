import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pub = path.join(root, 'public');
const prune = JSON.parse(readFileSync(path.join(root, 'site/seo-prune.json'), 'utf8'));
const lists = Object.entries(prune).filter(([, v]) => Array.isArray(v));
const sitemap = readFileSync(path.join(pub, 'sitemap.xml'), 'utf8');

// SEO recovery: pruned translations exist, say "noindex, follow" and are absent from the sitemap and hreflang.
test('pruned translations are built noindex and kept out of the sitemap', () => {
  assert.ok(lists.length > 0);
  for (const [code, routes] of lists) {
    for (const route of routes) {
      const url = `/${code}${route}`;
      const file = path.join(pub, url, 'index.html');
      assert.ok(existsSync(file), `${url} is listed but not built`);
      assert.match(readFileSync(file, 'utf8'), /<meta name="robots" content="noindex, follow">/, url);
      assert.ok(!sitemap.includes(`myunwrapped.com${url}"`) && !sitemap.includes(`myunwrapped.com${url}<`), `${url} is still in the sitemap`);
    }
  }
});

test('English pages are never pruned', () => {
  assert.ok(!('en' in prune));
});
