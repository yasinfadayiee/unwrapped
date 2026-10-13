// TikTok Video finder: "I saw a video last Tuesday night…" — browse every video
// you watched, liked, saved or shared by day and time, then open it again.

import { h, icon, clear, csvFile, downloadBlob, toast } from '../lib/ui.js';
import { fmtInt } from '../lib/format.js';
import { viewHead, emptyState } from './components.js';
import { locale, t as tl } from '../lib/i18n.js';

const PAGE = 150;
const timeFmt = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const isoDay = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const videoId = (link) => (link.match(/(\d{8,})/) || [])[1] || '';

export function videosView(ds, ctx) {
  const H = ds.history;
  const kinds = [
    { id: 'watched', label: tl('Watched'), items: H.watched },
    { id: 'liked', label: tl('Liked'), items: H.liked },
    { id: 'favorites', label: tl('Favorites'), items: H.favorites },
    { id: 'shared', label: tl('Shared'), items: H.shared },
  ].filter((k) => k.items.length);
  const root = h('div', { class: 'app-content' });
  root.append(viewHead(tl('Video finder'), tl('Find any TikTok you watched, liked, saved or shared — by the day and time you remember — and open it again.')));
  if (!kinds.length) {
    root.append(emptyState(tl('No video links in this export. Request “All data” in JSON format.'), 'play'));
    return root;
  }

  let kind = kinds[0];
  let shown = PAGE;
  const tabs = h('div', { class: 'seg', role: 'tablist' });
  const day = h('input', { class: 'input input--sm', type: 'date', 'aria-label': tl('Day') });
  const part = h(
    'select',
    { class: 'select input--sm', 'aria-label': tl('Time of day') },
    [
      ['any', tl('Any time')],
      ['morning', tl('Morning (6–12)')],
      ['afternoon', tl('Afternoon (12–18)')],
      ['evening', tl('Evening (18–24)')],
      ['night', tl('Night (0–6)')],
    ].map(([v, l]) => h('option', { value: v }, l)),
  );
  const csv = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('download'), tl('Download CSV'));
  const count = h('span', { class: 'tiny muted' });
  const list = h('div', { class: 'vid-list' });
  root.append(
    h('div', { class: 'panel' }, h('div', { class: 'vid-tools' }, tabs, day, part, csv), h('p', { class: 'tiny muted', style: { margin: '10px 0 0' } }, icon('info'), ' ', tl('TikTok’s export has no titles or captions — narrow it down by the day and time you remember.')), count, list),
  );

  const inPart = (ts) => {
    const hr = new Date(ts).getHours();
    return { any: true, morning: hr >= 6 && hr < 12, afternoon: hr >= 12 && hr < 18, evening: hr >= 18, night: hr < 6 }[part.value];
  };
  const filtered = () => kind.items.filter((v) => (!day.value || (v.ts && isoDay(v.ts) === day.value)) && (!v.ts || inPart(v.ts))).sort((a, b) => (b.ts || 0) - (a.ts || 0));

  function drawTabs() {
    clear(tabs);
    for (const k of kinds) {
      const b = h('button', { class: 'seg-btn', type: 'button', role: 'tab', 'aria-selected': String(k === kind) }, `${k.label} · ${fmtInt(k.items.length)}`);
      b.addEventListener('click', () => {
        kind = k;
        shown = PAGE;
        drawTabs();
        draw();
      });
      tabs.append(b);
    }
    let lo = Infinity;
    let hi = 0;
    for (const v of kind.items) if (v.ts) [lo, hi] = [Math.min(lo, v.ts), Math.max(hi, v.ts)];
    if (hi) [day.min, day.max] = [isoDay(lo), isoDay(hi)];
  }

  function draw() {
    const items = filtered();
    count.textContent = tl('{v0} videos', { v0: fmtInt(items.length) });
    clear(list);
    if (!items.length) {
      list.append(emptyState(tl('No videos for this day and time.'), 'search'));
      return;
    }
    let lastDay = '';
    for (const v of items.slice(0, shown)) {
      const d = v.ts ? dayFmt.format(v.ts) : tl('No date');
      if (d !== lastDay) list.append(h('div', { class: 'vid-day' }, d));
      lastDay = d;
      list.append(
        h(
          'a',
          { class: 'vid-row', href: v.link, target: '_blank', rel: 'noopener noreferrer nofollow' },
          h('span', { class: 'vid-time' }, v.ts ? timeFmt.format(v.ts) : '—'),
          h('span', { class: 'vid-thumb', 'aria-hidden': 'true' }, icon('play')),
          h('span', { class: 'vid-id' }, tl('Video {v0}', { v0: videoId(v.link).slice(-6) || '' })),
          h('span', { class: 'vid-open' }, tl('Open'), icon('external')),
        ),
      );
    }
    if (items.length > shown) {
      const more = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', style: { justifySelf: 'center', marginTop: '10px' } }, tl('Show more ({v0} left)', { v0: fmtInt(items.length - shown) }));
      more.addEventListener('click', () => {
        shown += PAGE;
        draw();
      });
      list.append(more);
    }
  }

  csv.addEventListener('click', () => {
    if (!ctx.can('videos')) return ctx.upgrade('videos');
    const rows = [['date', 'time', 'link'], ...filtered().map((v) => [v.ts ? isoDay(v.ts) : '', v.ts ? timeFmt.format(v.ts) : '', v.link])];
    downloadBlob(csvFile(rows), `tiktok-${kind.id}.csv`);
    toast(tl('CSV downloaded'));
  });
  day.addEventListener('change', () => {
    shown = PAGE;
    draw();
  });
  part.addEventListener('change', () => {
    shown = PAGE;
    draw();
  });
  drawTabs();
  draw();
  return root;
}
