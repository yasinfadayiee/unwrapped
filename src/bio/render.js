// Server-rendered public "link in bio" page: one small HTML file, no JS,
// mobile-first, six themes. Every value is escaped; links go through the
// click counter.

import { escapeHtml as e } from '../util.js';

const THEME = {
  midnight: { bg: '#07070b', bg2: 'radial-gradient(900px 500px at 15% -10%, rgba(143,125,255,.35), transparent 60%), radial-gradient(700px 500px at 100% 110%, rgba(26,158,142,.25), transparent 60%)', card: 'rgba(255,255,255,.06)', border: 'rgba(255,255,255,.12)', text: '#f4f4f6', muted: '#b9b9c6', accent: '#d7ff3a', accentInk: '#0a0a0e' },
  aurora: { bg: '#0b1020', bg2: 'linear-gradient(160deg, #3b2a8f 0%, #0b1020 45%, #0f5d57 100%)', card: 'rgba(255,255,255,.08)', border: 'rgba(255,255,255,.16)', text: '#ffffff', muted: '#d4d8ff', accent: '#8ff0d8', accentInk: '#08221d' },
  sunset: { bg: '#1a0b12', bg2: 'linear-gradient(170deg, #ff7a59 0%, #c2346b 45%, #2a0f2e 100%)', card: 'rgba(255,255,255,.14)', border: 'rgba(255,255,255,.24)', text: '#ffffff', muted: '#ffe3ea', accent: '#ffffff', accentInk: '#7a1d3f' },
  mint: { bg: '#eafaf3', bg2: 'linear-gradient(180deg, #d9f7ea 0%, #f6fffb 100%)', card: '#ffffff', border: '#cdeee0', text: '#0b2a20', muted: '#456b5e', accent: '#0f9d74', accentInk: '#ffffff' },
  paper: { bg: '#f7f4ee', bg2: 'linear-gradient(180deg, #f7f4ee 0%, #efe9dd 100%)', card: '#ffffff', border: '#e6dfd0', text: '#1d1a14', muted: '#6b6455', accent: '#1d1a14', accentInk: '#f7f4ee' },
  mono: { bg: '#000000', bg2: '#000000', card: '#111111', border: '#2a2a2a', text: '#ffffff', muted: '#a3a3a3', accent: '#ffffff', accentInk: '#000000' },
};

const SOCIAL = {
  instagram: ['Instagram', (v) => (/^https?:/i.test(v) ? v : `https://instagram.com/${v.replace(/^@/, '')}`)],
  tiktok: ['TikTok', (v) => (/^https?:/i.test(v) ? v : `https://www.tiktok.com/@${v.replace(/^@/, '')}`)],
  x: ['X', (v) => (/^https?:/i.test(v) ? v : `https://x.com/${v.replace(/^@/, '')}`)],
  youtube: ['YouTube', (v) => (/^https?:/i.test(v) ? v : `https://www.youtube.com/@${v.replace(/^@/, '')}`)],
  telegram: ['Telegram', (v) => (/^https?:/i.test(v) ? v : `https://t.me/${v.replace(/^@/, '')}`)],
  whatsapp: ['WhatsApp', (v) => (/^https?:/i.test(v) ? v : `https://wa.me/${v.replace(/\D/g, '')}`)],
  facebook: ['Facebook', (v) => (/^https?:/i.test(v) ? v : `https://facebook.com/${v.replace(/^@/, '')}`)],
  linkedin: ['LinkedIn', (v) => (/^https?:/i.test(v) ? v : `https://www.linkedin.com/in/${v.replace(/^@/, '')}`)],
  threads: ['Threads', (v) => (/^https?:/i.test(v) ? v : `https://www.threads.net/@${v.replace(/^@/, '')}`)],
  email: ['E-mail', (v) => `mailto:${v.replace(/^mailto:/i, '')}`],
};

