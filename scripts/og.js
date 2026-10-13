// Share images (og:image) for every page and language.
//
//   npm run build && npm run og   → then open http://localhost:8799 in a browser
//
// The page draws each card on a <canvas> with the site's own fonts and posts it
// back here; cards are written to public/assets/img/og/<lang>-<page>.jpg and
// picked up by the next build. Run it again after adding or renaming pages.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'public/assets/img/og');
const manifestPath = path.join(root, '.og/manifest.json');
const PORT = Number(process.env.OG_PORT) || 8799;
if (!existsSync(manifestPath)) {
  console.error('Run "npm run build" first — it writes .og/manifest.json.');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const PAGE = `<!doctype html><meta charset="utf-8"><title>Share images</title>
<style>body{background:#07070b;color:#ccc;font:14px system-ui;margin:20px}canvas{width:600px;height:315px;display:block;margin:10px 0;border-radius:8px}</style>
<p id="s">Rendering…</p><canvas id="c" width="1200" height="630"></canvas>
<script type="module">
const s = document.getElementById('s');
const c = document.getElementById('c');
const ctx = c.getContext('2d');
const EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+20A0-20C0, U+2C60-2C7F, U+A720-A7FF';
const fonts = [
  new FontFace('Bricolage', 'url(/fonts/bricolage-wght.woff2)', { weight: '200 800' }),
  new FontFace('Bricolage', 'url(/fonts/bricolage-wght-ext.woff2)', { weight: '200 800', unicodeRange: EXT }),
  new FontFace('Inter', 'url(/fonts/inter-wght.woff2)', { weight: '100 900' }),
  new FontFace('Inter', 'url(/fonts/inter-wght-ext.woff2)', { weight: '100 900', unicodeRange: EXT }),
];
for (const f of fonts) document.fonts.add(await f.load());
const list = await (await fetch('/manifest.json')).json();

function wrap(text, font, max, lines) {
  ctx.font = font;
  const words = text.split(/\\s+/);
  const out = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (ctx.measureText(next).width > max && line) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  if (out.length > lines) {
    out.length = lines;
    let last = out[lines - 1];
    while (ctx.measureText(last + '…').width > max && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' '));
    out[lines - 1] = last + '…';
  }
  return out;
}

function pill(x, y, text, { bg, fg, font, padX = 18, h = 42, dot }) {
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2 + (dot ? 18 : 0);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
  if (dot) { ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(x + padX + 4, y + h / 2, 5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = fg; ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX + (dot ? 18 : 0), y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return w;
}

function draw(card) {
  const W = 1200, H = 630;
  ctx.fillStyle = '#07070b'; ctx.fillRect(0, 0, W, H);
  // Aurora glows.
  for (const [x, y, r, col] of [[160, 40, 520, 'rgba(143,125,255,.38)'], [1120, 640, 560, 'rgba(215,255,58,.16)'], [980, 40, 380, 'rgba(26,158,142,.20)']]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // Fine grid.
  ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); ctx.stroke(); }
  // Brand.
  const lg = ctx.createLinearGradient(64, 56, 112, 104);
  lg.addColorStop(0, '#d7ff3a'); lg.addColorStop(1, '#8f7dff');
  ctx.fillStyle = lg; ctx.beginPath(); ctx.roundRect(64, 56, 48, 48, 14); ctx.fill();
  ctx.fillStyle = '#07070b'; ctx.beginPath(); ctx.roundRect(76, 68, 24, 24, 7); ctx.fill();
  ctx.fillStyle = '#d7ff3a'; ctx.beginPath(); ctx.arc(94, 86, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '700 34px Bricolage'; ctx.fillText('Unwrapped', 128, 92);
  if (card.kicker) {
    ctx.font = '600 20px Inter';
    const kw = ctx.measureText(card.kicker.toUpperCase()).width + 36;
    pill(W - 64 - kw, 59, card.kicker.toUpperCase(), { bg: 'rgba(255,255,255,.08)', fg: '#d7ff3a', font: '600 20px Inter' });
  }
  // Title + accent bar + subtitle, centred in the space between the brand row
  // and the footer: the title as large as fits in three lines, then the
  // subtitle drops to one line or the title shrinks until everything fits.
  const TOP = 140, BOTTOM = H - 122, GAP = 30, BAR = 6, SUB_LH = 38;
  let size = 76, lines, sub, total, lh;
  for (; size >= 44; size -= 4) {
    lines = wrap(card.title, '700 ' + size + 'px Bricolage', 1060, 9);
    if (lines.length > 3) continue;
    lh = Math.round(size * 1.08);
    for (const subLines of [2, 1]) {
      sub = wrap(card.sub, '400 27px Inter', 1040, subLines);
      total = lines.length * lh + GAP + BAR + GAP + sub.length * SUB_LH;
      if (total <= BOTTOM - TOP) break;
    }
    if (total <= BOTTOM - TOP) break;
  }
  if (lines.length > 3 || size < 44) {
    size = 44; lh = Math.round(size * 1.08);
    lines = wrap(card.title, '700 44px Bricolage', 1060, 3);
    sub = wrap(card.sub, '400 27px Inter', 1040, 1);
    total = lines.length * lh + GAP + BAR + GAP + SUB_LH;
  }
  let y = TOP + (BOTTOM - TOP - total) / 2 + size * 0.86;
  ctx.fillStyle = '#ffffff'; ctx.font = '700 ' + size + 'px Bricolage';
  for (const l of lines) { ctx.fillText(l, 64, y); y += lh; }
  // Accent bar under the title.
  const barY = y - lh + size * 0.14 + GAP;
  const bar = ctx.createLinearGradient(64, 0, 300, 0);
  bar.addColorStop(0, '#d7ff3a'); bar.addColorStop(1, '#8f7dff');
  ctx.fillStyle = bar; ctx.beginPath(); ctx.roundRect(64, barY, 120, BAR, 3); ctx.fill();
  // Subtitle.
  ctx.fillStyle = '#b9b9c6'; ctx.font = '400 27px Inter';
  let sy = barY + BAR + GAP + 20;
  for (const l of sub) { ctx.fillText(l, 64, sy); sy += SUB_LH; }
  // Footer.
  pill(64, H - 92, card.tag, { bg: 'rgba(215,255,58,.12)', fg: '#e9ffb0', font: '600 21px Inter', dot: '#d7ff3a' });
  ctx.font = '500 21px Inter'; ctx.fillStyle = 'rgba(255,255,255,.55)';
  const plats = 'Instagram · TikTok · X · Facebook · LinkedIn';
  ctx.fillText(plats, W - 64 - ctx.measureText(plats).width, H - 63);
}

let n = 0;
for (const card of list) {
  draw(card);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  const res = await fetch('/save/' + card.key, { method: 'POST', body: blob });
  if (!res.ok) throw new Error('save failed ' + card.key);
  s.textContent = 'Saved ' + (++n) + ' / ' + list.length + ' — ' + card.key;
}
s.textContent = 'Done: ' + n + ' images. Run "npm run build" again.';
fetch('/done');
</script>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
  if (req.method === 'GET' && url.pathname === '/manifest.json') return res.writeHead(200, { 'content-type': 'application/json' }).end(readFileSync(manifestPath));
  const font = url.pathname.match(/^\/fonts\/([a-z-]+\.woff2)$/);
  if (req.method === 'GET' && font) return res.writeHead(200, { 'content-type': 'font/woff2' }).end(readFileSync(path.join(root, 'public/assets/fonts', font[1])));
  const save = url.pathname.match(/^\/save\/([a-z]{2}-[a-z0-9-]+)$/);
  if (req.method === 'POST' && save) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      writeFileSync(path.join(outDir, `${save[1]}.jpg`), Buffer.concat(chunks));
      res.writeHead(204).end();
    });
    return;
  }
  if (url.pathname === '/done') {
    res.writeHead(204).end();
    console.log('All share images written to public/assets/img/og/');
    setTimeout(() => process.exit(0), 200);
    return;
  }
  res.writeHead(404).end();
});
server.listen(PORT, '127.0.0.1', () => console.log(`Open http://localhost:${PORT} in a browser to render the share images…`));
