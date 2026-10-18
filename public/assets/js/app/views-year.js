import { h, icon } from '../lib/ui.js';
import { fmtInt } from '../lib/format.js';
import { pickYear, yearInReview } from '../core/year.js';
import { viewHead, panel, emptyState, upsell } from './components.js';
import { drawYearCard, downloadCanvas, shareCanvas } from './chat-card.js';
import { t as tl } from '../lib/i18n.js';

const NAME = { instagram: 'Instagram', threads: 'Threads', tiktok: 'TikTok', x: 'X', facebook: 'Facebook', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', telegram: 'Telegram', spotify: 'Spotify' };

function lineFor(it) {
  const p = NAME[it.platform] || it.platform;
  const v = fmtInt(it.value);
  switch (it.key) {
    case 'followers': return [`+${v}`, tl('new followers on {v0}', { v0: p })];
    case 'friends': return [`+${v}`, tl('new friends on {v0}', { v0: p })];
    case 'connections': return [`+${v}`, tl('new connections on {v0}', { v0: p })];
    case 'posts': return [v, tl('posts on {v0}', { v0: p })];
    case 'chats': return [v, tl('people you messaged on {v0}', { v0: p })];
    case 'messages': return [v, tl('messages on {v0}', { v0: p })];
    case 'minutes': return [v, it.top ? tl('minutes on Spotify · top: {v0}', { v0: it.top }) : tl('minutes on Spotify')];
    default: return [v, it.key];
  }
}

export function yearView(datasets, ctx) {
  const full = ctx.pro || ctx.demo;
  const year = pickYear();
  const items = yearInReview(datasets, year).sort((a, b) => b.value - a.value);
  const root = h('div', { class: 'app-content' }, viewHead(tl('Your {v0}', { v0: year }), tl('Your year online across every export you dropped — as a card for your story.')));
  if (!items.length) return root.appendChild(panel(null, emptyState(tl('Nothing dated in {v0} in these exports yet.', { v0: year }), 'calendar'))) && root;
  const lines = items.map(lineFor);
  const canvas = drawYearCard(year, lines, { watermark: !full });
  canvas.style.cssText = 'width:100%;max-width:420px;height:auto;border-radius:18px;display:block;margin:0 auto';
  const name = `my-${year}-unwrapped.png`;
  const share = h('button', { class: 'btn btn--primary', type: 'button' }, icon('share'), tl('Share'));
  share.addEventListener('click', async () => {
    if (!(await shareCanvas(canvas, name).catch(() => false))) downloadCanvas(canvas, name);
  });
  const save = h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => downloadCanvas(canvas, name) }, icon('download'), tl('Save image'));
  root.append(
    panel(null, canvas, h('div', { class: 'drop-actions', style: { justifyContent: 'center', marginTop: '18px' } }, share, save)),
    full ? null : upsell({ title: tl('Remove the watermark'), text: tl('Plus gives you clean cards for every chat.'), onUpgrade: () => ctx.upgrade('year') }),
  );
  return root;
}
