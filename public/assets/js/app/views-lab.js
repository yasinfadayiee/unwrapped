// Pro Lab — the tools behind the Pro and Creator tiers. Headline numbers are
// always visible; the details unlock with the tier that includes the tool.

import { h, icon, avatarStyle, append } from '../lib/ui.js';
import { fmtInt, pct, relTime, dateShort, duration, monthLabel, hourLabel } from '../lib/format.js';
import { TIER_NAME, tierFor } from '../lib/tiers.js';
import { relationships } from '../core/insights.js';
import { ghostReport, engagementAudit, growthTimeline, audienceQuality, bestTimesFor, accountHealth } from '../core/lab.js';
import { viewHead, stat, panel, insights, emptyState, lockCard, personRow, userList, dataNote, reminderButton } from './components.js';
import { drawCard, fontsReady } from './wrapped.js';
import { cardButtons } from './views-wrapped.js';
import { barChart, heatmapChart, rankList } from './charts.js';
import { openQueue } from './queue.js';
import { reportView, windowLabel } from './report.js';
import { t as tl } from '../lib/i18n.js';

const DAYS = [tl('Monday'), tl('Tuesday'), tl('Wednesday'), tl('Thursday'), tl('Friday'), tl('Saturday'), tl('Sunday')];

// Like Element.append, but skips null/false (optional panels and teasers).
const add = (root, ...children) => append(root, children);

export function tierPill(tier) {
  return h('span', { class: `tier-pill tier-pill--${tier}` }, TIER_NAME[tier]);
}

export const replyTime = (ms) => (ms == null ? '—' : ms < 60_000 ? '< 1 min' : duration(ms));

// A blurred stand-in for a list the current tier can't open.
function lockedBlock(ctx, feature, { count, what = 'people', title, text, minHeight = '240px' }) {
  const tier = tierFor(feature);
  return h(
    'div',
    { class: 'locked', style: { minHeight } },
    h(
      'div',
      { class: 'locked-rows' },
      Array.from({ length: Math.min(5, Math.max(3, count || 3)) }, () => h('div', { class: 'row' }, h('span', { class: 'av' }), h('div', { class: 'who' }, h('b', null, tl('Hidden name')), h('span', null, tl('Locked'))))),
    ),
    lockCard({ count, what, tier, title, text: text || tl('Part of {v0} — unlock it and every tool below it.', { v0: TIER_NAME[tier] }), onUpgrade: () => ctx.upgrade(feature) }),
  );
}

function nameRow(name, sub, value) {
  const initials = String(name).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2) || '?';
  return h(
    'div',
    { class: 'row' },
    h('span', { class: 'av', style: avatarStyle(name), 'aria-hidden': 'true' }, initials),
    h('div', { class: 'who' }, h('b', null, name), sub ? h('span', null, sub) : null),
    value ? h('span', { class: 'count-pill' }, value) : null,
  );
}

function peopleList(items, describe, { ctx, feature, limit = 8, value, empty = tl('Nobody here — nice.') }) {
  if (!items.length) return emptyState(empty, 'check');
  if (!ctx.can(feature)) return lockedBlock(ctx, feature, { count: items.length });
  return h('div', { class: 'rows' }, items.slice(0, limit).map((p) => nameRow(p.name, describe(p), value ? value(p) : null)));
}

function teaser(ctx, feature) {
  if (ctx.can(feature)) return null;
  const tier = tierFor(feature);
  return h(
    'div',
    { class: 'lab-teaser' },
    tierPill(tier),
    h('span', null, tl('The numbers above are yours. {v0} reveals the names behind them.', { v0: TIER_NAME[tier] })),
    h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => ctx.upgrade(feature) }, icon('bolt'), tl('Unlock with {v0}', { v0: TIER_NAME[tier] })),
  );
}

/* ---------- Ghost Detector ---------- */

