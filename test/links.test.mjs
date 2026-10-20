import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const pub = path.resolve(import.meta.dirname, '../public');

function pages(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return f === 'assets' ? [] : pages(p);
    return p.endsWith('.html') ? [p] : [];
  });
}

function exists(href) {
  const clean = decodeURI(href.split(/[?#]/)[0]);
  if (!clean || clean.startsWith('/api/') || clean.startsWith('/cdn-cgi/')) return true;
  const file = path.join(pub, clean);
  return clean.endsWith('/') ? existsSync(path.join(file, 'index.html')) : existsSync(file) || existsSync(path.join(file, 'index.html'));
}

// Every same-site link and asset in the built pages points at a file that exists.
test('built pages have no broken internal links', () => {
  const broken = [];
  for (const file of pages(pub)) {
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(/\s(?:href|src)="(\/(?!\/)[^"]*)"/g)) {
      if (!exists(m[1])) broken.push(`${path.relative(pub, file)} → ${m[1]}`);
    }
  }
  assert.deepEqual([...new Set(broken)], []);
});
