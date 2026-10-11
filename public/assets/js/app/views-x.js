import { h, icon } from '../lib/ui.js';
import { fmtInt, dateShort, compact, hourLabel, monthLabel, yearsSince } from '../lib/format.js';
import { tweetStats } from '../core/insights.js';
import { viewHead, stat, panel, insights, emptyState, dataNote } from './components.js';
import { relationshipViews, relationshipStats, networkPanel, relationshipInsights, exposurePanel, tagCloud } from './views-common.js';
import { barChart, heatmapChart, rankList, splitBar } from './charts.js';
import { wrappedView } from './views-wrapped.js';
import { privacyParts } from './wrapped.js';

function overview(ds, ctx) {
  const st = tweetStats(ds.tweets);
  const a = ds.account;
  const root = h('div', { class: 'app-content' });
  root.append(viewHead(a.username ? `@${a.username}` : 'X archive', `Archive from ${dateShort(ds.exportedAt)}${a.createdAt ? ` · on X for ${yearsSince(a.createdAt).toFixed(1)} years` : ''}`));
  if (st) {
    root.append(
      h(
        'div',
        { class: 'stats' },
        stat({ label: 'Posts', value: compact(st.originals), sub: 'Your own posts' }),
        stat({ label: 'Replies', value: compact(st.replies) }),
        stat({ label: 'Reposts', value: compact(st.retweets) }),
        stat({ label: 'Likes earned', value: compact(st.likesEarned), sub: `${compact(st.rtsEarned)} reposts earned` }),
      ),
    );
  }
  if (ds.hasRelationships) {
    const { tiles, rel } = relationshipStats(ds, ctx);
    root.append(tiles, h('div', { class: 'panels panels--3-2' }, networkPanel(ds, rel), panel({ title: 'What stands out' }, relationshipInsights(ds, rel))));
    root.append(h('p', { class: 'tiny muted' }, 'X archives list followers by account ID only — use “Open” to see who each one is.'));
  }
  root.append(dataNote(ds));
  return root;
}

function postsView(ds, ctx) {
  const st = tweetStats(ds.tweets);
  const root = h('div', { class: 'app-content' }, viewHead('Your posts', 'Everything you ever posted on X, measured.'));
  if (!st) return root.appendChild(panel(null, emptyState('No posts in this archive.', 'message'))) && root;
  const months = st.months.slice(-36).map((m) => ({ label: monthLabel(m.month), short: monthLabel(m.month, true), value: m.count }));
  const best = st.best.slice(0, ctx.pro || ctx.demo ? 10 : 3);
  root.append(
    panel({ title: 'Posting by month', text: 'Last 36 months' }, barChart(months, { title: 'Posts', ariaLabel: 'Posts by month' })),
    h(
      'div',
      { class: 'panels panels--2' },
      panel(
        { title: 'Your best posts ever', text: 'Ranked by likes + 2× reposts' },
        h(
          'div',
          { class: 'rows' },
          best.map((t, i) =>
            h(
              'div',
              { class: 'row', style: { alignItems: 'flex-start' } },
              h('span', { class: 'count-pill' }, `#${i + 1}`),
              h('div', { class: 'who' }, h('b', { style: { whiteSpace: 'normal' } }, t.text.slice(0, 220)), h('span', null, `${fmtInt(t.likes)} likes · ${fmtInt(t.rts)} reposts · ${dateShort(t.ts)}`)),
              h('a', { class: 'row-btn', href: `https://x.com/i/status/${encodeURIComponent(t.id)}`, target: '_blank', rel: 'noopener noreferrer nofollow' }, icon('external'), 'Open'),
            ),
          ),
        ),
        !ctx.pro && !ctx.demo ? h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => ctx.upgrade('posts') }, icon('lock'), 'See your top 10 with Pro')) : null,
      ),
      panel(
        { title: 'Your mix' },
        splitBar([
          { label: 'Posts', value: st.originals, color: 'var(--c1)' },
          { label: 'Replies', value: st.replies, color: 'var(--c2)' },
          { label: 'Reposts', value: st.retweets, color: 'var(--c3)' },
        ]),
        h('div', { style: { marginTop: '22px' } }, insights([{ icon: 'clock', title: `Most active at ${hourLabel(st.peakHour)}`, text: `Longest posting streak: ${fmtInt(st.streak)} days.` }, st.first && { icon: 'calendar', title: `First post: ${dateShort(st.first.ts)}`, text: st.first.text.slice(0, 120) }])),
      ),
    ),
    panel({ title: 'When you post', text: 'Weekday × hour, your local time' }, heatmapChart(st.heat, { unit: 'posts' })),
    h(
      'div',
      { class: 'panels panels--2' },
      panel({ title: 'Top hashtags' }, st.hashtags.length ? rankList(st.hashtags) : emptyState('No hashtags.', 'hash')),
      panel({ title: 'Words you use most' }, tagCloud(st.words.map((w) => w.key), { limit: 30 })),
    ),
  );
  return root;
}