function ghostView(ds, ctx) {
  const r = ghostReport(ds.activity?.messages);
  const root = h('div', { class: 'app-content' }, viewHead(tl('Ghost Detector'), tl('How fast people really answer you, who leaves you on read and who always has to start the conversation — measured from your 1:1 DMs.')));
  if (!r) return root.appendChild(panel(null, emptyState(tl('Not enough 1:1 conversations in this export. Request “All available information” including messages.'), 'message'))) && root;
  const faster = r.replyMe && r.replyThem ? r.replyThem / r.replyMe : null;
  add(root,
    h(
      'div',
      { class: 'stats stats--5' },
      stat({ label: tl('Your typical reply'), value: replyTime(r.replyMe), color: 'var(--c1)' }),
      stat({ label: tl('Their typical reply'), value: replyTime(r.replyThem), color: 'var(--c3)' }),
      stat({ label: tl('You start'), value: pct(r.startShare), sub: tl('of all conversations') }),
      stat({ label: tl('Left on read'), value: fmtInt(r.ignoredMe), color: 'var(--c2)', sub: tl('times you had to text again') }),
      stat({ label: tl('Waiting on them'), value: fmtInt(r.waiting.length), color: 'var(--c4)', sub: tl('your last message, 7+ days ago') }),
    ),
    teaser(ctx, 'ghost'),
    h(
      'div',
      { class: 'panels panels--2' },
      panel({ title: tl('Who leaves you on read · {v0}', { v0: fmtInt(r.ghostsYou.length) }), text: tl('You wrote, heard nothing for a day or more, and wrote again') }, peopleList(r.ghostsYou, (p) => tl('{v0} unanswered texts · {v1} of your messages', { v0: fmtInt(p.ignoredMe), v1: pct(p.ghostRate) }), { ctx, feature: 'ghost' })),
      panel({ title: tl('Never answered your last message · {v0}', { v0: fmtInt(r.waiting.length) }), text: tl('The last word is yours and they haven’t written since') }, peopleList(r.waiting, (p) => tl('You wrote {v0}', { v0: relTime(p.waitingOnThem) }), { ctx, feature: 'ghost' })),
      panel({ title: tl('Slowest to answer you'), text: tl('Their usual time to reply to you') }, peopleList(r.slowest, (p) => tl('{v0} messages', { v0: fmtInt(p.count) }), { ctx, feature: 'ghost', value: (p) => replyTime(p.replyThem) })),
      panel({ title: tl('Fastest to answer you'), text: tl('The people who never keep you waiting') }, peopleList(r.fastest, (p) => tl('{v0} messages', { v0: fmtInt(p.count) }), { ctx, feature: 'ghost', value: (p) => replyTime(p.replyThem) })),
      panel({ title: tl('You always text first · {v0}', { v0: fmtInt(r.youStart.length) }), text: tl('Conversations they almost never start') }, peopleList(r.youStart, (p) => tl('You start {v0} of your conversations', { v0: pct(p.startShare) }), { ctx, feature: 'ghost' })),
      panel({ title: tl('Who you leave on read · {v0}', { v0: fmtInt(r.youGhost.length) }), text: tl('They had to text you again before you answered') }, peopleList(r.youGhost, (p) => tl('{v0} of their texts went unanswered', { v0: fmtInt(p.ignoredThem) }), { ctx, feature: 'ghost' })),
    ),
    panel(
      null,
      insights([
        faster && faster > 1.5 && { icon: 'clock', title: tl('You answer {v0}× faster than people answer you', { v0: faster.toFixed(1) }), text: tl('You may be more available than you need to be — it’s fine to take your time.') },
        r.startShare >= 0.6 && { icon: 'send', title: tl('You start {v0} of your conversations', { v0: pct(r.startShare) }), text: tl('Try waiting for the people on the “You always text first” list to reach out.') },
        { icon: 'shield', title: tl('Private by design'), text: tl('Computed on your device. Nobody is notified, and nothing about these people leaves your browser.') },
      ]),
    ),
  );
  return root;
}

/* ---------- Engagement Audit ---------- */

