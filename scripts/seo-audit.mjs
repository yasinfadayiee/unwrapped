// Local inventory plus release checks. Never calls Search Console or changes indexing.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MERGED } from '../src/redirects.js';
import { robotsText } from '../src/seo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const locales = JSON.parse(read('site/i18n/locales.json'));
const prune = JSON.parse(read('site/seo-prune.json'));
const priorities = JSON.parse(read('site/seo-priority.json')).urls;
const sitemap = read('public/sitemap.xml');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const origin = new URL(urls[0]).origin;
const errors = [];
const rows = [];
const check = (ok, message) => { if (!ok) errors.push(message); };
check(new Set(urls).size === urls.length, 'Duplicate sitemap URLs');
check(read('public/robots.txt') === robotsText(origin), 'Build and runtime robots policy differ');

for (const loc of locales) {
  const dir = loc.code === 'en' ? 'site/pages' : `site/i18n/${loc.code}/pages`;
  for (const file of readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.html'))) {
    const raw = read(`${dir}/${file}`);
    const meta = JSON.parse(raw.match(/^<!--page\s+([\s\S]*?)-->/)[1]);
    const route = `${loc.path}${meta.route}`;
    const state = meta.noindex || meta.route.endsWith('.html') ? 'private' : prune[loc.code]?.includes(meta.route) ? 'intentional-noindex' : 'index-target';
    const output = route.endsWith('.html') ? `public${route}` : `public${route}index.html`;
    const html = read(output);
    const robots = html.match(/<meta name="robots" content="([^"]+)"/)?.[1] || '';
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    const url = `${origin}${route}`;
    check(canonical === url, `Wrong canonical: ${route}`);
    check(urls.includes(url) === (state === 'index-target'), `Sitemap policy mismatch: ${route}`);
    check(state === 'index-target' ? /^index,/.test(robots) : /^noindex,/.test(robots), `Robots policy mismatch: ${route}`);
    const alternates = [...html.matchAll(/<link rel="alternate" hreflang="[^"]+" href="([^"]+)"/g)].map((m) => m[1]);
    for (const alternate of alternates) check(urls.includes(alternate), `hreflang targets a non-indexable page: ${route} -> ${alternate}`);
    rows.push({ url, route, state, source: `${dir}/${file}`, robots, canonical, priority: priorities.includes(route) });
  }
  for (const [from, to] of Object.entries(MERGED)) {
    const route = `${loc.path}${from}`;
    check(!urls.includes(`${origin}${route}`), `Merged source remains in sitemap: ${route}`);
    check(!(to in MERGED), `Redirect chain: ${from}`);
    rows.push({ url: `${origin}${route}`, route, state: 'merged-301', target: `${origin}${loc.path}${to}` });
  }
}
for (const route of priorities) check(rows.some((r) => r.route === route && r.state === 'index-target'), `Priority URL is not indexable: ${route}`);
const report = {
  checkedAt: new Date().toISOString(), origin,
  note: 'Index target means technically eligible in this build, not confirmed indexed by Google.',
  totals: Object.fromEntries(['index-target', 'intentional-noindex', 'private', 'merged-301'].map((state) => [state, rows.filter((r) => r.state === state).length])),
  priorities: rows.filter((r) => r.priority), errors, rows,
};
if (process.argv.includes('--write')) writeFileSync(path.join(root, 'seo-inventory.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ origin, totals: report.totals, priorities: priorities.length, errors }, null, 2));
if (errors.length) process.exitCode = 1;