function privacyView(ds, ctx) {
  const parts = privacyParts(ds);
  const root = h('div', { class: 'app-content' }, viewHead('Privacy X-ray', 'What X inferred about you and who targeted you with ads.'));
  root.append(
    exposurePanel(parts, [
      ds.apps.length && { icon: 'key', title: `Review ${fmtInt(ds.apps.length)} connected apps`, text: 'Settings → Security and account access → Apps and sessions.' },
      { icon: 'megaphone', title: 'Turn off personalized ads', text: 'Settings → Privacy and safety → Ads preferences.' },
    ]),
    h(
      'div',
      { class: 'stats' },
      stat({ label: 'Interests assigned', value: fmtInt(ds.interests.length) }),
      stat({ label: 'Advertisers', value: fmtInt(ds.advertisers.length) }),
      stat({ label: 'Ad impressions logged', value: compact(ds.adImpressions) }),
      stat({ label: 'Connected apps', value: fmtInt(ds.apps.length) }),
    ),
  );
  if (ds.inferred.age || ds.inferred.gender) {
    root.append(
      panel(
        { title: 'Who X thinks you are' },
        insights([
          ds.inferred.age && { icon: 'user', title: `Age: ${ds.inferred.age}`, text: 'Inferred from your activity.' },
          ds.inferred.gender && { icon: 'user', title: `Gender: ${ds.inferred.gender}`, text: 'Inferred unless you set it yourself.' },
          ds.inferred.languages.length && { icon: 'globe', title: `Languages: ${ds.inferred.languages.join(', ')}`, text: 'Used to target ads and content.' },
        ]),
      ),
    );
  }
  root.append(panel({ title: `Interests · ${fmtInt(ds.interests.length)}` }, tagCloud(ds.interests, { locked: !ctx.pro && !ctx.demo, ctx })));
  if (ds.advertisers.length) {
    root.append(
      h(
        'div',
        { class: 'panels panels--2' },
        panel({ title: 'Advertisers that targeted you' }, rankList(ds.advertisers.map((a) => ({ key: a.name, count: a.count })), { limit: ctx.pro || ctx.demo ? 15 : 5 })),
        panel({ title: 'How they targeted you' }, rankList(ds.targeting, { limit: ctx.pro || ctx.demo ? 15 : 5, color: 'var(--c3)' })),
      ),
    );
  }
  if (ds.apps.length) {
    root.append(
      panel(
        { title: 'Apps with access to your account' },
        h(
          'div',
          { class: 'rows' },
          ds.apps.map((app) => h('div', { class: 'row' }, h('div', { class: 'who' }, h('b', null, app.name), h('span', null, `${app.permissions.join(', ') || 'read'} · approved ${dateShort(app.approvedAt)}`)), app.permissions.includes('directmessages') || app.permissions.includes('write') ? h('span', { class: 'badge', style: { background: 'rgba(250,178,25,.12)', color: '#f3d79b' } }, icon('warning'), 'Can act for you') : null)),
        ),
      ),
    );
  }
  return root;
}

export function xViews(ds, ctx) {
  const keepKey = `x:${ds.account?.username || 'me'}`;
  const views = [{ id: 'overview', label: 'Overview', icon: 'home', render: () => overview(ds, ctx) }];
  if (ds.tweets.length) views.push({ id: 'posts', label: 'Your posts', icon: 'message', count: ds.tweets.length, render: () => postsView(ds, ctx) });
  if (ds.hasRelationships) views.push(...relationshipViews(ds, ctx, { keepKey }));
  views.push({ id: 'privacy', label: 'Privacy X-ray', icon: 'fingerprint', render: () => privacyView(ds, ctx) });
  views.push({ id: 'wrapped', label: 'Wrapped cards', icon: 'sparkles', render: () => wrappedView(ds, ctx) });
  return views;
}
