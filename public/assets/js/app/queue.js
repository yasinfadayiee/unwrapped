// Unfollow queue: opens one profile at a time so the user can unfollow by
// hand, safely paced. We never touch the account ourselves.

import { h, icon, modal, clear, avatarStyle } from '../lib/ui.js';
import { fmtInt } from '../lib/format.js';
import { profileUrl, displayName } from './components.js';
import { t as tl } from '../lib/i18n.js';

const DAILY_SUGGESTED = 100;

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(`unw.queue.${key}`) || '{}');
  } catch {
    return {};
  }
}
function save(key, state) {
  try {
    localStorage.setItem(`unw.queue.${key}`, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function openQueue(ds, items, ctx, keepKey) {
  const key = keepKey || ds.platform;
  const state = load(key);
  state.done = state.done || [];
  const today = new Date().toISOString().slice(0, 10);
  if (state.day !== today) {
    state.day = today;
    state.today = 0;
  }
  const kept = ctx.keepSet(keepKey);
  const done = new Set(state.done);
  const idOf = (i) => String(i.u || i.name || i.id).toLowerCase();
  // Oldest follows first: the longer they never followed back, the likelier you won't miss them.
  const queue = [...items].filter((i) => !kept.has(idOf(i)) && !done.has(idOf(i))).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  let index = 0;

  const m = modal({ title: tl('Unfollow queue') });
  const total = queue.length;

  function render() {
    clear(m.body);
    const current = queue[index];
    const progress = total ? (index / total) * 100 : 100;
    if (!current) {
      m.body.append(
        h('div', { class: 'queue' }, h('div', { class: 'success-burst' }, icon('check')), h('div', { class: 'h3' }, tl('Queue cleared')), h('p', { class: 'text-2' }, tl('You reviewed {v0} accounts. Fresh export next week?', { v0: fmtInt(total) }))),
      );
      return;
    }
    const url = profileUrl(ds.platform, current);
    const open = h('a', { class: 'btn btn--primary btn--lg', href: url, target: '_blank', rel: 'noopener noreferrer nofollow' }, icon('external'), tl('Open profile'));
    const next = h('button', { class: 'btn btn--ghost', type: 'button' }, icon('check'), tl('Done — next'));
    const keep = h('button', { class: 'btn btn--ghost', type: 'button' }, icon('pin'), tl('Keep following'));
    const skip = h('button', { class: 'btn btn--ghost', type: 'button' }, tl('Skip'));
    open.addEventListener('click', () => {
      next.focus();
    });
    next.addEventListener('click', () => {
      state.done.push(idOf(current));
      state.today = (state.today || 0) + 1;
      save(key, state);
      index++;
      render();
    });
    keep.addEventListener('click', () => {
      ctx.toggleKeep(keepKey, idOf(current));
      index++;
      render();
    });
    skip.addEventListener('click', () => {
      index++;
      render();
    });
    const pace = state.today >= DAILY_SUGGESTED;
    m.body.append(
      h(
        'div',
        { class: 'queue' },
        h('div', { class: 'progress', 'aria-label': tl('{v0} of {v1} reviewed', { v0: index, v1: total }) }, h('i', { style: { width: `${progress}%` } })),
        h('div', { class: 'small muted' }, tl('{v0} of {v1} · {v2} done today', { v0: fmtInt(index + 1), v1: fmtInt(total), v2: fmtInt(state.today || 0) })),
        h('span', { class: 'av', style: { ...avatarStyle(idOf(current)), width: '84px', height: '84px', borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: '700', fontSize: '24px' } }, idOf(current).slice(0, 2).toUpperCase()),
        h('div', { class: 'who' }, displayName(ds.platform, current)),
        open,
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' } }, next, keep, skip),
        pace
          ? h('div', { class: 'warn-box' }, icon('warning'), h('span', null, tl('You’ve done {v0} today. Platforms may temporarily limit accounts that unfollow too fast — take a break and continue tomorrow.', { v0: fmtInt(state.today) })))
          : h('p', { class: 'tiny muted' }, tl('Tip: stay under ~{v0} unfollows a day, with breaks, to avoid temporary action limits.', { v0: DAILY_SUGGESTED })),
      ),
    );
  }
  render();
}