function auditView(ds, ctx, { keepKey }) {
  const a = engagementAudit(ds);
  const root = h('div', { class: 'app-content' });
  const rel = relationships(ds);
  const followers = new Set((ds.lists.followers || []).map((f) => f.u.toLowerCase()));
  const deadNotBack = a.dead.filter((f) => !followers.has(f.u.toLowerCase()));
  const newRate = rel.following - deadNotBack.length ? rel.mutuals.length / (rel.following - deadNotBack.length) : 0;
  const queueBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('bolt'), tl('Clean up dead follows'));
  queueBtn.addEventListener('click', () => (ctx.can('queue') && ctx.can('audit') ? openQueue(ds, deadNotBack, ctx, keepKey) : ctx.upgrade('audit')));
  add(root,
    viewHead(tl('Engagement Audit'), tl('Where your likes, comments and story reactions really go — and which follows are dead weight.'), deadNotBack.length ? queueBtn : null),
    h(
      'div',
      { class: 'stats' },
      stat({ label: tl('Accounts you engage with'), value: fmtInt(a.engaged), color: 'var(--c1)' }),
      stat({ label: tl('Support not returned'), value: pct(a.oneWayShare), color: 'var(--c2)', sub: tl('of your engagement goes to accounts that don’t follow you') }),
      stat({ label: tl('Dead follows'), value: fmtInt(a.dead.length), color: 'var(--c4)', sub: tl('{v0} of who you follow — never liked or commented', { v0: pct(a.deadShare) }) }),
      stat({ label: tl('Your real circle'), value: fmtInt(a.circle.length), color: 'var(--c3)', sub: tl('mutuals you actually engage with') }),
    ),
    teaser(ctx, 'audit'),
    panel(
      { title: tl('You support them, they don’t follow you · {v0}', { v0: fmtInt(a.oneWay.length) }), text: tl('Ranked by your likes, comments (×3) and story likes (×2)') },
      !a.oneWay.length
        ? emptyState(tl('Everyone you engage with follows you back.'), 'check')
        : ctx.can('audit')
          ? h('div', { class: 'rows' }, a.oneWay.slice(0, 40).map((p) => personRow(ds.platform, p, { sub: [p.likes && tl('{v0} likes', { v0: fmtInt(p.likes) }), p.comments && tl('{v0} comments', { v0: fmtInt(p.comments) }), p.stories && tl('{v0} story likes', { v0: fmtInt(p.stories) })].filter(Boolean).join(' · ') })))
          : lockedBlock(ctx, 'audit', { count: a.oneWay.length, what: tl('accounts') }),
    ),
    panel(
      { title: tl('Dead follows · {v0}', { v0: fmtInt(a.dead.length) }), text: tl('You follow them but never liked, commented on or reacted to anything they posted — oldest first') },
      ctx.can('audit')
        ? userList({ platform: ds.platform, items: a.dead, ctx, subFor: (i) => (i.ts ? tl('Followed {v0} · no interaction', { v0: relTime(i.ts) }) : tl('No interaction')), exportName: `${ds.platform}-dead-follows`, keepKey })
        : lockedBlock(ctx, 'audit', { count: a.dead.length, what: tl('accounts') }),
    ),
    panel({ title: tl('Your real circle'), text: tl('Mutuals you engage with the most') }, ctx.can('audit') ? rankList(a.circle.map((p) => ({ key: `@${p.u}`, count: p.weight })), { limit: 12, color: 'var(--c3)' }) : lockedBlock(ctx, 'audit', { count: a.circle.length, what: tl('accounts'), minHeight: '200px' })),
    panel(
      null,
      insights([
        deadNotBack.length > 10 && { icon: 'trend', title: tl('Unfollowing {v0} dead follows lifts your follow-back rate from {v1} to {v2}', { v0: fmtInt(deadNotBack.length), v1: pct(rel.followBackRate), v2: pct(newRate) }), text: tl('These accounts don’t follow you and you never interact with them.') },
        a.oneWayShare > 0.25 && { icon: 'heart', title: tl('{v0} of your engagement is one-way', { v0: pct(a.oneWayShare) }), text: tl('Spend more of it on mutuals and the people in your real circle — the algorithm rewards two-way relationships.') },
      ]),
    ),
    dataNote(ds),
  );
  return root;
}

/* ---------- Growth Time Machine ---------- */

