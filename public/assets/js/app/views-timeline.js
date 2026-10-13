// "Your digital life": one timeline across every export that was dropped.

import { h, icon } from '../lib/ui.js';
import { fmtInt, dateShort } from '../lib/format.js';
import { buildTimeline } from '../core/timeline.js';
import { viewHead, stat, panel, emptyState } from './components.js';
import { t as tl } from '../lib/i18n.js';
import { drawCard, fontsReady } from './wrapped.js';
import { cardButtons } from './views-wrapped.js';

function sentence(e) {
  const v = { v0: e.label, v1: fmtInt(e.n || 0) };
  switch (e.kind) {
    case 'joined': return tl('You joined {v0}', v);
    case 'firstFollower': return tl('Your oldest follower on {v0} followed you', v);
    case 'firstFriend': return tl('Your oldest {v0} friendship started', v);
    case 'firstConnection': return tl('Your first {v0} connection', v);
    case 'milestone': return tl('{v1} followers on {v0}', v);
    case 'bestYear': return tl('Your biggest year on {v0}: {v1} new followers', v);
    case 'firstFollow': return tl('The oldest account you still follow on {v0}', v);
    case 'firstPost': return tl('Your first {v0} post still online', v);
    case 'firstLike': return tl('Oldest like in your {v0} export', v);
    case 'firstComment': return tl('Oldest comment in your {v0} export', v);
    case 'firstTweet': return tl('Your first post on {v0}', v);
    case 'firstWatch': return tl('Oldest video in your {v0} watch history', v);
    default: return '';
  }
}

const ICONS = { joined: 'sparkles', firstFollower: 'user-plus', firstFriend: 'users', firstConnection: 'users', milestone: 'flame', bestYear: 'star', firstFollow: 'heart', firstPost: 'image', firstLike: 'heart', firstComment: 'message', firstTweet: 'message', firstWatch: 'play' };

export function timelineView(datasets, ctx) {
  const events = buildTimeline(datasets);
  const root = h('div', { class: 'app-content' }, viewHead(tl('Your digital life'), tl('Firsts and milestones from every export you dropped, in one timeline. Drop several platforms at once to see them side by side.')));
  if (!events.length) return root.appendChild(panel(null, emptyState(tl('Your export has no dates to build a timeline from.'), 'calendar'))) && root;
  const first = events[0];
  const years = (Date.now() - first.ts) / (365.25 * 864e5);
  root.append(
    h(
      'div',
      { class: 'stats' },
      stat({ label: tl('Online since'), value: String(new Date(first.ts).getFullYear()), sub: sentence(first) }),
      stat({ label: tl('Years of history'), value: years.toFixed(1) }),
      stat({ label: tl('Platforms'), value: fmtInt(new Set(events.map((e) => e.platform)).size) }),
      stat({ label: tl('Moments'), value: fmtInt(events.length) }),
    ),
  );
  const byYear = new Map();
  for (const e of events) {
    const y = new Date(e.ts).getFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(e);
  }
  root.append(
    panel(
      null,
      h(
        'ol',
        { class: 'dl-line' },
        [...byYear.entries()].map(([year, list]) =>
          h(
            'li',
            { class: 'dl-year' },
            h('span', { class: 'dl-yr' }, String(year)),
            h(
              'ul',
              null,
              list.map((e) =>
                h(
                  'li',
                  { class: 'dl-ev' },
                  h('span', { class: 'dl-ico', 'aria-hidden': 'true' }, icon(e.platform)),
                  h('div', null, h('b', null, sentence(e)), h('span', null, e.kind === 'bestYear' ? String(e.year) : dateShort(e.ts))),
                  h('span', { class: 'dl-kind', 'aria-hidden': 'true' }, icon(ICONS[e.kind] || 'dot')),
                ),
              ),
            ),
          ),
        ),
      ),
      h('p', { class: 'tiny muted', style: { marginTop: '14px' } }, tl('Based only on what is in your exports: follower dates cover the people who follow you today, and some platforms keep only recent activity.')),
    ),
  );
  root.append(shareCard(events, years, ctx));
  return root;
}

// A story-sized card with the headline numbers — no names of other people.
function shareCard(events, years, ctx) {
  const platforms = new Set(events.map((e) => e.platform));
  const joined = events.filter((e) => e.kind === 'joined');
  const top = events.filter((e) => e.kind === 'milestone').sort((a, b) => b.n - a.n)[0];
  const since = new Date(events[0].ts).getFullYear();
  const persona = since <= 2015 ? [tl('The Pioneer'), tl('You were here before it was cool.')] : platforms.size >= 3 ? [tl('The Multi-Platformer'), tl('Everywhere at once, on your own terms.')] : [tl('The Rising Star'), tl('Your story online is just getting started.')];
  const card = {
    kicker: tl('Digital life'),
    titleA: tl('My digital life,'),
    titleB: tl('unwrapped.'),
    hero: tl('{v0} yrs', { v0: years.toFixed(1) }),
    heroLabel: tl('online since {v0}', { v0: String(since) }),
    rows: [
      [tl('Platforms'), fmtInt(platforms.size)],
      joined[0] && [tl('First account'), joined[0].label],
      top && [tl('Biggest milestone'), tl('{v0} followers', { v0: fmtInt(top.n) })],
      [tl('Moments'), fmtInt(events.length)],
    ].filter(Boolean),
    persona: persona[0],
    personaLine: persona[1],
    period: '',
  };
  const canvas = h('canvas', { width: 1080, height: 1920, role: 'img', 'aria-label': `${card.titleA} ${card.titleB} ${card.hero} ${card.heroLabel}` });
  fontsReady().then(() => drawCard(canvas, card, 'aurora', { watermark: !ctx.pro, site: ctx.site }));
  return panel({ title: tl('Share your timeline'), text: tl('A story-sized card with your numbers only — never other people’s names.') }, h('div', { class: 'wrapped-grid' }, h('div', { class: 'wrapped-item' }, canvas, cardButtons(canvas, 'unwrapped-digital-life.png'))));
}
