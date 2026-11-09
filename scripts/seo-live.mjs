// Bounded public GET checks; no credentials, orders, indexing requests or visitor data.
import { readFileSync } from 'node:fs';
const priorities = JSON.parse(readFileSync(new URL('../site/seo-priority.json', import.meta.url), 'utf8')).urls;
const origin = new URL(process.env.SEO_CHECK_ORIGIN || 'https://myunwrapped.com').origin;
const targets = ['/robots.txt', '/sitemap.xml', ...priorities];
const results = await Promise.all(targets.map(async (route) => {
  try {
    const response = await fetch(origin + route, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const body = await response.text();
    const errors = [];
    if (response.status !== 200) errors.push(`HTTP ${response.status}`);
    if (/noindex/i.test(response.headers.get('x-robots-tag') || '')) errors.push('X-Robots-Tag: noindex');
    if (route === '/robots.txt') {
      if (!/text\/plain/i.test(response.headers.get('content-type') || '')) errors.push('robots is not text/plain');
      if (!body.includes(`Sitemap: ${origin}/sitemap.xml`) || /Disallow:\s*\/\s*$/m.test(body)) errors.push('Invalid crawler policy');
    } else if (route === '/sitemap.xml') {
      if (!body.includes('<urlset')) errors.push('Not a sitemap');
      for (const p of priorities) if (!body.includes(`<loc>${origin}${p}</loc>`)) errors.push(`Missing ${p}`);
    } else {
      if (!body.includes(`rel="canonical" href="${origin}${route}"`)) errors.push('Wrong canonical');
      if (!/<meta name="robots" content="index,/.test(body)) errors.push('Missing index policy');
      if (!/<h1\b/.test(body)) errors.push('Missing main content');
    }
    return { route, status: response.status, errors };
  } catch (error) { return { route, errors: [error.message] }; }
}));
console.log(JSON.stringify({ origin, results }, null, 2));
if (results.some((r) => r.errors.length)) process.exitCode = 1;