function growthView(ds, ctx) {
  const g = growthTimeline(ds, ctx.snapshots || []);
  const can = ctx.can('growth');
  const root = h('div', { class: 'app-content' }, viewHead(tl('Growth Time Machine'), tl('How your audience was built, how fast people follow back, and what changed between every export you analyzed.')));
  add(root,
    h(
      'div',
      { class: 'stats stats--5' },
      stat({ label: tl('New followers · 30 days'), value: g.hasDates ? fmtInt(g.last30) : '—', color: 'var(--c3)', sub: tl('still following you') }),
      stat({ label: tl('New followers · 90 days'), value: g.hasDates ? fmtInt(g.last90) : '—', sub: g.hasDates ? tl('≈ {v0} a month', { v0: fmtInt(g.last90 / 3) }) : tl('not in this export') }),
      stat({ label: tl('They followed first'), value: fmtInt(g.theyFirst), color: 'var(--c1)', sub: tl('vs {v0} where you did', { v0: fmtInt(g.youFirst) }) }),
      stat({ label: tl('Typical follow-back'), value: g.followBackMedian == null ? '—' : duration(g.followBackMedian), sub: tl('after you follow someone') }),
      stat({ label: tl('Churn · 30 days'), value: g.churn30 == null ? '—' : pct(g.churn30, 1), color: 'var(--c2)', sub: g.churn30 == null ? tl('needs 2 snapshots') : tl('of followers lost per month') }),
    ),
    teaser(ctx, 'growth'),
  );
  if (g.cumulative.length > 2) {
    const months = g.cumulative.slice(-36).map((m) => ({ label: monthLabel(m.month), short: monthLabel(m.month, true), value: m.total }));
    add(root,panel({ title: tl('Your audience, month by month'), text: tl('Followers you still have, counted from when they joined') }, can ? barChart(months, { title: tl('Followers'), ariaLabel: tl('Followers over time'), color: 'var(--c3)' }) : lockedBlock(ctx, 'growth', { what: tl('months'), title: tl('See your growth curve'), minHeight: '220px' })));
  }
  const rows = g.history.slice().reverse();
  add(root,
    h(
      'div',
      { class: 'panels panels--2' },
      panel(
        { title: tl('Every snapshot, compared'), text: rows.length > 1 ? tl('{v0} exports analyzed on this device', { v0: rows.length }) : tl('Analyze a newer export later to see the changes') },
        rows.length < 2
          ? h('div', { class: 'stack', style: { '--stack': '12px', justifyItems: 'center' } }, emptyState(tl('Only one snapshot so far. Download a fresh export in a week or two and drop it here.'), 'calendar'), reminderButton(ds))
          : can
            ? h('div', { class: 'rows' }, rows.map((s) => h('div', { class: 'row' }, h('div', { class: 'who' }, h('b', null, dateShort(s.takenAt)), h('span', null, tl('{v0} followers · {v1} following', { v0: fmtInt(s.followers), v1: fmtInt(s.following) }))), s.gained == null ? h('span', { class: 'badge badge--muted' }, 'first') : h('span', { class: 'delta' }, h('b', { class: 'up' }, `+${fmtInt(s.gained)}`), ' ', h('b', { class: 'down' }, `−${fmtInt(s.lost)}`)))))
            : lockedBlock(ctx, 'growth', { count: rows.length, what: tl('snapshots') }),
      ),
      panel(
        { title: tl('Follow-for-follow check'), text: tl('People who followed you back within 48 hours of you following them') },
        can
          ? insights([
              { icon: 'users', title: tl('{v0} quick follow-backs', { v0: fmtInt(g.quickFollowBacks) }), text: g.youFirst ? tl('{v0} of the people you followed first returned it within two days — often follow-for-follow accounts that may unfollow later.', { v0: pct(g.quickFollowBacks / g.youFirst) }) : tl('No follow-back data in this export.') },
              { icon: 'star', title: tl('{v0} people found you first', { v0: fmtInt(g.theyFirst) }), text: tl('They followed you before you followed them — your organic reach.') },
            ])
          : lockedBlock(ctx, 'growth', { what: tl('insights'), minHeight: '200px' }),
      ),
    ),
    dataNote(ds),
  );
  return root;
}

/* ---------- Audience Quality ---------- */

