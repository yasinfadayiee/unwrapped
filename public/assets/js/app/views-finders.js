// Finders: search everything you ever posted, liked, saved or commented —
// "Search & clean up your posts" (X) and "Likes & comments finder" (Instagram).

import { h, icon, clear, csvFile, downloadBlob, toast } from '../lib/ui.js';
import { fmtInt, compact } from '../lib/format.js';
import { viewHead, emptyState } from './components.js';
import { locale, t as tl } from '../lib/i18n.js';
import { SCAN_RES, wordRe, matches, countMatches } from '../core/cleanup.js';

const PAGE = 100;
const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const yearOf = (ts) => (ts ? new Date(ts).getFullYear() : 0);

const SCANS = {
  swearing: { label: () => tl('Swearing'), re: SCAN_RES.swearing },
  party: { label: () => tl('Alcohol & drugs'), re: SCAN_RES.party },
  personal: { label: () => tl('Personal info'), re: SCAN_RES.personal },
};

function highlight(text, re) {
  if (!re) return text;
  const out = [];
  let last = 0;
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) {
    if (!m[0]) continue;
    out.push(text.slice(last, m.index), h('mark', null, m[0]));
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

function combine(regexes) {
  const list = regexes.filter(Boolean);
  if (!list.length) return null;
  return new RegExp(list.map((r) => r.source).join('|'), 'giu');
}

// The "Clean-up check" box: one toggle per check with its hit count, plus a
// field for your own words. `active()` returns the regexes switched on.
function cleanupBox(texts, onChange) {
  const hits = countMatches(texts);
  const scans = new Set();
  let custom = null;
  const chips = h('div', { class: 'scan-chips' });
  const customInput = h('input', { class: 'input input--sm', type: 'text', placeholder: tl('Your own words, comma separated'), 'aria-label': tl('Your own words') });
  const el = h('div', { class: 'scan-box' }, h('div', { class: 'scan-head' }, icon('shield'), h('b', null, tl('Clean-up check')), h('span', { class: 'tiny muted' }, tl('Posts a recruiter, client or new employer might stumble on.'))), chips, customInput);
  function drawChips() {
    clear(chips);
    for (const [id, s] of Object.entries(SCANS)) {
      const on = scans.has(id);
      const b = h('button', { class: `scan-chip${on ? ' is-on' : ''}${hits[id] ? '' : ' is-zero'}`, type: 'button', 'aria-pressed': String(on) }, s.label(), h('span', { class: 'scan-n' }, fmtInt(hits[id])));
      b.addEventListener('click', () => {
        if (on) scans.delete(id);
        else scans.add(id);
        drawChips();
        onChange();
      });
      chips.append(b);
    }
  }
  let timer;
  customInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const words = customInput.value.split(',').map((w) => w.trim()).filter((w) => w.length > 1);
      custom = words.length ? wordRe(words) : null;
      onChange();
    }, 250);
  });
  drawChips();
  return { el, active: () => [...[...scans].map((id) => SCANS[id].re), ...(custom ? [custom] : [])] };
}

function finderShell({ title, text, searchLabel }) {
  const root = h('div', { class: 'app-content' });
  root.append(viewHead(title, text));
  const search = h('input', { class: 'input', type: 'search', placeholder: searchLabel, 'aria-label': searchLabel });
  const tabs = h('div', { class: 'seg', role: 'tablist' });
  const year = h('select', { class: 'select input--sm', 'aria-label': tl('Year') });
  const sort = h('select', { class: 'select input--sm', 'aria-label': tl('Sort') });
  const csv = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('download'), tl('Download CSV'));
  const extra = h('div', { class: 'finder-extra' });
  const count = h('div', { class: 'tiny muted', style: { marginTop: '10px' } });
  const list = h('div', { class: 'finder-list' });
  root.append(h('div', { class: 'panel' }, h('div', { class: 'finder-search' }, icon('search'), search), h('div', { class: 'vid-tools', style: { marginTop: '12px' } }, tabs, year, sort, csv), extra, count, list));
  return { root, search, tabs, year, sort, csv, extra, count, list };
}

function fillYears(select, items) {
  const years = [...new Set(items.map((i) => yearOf(i.ts)).filter(Boolean))].sort((a, b) => b - a);
  clear(select).append(h('option', { value: '' }, tl('All years')), ...years.map((y) => h('option', { value: String(y) }, String(y))));
}

function drawTabs(tabs, kinds, current, onPick) {
  clear(tabs);
  for (const k of kinds) {
    const b = h('button', { class: 'seg-btn', type: 'button', role: 'tab', 'aria-selected': String(k.id === current) }, `${k.label} · ${fmtInt(k.count)}`);
    b.addEventListener('click', () => onPick(k.id));
    tabs.append(b);
  }
}

