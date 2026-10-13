import { h, icon } from '../lib/ui.js';
import { fmtInt, dateShort, compact, hourLabel, monthLabel, yearsSince } from '../lib/format.js';
import { tweetStats } from '../core/insights.js';
import { viewHead, stat, panel, insights, emptyState, dataNote } from './components.js';
import { relationshipViews, relationshipStats, networkPanel, relationshipInsights, exposurePanel, tagCloud } from './views-common.js';
import { barChart, heatmapChart, rankList, splitBar } from './charts.js';
import { wrappedView } from './views-wrapped.js';
import { privacyParts } from './wrapped.js';
import { t as tl } from '../lib/i18n.js';

function overview(ds, ctx) {
  const st = tweetStats(ds.tweets);
  const a = ds.account;
  const root = h('div', { class: 'app-content' });
  root.append(viewHead(a.username ? `@${a.username}` : tl('X archive'), `${tl('Archive from {v0}', { v0: dateShort(ds.exportedAt) })}${a.createdAt ? ` · ${tl('on X for {v0} years', { v0: yearsSince(a.createdAt).toFixed(1) })}` : ''}`));
  if (st) {
    root.append(
      h(
        'div',
        { class: 'stats' },
        stat({ label: tl('Posts'), value: compact(st.originals), sub: tl('Your own posts') }),
        stat({ label: tl('Replies'), value: compact(st.replies) }),
        stat({ label: tl('Reposts'), value: compact(st.retweets) }),
        stat({ label: tl('Likes earned'), value: compact(st.likesEarned), sub: tl('{v0} reposts earned', { v0: compact(st.rtsEarned) }) }),
      ),
    );
  }
  if (ds.hasRelationships) {
    const { tiles, rel } = relationshipStats(ds, ctx);
    root.append(tiles, h('div', { class: 'panels panels--3-2' }, networkPanel(ds, rel), panel({ title: tl('What stands out') }, relationshipInsights(ds, rel))));
    root.append(h('p', { class: 'tiny muted' }, tl('X archives list followers by account ID only — use “Open” to see who each one is.')));
  }
  root.append(dataNote(ds));
  return root;
}

function postsView(ds, ctx) {
  const st = tweetStats(ds.tweets);
  const root = h('div', { class: 'app-content' }, viewHead(tl('Your posts'), tl('Everything you ever posted on X, measured.')));
  if (!st) return root.appendChild(panel(null, emptyState(tl('No posts in this archive.'), 'message'))) && root;
  const months = st.months.slice(-36).map((m) => ({ label: monthLabel(m.month), short: monthLabel(m.month, true), value: m.count }));
  const best = st.best.slice(0, ctx.pro || ctx.demo ? 10 : 3);
  root.append(
    panel({ title: tl('Posting by month'), text: tl('Last 36 months') }, barChart(months, { title: tl('Posts'), ariaLabel: tl('Posts by month') })),
    h(
      'div',
      { class: 'panels panels--2' },
      panel(
        { title: tl('Your best posts ever'), text: tl('Ranked by likes + 2× reposts') },
        h(
          'div',
          { class: 'rows' },
          best.map((t, i) =>
            h(
              'div',
              { class: 'row', style: { alignItems: 'flex-start' } },
              h('span', { class: 'count-pill' }, `#${i + 1}`),
              h('div', { class: 'who' }, h('b', { style: { whiteSpace: 'normal' } }, t.text.slice(0, 220)), h('span', null, tl('{v0} likes · {v1} reposts · {v2}', { v0: fmtInt(t.likes), v1: fmtInt(t.rts), v2: dateShort(t.ts) }))),
              h('a', { class: 'row-btn', href: `https://x.com/i/status/${encodeURIComponent(t.id)}`, target: '_blank', rel: 'noopener noreferrer nofollow' }, icon('external'), tl('Open')),
            ),
          ),
        ),
        !ctx.pro && !ctx.demo ? h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => ctx.upgrade('posts') }, icon('lock'), tl('See your top 10 with Plus'))) : null,
      ),
      panel(
        { title: tl('Your mix') },
        splitBar([
          { label: tl('Posts'), value: st.originals, color: 'var(--c1)' },
          { label: tl('Replies'), value: st.replies, color: 'var(--c2)' },
          { label: tl('Reposts'), value: st.retweets, color: 'var(--c3)' },
        ]),
        h('div', { style: { marginTop: '22px' } }, insights([{ icon: 'clock', title: tl('Most active at {v0}', { v0: hourLabel(st.peakHour) }), text: tl('Longest posting streak: {v0} days.', { v0: fmtInt(st.streak) }) }, st.first && { icon: 'calendar', title: tl('First post: {v0}', { v0: dateShort(st.first.ts) }), text: st.first.text.slice(0, 120) }])),
      ),
    ),
    panel({ title: tl('When you post'), text: tl('Weekday × hour, your local time') }, heatmapChart(st.heat, { unit: tl('posts') })),
    h(
      'div',
      { class: 'panels panels--2' },
      panel({ title: tl('Top hashtags') }, st.hashtags.length ? rankList(st.hashtags) : emptyState(tl('No hashtags.'), 'hash')),
      panel({ title: tl('Words you use most') }, tagCloud(st.words.map((w) => w.key), { limit: 30 })),
    ),
  );
  return root;
}

