import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { TIERS, PLANS } from '../src/config.js';

const root = path.resolve(import.meta.dirname, '..');
const jsRoot = path.join(root, 'public/assets/js');
const LANGS = ['es', 'pt', 'tr'];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return f === 'i18n' || f === 'vendor' ? [] : walk(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

// Every t('…') / tr('…') literal in the browser code, plus the plan texts the
// server sends (translated in the browser by their English wording).
export function translationKeys() {
  const keys = new Set();
  const re = /\b(?:t|tr|tl)\(\s*'((?:[^'\\]|\\.)*)'/g;
  for (const file of walk(jsRoot)) {
    const src = readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(src))) keys.add(m[1].replace(/\\'/g, "'"));
  }
  for (const tier of TIERS) [tier.tagline, tier.bestFor, ...tier.features].forEach((s) => keys.add(s));
  for (const plan of PLANS) [plan.short, plan.badge].filter(Boolean).forEach((s) => keys.add(s));
  const worker = readFileSync(path.join(root, 'src/worker.js'), 'utf8');
  for (const m of worker.matchAll(/(?:label|detail): '([^']+)'/g)) keys.add(m[1]);
  // Error messages are passed to t() through the ERRORS map.
  const checkout = readFileSync(path.join(jsRoot, 'lib/checkout.js'), 'utf8');
  const errors = checkout.match(/const ERRORS = \{([\s\S]*?)\};/)[1];
  for (const m of errors.matchAll(/: '([^']+)'/g)) keys.add(m[1]);
  // Text produced by the analysis modules and translated where it is shown.
  const lab = readFileSync(path.join(jsRoot, 'core/lab.js'), 'utf8');
  for (const m of lab.matchAll(/label: '([^']+)'/g)) keys.add(m[1]);
  for (const m of lab.matchAll(/\.\.\.detail\('([^']+)'/g)) keys.add(m[1]);
  for (const m of lab.matchAll(/flag\(\d, '([^']+)'\)/g)) keys.add(m[1]);
  for (const m of lab.matchAll(/reasons\.push\('([^']+)'\)/g)) keys.add(m[1]);
  const insights = readFileSync(path.join(jsRoot, 'core/insights.js'), 'utf8');
  for (const m of insights.matchAll(/(?:title|line|label): '([^']+)'/g)) keys.add(m[1]);
  for (const file of walk(jsRoot)) {
    for (const m of readFileSync(file, 'utf8').matchAll(/plural\([^,]+, '([^']+)'(?:, '([^']+)')?\)/g)) {
      keys.add(m[1]);
      keys.add(m[2] || `${m[1]}s`);
    }
  }
  keys.delete('');
  return keys;
}

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

for (const lang of LANGS) {
  test(`${lang}: every string has a translation with the same placeholders`, async () => {
    const dict = (await import(`../public/assets/js/i18n/${lang}.js`)).default;
    const missing = [];
    const wrongVars = [];
    for (const key of translationKeys()) {
      if (!(key in dict)) missing.push(key);
      else if (placeholders(dict[key]) !== placeholders(key)) wrongVars.push(`${key} → ${dict[key]}`);
    }
    assert.deepEqual(missing, [], `${missing.length} missing in ${lang}.js`);
    assert.deepEqual(wrongVars, []);
  });
}
