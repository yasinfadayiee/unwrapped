import { h, icon, clear, avatarStyle, csvFile, downloadBlob, toast } from '../lib/ui.js';
import { fmtInt, relTime, dateShort } from '../lib/format.js';
import { TIER_NAME } from '../lib/tiers.js';
import { icsReminder } from '../lib/calendar.js';
import { t as tl } from '../lib/i18n.js';

export function viewHead(title, text, ...actions) {
  return h('div', { class: 'view-head' }, h('div', null, h('h2', null, title), text ? h('p', null, text) : null), actions.length ? h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, actions) : null);
}

export function stat({ label, value, sub, color, hero = false, onClick }) {
  const tag = onClick ? 'button' : 'div';
  return h(
    tag,
    { class: `stat${hero ? ' stat--hero' : ''}`, type: onClick ? 'button' : null, onClick },
    h('span', { class: 'label' }, color ? h('i', { style: { background: color } }) : null, label),
    h('span', { class: 'value' }, value),
    sub ? h('span', { class: 'sub' }, sub) : null,
  );
}

export function panel(opts, ...children) {
  const { title, text, actions } = opts || {};
  return h(
    'section',
    { class: 'panel' },
    title || actions ? h('div', { class: 'panel-head' }, h('div', null, title ? h('h3', null, title) : null, text ? h('p', null, text) : null), actions || null) : null,
    children,
  );
}

export function insights(items) {
  return h(
    'div',
    { class: 'insights' },
    items.filter(Boolean).map((it) => h('div', { class: 'insight' }, h('span', { class: 'ico' }, icon(it.icon || 'sparkles')), h('div', null, h('b', null, it.title), h('span', null, it.text)))),
  );
}

export function emptyState(text, iconName = 'inbox') {
  const art = iconName === 'inbox' ? h('img', { class: 'ico3d empty-art', src: '/assets/img/icons/ghost.webp', width: 64, height: 64, alt: '' }) : icon(iconName);
  return h('div', { class: 'empty' }, art, h('div', null, text));
}

export function lockCard({ count, what = 'accounts', onUpgrade, title, text, tier = 'plus' }) {
  return h(
    'div',
    { class: 'lock-card' },
    h(
      'div',
      { class: 'lock-inner' },
      h('img', { class: 'lock-art', src: '/assets/img/art/padlock-check-320.webp', width: 320, height: 320, alt: '', loading: 'lazy', decoding: 'async' }),
      h('h4', null, title || (count ? tl('{v0} more {v1}', { v0: fmtInt(count), v1: what }) : tl('Unlock with {v0}', { v0: TIER_NAME[tier] }))),
      h('p', null, text || tl('Unlock the full list, search, CSV export and your unfollower history with {v0}.', { v0: TIER_NAME[tier] })),
      h('button', { class: 'btn btn--primary', type: 'button', onClick: onUpgrade }, icon('bolt'), tl('Unlock with {v0}', { v0: TIER_NAME[tier] })),
    ),
  );
}

export function profileUrl(platform, item) {
  switch (platform) {
    case 'instagram':
      return `https://www.instagram.com/${encodeURIComponent(item.u)}/`;
    case 'threads':
      return `https://www.threads.net/@${encodeURIComponent(item.u)}`;
    case 'tiktok':
      return `https://www.tiktok.com/@${encodeURIComponent(item.u)}`;
    case 'x':
      return `https://x.com/intent/user?user_id=${encodeURIComponent(item.id)}`;
    case 'facebook':
      return `https://www.facebook.com/search/people/?q=${encodeURIComponent(item.name)}`;
    case 'linkedin':
      return item.url || null;
    default:
      return null;
  }
}

export function displayName(platform, item) {
  if (platform === 'x') return tl('Account #{v0}', { v0: item.id });
  if (platform === 'facebook' || platform === 'linkedin') return item.name;
  return `@${item.u}`;
}