function moreButton(list, left, onMore) {
  const more = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', style: { justifySelf: 'center', marginTop: '10px' } }, tl('Show more ({v0} left)', { v0: fmtInt(left) }));
  more.addEventListener('click', onMore);
  list.append(more);
}

/* ---------------------------- X: your posts ---------------------------- */

export function tweetsView(ds, ctx) {
  const all = ds.tweets;
  const user = ds.account?.username;
  const linkOf = (tw) => `https://x.com/${user || 'i/web'}/status/${tw.id}`;
  const typeOf = (tw) => (tw.isRT ? 'reposts' : tw.isReply ? 'replies' : 'posts');
  const ui = finderShell({
    title: tl('Search & clean up your posts'),
    text: tl('Every post, reply and repost you ever made — search by word, filter by year, and find old posts worth deleting before a recruiter does.'),
    searchLabel: tl('Search your posts…'),
  });
  if (!all.length) {
    ui.root.append(emptyState(tl('No posts in this archive.'), 'message'));
    return ui.root;
  }
  let kind = 'all';
  let shown = PAGE;
  const counts = { all: all.length, posts: 0, replies: 0, reposts: 0 };
  for (const tw of all) counts[typeOf(tw)]++;
  const kinds = [
    { id: 'all', label: tl('All'), count: counts.all },
    { id: 'posts', label: tl('Posts'), count: counts.posts },
    { id: 'replies', label: tl('Replies'), count: counts.replies },
    { id: 'reposts', label: tl('Reposts'), count: counts.reposts },
  ].filter((k) => k.id === 'all' || k.count);
  fillYears(ui.year, all);
  ui.sort.append(h('option', { value: 'new' }, tl('Newest first')), h('option', { value: 'old' }, tl('Oldest first')), h('option', { value: 'liked' }, tl('Most liked')));

  // Clean-up check over your own words (reposts are other people's).
  const check = cleanupBox(all.filter((tw) => !tw.isRT).map((tw) => tw.text), () => ((shown = PAGE), draw()));
  ui.extra.append(check.el);

  function filtered() {
    const q = ui.search.value.trim().toLowerCase();
    const y = Number(ui.year.value) || 0;
    const active = check.active();
    let items = all.filter((tw) => {
      if (kind !== 'all' && typeOf(tw) !== kind) return false;
      if (y && yearOf(tw.ts) !== y) return false;
      if (q && !tw.text.toLowerCase().includes(q)) return false;
      if (active.length && !active.some((re) => matches(re, tw.text))) return false;
      return true;
    });
    const s = ui.sort.value;
    items = items.sort((a, b) => (s === 'old' ? a.ts - b.ts : s === 'liked' ? b.likes + 2 * b.rts - (a.likes + 2 * a.rts) : b.ts - a.ts));
    return { items, mark: combine([q ? new RegExp(escRe(q), 'giu') : null, ...active]) };
  }

  function draw() {
    const { items, mark } = filtered();
    ui.count.textContent = tl('{v0} posts', { v0: fmtInt(items.length) });
    clear(ui.list);
    if (!items.length) ui.list.append(emptyState(tl('No matches.'), 'search'));
    for (const tw of items.slice(0, shown)) {
      ui.list.append(
        h(
          'div',
          { class: 'finder-row' },
          h('div', { class: 'finder-meta' }, h('span', { class: `finder-type finder-type--${typeOf(tw)}` }, kinds.find((k) => k.id === typeOf(tw))?.label || ''), h('span', null, tw.ts ? `${dateFmt.format(tw.ts)} · ${timeFmt.format(tw.ts)}` : '')),
          h('p', { class: 'finder-text' }, highlight(tw.text, mark)),
          h(
            'div',
            { class: 'finder-foot' },
            h('span', { class: 'tiny muted' }, `♥ ${compact(tw.likes)} · ↻ ${compact(tw.rts)}`),
            h('a', { class: 'row-btn', href: linkOf(tw), target: '_blank', rel: 'noopener noreferrer nofollow' }, icon('external'), tl('Open on X')),
          ),
        ),
      );
    }
    if (items.length > shown) moreButton(ui.list, items.length - shown, () => ((shown += PAGE), draw()));
  }

  ui.csv.addEventListener('click', () => {
    if (!ctx.can('finder')) return ctx.upgrade('finder');
    const rows = [['date', 'type', 'likes', 'reposts', 'link', 'text'], ...filtered().items.map((tw) => [tw.ts ? new Date(tw.ts).toISOString() : '', typeOf(tw), tw.likes, tw.rts, linkOf(tw), tw.text])];
    downloadBlob(csvFile(rows), 'x-posts.csv');
    toast(tl('CSV downloaded'));
  });
  const redraw = () => ((shown = PAGE), draw());
  let qTimer;
  ui.search.addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(redraw, 200);
  });
  ui.year.addEventListener('change', redraw);
  ui.sort.addEventListener('change', redraw);
  const pick = (id) => {
    kind = id;
    drawTabs(ui.tabs, kinds, kind, pick);
    redraw();
  };
  ui.root.append(h('p', { class: 'tiny muted' }, icon('info'), ' ', tl('X has no bulk delete without logging in, so nothing here touches your account — open a post on X and delete it there.')));
  drawTabs(ui.tabs, kinds, kind, pick);
  draw();
  return ui.root;
}

