// Friendship Radar — who your real friends are, which friendships are fading
// or rising, and which are one-sided. Built from 1:1 DM history only.

import { h, s, icon } from '../lib/ui.js';
import { fmtInt, pct, relTime } from '../lib/format.js';
import { friendshipRadar } from '../core/insights.js';
import { viewHead, stat, panel, insights, emptyState, lockCard } from './components.js';
import { friendCardPanel } from './friend-card.js';
import { t as tl } from '../lib/i18n.js';

const GROUPS = [
  { key: 'steady', label: tl('Steady'), color: 'var(--c1)' },
  { key: 'rising', label: tl('Rising'), color: 'var(--c3)' },
  { key: 'fading', label: tl('Fading'), color: 'var(--c2)' },
  { key: 'onesided', label: tl('One-sided'), color: 'var(--c4)' },
];
const groupOf = (p) => (p.tag === 'rising' ? 'rising' : p.tag === 'fading' || p.tag === 'quiet' ? 'fading' : p.tag === 'you-chase' || p.tag === 'they-chase' ? 'onesided' : 'steady');

function radarSvg(radar, { hideNames }) {
  const size = 520;
  const c = size / 2;
  const R = c - 30;
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': tl('Friendship radar: closer to the center means closer friendship') });
  for (const f of [0.25, 0.5, 0.75, 1]) svg.append(s('circle', { cx: c, cy: c, r: R * f, fill: 'none', stroke: '#24242f', 'stroke-width': 1 }));
  GROUPS.forEach((g, i) => {
    const a = (i / GROUPS.length) * Math.PI * 2 - Math.PI / 2;
    svg.append(s('line', { x1: c, y1: c, x2: c + Math.cos(a) * R, y2: c + Math.sin(a) * R, stroke: '#24242f' }));
    const la = a + Math.PI / GROUPS.length;
    svg.append(s('text', { x: c + Math.cos(la) * (R + 14), y: c + Math.sin(la) * (R + 14) + 4, 'text-anchor': 'middle', fill: '#858596', 'font-size': 12, 'font-family': 'Inter, sans-serif' }, g.label));
  });
  svg.append(s('circle', { cx: c, cy: c, r: 16, fill: '#d7ff3a' }), s('text', { x: c, y: c + 4, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#0a0a0e', 'font-family': 'Inter, sans-serif' }, tl('YOU')));
  const max = Math.max(...radar.people.map((p) => p.count));
  const byGroup = new Map(GROUPS.map((g) => [g.key, []]));
  for (const p of radar.people.slice(0, 60)) byGroup.get(groupOf(p)).push(p);
  GROUPS.forEach((g, gi) => {
    const list = byGroup.get(g.key);
    list.forEach((p, k) => {
      const a0 = (gi / GROUPS.length) * Math.PI * 2 - Math.PI / 2;
      const a = a0 + ((k + 0.5) / Math.max(1, list.length)) * ((Math.PI * 2) / GROUPS.length);
      const dist = 28 + (1 - p.score / 100) * (R - 36);
      const x = c + Math.cos(a) * dist;
      const y = c + Math.sin(a) * dist;
      const r = 4 + Math.sqrt(p.count / max) * 9;
      const dot = s('circle', { cx: x, cy: y, r, fill: g.color, stroke: '#101017', 'stroke-width': 2, tabindex: 0 });
      dot.append(s('title', null, tl('{v0} · closeness {v1}/100 · {v2} messages', { v0: hideNames ? tl('Friend') : p.name, v1: p.score, v2: fmtInt(p.count) })));
      svg.append(dot);
    });
  });
  return svg;
}

function personList(items, describe, { ctx, limit = 8 }) {
  if (!items.length) return emptyState(tl('Nobody here right now.'), 'check');
  const locked = !ctx.can('friends');
  const rows = items.slice(0, locked ? 1 : limit).map((p) =>
    h('div', { class: 'row' }, h('span', { class: 'count-pill' }, `${p.score}`), h('div', { class: 'who' }, h('b', null, p.name), h('span', null, describe(p)))),
  );
  if (locked && items.length > 1) {
    return h(
      'div',
      null,
      h('div', { class: 'rows' }, rows),
      h(
        'div',
        { class: 'locked', style: { minHeight: '220px', marginTop: '6px' } },
        h('div', { class: 'locked-rows' }, items.slice(1, 4).map(() => h('div', { class: 'row' }, h('div', { class: 'who' }, h('b', null, tl('Hidden friend')), h('span', null, tl('Locked')))))),
        lockCard({ count: items.length - 1, what: tl('people'), tier: 'pro', text: tl('Friendship Radar is part of Pro — with Ghost Detector, Engagement Audit and Growth Time Machine.'), onUpgrade: () => ctx.upgrade('friends') }),
      ),
    );
  }
  return h('div', { class: 'rows' }, rows);
}

export function friendsView(ds, ctx) {
  const radar = friendshipRadar(ds.activity?.messages);
  const root = h('div', { class: 'app-content' });
  root.append(viewHead(tl('Friendship Radar'), tl('Your real inner circle, the friendships that are fading or growing, and the ones where only one side makes the effort — measured from your DMs over the last 90 days vs the 90 days before.')));
  if (!radar) {
    root.append(panel(null, emptyState(tl('Your export has no messages. Request “All available information” to unlock the Friendship Radar.'), 'message')));
    return root;
  }
  const locked = !ctx.can('friends');
  const describe = {
    fading: (p) => tl('{v0} → {v1} messages · last {v2}', { v0: fmtInt(p.previous), v1: fmtInt(p.recent), v2: relTime(p.last) }),
    rising: (p) => tl('{v0} → {v1} messages in 90 days', { v0: fmtInt(p.previous), v1: fmtInt(p.recent) }),
    youChase: (p) => tl('You send {v0} of the messages', { v0: pct(p.share) }),
    theyChase: (p) => tl('They send {v0} of the messages', { v0: pct(1 - p.share) }),
    inner: (p) => tl('{v0} messages · {v1} from you', { v0: fmtInt(p.count), v1: pct(p.share) }),
  };
  root.append(
    h(
      'div',
      { class: 'stats stats--5' },
      stat({ label: tl('Inner circle'), value: fmtInt(radar.innerCircle.length), color: 'var(--c1)' }),
      stat({ label: tl('Rising'), value: fmtInt(radar.rising.length), color: 'var(--c3)', sub: tl('Talking more lately') }),
      stat({ label: tl('Fading'), value: fmtInt(radar.fading.length + radar.quiet.length), color: 'var(--c2)', sub: tl('Talking much less') }),
      stat({ label: tl('You carry it'), value: fmtInt(radar.youChase.length), color: 'var(--c4)', sub: tl('You send most messages') }),
      stat({ label: tl('They carry it'), value: fmtInt(radar.theyChase.length), sub: tl('They send most messages') }),
    ),
    h(
      'div',
      { class: 'panels panels--3-2' },
      panel(
        { title: tl('Your radar'), text: tl('Closer to the center = closer friendship. Dot size = total messages.') },
        h('div', { style: { maxWidth: '520px', margin: '0 auto' } }, radarSvg(radar, { hideNames: locked })),
        h('div', { class: 'legend', style: { marginTop: '12px', justifyContent: 'center' } }, GROUPS.map((g) => h('span', null, h('i', { style: { background: g.color } }), g.label))),
      ),
      panel({ title: tl('Inner circle'), text: tl('Highest closeness score') }, personList(radar.innerCircle, describe.inner, { ctx, limit: 5 })),
    ),
    h(
      'div',
      { class: 'panels panels--2' },
      panel({ title: tl('Fading friendships'), text: tl('You used to talk a lot more') }, personList([...radar.fading, ...radar.quiet], describe.fading, { ctx })),
      panel({ title: tl('Rising friendships'), text: tl('Talking more than ever') }, personList(radar.rising, describe.rising, { ctx })),
      panel({ title: tl('You carry the conversation'), text: tl('Maybe wait for them to text first?') }, personList(radar.youChase, describe.youChase, { ctx })),
      panel({ title: tl('They carry the conversation'), text: tl('Someone wants your attention') }, personList(radar.theyChase, describe.theyChase, { ctx })),
    ),
    panel(
      null,
      insights([
        radar.fading[0] && !locked && { icon: 'heart', title: tl('Text {v0} today', { v0: radar.fading[0].name }), text: tl('Your most-faded friendship. A simple “thinking of you” goes a long way.') },
        { icon: 'shield', title: tl('Private by design'), text: tl('Computed on your device from your own export. Nobody is notified, and names are never put on share cards.') },
      ]),
    ),
  );
  const card = friendCardPanel(ds, ctx);
  if (card) root.append(card);
  return root;
}