export function personRow(platform, item, { sub, actions = [], kept = false } = {}) {
  const name = displayName(platform, item);
  const initials = (item.u || item.name || item.id || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || '?';
  const url = profileUrl(platform, item);
  return h(
    'div',
    { class: `row${kept ? ' is-kept' : ''}` },
    h('span', { class: 'av', style: avatarStyle(item.u || item.name || item.id || ''), 'aria-hidden': 'true' }, initials),
    h('div', { class: 'who' }, h('b', null, name), sub ? h('span', null, sub) : null),
    h(
      'div',
      { class: 'acts' },
      actions,
      url ? h('a', { class: 'row-btn', href: url, target: '_blank', rel: 'noopener noreferrer nofollow' }, icon('external'), h('span', { class: 'sr-only' }, tl('Open {v0}', { v0: name })), tl('Open')) : null,
    ),
  );
}

const SORTS = {
  newest: { label: tl('Newest first'), fn: (a, b) => (b.ts || 0) - (a.ts || 0) },
  oldest: { label: tl('Oldest first'), fn: (a, b) => (a.ts || Infinity) - (b.ts || Infinity) },
  az: { label: tl('A → Z'), fn: (a, b) => String(a.u || a.name || a.id).localeCompare(String(b.u || b.name || b.id)) },
};

/**
 * Searchable, sortable, incrementally rendered list with a Pro lock.
 * opts: { platform, items, ctx, subFor, exportName, keepKey, emptyText, extraTools }
 */
export function userList({ platform, items, ctx, subFor, exportName = 'list', keepKey = null, emptyText = tl('Nobody here — nice.'), extraTools = [] }) {
  const root = h('div');
  if (!items.length) return root.appendChild(emptyState(emptyText, 'users')) && root;

  const kept = keepKey ? ctx.keepSet(keepKey) : null;
  let query = '';
  let sort = items.some((i) => i.ts) ? 'newest' : 'az';
  let hideKept = false;
  let shown = 60;
  const pro = ctx.pro;
  const limit = ctx.freeLimit;

  const search = h('input', { class: 'input', type: 'search', placeholder: pro ? tl('Search…') : tl('Search (Pro)'), 'aria-label': tl('Search this list'), disabled: !pro });
  const sortSel = h(
    'select',
    { class: 'select', 'aria-label': tl('Sort') },
    Object.entries(SORTS)
      .filter(([k]) => k === 'az' || items.some((i) => i.ts))
      .map(([k, v]) => h('option', { value: k, selected: k === sort }, v.label)),
  );
  const exportBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('download'), 'CSV');
  const hideKeptBtn = kept ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-pressed': 'false' }, icon('eye'), tl('Hide kept')) : null;
  const listBox = h('div');
  root.append(h('div', { class: 'list-tools' }, h('label', { class: 'search' }, icon('search'), search), sortSel, hideKeptBtn, exportBtn, extraTools), listBox);

  function filtered() {
    let list = [...items];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((i) => String(i.u || i.name || i.id).toLowerCase().includes(q));
    }
    if (hideKept && kept) list = list.filter((i) => !kept.has(String(i.u || i.name || i.id).toLowerCase()));
    return list.sort(SORTS[sort].fn);
  }

  function row(item) {
    const key = String(item.u || item.name || item.id).toLowerCase();
    const actions = [];
    if (kept) {
      const isKept = kept.has(key);
      const btn = h('button', { class: `row-btn${isKept ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(isKept), title: tl('Keep following (hide from clean-up)') }, icon(isKept ? 'check' : 'pin'), isKept ? tl('Kept') : tl('Keep'));
      btn.addEventListener('click', () => {
        ctx.toggleKeep(keepKey, key);
        render();
      });
      actions.push(btn);
    }
    return personRow(platform, item, { sub: subFor ? subFor(item) : item.ts ? relTime(item.ts) : '', actions, kept: kept?.has(key) });
  }

  function render() {
    const list = filtered();
    clear(listBox);
    if (!list.length) {
      listBox.append(emptyState(query ? tl('No matches.') : emptyText, 'search'));
      return;
    }
    const visible = pro ? list.slice(0, shown) : list.slice(0, limit);
    listBox.append(h('div', { class: 'rows' }, visible.map(row)));
    if (!pro && list.length > limit) {
      const ghost = list.slice(limit, limit + 6).map((i) => personRow(platform, { ...i, u: i.u ? 'hidden.account' : i.u, name: i.name ? tl('Hidden name') : i.name, id: i.id ? '•••••' : i.id }, { sub: tl('Locked') }));
      listBox.append(
        h(
          'div',
          { class: 'locked', style: { marginTop: '6px', minHeight: '300px' } },
          h('div', { class: 'locked-rows' }, ghost),
          lockCard({ count: list.length - limit, onUpgrade: () => ctx.upgrade('list') }),
        ),
      );
    } else if (pro && list.length > shown) {
      const more = h('button', { class: 'btn btn--ghost', type: 'button' }, tl('Show more ({v0} left)', { v0: fmtInt(list.length - shown) }));
      more.addEventListener('click', () => {
        shown += 200;
        render();
      });
      listBox.append(h('div', { class: 'list-more' }, more));
    }
  }

  search.addEventListener('input', () => {
    query = search.value.trim();
    shown = 60;
    render();
  });
  sortSel.addEventListener('change', () => {
    sort = sortSel.value;
    render();
  });
  hideKeptBtn?.addEventListener('click', () => {
    hideKept = !hideKept;
    hideKeptBtn.setAttribute('aria-pressed', String(hideKept));
    render();
  });
  exportBtn.addEventListener('click', () => {
    if (!pro) return ctx.upgrade('csv');
    const rows = [['account', 'profile_url', 'date']];
    for (const i of filtered()) rows.push([displayName(platform, i), profileUrl(platform, i) || '', i.ts ? new Date(i.ts).toISOString().slice(0, 10) : '']);
    downloadBlob(csvFile(rows), `${exportName}.csv`);
    toast(tl('CSV downloaded'));
  });
  render();
  return root;
}

// Saves a calendar reminder to download a fresh export, so the next one can be
// compared with today's snapshot.
export function reminderButton(ds, { days = 14, label = tl('Remind me in 2 weeks') } = {}) {
  const btn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('calendar'), label);
  btn.addEventListener('click', () => {
    const ics = icsReminder({
      title: tl('Download a fresh {v0} export', { v0: ds.label }),
      description: tl('Request your {v0} data again and drop it on {v1}. Unwrapped compares it with your snapshot from {v2} and shows exactly who unfollowed you.', { v0: ds.label, v1: location.origin, v2: dateShort(ds.exportedAt) }),
      url: `${location.origin}/#how`,
      days,
    });
    downloadBlob(new Blob([ics], { type: 'text/calendar' }), 'unwrapped-reminder.ics');
    toast(tl('Reminder saved — open it to add it to your calendar'), { iconName: 'calendar', timeout: 4200 });
  });
  return btn;
}

export function dataNote(ds) {
  return h('p', { class: 'tiny muted', style: { marginTop: '4px' } }, tl('Data from your export of {v0} · processed on this device only.', { v0: dateShort(ds.exportedAt) }));
}