function privacyView(ds, ctx) {
  const parts = privacyParts(ds);
  const root = h('div', { class: 'app-content' }, viewHead(tl('Privacy X-ray'), tl('What X inferred about you and who targeted you with ads.')));
  root.append(
    exposurePanel(parts, [
      ds.apps.length && { icon: 'key', title: tl('Review {v0} connected apps', { v0: fmtInt(ds.apps.length) }), text: tl('Settings → Security and account access → Apps and sessions.') },
      { icon: 'megaphone', title: tl('Turn off personalized ads'), text: tl('Settings → Privacy and safety → Ads preferences.') },
    ]),
    h(
      'div',
      { class: 'stats' },
      stat({ label: tl('Interests assigned'), value: fmtInt(ds.interests.length) }),
      stat({ label: tl('Advertisers'), value: fmtInt(ds.advertisers.length) }),
      stat({ label: tl('Ad impressions logged'), value: compact(ds.adImpressions) }),
      stat({ label: tl('Connected apps'), value: fmtInt(ds.apps.length) }),
    ),
  );
  if (ds.inferred.age || ds.inferred.gender) {
    root.append(
      panel(
        { title: tl('Who X thinks you are') },
        insights([
          ds.inferred.age && { icon: 'user', title: tl('Age: {v0}', { v0: ds.inferred.age }), text: tl('Inferred from your activity.') },
          ds.inferred.gender && { icon: 'user', title: tl('Gender: {v0}', { v0: ds.inferred.gender }), text: tl('Inferred unless you set it yourself.') },
          ds.inferred.languages.length && { icon: 'globe', title: tl('Languages: {v0}', { v0: ds.inferred.languages.join(', ') }), text: tl('Used to target ads and content.') },
        ]),
      ),
    );
  }
  root.append(panel({ title: tl('Interests · {v0}', { v0: fmtInt(ds.interests.length) }) }, tagCloud(ds.interests, { locked: !ctx.pro && !ctx.demo, ctx })));
  if (ds.advertisers.length) {
    root.append(
      h(
        'div',
        { class: 'panels panels--2' },
        panel({ title: tl('Advertisers that targeted you') }, rankList(ds.advertisers.map((a) => ({ key: a.name, count: a.count })), { limit: ctx.pro || ctx.demo ? 15 : 5 })),
        panel({ title: tl('How they targeted you') }, rankList(ds.targeting, { limit: ctx.pro || ctx.demo ? 15 : 5, color: 'var(--c3)' })),
      ),
    );
  }
  if (ds.apps.length) {
    root.append(
      panel(
        { title: tl('Apps with access to your account') },
        h(
          'div',
          { class: 'rows' },
          ds.apps.map((app) => h('div', { class: 'row' }, h('div', { class: 'who' }, h('b', null, app.name), h('span', null, tl('{v0} · approved {v1}', { v0: app.permissions.join(', ') || 'read', v1: dateShort(app.approvedAt) }))), app.permissions.includes('directmessages') || app.permissions.includes('write') ? h('span', { class: 'badge', style: { background: 'rgba(250,178,25,.12)', color: '#f3d79b' } }, icon('warning'), tl('Can act for you')) : null)),
        ),
      ),
    );
  }
  return root;
}

export function xViews(ds, ctx) {
  const keepKey = `x:${ds.account?.username || 'me'}`;
  const views = [{ id: 'overview', label: tl('Overview'), icon: 'home', render: () => overview(ds, ctx) }];
  if (ds.tweets.length) views.push({ id: 'posts', label: tl('Your posts'), icon: 'message', count: ds.tweets.length, render: () => postsView(ds, ctx) });
  if (ds.hasRelationships) views.push(...relationshipViews(ds, ctx, { keepKey }));
  views.push({ id: 'privacy', label: tl('Privacy X-ray'), icon: 'fingerprint', render: () => privacyView(ds, ctx) });
  views.push({ id: 'wrapped', label: tl('Wrapped cards'), icon: 'sparkles', render: () => wrappedView(ds, ctx) });
  return views;
}