function audienceView(ds, ctx) {
  const q = audienceQuality(ds.lists.followers);
  const can = ctx.can('audience');
  const root = h('div', { class: 'app-content' }, viewHead(tl('Audience Quality'), tl('An estimate of how many of your followers are bots, spam or bought — from username patterns and sudden follow spikes.')));
  if (!q) return root.appendChild(panel(null, emptyState(tl('Not enough followers with usernames to score.'), 'users'))) && root;
  const gradeColor = { A: 'var(--good)', B: 'var(--signal)', C: 'var(--warning)', D: 'var(--serious)', F: 'var(--critical)' }[q.grade];
  add(root,
    h(
      'div',
      { class: 'stats' },
      h('div', { class: 'stat stat--hero quality-hero' }, h('span', { class: 'label' }, tl('Audience quality')), h('span', { class: 'value' }, h('span', { style: { color: gradeColor } }, q.grade), h('small', null, ` ${q.score}/100`)), h('span', { class: 'sub' }, tl('{v0} of {v1} followers look like real people', { v0: fmtInt(q.clean), v1: fmtInt(q.total) }))),
      stat({ label: tl('Likely bots or spam'), value: fmtInt(q.likely.length), color: 'var(--c2)', sub: pct(q.likely.length / q.total, 1) }),
      stat({ label: tl('Suspicious'), value: fmtInt(q.suspicious.length), color: 'var(--c4)', sub: pct(q.suspicious.length / q.total, 1) }),
      stat({ label: tl('Follow spikes'), value: fmtInt(q.bursts.length), sub: tl('days with unusual waves of followers') }),
    ),
    teaser(ctx, 'audience'),
    panel(
      { title: tl('Likely bots & spam · {v0}', { v0: fmtInt(q.likely.length) }), text: tl('Several red flags at once. Review, then remove them from your followers to clean up your reach.') },
      !q.likely.length ? emptyState(tl('No likely bots found. Your audience looks real.'), 'check') : can ? userList({ platform: ds.platform, items: q.likely, ctx, subFor: (i) => i.reasons.map((r) => tl(r)).join(' · '), exportName: `${ds.platform}-likely-bots` }) : lockedBlock(ctx, 'audience', { count: q.likely.length, what: tl('accounts') }),
    ),
    h(
      'div',
      { class: 'panels panels--2' },
      panel({ title: tl('Red flags we found') }, q.reasons.length ? (can ? rankList(q.reasons.map((r) => ({ ...r, key: tl(r.key) })), { color: 'var(--c2)' }) : lockedBlock(ctx, 'audience', { what: tl('flags'), minHeight: '200px' })) : emptyState(tl('No red flags.'), 'check')),
      panel(
        { title: tl('Follow spikes'), text: tl('Days far above your normal — typical of bought followers or bot waves') },
        !q.bursts.length ? emptyState(tl('No unusual spikes.'), 'check') : can ? barChart(q.bursts.map((b) => ({ label: dateShort(Date.parse(b.day)), value: b.count })), { title: tl('New followers'), ariaLabel: tl('Follow spikes'), color: 'var(--c2)', height: 180 }) : lockedBlock(ctx, 'audience', { what: tl('days'), minHeight: '200px' }),
      ),
    ),
    q.suspicious.length && can ? panel({ title: tl('Suspicious · {v0}', { v0: fmtInt(q.suspicious.length) }), text: tl('One or two red flags — many are real people with unusual usernames') }, userList({ platform: ds.platform, items: q.suspicious, ctx, subFor: (i) => i.reasons.map((r) => tl(r)).join(' · '), exportName: `${ds.platform}-suspicious-followers` })) : null,
    h('p', { class: 'tiny muted' }, tl('An estimate from public signals in your own export — not a verdict. Some real people have unusual usernames, so check before removing anyone.')),
  );
  return root;
}

/* ---------- Best Time to Post ---------- */

