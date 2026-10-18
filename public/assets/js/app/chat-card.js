// A shareable "Chat Wrapped" image, drawn on a canvas in the browser.
// Free cards carry a large watermark; paid cards only a small credit line.

import { t as tl } from '../lib/i18n.js';
import { fmtInt } from '../lib/format.js';

const W = 1080;
const H = 1350;

function fit(ctx, text, max, size, weight = 800) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px Inter, system-ui, sans-serif`;
    s -= 4;
  } while (ctx.measureText(text).width > max && s > 24);
}

export function drawChatCard(chat, effort, { watermark = true } = {}) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#1b1036');
  g.addColorStop(0.55, '#0d0d14');
  g.addColorStop(1, '#0b2b1c');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(201,255,60,.10)';
  x.beginPath();
  x.arc(900, 160, 260, 0, Math.PI * 2);
  x.fill();

  x.fillStyle = '#c9ff3c';
  x.font = '700 34px Inter, system-ui, sans-serif';
  x.fillText(tl('CHAT WRAPPED'), 80, 120);
  x.fillStyle = '#fff';
  fit(x, chat.title || tl('WhatsApp chat'), W - 160, 92);
  x.fillText(chat.title || tl('WhatsApp chat'), 80, 230);

  const rows = [
    [fmtInt(chat.total), tl('messages')],
    [fmtInt(chat.longestStreak), tl('days in a row')],
    [chat.topEmojis[0]?.key || '💬', tl('favourite emoji')],
    [fmtInt(chat.activeDays), tl('days you talked')],
  ];
  rows.forEach(([big, small], i) => {
    const cx = 80 + (i % 2) * 470;
    const cy = 400 + Math.floor(i / 2) * 230;
    x.fillStyle = 'rgba(255,255,255,.06)';
    x.beginPath();
    x.roundRect(cx, cy, 440, 200, 28);
    x.fill();
    x.fillStyle = '#fff';
    fit(x, big, 380, 96);
    x.fillText(big, cx + 32, cy + 112);
    x.fillStyle = 'rgba(255,255,255,.65)';
    x.font = '500 34px Inter, system-ui, sans-serif';
    x.fillText(small, cx + 32, cy + 168);
  });

  if (effort) {
    const top = effort.scoreA >= effort.scoreB ? [effort.a.name, effort.scoreA] : [effort.b.name, effort.scoreB];
    x.fillStyle = 'rgba(255,255,255,.65)';
    x.font = '500 34px Inter, system-ui, sans-serif';
    x.fillText(tl('Who cares more'), 80, 920);
    x.fillStyle = '#fff';
    fit(x, `${top[0]} · ${top[1]}%`, W - 160, 76);
    x.fillText(`${top[0]} · ${top[1]}%`, 80, 1010);
    x.fillStyle = 'rgba(255,255,255,.12)';
    x.beginPath();
    x.roundRect(80, 1050, W - 160, 26, 13);
    x.fill();
    x.fillStyle = '#c9ff3c';
    x.beginPath();
    x.roundRect(80, 1050, ((W - 160) * effort.scoreA) / 100, 26, 13);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.7)';
    x.font = '500 28px Inter, system-ui, sans-serif';
    x.fillText(effort.a.name.slice(0, 22), 80, 1118);
    const bn = effort.b.name.slice(0, 22);
    x.fillText(bn, W - 80 - x.measureText(bn).width, 1118);
  }

  x.fillStyle = 'rgba(255,255,255,.55)';
  x.font = '600 30px Inter, system-ui, sans-serif';
  x.fillText('myunwrapped.com', 80, H - 70);
  if (watermark) {
    x.save();
    x.translate(W / 2, H / 2);
    x.rotate(-0.42);
    x.fillStyle = 'rgba(255,255,255,.09)';
    x.font = '900 120px Inter, system-ui, sans-serif';
    x.textAlign = 'center';
    x.fillText('UNWRAPPED', 0, 0);
    x.fillText('FREE PREVIEW', 0, 150);
    x.restore();
  }
  return c;
}

export function downloadCanvas(canvas, name) {
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

export async function shareCanvas(canvas, name) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text: 'myunwrapped.com' });
    return true;
  }
  return false;
}
