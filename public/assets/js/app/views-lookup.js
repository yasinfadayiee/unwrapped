// Look up anyone: type a name and see your whole history with that person —
// follows, unfollows, lists, likes, comments and chats — from your export.

import { h, icon, clear, avatarStyle } from '../lib/ui.js';
import { fmtInt, dateShort, relTime } from '../lib/format.js';
import { viewHead, panel, lockCard, profileUrl } from './components.js';
import { buildPeopleIndex, interestingPeople, searchPeople, relationOf, engagementScore } from '../core/people.js';
import { t as tl } from '../lib/i18n.js';

const LIST_BADGES = {
  closeFriends: () => tl('Close friend'),
  favorites: () => tl('Favorite'),
  blocked: () => tl('Blocked by you'),
  restricted: () => tl('Restricted by you'),
  hideStoryFrom: () => tl('Hidden from your stories'),
  pendingSent: () => tl('Your request is pending'),
  requestsReceived: () => tl('Wants to follow you'),
  sentRequests: () => tl('Your request is pending'),
  receivedRequests: () => tl('Sent you a request'),
  removed: () => tl('Removed by you'),
};

const RELATION = {
  mutual: () => tl('You follow each other'),
  fan: () => tl('Follows you · you don’t follow back'),
  notBack: () => tl('You follow them · they don’t follow back'),
  none: () => tl('No follow either way'),
};

function personItem(ds, p) {
  if (ds.platform === 'facebook') return { name: p.name };
  return { u: p.name };
}

function fact(iconName, text, sub) {
  return h('li', { class: 'lk-fact' }, h('span', { class: 'lk-ico' }, icon(iconName)), h('div', null, h('b', null, text), sub ? h('span', null, sub) : null));
}

function card(ds, ctx, p) {
  const fb = ds.platform === 'facebook';
  const url = profileUrl(ds.platform, personItem(ds, p));
  const rel = relationOf(p);
  const badges = [...p.lists].filter((l) => LIST_BADGES[l]).map((l) => h('span', { class: `lk-badge${l === 'blocked' || l === 'restricted' ? ' lk-badge--warn' : ''}` }, LIST_BADGES[l]()));
  const facts = [];
  if (fb) {
    if (p.follower !== null) facts.push(fact('users', tl('Friends'), p.follower ? tl('Friends since {v0}', { v0: dateShort(p.follower) }) : null));
  } else {
    facts.push(fact(rel === 'mutual' ? 'users' : rel === 'none' ? 'user-minus' : 'user', RELATION[rel]()));
    if (p.follower) facts.push(fact('calendar', tl('Followed you on {v0}', { v0: dateShort(p.follower) }), relTime(p.follower)));
    if (p.following) facts.push(fact('calendar', tl('You followed them on {v0}', { v0: dateShort(p.following) }), relTime(p.following)));
  }
  // A snapshot window only adds something when the export has no exact date.
  const inWindow = (ts, h0) => ts && ts >= h0.from - 86_400_000 && ts <= h0.to + 86_400_000;
  for (const h0 of p.history) {
    if ((h0.type === 'followedYou' && inWindow(p.follower, h0)) || (h0.type === 'youFollowed' && inWindow(p.following, h0))) continue;
    const between = tl('between {v0} and {v1}', { v0: dateShort(h0.from), v1: dateShort(h0.to) });
    if (h0.type === 'unfollowedYou') facts.push(ctx.pro ? fact('ghost', fb ? tl('Unfriended you') : tl('Unfollowed you'), between) : fact('lock', fb ? tl('Unfriended you') : tl('Unfollowed you'), tl('See when with Plus')));
    if (h0.type === 'followedYou') facts.push(fact('user', fb ? tl('Became friends') : tl('Started following you'), between));
    if (h0.type === 'youUnfollowed') facts.push(fact('user-minus', fb ? tl('You removed them') : tl('You unfollowed them'), between));
    if (h0.type === 'youFollowed') facts.push(fact('user', tl('You followed them'), between));
  }
  if (p.lists.has('youUnfollowed')) facts.push(fact('user-minus', tl('You unfollowed them recently')));
  const a = p.activity;
  if (a.likes) facts.push(fact('heart', tl('You liked {v0} of their posts', { v0: fmtInt(a.likes.count) }), a.likes.last ? tl('Last on {v0}', { v0: dateShort(a.likes.last) }) : null));
  if (a.comments) facts.push(fact('message', tl('You commented {v0} times', { v0: fmtInt(a.comments.count) }), a.comments.last ? tl('Last on {v0}', { v0: dateShort(a.comments.last) }) : null));
  if (a.storyLikes) facts.push(fact('sparkles', tl('You liked {v0} of their stories', { v0: fmtInt(a.storyLikes.count) })));
  if (a.saved) facts.push(fact('download', tl('You saved {v0} of their posts', { v0: fmtInt(a.saved.count) })));
  if (p.thread) {
    const t = p.thread;
    facts.push(fact('inbox', tl('{v0} messages together', { v0: fmtInt(t.count) }), tl('You sent {v0} · since {v1} · last {v2}', { v0: fmtInt(t.sent), v1: dateShort(t.first), v2: relTime(t.last) })));
  }
  if (!fb && rel !== 'none' && !a.likes && !a.comments && !a.storyLikes && !p.thread) facts.push(fact('info', tl('No likes, comments or messages with this person in your export')));

  const openChat = p.thread && ctx.openChat ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => ctx.openChat(p.thread) }, icon('message'), tl('Open chat')) : null;
  return h(
    'section',
    { class: 'panel lk-card' },
    h(
      'div',
      { class: 'lk-head' },
      h('span', { class: 'lk-avatar', style: avatarStyle(p.key) }, (p.name[0] || '?').toUpperCase()),
      h('div', { class: 'lk-who' }, h('b', null, fb ? p.name : `@${p.name}`), badges.length ? h('div', { class: 'lk-badges' }, badges) : null),
      h('div', { class: 'lk-acts' }, openChat, url ? h('a', { class: 'btn btn--ghost btn--sm', href: url, target: '_blank', rel: 'noopener noreferrer nofollow' }, icon('external'), tl('Open profile')) : null),
    ),
    h('ul', { class: 'lk-facts' }, facts),
  );
}

