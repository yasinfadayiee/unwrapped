import { h, s, icon } from '../lib/ui.js';
import { fmtInt, dateShort, monthLabel, pct } from '../lib/format.js';
import { viewHead, stat, panel, insights, emptyState, personRow } from './components.js';
import { splitBar } from './charts.js';
import { timeMachine, lagLabel } from '../core/timemachine.js';

const W = 900;
const H = 260;
const PAD = { l: 8, r: 8, t: 16, b: 26 };

/** Scrubbable, playable growth chart of followers vs following. */
function replay(tm) {
  const M = tm.months;
  const max = Math.max(1, ...M.map((m) => Math.max(m.followers, m.following)));
  const x = (i) => PAD.l + (i / Math.max(1, M.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const line = (f) => M.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m[f]).toFixed(1)}`).join('');
  const area = (f) => `${line(f)}L${x(M.length - 1)},${H - PAD.b}L${x(0)},${H - PAD.b}Z`;
  const eraKeys = new Map(tm.eras.map((e) => [e.key, e]));

  const clipRect = s('rect', { x: 0, y: 0, width: W, height: H });
  const cursor = s('line', { class: 'tm-cursor', x1: 0, x2: 0, y1: PAD.t - 6, y2: H - PAD.b });
  const dotA = s('circle', { class: 'tm-dot', r: 5, fill: 'var(--c1)' });
  const dotB = s('circle', { class: 'tm-dot', r: 5, fill: 'var(--signal)' });
  const svg = s(
    'svg',
    { class: 'tm-svg', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': `Followers and following over time, ${monthLabel(M[0].key)} to ${monthLabel(M.at(-1).key)}` },
    s('defs', null,
      s('clipPath', { id: 'tm-clip' }, clipRect),
      s('linearGradient', { id: 'tm-ga', x1: 0, x2: 0, y1: 0, y2: 1 }, s('stop', { offset: '0', 'stop-color': 'var(--c1)', 'stop-opacity': '.45' }), s('stop', { offset: '1', 'stop-color': 'var(--c1)', 'stop-opacity': '0' })),
      s('linearGradient', { id: 'tm-gb', x1: 0, x2: 0, y1: 0, y2: 1 }, s('stop', { offset: '0', 'stop-color': '#d7ff3a', 'stop-opacity': '.28' }), s('stop', { offset: '1', 'stop-color': '#d7ff3a', 'stop-opacity': '0' })),
    ),
    [0.25, 0.5, 0.75, 1].map((f) => s('line', { class: 'tm-grid', x1: PAD.l, x2: W - PAD.r, y1: y(max * f), y2: y(max * f) })),
    s('g', { 'clip-path': 'url(#tm-clip)' },
      s('path', { d: area('followers'), fill: 'url(#tm-ga)' }),
      s('path', { d: area('following'), fill: 'url(#tm-gb)' }),
      s('path', { d: line('followers'), class: 'tm-line', stroke: 'var(--c1)' }),
      s('path', { d: line('following'), class: 'tm-line', stroke: 'var(--signal)' }),
    ),
    M.map((m, i) => (eraKeys.has(m.key) ? s('g', { class: 'tm-era' }, s('line', { x1: x(i), x2: x(i), y1: PAD.t, y2: H - PAD.b }), s('circle', { cx: x(i), cy: PAD.t, r: 4 })) : null)),
    cursor, dotA, dotB,
    [0, Math.floor((M.length - 1) / 2), M.length - 1].map((i, k) => s('text', { class: 'tm-axis', x: x(i), y: H - 6, 'text-anchor': ['start', 'middle', 'end'][k] }, monthLabel(M[i].key))),
  );

  const dateEl = h('b', { class: 'tm-date' });
  const aEl = h('b');
  const bEl = h('b');
  const noteEl = h('div', { class: 'tm-note' });
  const range = h('input', { class: 'tm-range', type: 'range', min: 0, max: M.length - 1, value: M.length - 1, 'aria-label': 'Travel through time' });
  const playBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('play'), 'Replay my story');

  function show(i) {
    const m = M[i];
    const cx = x(i);
    clipRect.setAttribute('width', cx);
    cursor.setAttribute('x1', cx);
    cursor.setAttribute('x2', cx);
    dotA.setAttribute('cx', cx); dotA.setAttribute('cy', y(m.followers));
    dotB.setAttribute('cx', cx); dotB.setAttribute('cy', y(m.following));
    dateEl.textContent = monthLabel(m.key);
    aEl.textContent = fmtInt(m.followers);
    bEl.textContent = fmtInt(m.following);
    const era = eraKeys.get(m.key);
    noteEl.textContent = era
      ? era.kind === 'spree' ? `⚡ Follow spree — you followed ${fmtInt(era.count)} accounts this month.` : `🌊 Follower wave — ${fmtInt(era.count)} people followed you this month.`
      : m.gained || m.followed ? `+${fmtInt(m.gained)} followers · +${fmtInt(m.followed)} follows this month` : 'A quiet month.';
    noteEl.classList.toggle('is-era', Boolean(era));
  }

  let timer = 0;
  function stop() {
    cancelAnimationFrame(timer);
    timer = 0;
    playBtn.lastChild.textContent = 'Replay my story';
  }
  playBtn.addEventListener('click', () => {
    if (timer) return stop();
    playBtn.lastChild.textContent = 'Pause';
    const total = Math.min(9000, Math.max(3500, M.length * 90));
    const from = +range.value >= M.length - 1 ? 0 : +range.value;
    const t0 = performance.now() - (from / (M.length - 1 || 1)) * total;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / total);
      const i = Math.round(p * (M.length - 1));
      range.value = i;
      show(i);
      if (p < 1) timer = requestAnimationFrame(step);
      else stop();
    };
    timer = requestAnimationFrame(step);
  });
  range.addEventListener('input', () => { stop(); show(+range.value); });
  show(M.length - 1);

  return h(
    'div',
    { class: 'tm-replay' },
    h('div', { class: 'tm-readout' },
      h('div', null, h('small', null, 'You are in'), dateEl),
      h('div', null, h('small', null, h('i', { style: { background: 'var(--c1)' } }), 'Followers'), aEl),
      h('div', null, h('small', null, h('i', { style: { background: 'var(--signal)' } }), 'Following'), bEl),
      playBtn,
    ),
    h('div', { class: 'tm-chart' }, svg),
    range,
    noteEl,
  );
}

function people(ds, ctx, items, subFor) {
  const limit = ctx.pro || ctx.demo ? 12 : 3;
  return h(
    'div',
    null,
    h('div', { class: 'rows' }, items.slice(0, limit).map((p) => personRow(ds.platform, { u: p.u, ts: p.since }, { sub: subFor(p) }))),
    items.length > limit ? h('button', { class: 'btn btn--ghost btn--sm', style: { marginTop: '14px' }, type: 'button', onClick: () => ctx.upgrade('timemachine') }, icon('lock'), 'See all with Pro') : null,
  );
}

export function timeMachineView(ds, ctx) {
  const tm = timeMachine(ds.lists);
  const root = h('div', { class: 'app-content' }, viewHead('Time Machine', 'Your account’s story, rebuilt from the timestamp on every follow — including who made the first move.'));
  if (!tm) {
    root.append(panel(null, emptyState('This export doesn’t include follow dates. Request it in JSON format to unlock the Time Machine.', 'clock')));
    return root;
  }

  root.append(panel({ title: 'Replay your account', text: 'Drag through time or press play. Marked months are your “eras” — bursts far above your usual pace.' }, replay(tm)));

  if (tm.pairs) {
    const share = tm.youFirst / tm.pairs;
    const verdict = share >= 0.6 ? ['The Initiator', 'You usually make the first move.'] : share <= 0.4 ? ['The Magnet', 'People usually come to you first.'] : ['The Diplomat', 'Your friendships start from both sides equally.'];
    root.append(
      h('div', { class: 'tm-hero' },
        h('div', { class: 'tm-hero-text' },
          h('small', null, 'Who made the first move?'),
          h('h3', null, verdict[0]),
          h('p', null, `${verdict[1]} Of your ${fmtInt(tm.pairs)} mutuals, you followed first ${pct(share)} of the time.`),
        ),
        h('div', { class: 'tm-hero-bar' }, splitBar([
          { label: 'You followed first', value: tm.youFirst, color: 'var(--signal)' },
          { label: 'They followed first', value: tm.theyFirst, color: 'var(--c1)' },
        ])),
      ),
      h('div', { class: 'stats' },
        stat({ label: 'They follow you back in', value: tm.youFirst ? lagLabel(tm.theirReply) : '—', sub: 'median, after you follow' }),
        stat({ label: 'You follow back in', value: tm.theyFirst ? lagLabel(tm.yourReply) : '—', sub: 'median, after they follow' }),
        stat({ label: 'Instant follow-backs', value: fmtInt(tm.instant), sub: 'within one hour' }),
        stat({ label: 'Your first follower still here', value: tm.firstFollower ? dateShort(tm.firstFollower.ts) : '—', sub: tm.firstFollower ? `@${tm.firstFollower.u}` : '' }),
      ),
      h('div', { class: 'panels panels--3' },
        panel({ title: 'Day ones', text: 'Your longest-standing mutual connections' }, people(ds, ctx, tm.dayOnes, (p) => `Since ${dateShort(p.since)}`)),
        panel({ title: 'Lightning follow-backs', text: 'The fastest replies in your network' }, people(ds, ctx, tm.fastest, (p) => `${p.youFirst ? 'They' : 'You'} replied in ${lagLabel(p.lag)}`)),
        panel({ title: 'Slow burns', text: 'Friendships that took their time' }, people(ds, ctx, tm.slowBurns, (p) => `${p.youFirst ? 'They' : 'You'} took ${lagLabel(p.lag)}`)),
      ),
    );
  }

  if (tm.eras.length) {
    root.append(panel({ title: 'Your eras', text: 'Months that stand out from everything else' }, insights(tm.eras.map((e) => ({
      icon: e.kind === 'spree' ? 'bolt' : 'users',
      title: `${monthLabel(e.key)} — ${e.kind === 'spree' ? 'follow spree' : 'follower wave'}`,
      text: e.kind === 'spree' ? `You followed ${fmtInt(e.count)} accounts — ${e.times.toFixed(1)}× your usual month.` : `${fmtInt(e.count)} new followers — ${e.times.toFixed(1)}× your usual month.`,
    })))));
  }
  root.append(h('p', { class: 'tiny muted', style: { marginTop: '4px' } }, 'Based on the accounts in this export. People who unfollowed or were unfollowed earlier aren’t in it, so early months can look smaller than they were.'));
  return root;
}
