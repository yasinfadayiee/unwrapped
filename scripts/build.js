// Builds the static pages in /public from /site (layout + partials + pages),
// plus sitemap.xml, robots.txt and the service-worker version.
//   node scripts/build.js            (uses site/site.json)
//   SITE_URL=https://example.com node scripts/build.js

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PLANS, TIERS } from '../src/config.js';

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

// Languages: English pages live in site/pages + site/partials; every other
// locale has site/i18n/<code>/{pages,partials,layout.json}. A localized page
// uses the same "route" as its English original and is served under the
// locale's path prefix (e.g. /es/pricing/). Missing partials fall back to English.
const locales = JSON.parse(read('site/i18n/locales.json'));
const listHtml = (dir) => (existsSync(path.join(root, dir)) ? readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.html')) : []);
const loadPartials = (dir) => Object.fromEntries(listHtml(dir).map((f) => [f.replace(/\.html$/, ''), read(`${dir}/${f}`)]));
const basePartials = loadPartials('site/partials');
const layoutStrings = Object.fromEntries(locales.map((l) => [l.code, JSON.parse(read(`site/i18n/${l.code}/layout.json`))]));

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

// Pass 1: read every page of every locale, so links and hreflang tags know
// which routes exist in which language.
const pages = [];
for (const loc of locales) {
  const dir = loc.code === 'en' ? 'site/pages' : `site/i18n/${loc.code}/pages`;
  for (const file of listHtml(dir)) {
    const raw = read(`${dir}/${file}`);
    const m = raw.match(/^<!--page\s+([\s\S]*?)-->\s*/);
    if (!m) throw new Error(`${dir}/${file}: missing <!--page {...}--> header`);
    pages.push({ loc, file: `${dir}/${file}`, meta: JSON.parse(m[1]), body: raw.slice(m[0].length) });
  }
}
const routesOf = new Map(locales.map((l) => [l.code, new Set(pages.filter((p) => p.loc.code === l.code).map((p) => p.meta.route))]));
const urlOf = (loc, route) => `${loc.path}${route}`;
const localesWith = (route) => locales.filter((l) => routesOf.get(l.code).has(route));

// Internal links point to the same-language page when it exists.
function localizeLinks(html, loc) {
  if (!loc.path) return html;
  const routes = routesOf.get(loc.code);
  return html.replace(/href="(\/[^"#?]*)([^"]*)"/g, (all, p, rest) => (routes.has(p) ? `href="${loc.path}${p}${rest}"` : all));
}

// Search results cut titles after ~65 characters and descriptions after ~160.
// Long page titles drop their trailing " · …" parts first (year, brand), then
// end at a natural break; descriptions end at the last full sentence that fits.
function shortTitle(title, max = 65) {
  let t = String(title || '');
  const parts = t.split(' · ');
  while (t.length > max && parts.length > 1) {
    parts.pop();
    t = parts.join(' · ');
  }
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  // A question is a complete title on its own: keep the "?".
  const q = Math.max(cut.lastIndexOf('? '), cut.lastIndexOf(' ? '));
  if (q > 15) return cut.slice(0, cut.indexOf('?', q) + 1);
  const brk = Math.max(cut.lastIndexOf(' — '), cut.lastIndexOf(': '), cut.lastIndexOf(' : '), cut.lastIndexOf(' ('), cut.lastIndexOf(', '));
  if (brk > 25) return cut.slice(0, brk).replace(/[\s,:—(]+$/, '');
  // Otherwise end on a whole word — no "…", and no dangling little word.
  let words = cut.slice(0, cut.lastIndexOf(' ')).split(' ');
  while (words.length > 3 && TRAILING.test(words[words.length - 1])) words.pop();
  return words.join(' ').replace(/[\s,:—(&]+$/, '');
}
const TRAILING = /^(a|an|the|of|from|your|my|to|and|or|with|in|on|for|de|da|do|des|du|la|le|les|el|los|las|tu|tus|ta|tes|seu|sua|seus|suas|e|y|et|und|oder|von|aus|dein|deine|deinen|der|die|das|mit|für|ve|ile|için|bir)$/i;

// Decorative images keep their meaning out of screen readers (aria-hidden) but
// get a short descriptive alt from the file name, which image search and
// crawlers like Bing expect ("instagram-640.webp" → "Instagram icon").
function describeImages(html) {
  return html.replace(/<img\b([^>]*?)\salt=""([^>]*)>/g, (tag, before, after) => {
    const src = (tag.match(/\ssrc="([^"]+)"/) || [])[1] || '';
    const base = src.split('/').pop().replace(/\.[a-z0-9]+$/i, '').replace(/-\d+$/, '').replace(/-/g, ' ');
    if (!base) return tag;
    const kind = src.includes('/icons/') ? 'icon' : 'illustration';
    const label = `${base.replace(/^\w/, (c) => c.toUpperCase())} ${kind}`;
    const hidden = /aria-hidden=/.test(tag) ? '' : ' aria-hidden="true"';
    return `<img${before} alt="${label}"${hidden}${after}>`;
  });
}

// Below-the-fold images load lazily; the first image of a page (its hero) and
// anything already marked loading/fetchpriority are left alone so LCP stays fast.
function lazyImages(html) {
  let first = true;
  return html.replace(/<img\b[^>]*>/g, (tag) => {
    if (first) {
      first = false;
      return tag;
    }
    if (/\s(loading|fetchpriority)=/.test(tag)) return tag;
    return tag.replace(/<img\b/, '<img loading="lazy"');
  });
}

function shortDescription(text, max = 160) {
  const d = String(text || '');
  if (d.length <= max) return d;
  const cut = d.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('.'));
  if (end > 80) return cut.slice(0, end + 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,:;—–-]+$/, '')}…`;
}

// When a page really changed: its source file (or partials it uses), never
// "today" on every build — search engines ignore a lastmod that always moves.
// The date of the last commit that touched the file; a fresh checkout gives
// every file the same mtime, which would move every lastmod on each deploy.
function fileDate(file) {
  try {
    const d = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (d) return new Date(d);
  } catch {
    /* no git history (e.g. a source tarball) */
  }
  return statSync(path.join(root, file)).mtime;
}

function lastModified(file, meta) {
  const mtime = fileDate(file);
  const article = meta.updated || meta.article;
  const best = article && new Date(article) > mtime ? new Date(article) : mtime;
  return best.toISOString().slice(0, 10);
}

// Pages that are tools people use in the browser.
const TOOL_ROUTES = new Set(['/instagram/', '/tiktok/', '/x/', '/facebook/', '/linkedin/', '/fake-follower-checker/', '/instagram-audit/', '/instagram-dm-analyzer/', '/best-time-to-post/', '/instagram-message-viewer/', '/tiktok-watch-history/', '/instagram-story-archive/', '/search-old-tweets/', '/instagram-liked-posts/', '/instagram-account-age/', '/export-instagram-followers/', '/threads-unfollowers/', '/instagram-follower-tracker/', '/whatsapp-chat-analyzer/', '/telegram-chat-analyzer/', '/spotify-stats/']);

function breadcrumbs(loc, meta, strings, pageName) {
  if (meta.route === '/') return null;
  const items = [{ name: site.name, url: `${origin}${urlOf(loc, '/')}` }];
  const parent = meta.route.match(/^\/(guides|blog)\/.+/);
  if (parent) items.push({ name: parent[1] === 'guides' ? strings.fGuides : strings.fBlog, url: `${origin}${urlOf(loc, `/${parent[1]}/`)}` });
  items.push({ name: pageName, url: `${origin}${urlOf(loc, meta.route)}` });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}

function languageLinks(loc, route) {
  return locales
    .map((l) => {
      const href = urlOf(l, routesOf.get(l.code).has(route) ? route : '/');
      return `<a href="${href}" hreflang="${l.hreflang}" lang="${l.hreflang}"${l.code === loc.code ? ' aria-current="true"' : ''}>${esc(l.name)}</a>`;
    })
    .join('');
}

const sitemap = [];
const ogManifest = [];
for (const { loc, file, meta, body } of pages) {
  const partials = loc.code === 'en' ? basePartials : { ...basePartials, ...loadPartials(`site/i18n/${loc.code}/partials`) };
  const strings = { ...layoutStrings.en, ...layoutStrings[loc.code] };
  let content = body;
  for (let depth = 0; depth < 4 && /\{\{>/.test(content); depth++) {
    content = content.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
      if (!(name in partials)) throw new Error(`${file}: unknown partial ${name}`);
      return partials[name];
    });
  }
  content = content.replaceAll('{{siteName}}', site.name).replaceAll('{{origin}}', origin);

  const url = urlOf(loc, meta.route);
  const canonical = `${origin}${url.replace(/index\.html$/, '')}`;
  const translations = meta.noindex || meta.route.endsWith('.html') ? [] : localesWith(meta.route);
  const alternates =
    translations.length > 1
      ? [...translations.map((l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${origin}${urlOf(l, meta.route)}">`), `<link rel="alternate" hreflang="x-default" href="${origin}${meta.route}">`].join('\n')
      : '';
  const schemas = [];
  const pageName = meta.headline || shortTitle(meta.title, 60).split(' · ')[0].split(' — ')[0];
  // Share image: a per-page, per-language card when it has been rendered
  // (npm run og), otherwise the generic one.
  const ogKey = `${loc.code}-${meta.route.replace(/^\/|\/$/g, '').replace(/\//g, '--') || 'home'}`;
  const ogImage = existsSync(path.join(root, `public/assets/img/og/${ogKey}.jpg`)) ? `/assets/img/og/${ogKey}.jpg` : '/assets/img/og.png';
  if (!meta.noindex && !meta.route.endsWith('.html')) {
    const kicker = meta.route.startsWith('/guides/') ? strings.fGuides : meta.route.startsWith('/blog/') ? strings.fBlog : TOOL_ROUTES.has(meta.route) ? strings.fTools : '';
    ogManifest.push({ key: ogKey, lang: loc.code, kicker, tag: strings.ogTag, title: meta.route === '/' ? strings.ogHome || pageName : pageName, sub: shortDescription(meta.description, 130) });
  }
  if (meta.route === '/') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: site.name,
      url: `${origin}${url}`,
      inLanguage: loc.hreflang,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any (runs in the browser)',
      description: meta.description,
      offers: { '@type': 'AggregateOffer', priceCurrency: 'USD', lowPrice: '0', highPrice: '119' },
    });
    schemas.push({ '@context': 'https://schema.org', '@type': 'Organization', name: site.name, url: `${origin}/`, logo: `${origin}/assets/img/icon-512.png` });
    schemas.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: `${origin}${url}`, inLanguage: loc.hreflang });
  } else if (TOOL_ROUTES.has(meta.route)) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: `${pageName} — ${site.name}`,
      url: `${origin}${url}`,
      inLanguage: loc.hreflang,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any (runs in the browser)',
      description: shortDescription(meta.description),
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    });
  }
  if (!meta.noindex) {
    const crumbs = breadcrumbs(loc, meta, { ...layoutStrings.en, ...layoutStrings[loc.code] }, pageName);
    if (crumbs) schemas.push(crumbs);
  }
  if (meta.article) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: meta.headline || meta.title,
      description: meta.description,
      datePublished: meta.article,
      dateModified: meta.updated || meta.article,
      mainEntityOfPage: canonical,
      image: `${origin}${ogImage}`,
      author: { '@type': 'Organization', name: site.name, url: `${origin}/` },
      publisher: { '@type': 'Organization', name: site.name, logo: { '@type': 'ImageObject', url: `${origin}/assets/img/icon-512.png` } },
    });
  }
  if (meta.route === '/pricing/') {
    // One Product per tier with an Offer per plan, so the prices can show up in search.
    for (const tier of TIERS) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: `${site.name} ${tier.name}`,
        description: `${tier.tagline}. ${tier.bestFor}.`,
        brand: { '@type': 'Brand', name: site.name },
        image: `${origin}${ogImage}`,
        offers: PLANS.filter((p) => p.tier === tier.id).map((p) => ({
          '@type': 'Offer',
          name: p.name,
          price: String(p.priceUsd),
          priceCurrency: 'USD',
          url: `${origin}${url}`,
          availability: 'https://schema.org/InStock',
        })),
      });
    }
  }
  if (meta.faqSchema) {
    const faq = faqSchema(content);
    if (faq) schemas.push(faq);
  }

  let html = layout.replace(/\{\{t:(\w+)\}\}/g, (_, key) => {
    if (!(key in strings)) throw new Error(`layout string "${key}" is missing in site/i18n/en/layout.json`);
    return esc(strings[key]);
  });
  const vars = {
    lang: loc.hreflang,
    ogLocale: loc.og,
    ogImage,
    ogType: meta.article ? 'article' : 'website',
    articleMeta: meta.article ? `\n<meta property="article:published_time" content="${meta.article}">\n<meta property="article:modified_time" content="${meta.updated || meta.article}">` : '',
    alternates,
    title: esc(shortTitle(meta.title)),
    description: esc(shortDescription(meta.description)),
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
  html = localizeLinks(html, loc);
  // Language links are absolute per locale, so they are added after localizeLinks.
  const links = languageLinks(loc, meta.route);
  const current = locales.find((l) => l.code === loc.code);
  html = html
    .replace('{{langSwitch}}', `<details class="lang-switch"><summary aria-label="${esc(strings.language)}: ${esc(current.name)}"><svg aria-hidden="true"><use href="#i-globe"/></svg>${current.short}</summary><div class="lang-menu">${links}</div></details>`)
    .replaceAll('{{langLinks}}', links);

  const out = url.endsWith('.html') ? `public${url}` : `public${url}index.html`;
  write(out, lazyImages(describeImages(html)));
  if (!meta.noindex && !meta.route.endsWith('.html')) {
    const alternates = translations.length > 1 ? [...translations.map((l) => ({ hreflang: l.hreflang, href: `${origin}${urlOf(l, meta.route)}` })), { hreflang: 'x-default', href: `${origin}${meta.route}` }] : [];
    sitemap.push({ loc: canonical, lastmod: lastModified(file, meta), priority: meta.route === '/' ? '1.0' : meta.article ? '0.6' : '0.8', alternates });
  }
}

write(
  'public/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemap
    .map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.priority}</priority>${u.alternates.map((a) => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}"/>`).join('')}</url>`)
    .join('\n')}\n</urlset>\n`,
);
// Account pages stay crawlable: they carry `noindex`, which crawlers can only
// see if robots.txt lets them in (and Bing reports blocked linked pages).
const privatePaths = ['/admin/', '/success/', '/api/'];
write('public/robots.txt', `User-agent: *\nAllow: /\n${[...new Set(privatePaths)].map((p) => `Disallow: ${p}`).join('\n')}\n\nSitemap: ${origin}/sitemap.xml\n`);

// Texts for the share-image renderer (scripts/og.js), one card per page.
write('.og/manifest.json', JSON.stringify(ogManifest, null, 1));

const sw = read('site/sw.template.js').replace('__VERSION__', version);
write('public/sw.js', sw);
console.log(`Built ${sitemap.length} indexable pages for ${origin} (v${version})`);