function chipRow(title, list, onPick, sub) {
  if (!list.length) return null;
  return h(
    'div',
    { class: 'lk-group' },
    h('h4', null, title),
    h(
      'div',
      { class: 'lk-chips' },
      list.map((p) => {
        const b = h('button', { class: 'lk-chip', type: 'button' }, h('span', { class: 'lk-mini', style: avatarStyle(p.key) }, (p.name[0] || '?').toUpperCase()), p.name, sub ? h('em', null, sub(p)) : null);
        b.addEventListener('click', () => onPick(p));
        return b;
      }),
    ),
  );
}

export function lookupView(ds, ctx) {
  const people = buildPeopleIndex(ds, ctx.snapshots || []);
  const fb = ds.platform === 'facebook';
  const root = h('div', { class: 'app-content' });
  root.append(viewHead(tl('Look up anyone'), tl('Type a name to see your whole history with that person — follows, unfollows, likes, comments and messages. From your export, on your device.')));
  const input = h('input', { class: 'input lk-input', type: 'search', placeholder: fb ? tl('Type a friend’s name…') : tl('Type a username…'), 'aria-label': tl('Look up anyone'), autocomplete: 'off', spellcheck: false });
  const suggest = h('div', { class: 'lk-suggest', role: 'listbox' });
  const result = h('div', { class: 'lk-result' });
  root.append(h('div', { class: 'lk-search' }, icon('search'), input, suggest), result);

  function show(p) {
    clear(suggest);
    input.value = p.name;
    clear(result).append(card(ds, ctx, p), backLink());
    result.scrollIntoView({ block: 'nearest' });
  }
  function backLink() {
    const b = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', style: { marginTop: '10px' } }, icon('arrow-left'), tl('Back to suggestions'));
    b.addEventListener('click', () => {
      input.value = '';
      home();
    });
    return b;
  }
  function home() {
    const s = interestingPeople(people);
    clear(result).append(
      panel(
        { title: tl('Start with these'), text: tl('{v0} people in your export', { v0: fmtInt(people.size) }) },
        chipRow(tl('You interact with most'), s.engaged, show, (p) => fmtInt(engagementScore(p))),
        chipRow(tl('You message most'), s.chats, show, (p) => fmtInt(p.thread.count)),
        ctx.pro ? chipRow(fb ? tl('Recently unfriended you') : tl('Recently unfollowed you'), s.left, show) : null,
        chipRow(fb ? tl('Friends the longest') : tl('Mutuals the longest'), s.oldest, show, (p) => String(new Date(Math.max(p.follower || 0, p.following || 0)).getFullYear())),
      ),
      !ctx.pro && s.left.length ? lockCard({ tier: 'plus', title: tl('See who recently unfollowed you'), text: tl('Plus shows their names here and when they left.'), onUpgrade: () => ctx.upgrade('lookup') }) : null,
    );
  }

  let active = -1;
  function drawSuggest() {
    const list = searchPeople(people, input.value);
    clear(suggest);
    active = -1;
    for (const p of list) {
      const b = h('button', { class: 'lk-opt', type: 'button', role: 'option' }, h('span', { class: 'lk-mini', style: avatarStyle(p.key) }, (p.name[0] || '?').toUpperCase()), fb ? p.name : `@${p.name}`, h('em', null, fb ? '' : RELATION[relationOf(p)]()));
      b.addEventListener('click', () => show(p));
      suggest.append(b);
    }
    if (input.value.trim() && !list.length) suggest.append(h('div', { class: 'lk-none' }, tl('Nobody with that name in this export.')));
  }
  input.addEventListener('input', drawSuggest);
  input.addEventListener('keydown', (e) => {
    const opts = [...suggest.querySelectorAll('.lk-opt')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!opts.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.classList.toggle('is-active', i === active));
      opts[active].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      (opts[active] || opts[0])?.click();
    } else if (e.key === 'Escape') clear(suggest);
  });
  home();
  return root;
}