function bestTimeView(ds, ctx) {
  const b = bestTimesFor(ds);
  const can = ctx.can('besttime');
  const engagement = b.mode === 'engagement';
  const root = h(
    'div',
    { class: 'app-content' },
    viewHead(
      tl('Best Time to Post'),
      engagement
        ? tl('When your posts earn the most likes and reposts — from {v0} of your own original posts, in your local time.', { v0: fmtInt(b.samples) })
        : b.sources.messages ? tl('When your audience is active — from {v0} follows and {v1} messages you received, in your local time.', { v0: fmtInt(b.sources.follows), v1: fmtInt(b.sources.messages) }) : tl('When your audience is active — from {v0} follows, in your local time.', { v0: fmtInt(b.sources.follows) }),
    ),
  );
  add(root,
    h(
      'div',
      { class: 'stats' },
      b.top.map((w, i) =>
        stat({
          label: tl('Best window #{v0}', { v0: i + 1 }),
          value: can ? windowLabel(w) : '••• •–•',
          color: ['var(--signal)', 'var(--c1)', 'var(--c3)'][i],
          sub: i === 0 && engagement && b.lift ? (can ? tl('{v0}× your average engagement', { v0: b.lift.toFixed(1) }) : tl('Unlock to see the lift')) : engagement ? tl('High engagement') : tl('Peak audience activity'),
        }),
      ),
    ),
    teaser(ctx, 'besttime'),
  );
  const valueLabel = engagement ? (v) => tl('{v0} avg. engagement', { v0: fmtInt(v) }) : (v) => tl('{v0}% of activity', { v0: (v * 100).toFixed(1) });
  add(root,
    panel(
      { title: engagement ? tl('Average engagement by day and hour') : tl('Audience activity by day and hour'), text: engagement ? tl('Likes + 2× reposts per post. Hours with fewer than 2 posts are left blank.') : tl('Brighter = more of your audience is around') },
      can ? h('div', null, heatmapChart(b.grid, { valueLabel, ariaLabel: tl('Best time to post heatmap') })) : lockedBlock(ctx, 'besttime', { what: tl('hours'), title: tl('See your full heatmap'), minHeight: '220px' }),
    ),
  );
  if (can) {
    const days = b.byDay.map((v, i) => ({ label: DAYS[i], short: DAYS[i].slice(0, 3), value: engagement ? Math.round(v) : Math.round(v * 1000) / 10 }));
    const hours = b.byHour.map((v, i) => ({ label: hourLabel(i), short: i % 3 === 0 ? `${i}h` : '', value: engagement ? Math.round(v) : Math.round(v * 1000) / 10 }));
    const label = engagement ? (v) => fmtInt(v) : (v) => `${v}%`;
    add(root,
      h(
        'div',
        { class: 'panels panels--2' },
        panel({ title: tl('By weekday') }, barChart(days, { title: engagement ? tl('Avg. engagement') : tl('Share of activity'), valueLabel: label, height: 190 })),
        panel({ title: tl('By hour') }, barChart(hours, { title: engagement ? tl('Avg. engagement') : tl('Share of activity'), valueLabel: label, height: 190, color: 'var(--c3)' })),
      ),
      panel(
        null,
        insights([
          { icon: 'target', title: tl('Post around {v0}', { v0: windowLabel(b.top[0]) }), text: engagement ? tl('Your posts in this window historically do best.') : tl('Publish about 30 minutes before the window so the post is fresh when your audience arrives.') },
          { icon: 'calendar', title: tl('Re-check every few months'), text: tl('Audiences shift. Drop a fresh export and this updates automatically.') },
        ]),
      ),
    );
  }
  return root;
}

/* ---------- Account Health (free) ---------- */

const HEALTH = {
  A: [tl('Thriving'), tl('An account in great shape.')],
  B: [tl('Healthy'), tl('Strong, with a few quick wins left.')],
  C: [tl('Room to grow'), tl('A few fixes will make a big difference.')],
  D: [tl('Needs attention'), tl('Some clean-up will pay off fast.')],
  F: [tl('Time for a clean-up'), tl('Start with the weakest factor below.')],
};
const GRADE_COLOR = { A: 'var(--good)', B: 'var(--signal)', C: 'var(--warning)', D: 'var(--serious)', F: 'var(--critical)' };
const scoreColor = (s) => (s >= 0.8 ? 'var(--signal)' : s >= 0.6 ? 'var(--c3)' : s >= 0.4 ? 'var(--warning)' : 'var(--c2)');
// Factors that point at a paid tool show its tier when it is locked.
const PAID_FIX = new Set(['audience', 'audit', 'growth']);

