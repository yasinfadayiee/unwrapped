// "Your posts & stories": every photo and video you published, from the export,
// as a gallery you can browse and save — useful after deleting a post or story.

import { h, icon, clear, modal, downloadBlob } from '../lib/ui.js';
import { fmtInt, dateShort } from '../lib/format.js';
import { viewHead, emptyState } from './components.js';
import { lazySrc, mediaBlob, mediaUrl } from '../lib/media.js';
import { t as tl } from '../lib/i18n.js';

const PAGE = 60;

function fileName(item) {
  const d = item.ts ? new Date(item.ts).toISOString().slice(0, 10) : 'undated';
  return `instagram-${item.kind}-${d}-${item.entry.name}`;
}

function openItem(item) {
  const m = modal({ title: item.ts ? dateShort(item.ts) : tl('No date'), wide: true });
  const media = item.video ? h('video', { class: 'arch-full', controls: true, playsinline: true }) : h('img', { class: 'arch-full', alt: item.caption || '' });
  mediaUrl(item.entry).then((u) => (media.src = u)).catch(() => {});
  const save = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('download'), tl('Save original'));
  save.addEventListener('click', async () => downloadBlob(await mediaBlob(item.entry), fileName(item)));
  m.body.append(media, item.caption ? h('p', { class: 'arch-caption' }, item.caption) : null, h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '12px' } }, save));
}

export function archiveView(ds, ctx) {
  const all = ds.media.filter((i) => i.entry);
  const missing = ds.media.length - all.length;
  const root = h('div', { class: 'app-content' });
  root.append(viewHead(tl('Your posts & stories'), tl('Every photo and video you posted — {v0} items, including stories that have long disappeared. Open one to see its caption and save the original.', { v0: fmtInt(all.length) })));
  if (!all.length) {
    root.append(emptyState(missing ? tl('Your export lists your posts but doesn’t include the files. Request your data again with media included.') : tl('No posts or stories in this export.'), 'image'));
    return root;
  }

  const KINDS = [
    ['all', tl('All')],
    ['post', tl('Posts')],
    ['story', tl('Stories')],
    ['reel', tl('Reels')],
    ['archived', tl('Archived')],
    ['profile', tl('Profile photos')],
  ].filter(([k]) => k === 'all' || all.some((i) => i.kind === k));
  let kind = 'all';
  let shown = PAGE;
  const years = [...new Set(all.filter((i) => i.ts).map((i) => new Date(i.ts).getFullYear()))].sort((a, b) => b - a);
  const tabs = h('div', { class: 'seg', role: 'tablist' });
  const year = h('select', { class: 'select input--sm', 'aria-label': tl('Year') }, h('option', { value: '' }, tl('All years')), years.map((y) => h('option', { value: String(y) }, String(y))));
  const count = h('span', { class: 'tiny muted' });
  const grid = h('div', { class: 'arch-grid' });
  root.append(h('div', { class: 'panel' }, h('div', { class: 'vid-tools' }, tabs, year, count), grid));

  const filtered = () => all.filter((i) => (kind === 'all' || i.kind === kind) && (!year.value || (i.ts && new Date(i.ts).getFullYear() === Number(year.value))));

  function drawTabs() {
    clear(tabs);
    for (const [k, label] of KINDS) {
      const n = k === 'all' ? all.length : all.filter((i) => i.kind === k).length;
      const b = h('button', { class: 'seg-btn', type: 'button', role: 'tab', 'aria-selected': String(k === kind) }, `${label} · ${fmtInt(n)}`);
      b.addEventListener('click', () => {
        kind = k;
        shown = PAGE;
        drawTabs();
        draw();
      });
      tabs.append(b);
    }
  }

  function draw() {
    const items = filtered();
    count.textContent = tl('{v0} items', { v0: fmtInt(items.length) });
    clear(grid);
    if (!items.length) grid.append(emptyState(tl('Nothing here for this filter.'), 'image'));
    for (const item of items.slice(0, shown)) {
      const thumb = item.video ? h('video', { muted: true, preload: 'metadata', playsinline: true }) : h('img', { alt: item.caption ? item.caption.slice(0, 80) : '', loading: 'lazy' });
      const tile = h(
        'button',
        { class: 'arch-tile', type: 'button', title: item.caption || '' },
        lazySrc(thumb, item.entry),
        item.video ? h('span', { class: 'arch-badge' }, icon('play')) : null,
        h('span', { class: 'arch-date' }, item.ts ? dateShort(item.ts) : ''),
      );
      tile.addEventListener('click', () => openItem(item));
      grid.append(tile);
    }
    if (items.length > shown) {
      const more = h('button', { class: 'btn btn--ghost btn--sm arch-more', type: 'button' }, tl('Show more ({v0} left)', { v0: fmtInt(items.length - shown) }));
      more.addEventListener('click', () => {
        shown += PAGE;
        draw();
      });
      grid.append(more);
    }
  }

  year.addEventListener('change', () => {
    shown = PAGE;
    draw();
  });
  drawTabs();
  draw();
  if (missing) root.append(h('p', { class: 'tiny muted' }, tl('{v0} items are listed in your export without their files.', { v0: fmtInt(missing) })));
  return root;
}
