// Builds the static pages in /public from /site (layout + partials + pages),
// plus sitemap.xml, robots.txt and the service-worker version.
//   node scripts/build.js            (uses site/site.json)
//   SITE_URL=https://example.com node scripts/build.js

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const write = (p, content) => {
  const full = path.join(root, p);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
};

// Strips // and /* */ comments from JSONC without touching strings (URLs!).
function parseJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i];
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

// One source of truth: SITE_URL and BRAND come from wrangler.jsonc "vars".
const site = JSON.parse(read('site/site.json'));
const wranglerVars = parseJsonc(read('wrangler.jsonc')).vars || {};
if (wranglerVars.BRAND) site.name = wranglerVars.BRAND;
const origin = (process.env.SITE_URL || wranglerVars.SITE_URL || site.url).replace(/\/+$/, '');
const version = Date.now().toString(36);
const layout = read('site/layout.html');
const icons = read('site/icons.svg');
const partials = Object.fromEntries(
  readdirSync(path.join(root, 'site/partials')).map((f) => [f.replace(/\.html$/, ''), read(`site/partials/${f}`)]),
);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

function faqSchema(html) {
  const items = [];
  const re = /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>\s*<div class="answer">([\s\S]*?)<\/div>\s*<\/details>/g;
  let m;
  while ((m = re.exec(html))) items.push({ '@type': 'Question', name: stripTags(m[1]), acceptedAnswer: { '@type': 'Answer', text: stripTags(m[2]) } });
  return items.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items } : null;
}

const sitemap = [];
for (const file of readdirSync(path.join(root, 'site/pages'))) {
  const raw = read(`site/pages/${file}`);
  const m = raw.match(/^<!--page\s+([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`${file}: missing <!--page {...}--> header`);
  const meta = JSON.parse(m[1]);
  let content = raw.slice(m[0].length);
  for (let depth = 0; depth < 4 && /\{\{>/.test(content); depth++) {
    content = content.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
      if (!(name in partials)) throw new Error(`${file}: unknown partial ${name}`);
      return partials[name];
    });
  }
  content = content.replaceAll('{{siteName}}', site.name).replaceAll('{{origin}}', origin);

  const canonical = `${origin}${meta.route.replace(/index\.html$/, '')}`;
  const schemas = [];
  if (meta.route === '/') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: site.name,
      url: `${origin}/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any (runs in the browser)',
      description: meta.description,
      offers: { '@type': 'AggregateOffer', priceCurrency: 'USD', lowPrice: '0', highPrice: '59' },
    });
  }
  if (meta.article) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: meta.headline || meta.title,
      description: meta.description,
      datePublished: meta.article,
      dateModified: meta.article,
      mainEntityOfPage: canonical,
      image: `${origin}/assets/img/og.png`,
      author: { '@type': 'Organization', name: site.name, url: `${origin}/` },
      publisher: { '@type': 'Organization', name: site.name, logo: { '@type': 'ImageObject', url: `${origin}/assets/img/icon-512.png` } },
    });
  }
  if (meta.faqSchema) {
    const faq = faqSchema(content);
    if (faq) schemas.push(faq);
  }

  let html = layout;
  const vars = {
    title: esc(meta.title),
    description: esc(meta.description),
    canonical: esc(canonical),
    robots: meta.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
    jsonld: schemas.map(ld).join('\n'),
    bodyClass: esc(meta.bodyClass || ''),
    siteName: esc(site.name),
    origin,
    version,
    icons,
    content,
  };
  for (const [key, value] of Object.entries(vars)) html = html.replaceAll(`{{${key}}}`, () => value);
  if (meta.nav) html = html.replace(`data-nav="${meta.nav}"`, `data-nav="${meta.nav}" aria-current="page"`);

  const out = meta.route.endsWith('.html') ? `public${meta.route}` : `public${meta.route}index.html`;
  write(out, html);
  if (!meta.noindex && !meta.route.endsWith('.html')) sitemap.push({ loc: canonical, priority: meta.route === '/' ? '1.0' : '0.8' });
}

const today = new Date().toISOString().slice(0, 10);
write(
  'public/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap
    .map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`)
    .join('\n')}\n</urlset>\n`,
);
write('public/robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /account/\nDisallow: /success/\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`);

const sw = read('site/sw.template.js').replace('__VERSION__', version);
write('public/sw.js', sw);
console.log(`Built ${sitemap.length} indexable pages for ${origin} (v${version})`);