export function healthView(ds, ctx) {
  const health = accountHealth(ds, { snapshots: ctx.snapshots || [] });
  const root = h('div', { class: 'app-content' }, viewHead(tl('Account health'), tl('One score for how healthy your account is, and exactly what to fix first.')));
  if (!health) return root.appendChild(panel(null, emptyState(tl('Not enough data in this export to score the account yet.'), 'pulse'))) && root;
  const [headline, line] = HEALTH[health.grade];
  const weakest = health.factors[0];
  const fixBtn = (f, primary = false) => {
    const locked = PAID_FIX.has(f.fix) && !ctx.can(f.fix);
    return h('button', { class: `btn ${primary ? 'btn--primary' : 'btn--ghost'} btn--sm`, type: 'button', onClick: () => ctx.go(f.fix) }, primary ? tl('Fix {v0}', { v0: tl(f.label).toLowerCase() }) : tl('Improve'), icon('arrow'), locked ? tierPill(tierFor(f.fix)) : null);
  };

  const canvas = h('canvas', { width: 1080, height: 1920, role: 'img', 'aria-label': tl('Account health card: {v0} out of 100', { v0: health.score }) });
  const best = [...health.factors].sort((a, b) => b.weight - a.weight).slice(0, 4);
  fontsReady().then(() =>
    drawCard(
      canvas,
      {
        kicker: tl('{v0} · health', { v0: ds.label }),
        titleA: `My ${ds.label},`,
        titleB: tl('checked up.'),
        hero: String(health.score),
        heroLabel: tl('account health score · grade {v0}', { v0: health.grade }),
        rows: best.map((f) => [tl(f.label), `${Math.round(f.score * 100)}/100`]),
        persona: headline,
        personaLine: line,
        period: tl('EXPORT · {v0}', { v0: dateShort(ds.exportedAt).toUpperCase() }),
      },
      'aurora',
      { watermark: !ctx.pro, site: ctx.site },
    ),
  );

  add(
    root,
    h(
      'div',
      { class: 'panels panels--3-2' },
      panel(
        null,
        h(
          'div',
          { class: 'health-hero' },
          h('div', { class: 'gauge gauge--lg', style: { '--v': health.score, '--g': GRADE_COLOR[health.grade] } }, h('div', { class: 'gauge-in' }, h('b', null, health.grade), h('span', null, `${health.score}/100`))),
          h(
            'div',
            { class: 'health-copy' },
            h('span', { class: 'eyebrow' }, tl('Your account')),
            h('h3', null, headline),
            h('p', null, `${line} ${tl('Your weakest area is {v0}: {v1}.', { v0: tl(weakest.label).toLowerCase(), v1: tl(weakest.detailKey, weakest.vars) })}`),
            fixBtn(weakest, true),
          ),
        ),
      ),
      panel({ title: tl('Share your score'), text: tl('Numbers only, never anyone’s name.') }, h('div', { class: 'health-card' }, canvas, cardButtons(canvas, `unwrapped-${ds.platform}-health.png`, tl('My account health, unwrapped')))),
    ),
    panel(
      { title: tl('What makes up your score'), text: tl('Weakest first. Each factor links to the tool that helps you improve it.') },
      h(
        'div',
        { class: 'health-factors' },
        health.factors.map((f) =>
          h(
            'div',
            { class: 'hf' },
            h('div', { class: 'hf-top' }, h('b', null, tl(f.label)), h('span', { class: 'hf-score', style: { color: scoreColor(f.score) } }, `${Math.round(f.score * 100)}`, h('small', null, '/100'))),
            h('div', { class: 'track' }, h('i', { style: { width: `${Math.max(2, f.score * 100)}%`, background: scoreColor(f.score) } })),
            h('div', { class: 'hf-bottom' }, h('span', null, tl(f.detailKey, f.vars)), fixBtn(f)),
          ),
        ),
      ),
    ),
    dataNote(ds),
  );
  return root;
}

/* ---------- registry ---------- */

const FOLLOWER_PLATFORMS = ['instagram', 'threads', 'tiktok', 'x'];

export function labViews(ds, ctx, { keepKey }) {
  const views = [];
  const add = (id, label, iconName, feature, render) => views.push({ id, label, icon: iconName, group: 'lab', feature, render });
  if (ds.activity?.messages?.all?.some((t) => t.dynamics)) add('ghost', tl('Ghost Detector'), 'ghost', 'ghost', () => ghostView(ds, ctx));
  if (ds.platform === 'instagram' && ds.hasRelationships && (ds.activity?.likes || ds.activity?.comments || ds.activity?.storyLikes)) add('audit', tl('Engagement Audit'), 'heart', 'audit', () => auditView(ds, ctx, { keepKey }));
  if (ds.hasRelationships && FOLLOWER_PLATFORMS.includes(ds.platform)) add('growth', tl('Growth Time Machine'), 'trend', 'growth', () => growthView(ds, ctx));
  if (ds.hasRelationships && ds.platform !== 'x' && FOLLOWER_PLATFORMS.includes(ds.platform)) add('audience', tl('Audience Quality'), 'bot', 'audience', () => audienceView(ds, ctx));
  if (bestTimesFor(ds)) add('besttime', tl('Best Time to Post'), 'target', 'besttime', () => bestTimeView(ds, ctx));
  if (ds.hasRelationships && FOLLOWER_PLATFORMS.includes(ds.platform)) add('report', tl('Client report'), 'report', 'report', () => reportView(ds, ctx));
  return views;
}