/* ----------------------- Instagram: likes & comments ----------------------- */

export function likesView(ds, ctx) {
  const items = ds.activity.items;
  const kinds = [
    { id: 'liked', label: tl('Liked posts'), count: items.liked.length },
    { id: 'saved', label: tl('Saved'), count: items.saved.length },
    { id: 'comments', label: tl('Your comments'), count: items.comments.length },
  ].filter((k) => k.count);
  const ui = finderShell({
    title: tl('Likes & comments finder'),
    text: tl('Find any post you liked or saved, and every comment you wrote — by account, word or year — and open it again.'),
    searchLabel: tl('Search by account or comment…'),
  });
  if (!kinds.length) {
    ui.root.append(emptyState(tl('No likes, saves or comments in this export.'), 'heart'));
    return ui.root;
  }
  let kind = kinds[0].id;
  let shown = PAGE;
  ui.sort.append(h('option', { value: 'new' }, tl('Newest first')), h('option', { value: 'old' }, tl('Oldest first')));
  // The clean-up check only makes sense for the comments you wrote.
  const check = items.comments.length ? cleanupBox(items.comments.map((c) => c.text), () => ((shown = PAGE), draw())) : null;
  const showCheck = () => {
    clear(ui.extra);
    if (check && kind === 'comments') ui.extra.append(check.el);
  };

  function filtered() {
    const q = ui.search.value.trim().toLowerCase().replace(/^@/, '');
    const y = Number(ui.year.value) || 0;
    const active = check && kind === 'comments' ? check.active() : [];
    const list = items[kind].filter((it) => (!y || yearOf(it.ts) === y) && (!q || it.owner.toLowerCase().includes(q) || (it.text || '').toLowerCase().includes(q)) && (!active.length || active.some((re) => matches(re, it.text || ''))));
    return list.sort((a, b) => (ui.sort.value === 'old' ? (a.ts || 0) - (b.ts || 0) : (b.ts || 0) - (a.ts || 0)));
  }

  function draw() {
    const list = filtered();
    const q = ui.search.value.trim().replace(/^@/, '');
    const mark = combine([q ? new RegExp(escRe(q), 'giu') : null, ...(check && kind === 'comments' ? check.active() : [])]);
    ui.count.textContent = tl('{v0} items', { v0: fmtInt(list.length) });
    clear(ui.list);
    if (!list.length) ui.list.append(emptyState(tl('No matches.'), 'search'));
    for (const it of list.slice(0, shown)) {
      ui.list.append(
        h(
          'div',
          { class: 'finder-row' },
          h(
            'div',
            { class: 'finder-meta' },
            it.owner ? h('a', { class: 'finder-owner', href: `https://www.instagram.com/${encodeURIComponent(it.owner)}/`, target: '_blank', rel: 'noopener noreferrer nofollow' }, '@', highlight(it.owner, mark)) : null,
            h('span', null, it.ts ? dateFmt.format(it.ts) : tl('No date')),
          ),
          it.text ? h('p', { class: 'finder-text' }, highlight(it.text, mark)) : null,
          it.href ? h('div', { class: 'finder-foot' }, h('span'), h('a', { class: 'row-btn', href: it.href, target: '_blank', rel: 'noopener noreferrer nofollow' }, icon('external'), tl('Open post'))) : null,
        ),
      );
    }
    if (list.length > shown) moreButton(ui.list, list.length - shown, () => ((shown += PAGE), draw()));
  }

  ui.csv.addEventListener('click', () => {
    if (!ctx.can('finder')) return ctx.upgrade('finder');
    const rows = [['date', 'account', 'comment', 'link'], ...filtered().map((it) => [it.ts ? new Date(it.ts).toISOString() : '', it.owner, it.text || '', it.href || ''])];
    downloadBlob(csvFile(rows), `instagram-${kind}.csv`);
    toast(tl('CSV downloaded'));
  });
  const redraw = () => ((shown = PAGE), draw());
  let qTimer;
  ui.search.addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(redraw, 200);
  });
  ui.year.addEventListener('change', redraw);
  ui.sort.addEventListener('change', redraw);
  const pick = (id) => {
    kind = id;
    fillYears(ui.year, items[kind]);
    drawTabs(ui.tabs, kinds, kind, pick);
    showCheck();
    redraw();
  };
  fillYears(ui.year, items[kind]);
  drawTabs(ui.tabs, kinds, kind, pick);
  showCheck();
  draw();
  return ui.root;
}
