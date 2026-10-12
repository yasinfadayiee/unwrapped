// Renders the story slides into a 1080×1920 video (on-device, via
// MediaRecorder) ready for Instagram / TikTok stories. Numbers only.

import { fontsReady } from './wrapped.js';

const W = 1080;
const H = 1920;
const PALETTE = [
  ['#5a43d6', '#1a9e8e', '#07070b'],
  ['#e0574a', '#8f7dff', '#0b0710'],
  ['#9bc425', '#1a9e8e', '#060a06'],
  ['#b8820f', '#8f7dff', '#0a0806'],
  ['#8f7dff', '#e0574a', '#07070b'],
];
const SLIDE_MS = 2600;

function pickMime() {
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  return types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
}

export function videoSupported() {
  return Boolean(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream && pickMime());
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawFrame(ctx, slide, i, t, total, site) {
  const [a, b, base] = PALETTE[i % PALETTE.length];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  const drift = Math.sin(t * Math.PI) * 80;
  for (const [x, y, r, c] of [
    [200 + drift, 380, 1000, a],
    [900 - drift, 1600, 900, b],
  ]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `${c}cc`);
    g.addColorStop(1, `${c}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // progress bars
  for (let k = 0; k < total; k++) {
    const x = 60 + k * ((W - 120) / total);
    const w = (W - 120) / total - 10;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x, 60, w, 6);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, 60, k < i ? w : k === i ? w * t : 0, 6);
  }
  const ease = 1 - Math.pow(1 - Math.min(1, t * 1.6), 4);
  ctx.globalAlpha = Math.min(1, t * 4);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '500 34px "JetBrains Mono", monospace';
  ctx.fillText(String(slide.kicker).toUpperCase(), W / 2, 700 - (1 - ease) * 40);

  let y = 960;
  const big = slide.number !== undefined ? `${Math.round(slide.number * ease).toLocaleString('en-US')}${slide.suffix || ''}` : slide.big;
  if (big) {
    let size = 300;
    ctx.font = `800 ${size}px Bricolage, Inter, sans-serif`;
    while (ctx.measureText(big).width > W - 140 && size > 120) {
      size -= 10;
      ctx.font = `800 ${size}px Bricolage, Inter, sans-serif`;
    }
    ctx.fillStyle = slide.accentHex || '#ffffff';
    ctx.fillText(big, W / 2, y);
    y += 140;
  } else y = 900;
  ctx.fillStyle = '#fff';
  ctx.font = '700 84px Bricolage, Inter, sans-serif';
  const title = slide.serif ? `${slide.title} ${slide.serif}` : slide.title;
  for (const line of wrapLines(ctx, title, W - 160)) {
    ctx.fillText(line, W / 2, y);
    y += 96;
  }
  if (slide.text) {
    y += 30;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '500 44px Inter, sans-serif';
    for (const line of wrapLines(ctx, slide.text, W - 220)) {
      ctx.fillText(line, W / 2, y);
      y += 60;
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '600 34px Inter, sans-serif';
  ctx.fillText(`made with ${site}`, W / 2, H - 110);
}

const ACCENTS = { 'var(--c2)': '#ff7b6e', 'var(--signal)': '#d7ff3a' };

export async function recordStory(slides, { site, onProgress } = {}) {
  await fontsReady();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const list = slides.filter((s) => !s.final).map((s) => ({ ...s, accentHex: ACCENTS[s.accent] }));
  list.push({ kicker: 'Your turn', title: 'Unwrap yours at', serif: site, text: 'No password. Nothing uploaded.' });
  const mime = pickMime();
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((resolve) => (rec.onstop = resolve));
  rec.start(250);
  const totalMs = list.length * SLIDE_MS;
  const start = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= totalMs) return resolve();
      const i = Math.min(list.length - 1, Math.floor(elapsed / SLIDE_MS));
      drawFrame(ctx, list[i], i, (elapsed - i * SLIDE_MS) / SLIDE_MS, list.length, site);
      onProgress?.(elapsed / totalMs);
      setTimeout(tick, 1000 / 30);
    };
    tick();
  });
  rec.stop();
  await done;
  const type = mime.split(';')[0];
  return new Blob(chunks, { type });
}