const okHref = (u) => (/^(https?:|mailto:|tg:)/i.test(u) ? u : '#');

export function renderBioPage({ handle, data, pro, site }) {
  const t = THEME[data.theme] || THEME.midnight;
  const name = data.name || handle;
  const initials = data.emoji || name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '★';
  const links = (data.links || []).filter((l) => l.on);
  const socials = Object.entries(data.socials || {}).filter(([k]) => SOCIAL[k]);
  const desc = data.bio || `${name} — links and contact`;
  const url = `${site}/@${handle}`;
  return `<!doctype html>
<html lang="en" dir="auto"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(name)} (@${e(handle)}) · links</title>
<meta name="description" content="${e(desc.slice(0, 160))}">
<link rel="canonical" href="${e(url)}">
<meta property="og:type" content="profile"><meta property="og:title" content="${e(name)}"><meta property="og:description" content="${e(desc.slice(0, 200))}"><meta property="og:url" content="${e(url)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="${t.bg}">
<link rel="icon" href="/favicon.ico">
<style>
@font-face{font-family:Brico;src:url(/assets/fonts/bricolage-wght.woff2) format('woff2');font-weight:200 800;font-display:swap}
@font-face{font-family:Inter;src:url(/assets/fonts/inter-wght.woff2) format('woff2');font-weight:100 900;font-display:swap}
*{box-sizing:border-box}html,body{margin:0}
body{min-height:100vh;background:${t.bg};background-image:${t.bg2};background-attachment:fixed;color:${t.text};font:16px/1.5 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:560px;margin:0 auto;padding:56px 18px 40px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
.av{width:96px;height:96px;border-radius:50%;display:grid;place-items:center;font:700 38px Brico,sans-serif;background:${t.card};border:1px solid ${t.border};box-shadow:0 10px 40px rgba(0,0,0,.25)}
h1{font:750 26px/1.15 Brico,sans-serif;letter-spacing:-.02em;margin:6px 0 0}
.handle{color:${t.muted};font-size:14px;margin-top:-8px}
.bio{color:${t.muted};max-width:44ch;margin:0;white-space:pre-line}
.links{width:100%;display:flex;flex-direction:column;gap:12px;margin-top:10px}
.link{display:block;padding:16px 20px;border-radius:16px;background:${t.card};border:1px solid ${t.border};color:${t.text};text-decoration:none;font-weight:600;backdrop-filter:blur(8px);transition:transform .15s ease,background .15s ease}
.link:hover{transform:translateY(-2px)}.link:active{transform:scale(.98)}
.link:first-child{background:${t.accent};color:${t.accentInk};border-color:transparent}
.socials{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:8px}
.soc{padding:8px 14px;border-radius:999px;border:1px solid ${t.border};color:${t.text};text-decoration:none;font-size:14px;background:${t.card}}
.badge{margin-top:28px;font-size:13px;color:${t.muted};text-decoration:none;opacity:.85}
.badge b{color:${t.text}}
@media (prefers-reduced-motion:reduce){.link{transition:none}}
</style></head>
<body><main>
<div class="av" aria-hidden="true">${e(initials)}</div>
<h1>${e(name)}</h1>
<div class="handle">@${e(handle)}</div>
${data.bio ? `<p class="bio">${e(data.bio)}</p>` : ''}
<nav class="links" aria-label="Links">${links.map((l) => `<a class="link" href="/api/bio/go/${e(handle)}/${e(l.id)}" rel="noopener">${e(l.title)}</a>`).join('')}</nav>
${socials.length ? `<div class="socials">${socials.map(([k, v]) => `<a class="soc" href="${e(okHref(SOCIAL[k][1](v)))}" rel="noopener me">${SOCIAL[k][0]}</a>`).join('')}</div>` : ''}
${pro ? '' : `<a class="badge" href="${e(site)}/bio/">Made with <b>Unwrapped Bio</b> · get your free page</a>`}
</main></body></html>`;
}
