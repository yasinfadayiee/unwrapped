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

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
      Array.from({ length: Math.min(5, Math.max(3, count || 3)) }, () => h('div', { class: 'row' }, h('span', { class: 'av' }), h('div', { class: 'who' }, h('b', null, 'Hidden name'), h('span', null, 'Locked')))),
    ),
    lockCard({ count, what, tier, title, text: text || `Part of ${TIER_NAME[tier]} — unlock it and every tool below it.`, onUpgrade: () => ctx.upgrade(feature) }),
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

function peopleList(items, describe, { ctx, feature, limit = 8, value, empty = 'Nobody here — nice.' }) {
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
    h('span', null, `The numbers above are yours. ${TIER_NAME[tier]} reveals the names behind them.`),
    h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => ctx.upgrade(feature) }, icon('bolt'), `Unlock with ${TIER_NAME[tier]}`),
  );
}

/* ---------- Ghost Detector ---------- */

function ghostView(ds, ctx) {
  const r = ghostReport(ds.activity?.messages);
  const root = h('div', { class: 'app-content' }, viewHead('Ghost Detector', 'How fast people really answer you, who leaves you on read and who always has to start the conversation — measured from your 1:1 DMs.'));
  if (!r) return root.appendChild(panel(null, emptyState('Not enough 1:1 conversations in this export. Request “All available information” including messages.', 'message'))) && root;
  const faster = r.replyMe && r.replyThem ? r.replyThem / r.replyMe : null;
  add(root,
    h(
      'div',
      { class: 'stats stats--5' },
      stat({ label: 'Your typical reply', value: replyTime(r.replyMe), color: 'var(--c1)' }),
      stat({ label: 'Their typical reply', value: replyTime(r.replyThem), color: 'var(--c3)' }),
      stat({ label: 'You start', value: pct(r.startShare), sub: 'of all conversations' }),
      stat({ label: 'Left on read', value: fmtInt(r.ignoredMe), color: 'var(--c2)', sub: 'times you had to text again' }),
      stat({ label: 'Waiting on them', value: fmtInt(r.waiting.length), color: 'var(--c4)', sub: 'your last message, 7+ days ago' }),
    ),
    teaser(ctx, 'ghost'),
    h(
      'div',
      { class: 'panels panels--2' },
      panel({ title: `Who leaves you on read · ${fmtInt(r.ghostsYou.length)}`, text: 'You wrote, heard nothing for a day or more, and wrote again' }, peopleList(r.ghostsYou, (p) => `${fmtInt(p.ignoredMe)} unanswered texts · ${pct(p.ghostRate)} of your messages`, { ctx, feature: 'ghost' })),
      panel({ title: `Never answered your last message · ${fmtInt(r.waiting.length)}`, text: 'The last word is yours and they haven’t written since' }, peopleList(r.waiting, (p) => `You wrote ${relTime(p.waitingOnThem)}`, { ctx, feature: 'ghost' })),
      panel({ title: 'Slowest to answer you', text: 'Their usual time to reply to you' }, peopleList(r.slowest, (p) => `${fmtInt(p.count)} messages`, { ctx, feature: 'ghost', value: (p) => replyTime(p.replyThem) })),
      panel({ title: 'Fastest to answer you', text: 'The people who never keep you waiting' }, peopleList(r.fastest, (p) => `${fmtInt(p.count)} messages`, { ctx, feature: 'ghost', value: (p) => replyTime(p.replyThem) })),
      panel({ title: `You always text first · ${fmtInt(r.youStart.length)}`, text: 'Conversations they almost never start' }, peopleList(r.youStart, (p) => `You start ${pct(p.startShare)} of your conversations`, { ctx, feature: 'ghost' })),
      panel({ title: `Who you leave on read · ${fmtInt(r.youGhost.length)}`, text: 'They had to text you again before you answered' }, peopleList(r.youGhost, (p) => `${fmtInt(p.ignoredThem)} of their texts went unanswered`, { ctx, feature: 'ghost' })),
    ),
    panel(
      null,
      insights([
        faster && faster > 1.5 && { icon: 'clock', title: `You answer ${faster.toFixed(1)}× faster than people answer you`, text: 'You may be more available than you need to be — it’s fine to take your time.' },
        r.startShare >= 0.6 && { icon: 'send', title: `You start ${pct(r.startShare)} of your conversations`, text: 'Try waiting for the people on the “You always text first” list to reach out.' },
        { icon: 'shield', title: 'Private by design', text: 'Computed on your device. Nobody is notified, and nothing about these people leaves your browser.' },
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
  const queueBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('bolt'), 'Clean up dead follows');
  queueBtn.addEventListener('click', () => (ctx.can('queue') && ctx.can('audit') ? openQueue(ds, deadNotBack, ctx, keepKey) : ctx.upgrade('audit')));
  add(root,
    viewHead('Engagement Audit', 'Where your likes, comments and story reactions really go — and which follows are dead weight.', deadNotBack.length ? queueBtn : null),
    h(
      'div',
      { class: 'stats' },
      stat({ label: 'Accounts you engage with', value: fmtInt(a.engaged), color: 'var(--c1)' }),
      stat({ label: 'Support not returned', value: pct(a.oneWayShare), color: 'var(--c2)', sub: 'of your engagement goes to accounts that don’t follow you' }),
      stat({ label: 'Dead follows', value: fmtInt(a.dead.length), color: 'var(--c4)', sub: `${pct(a.deadShare)} of who you follow — never liked or commented` }),
      stat({ label: 'Your real circle', value: fmtInt(a.circle.length), color: 'var(--c3)', sub: 'mutuals you actually engage with' }),
    ),
    teaser(ctx, 'audit'),
    panel(
      { title: `You support them, they don’t follow you · ${fmtInt(a.oneWay.length)}`, text: 'Ranked by your likes, comments (×3) and story likes (×2)' },
      !a.oneWay.length
        ? emptyState('Everyone you engage with follows you back.', 'check')
        : ctx.can('audit')
          ? h('div', { class: 'rows' }, a.oneWay.slice(0, 40).map((p) => personRow(ds.platform, p, { sub: [p.likes && `${fmtInt(p.likes)} likes`, p.comments && `${fmtInt(p.comments)} comments`, p.stories && `${fmtInt(p.stories)} story likes`].filter(Boolean).join(' · ') })))
          : lockedBlock(ctx, 'audit', { count: a.oneWay.length, what: 'accounts' }),
    ),
    panel(
      { title: `Dead follows · ${fmtInt(a.dead.length)}`, text: 'You follow them but never liked, commented on or reacted to anything they posted — oldest first' },
      ctx.can('audit')
        ? userList({ platform: ds.platform, items: a.dead, ctx, subFor: (i) => (i.ts ? `Followed ${relTime(i.ts)} · no interaction` : 'No interaction'), exportName: `${ds.platform}-dead-follows`, keepKey })
        : lockedBlock(ctx, 'audit', { count: a.dead.length, what: 'accounts' }),
    ),
    panel({ title: 'Your real circle', text: 'Mutuals you engage with the most' }, ctx.can('audit') ? rankList(a.circle.map((p) => ({ key: `@${p.u}`, count: p.weight })), { limit: 12, color: 'var(--c3)' }) : lockedBlock(ctx, 'audit', { count: a.circle.length, what: 'accounts', minHeight: '200px' })),
    panel(
      null,
      insights([
        deadNotBack.length > 10 && { icon: 'trend', title: `Unfollowing ${fmtInt(deadNotBack.length)} dead follows lifts your follow-back rate from ${pct(rel.followBackRate)} to ${pct(newRate)}`, text: 'These accounts don’t follow you and you never interact with them.' },
        a.oneWayShare > 0.25 && { icon: 'heart', title: `${pct(a.oneWayShare)} of your engagement is one-way`, text: 'Spend more of it on mutuals and the people in your real circle — the algorithm rewards two-way relationships.' },
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
  const root = h('div', { class: 'app-content' }, viewHead('Growth Time Machine', 'How your audience was built, how fast people follow back, and what changed between every export you analyzed.'));
  add(root,
    h(
      'div',
      { class: 'stats stats--5' },
      stat({ label: 'New followers · 30 days', value: g.hasDates ? fmtInt(g.last30) : '—', color: 'var(--c3)', sub: 'still following you' }),
      stat({ label: 'New followers · 90 days', value: g.hasDates ? fmtInt(g.last90) : '—', sub: g.hasDates ? `≈ ${fmtInt(g.last90 / 3)} a month` : 'not in this export' }),
      stat({ label: 'They followed first', value: fmtInt(g.theyFirst), color: 'var(--c1)', sub: `vs ${fmtInt(g.youFirst)} where you did` }),
      stat({ label: 'Typical follow-back', value: g.followBackMedian == null ? '—' : duration(g.followBackMedian), sub: 'after you follow someone' }),
      stat({ label: 'Churn · 30 days', value: g.churn30 == null ? '—' : pct(g.churn30, 1), color: 'var(--c2)', sub: g.churn30 == null ? 'needs 2 snapshots' : 'of followers lost per month' }),
    ),
    teaser(ctx, 'growth'),
  );
  if (g.cumulative.length > 2) {
    const months = g.cumulative.slice(-36).map((m) => ({ label: monthLabel(m.month), short: monthLabel(m.month, true), value: m.total }));
    add(root,panel({ title: 'Your audience, month by month', text: 'Followers you still have, counted from when they joined' }, can ? barChart(months, { title: 'Followers', ariaLabel: 'Followers over time', color: 'var(--c3)' }) : lockedBlock(ctx, 'growth', { what: 'months', title: 'See your growth curve', minHeight: '220px' })));
  }
  const rows = g.history.slice().reverse();
  add(root,
    h(
      'div',
      { class: 'panels panels--2' },
      panel(
        { title: 'Every snapshot, compared', text: rows.length > 1 ? `${rows.length} exports analyzed on this device` : 'Analyze a newer export later to see the changes' },
        rows.length < 2
          ? h('div', { class: 'stack', style: { '--stack': '12px', justifyItems: 'center' } }, emptyState('Only one snapshot so far. Download a fresh export in a week or two and drop it here.', 'calendar'), reminderButton(ds))
          : can
            ? h('div', { class: 'rows' }, rows.map((s) => h('div', { class: 'row' }, h('div', { class: 'who' }, h('b', null, dateShort(s.takenAt)), h('span', null, `${fmtInt(s.followers)} followers · ${fmtInt(s.following)} following`)), s.gained == null ? h('span', { class: 'badge badge--muted' }, 'first') : h('span', { class: 'delta' }, h('b', { class: 'up' }, `+${fmtInt(s.gained)}`), ' ', h('b', { class: 'down' }, `−${fmtInt(s.lost)}`)))))
            : lockedBlock(ctx, 'growth', { count: rows.length, what: 'snapshots' }),
      ),
      panel(
        { title: 'Follow-for-follow check', text: 'People who followed you back within 48 hours of you following them' },
        can
          ? insights([
              { icon: 'users', title: `${fmtInt(g.quickFollowBacks)} quick follow-backs`, text: g.youFirst ? `${pct(g.quickFollowBacks / g.youFirst)} of the people you followed first returned it within two days — often follow-for-follow accounts that may unfollow later.` : 'No follow-back data in this export.' },
              { icon: 'star', title: `${fmtInt(g.theyFirst)} people found you first`, text: 'They followed you before you followed them — your organic reach.' },
            ])
          : lockedBlock(ctx, 'growth', { what: 'insights', minHeight: '200px' }),
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
  const root = h('div', { class: 'app-content' }, viewHead('Audience Quality', 'An estimate of how many of your followers are bots, spam or bought — from username patterns and sudden follow spikes.'));
  if (!q) return root.appendChild(panel(null, emptyState('Not enough followers with usernames to score.', 'users'))) && root;
  const gradeColor = { A: 'var(--good)', B: 'var(--signal)', C: 'var(--warning)', D: 'var(--serious)', F: 'var(--critical)' }[q.grade];
  add(root,
    h(
      'div',
      { class: 'stats' },
      h('div', { class: 'stat stat--hero quality-hero' }, h('span', { class: 'label' }, 'Audience quality'), h('span', { class: 'value' }, h('span', { style: { color: gradeColor } }, q.grade), h('small', null, ` ${q.score}/100`)), h('span', { class: 'sub' }, `${fmtInt(q.clean)} of ${fmtInt(q.total)} followers look like real people`)),
      stat({ label: 'Likely bots or spam', value: fmtInt(q.likely.length), color: 'var(--c2)', sub: pct(q.likely.length / q.total, 1) }),
      stat({ label: 'Suspicious', value: fmtInt(q.suspicious.length), color: 'var(--c4)', sub: pct(q.suspicious.length / q.total, 1) }),
      stat({ label: 'Follow spikes', value: fmtInt(q.bursts.length), sub: 'days with unusual waves of followers' }),
    ),
    teaser(ctx, 'audience'),
    panel(
      { title: `Likely bots & spam · ${fmtInt(q.likely.length)}`, text: 'Several red flags at once. Review, then remove them from your followers to clean up your reach.' },
      !q.likely.length ? emptyState('No likely bots found. Your audience looks real.', 'check') : can ? userList({ platform: ds.platform, items: q.likely, ctx, subFor: (i) => i.reasons.join(' · '), exportName: `${ds.platform}-likely-bots` }) : lockedBlock(ctx, 'audience', { count: q.likely.length, what: 'accounts' }),
    ),
    h(
      'div',
      { class: 'panels panels--2' },
      panel({ title: 'Red flags we found' }, q.reasons.length ? (can ? rankList(q.reasons, { color: 'var(--c2)' }) : lockedBlock(ctx, 'audience', { what: 'flags', minHeight: '200px' })) : emptyState('No red flags.', 'check')),
      panel(
        { title: 'Follow spikes', text: 'Days far above your normal — typical of bought followers or bot waves' },
        !q.bursts.length ? emptyState('No unusual spikes.', 'check') : can ? barChart(q.bursts.map((b) => ({ label: dateShort(Date.parse(b.day)), value: b.count })), { title: 'New followers', ariaLabel: 'Follow spikes', color: 'var(--c2)', height: 180 }) : lockedBlock(ctx, 'audience', { what: 'days', minHeight: '200px' }),
      ),
    ),
    q.suspicious.length && can ? panel({ title: `Suspicious · ${fmtInt(q.suspicious.length)}`, text: 'One or two red flags — many are real people with unusual usernames' }, userList({ platform: ds.platform, items: q.suspicious, ctx, subFor: (i) => i.reasons.join(' · '), exportName: `${ds.platform}-suspicious-followers` })) : null,
    h('p', { class: 'tiny muted' }, 'An estimate from public signals in your own export — not a verdict. Some real people have unusual usernames, so check before removing anyone.'),
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
      'Best Time to Post',
      engagement
        ? `When your posts earn the most likes and reposts — from ${fmtInt(b.samples)} of your own original posts, in your local time.`
        : `When your audience is active — from ${fmtInt(b.sources.follows)} follows${b.sources.messages ? ` and ${fmtInt(b.sources.messages)} messages you received` : ''}, in your local time.`,
    ),
  );
  add(root,
    h(
      'div',
      { class: 'stats' },
      b.top.map((w, i) =>
        stat({
          label: `Best window #${i + 1}`,
          value: can ? windowLabel(w) : '••• •–•',
          color: ['var(--signal)', 'var(--c1)', 'var(--c3)'][i],
          sub: i === 0 && engagement && b.lift ? (can ? `${b.lift.toFixed(1)}× your average engagement` : 'Unlock to see the lift') : engagement ? 'High engagement' : 'Peak audience activity',
        }),
      ),
    ),
    teaser(ctx, 'besttime'),
  );
  const valueLabel = engagement ? (v) => `${fmtInt(v)} avg. engagement` : (v) => `${(v * 100).toFixed(1)}% of activity`;
  add(root,
    panel(
      { title: engagement ? 'Average engagement by day and hour' : 'Audience activity by day and hour', text: engagement ? 'Likes + 2× reposts per post. Hours with fewer than 2 posts are left blank.' : 'Brighter = more of your audience is around' },
      can ? h('div', null, heatmapChart(b.grid, { valueLabel, ariaLabel: 'Best time to post heatmap' })) : lockedBlock(ctx, 'besttime', { what: 'hours', title: 'See your full heatmap', minHeight: '220px' }),
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
        panel({ title: 'By weekday' }, barChart(days, { title: engagement ? 'Avg. engagement' : 'Share of activity', valueLabel: label, height: 190 })),
        panel({ title: 'By hour' }, barChart(hours, { title: engagement ? 'Avg. engagement' : 'Share of activity', valueLabel: label, height: 190, color: 'var(--c3)' })),
      ),
      panel(
        null,
        insights([
          { icon: 'target', title: `Post around ${windowLabel(b.top[0])}`, text: engagement ? 'Your posts in this window historically do best.' : 'Publish about 30 minutes before the window so the post is fresh when your audience arrives.' },
          { icon: 'calendar', title: 'Re-check every few months', text: 'Audiences shift. Drop a fresh export and this updates automatically.' },
        ]),
      ),
    );
  }
  return root;
}

/* ---------- Account Health (free) ---------- */

const HEALTH = {
  A: ['Thriving', 'An account in great shape.'],
  B: ['Healthy', 'Strong, with a few quick wins left.'],
  C: ['Room to grow', 'A few fixes will make a big difference.'],
  D: ['Needs attention', 'Some clean-up will pay off fast.'],
  F: ['Time for a clean-up', 'Start with the weakest factor below.'],
};
const GRADE_COLOR = { A: 'var(--good)', B: 'var(--signal)', C: 'var(--warning)', D: 'var(--serious)', F: 'var(--critical)' };
const scoreColor = (s) => (s >= 0.8 ? 'var(--signal)' : s >= 0.6 ? 'var(--c3)' : s >= 0.4 ? 'var(--warning)' : 'var(--c2)');
// Factors that point at a paid tool show its tier when it is locked.
const PAID_FIX = new Set(['audience', 'audit', 'growth']);

export function healthView(ds, ctx) {
  const health = accountHealth(ds, { snapshots: ctx.snapshots || [] });
  const root = h('div', { class: 'app-content' }, viewHead('Account health', 'One score for how healthy your account is, and exactly what to fix first.'));
  if (!health) return root.appendChild(panel(null, emptyState('Not enough data in this export to score the account yet.', 'pulse'))) && root;
  const [headline, line] = HEALTH[health.grade];
  const weakest = health.factors[0];
  const fixBtn = (f, primary = false) => {
    const locked = PAID_FIX.has(f.fix) && !ctx.can(f.fix);
    return h('button', { class: `btn ${primary ? 'btn--primary' : 'btn--ghost'} btn--sm`, type: 'button', onClick: () => ctx.go(f.fix) }, primary ? `Fix ${f.label.toLowerCase()}` : 'Improve', icon('arrow'), locked ? tierPill(tierFor(f.fix)) : null);
  };

  const canvas = h('canvas', { width: 1080, height: 1920, role: 'img', 'aria-label': `Account health card: ${health.score} out of 100` });
  const best = [...health.factors].sort((a, b) => b.weight - a.weight).slice(0, 4);
  fontsReady().then(() =>
    drawCard(
      canvas,
      {
        kicker: `${ds.label} · health`,
        titleA: `My ${ds.label},`,
        titleB: 'checked up.',
        hero: String(health.score),
        heroLabel: `account health score · grade ${health.grade}`,
        rows: best.map((f) => [f.label, `${Math.round(f.score * 100)}/100`]),
        persona: headline,
        personaLine: line,
        period: `EXPORT · ${dateShort(ds.exportedAt).toUpperCase()}`,
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
            h('span', { class: 'eyebrow' }, 'Your account'),
            h('h3', null, headline),
            h('p', null, `${line} Your weakest area is ${weakest.label.toLowerCase()}: ${weakest.detail}.`),
            fixBtn(weakest, true),
          ),
        ),
      ),
      panel({ title: 'Share your score', text: 'Numbers only, never anyone’s name.' }, h('div', { class: 'health-card' }, canvas, cardButtons(canvas, `unwrapped-${ds.platform}-health.png`, 'My account health, unwrapped'))),
    ),
    panel(
      { title: 'What makes up your score', text: 'Weakest first. Each factor links to the tool that helps you improve it.' },
      h(
        'div',
        { class: 'health-factors' },
        health.factors.map((f) =>
          h(
            'div',
            { class: 'hf' },
            h('div', { class: 'hf-top' }, h('b', null, f.label), h('span', { class: 'hf-score', style: { color: scoreColor(f.score) } }, `${Math.round(f.score * 100)}`, h('small', null, '/100'))),
            h('div', { class: 'track' }, h('i', { style: { width: `${Math.max(2, f.score * 100)}%`, background: scoreColor(f.score) } })),
            h('div', { class: 'hf-bottom' }, h('span', null, f.detail), fixBtn(f)),
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
  if (ds.activity?.messages?.all?.some((t) => t.dynamics)) add('ghost', 'Ghost Detector', 'ghost', 'ghost', () => ghostView(ds, ctx));
  if (ds.platform === 'instagram' && ds.hasRelationships && (ds.activity?.likes || ds.activity?.comments || ds.activity?.storyLikes)) add('audit', 'Engagement Audit', 'heart', 'audit', () => auditView(ds, ctx, { keepKey }));
  if (ds.hasRelationships && FOLLOWER_PLATFORMS.includes(ds.platform)) add('growth', 'Growth Time Machine', 'trend', 'growth', () => growthView(ds, ctx));
  if (ds.hasRelationships && ds.platform !== 'x' && FOLLOWER_PLATFORMS.includes(ds.platform)) add('audience', 'Audience Quality', 'bot', 'audience', () => audienceView(ds, ctx));
  if (bestTimesFor(ds)) add('besttime', 'Best Time to Post', 'target', 'besttime', () => bestTimeView(ds, ctx));
  if (ds.hasRelationships && FOLLOWER_PLATFORMS.includes(ds.platform)) add('report', 'Client report', 'report', 'report', () => reportView(ds, ctx));
  return views;
}
