import { h, icon } from '../lib/ui.js';
import { fmtInt, dateShort, compact, hourLabel, monthLabel, relTime, yearsSince, pct } from '../lib/format.js';
import { viewHead, stat, panel, insights, userList, emptyState, dataNote } from './components.js';
import { relationshipStats, networkPanel, relationshipInsights, relationshipViews, exposurePanel, tagCloud, C } from './views-common.js';
import { barChart, rankList, splitBar } from './charts.js';
import { wrappedView } from './views-wrapped.js';
import { timeMachineView } from './views-timemachine.js';
import { privacyParts } from './wrapped.js';

function overview(ds, ctx) {
  const { rel, tiles } = relationshipStats(ds, ctx);
  const a = ds.account || {};
  const handle = a.username ? `@${a.username}` : ds.label;
  const followerMonths = new Map();
  for (const f of ds.lists.followers) {
    if (!f.ts) continue;
    const d = new Date(f.ts);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    followerMonths.set(k, (followerMonths.get(k) || 0) + 1);
  }
  const months = [...followerMonths.entries()].sort().slice(-24).map(([k, v]) => ({ label: monthLabel(k), short: monthLabel(k, true), value: v }));
  return h(
    'div',
    { class: 'app-content' },
    viewHead(handle, `${ds.label} export from ${dateShort(ds.exportedAt)}${a.createdAt ? ` · account ${yearsSince(a.createdAt).toFixed(1)} years old` : ''}`),
    tiles,
    h('div', { class: 'panels panels--3-2' }, networkPanel(ds, rel), panel({ title: 'What stands out' }, relationshipInsights(ds, rel))),
    months.length > 2
      ? panel({ title: 'New followers by month', text: 'When the people who follow you today first followed you' }, barChart(months, { title: 'New followers', ariaLabel: 'New followers by month' }))
      : null,
    dataNote(ds),
  );
}

function requestsView(ds, ctx) {
  const L = ds.lists;
  return h(
    'div',
    { class: 'app-content' },
    viewHead('Follow requests', 'Requests you sent that are still waiting, and requests you received.'),
    h(
      'div',
      { class: 'stats' },
      stat({ label: 'Pending — sent by you', value: fmtInt(L.pendingSent.length) }),
      stat({ label: 'Received', value: fmtInt(L.requestsReceived.length) }),
      stat({ label: 'Recent requests', value: fmtInt(L.recentRequests.length) }),
    ),
    panel(
      { title: 'Pending requests you sent', text: 'Private accounts that never accepted. Open one to cancel the request.' },
      userList({ platform: ds.platform, items: L.pendingSent, ctx, subFor: (i) => (i.ts ? `Requested ${relTime(i.ts)}` : ''), exportName: 'pending-requests', emptyText: 'No pending requests.' }),
    ),
    panel({ title: 'Requests you received' }, userList({ platform: ds.platform, items: L.requestsReceived, ctx, exportName: 'received-requests', emptyText: 'No requests waiting.' })),
  );
}

function listsView(ds, ctx) {
  const L = ds.lists;
  const sections = [
    ['closeFriends', 'Close friends', 'People on your Close Friends list.'],
    ['youUnfollowed', 'Recently unfollowed by you', 'Accounts you unfollowed recently.'],
    ['blocked', 'Blocked', 'Accounts you blocked.'],
    ['restricted', 'Restricted', 'Accounts you restricted.'],
    ['hideStoryFrom', 'Story hidden from', 'People who can’t see your stories.'],
    ['favorites', 'Favorites', 'Accounts you marked as favorites.'],
    ['removedSuggestions', 'Removed suggestions', 'Suggested accounts you dismissed.'],
  ].filter(([key]) => L[key]?.length);
  return h(
    'div',
    { class: 'app-content' },
    viewHead('Close friends & more', 'Every other list inside your export.'),
    sections.length
      ? sections.map(([key, title, text]) => panel({ title: `${title} · ${fmtInt(L[key].length)}`, text }, userList({ platform: ds.platform, items: L[key], ctx, exportName: key })))
      : panel(null, emptyState('Your export doesn’t include these lists.', 'inbox')),
  );
}

function activityView(ds, ctx) {
  const act = ds.activity;
  const root = h('div', { class: 'app-content' }, viewHead('Your activity', 'Likes, comments and messages — what you actually do on Instagram.'));
  const tiles = h(
    'div',
    { class: 'stats' },
    act.likes && stat({ label: 'Posts liked', value: compact(act.likes.total) }),
    act.comments && stat({ label: 'Comments', value: compact(act.comments.total) }),
    act.messages && stat({ label: 'Messages', value: compact(act.messages.total), sub: `${fmtInt(act.messages.threadCount)} conversations` }),
    act.storyLikes && stat({ label: 'Story likes', value: compact(act.storyLikes.total) }),
    act.saved && stat({ label: 'Saved posts', value: compact(act.saved.total) }),
  );
  root.append(tiles);
  if (act.likes) {
    const months = act.likes.byMonth.slice(-24).map((m) => ({ label: monthLabel(m.month), short: monthLabel(m.month, true), value: m.count }));
    root.append(
      h(
        'div',
        { class: 'panels panels--3-2' },
        panel({ title: 'Likes by month' }, barChart(months, { title: 'Likes', ariaLabel: 'Likes by month' })),
        panel({ title: 'Accounts you like the most', text: 'Ranked by how many of their posts you liked' }, ctx.pro ? rankList(act.likes.top, { limit: 15 }) : h('div', null, rankList(act.likes.top, { limit: 5 }), lockedMore(ctx, act.likes.top.length - 5))),
      ),
    );
  }
  if (act.messages) {
    const msg = act.messages;
    const hours = msg.byHour.map((v, i) => ({ label: hourLabel(i), short: i % 3 === 0 ? `${i}h` : '', value: v }));
    root.append(
      h(
        'div',
        { class: 'panels panels--2' },
        panel(
          { title: 'Your DM besties', text: 'Conversations with the most messages' },
          ctx.pro || ctx.demo ? rankList(msg.threads.map((t) => ({ key: t.title, count: t.count })), { limit: 10 }) : h('div', null, rankList(msg.threads.map((t) => ({ key: t.title, count: t.count })), { limit: 3 }), lockedMore(ctx, msg.threads.length - 3)),
        ),
        panel(
          { title: 'Sent vs received' },
          splitBar([
            { label: 'Sent by you', value: msg.sent, color: C.mutual },
            { label: 'Received', value: msg.received, color: C.fan },
          ]),
          h('div', { style: { marginTop: '20px' } }, barChart(hours, { title: 'Messages', ariaLabel: 'Messages by hour of day', height: 180 })),
        ),
      ),
    );
  }
  if (act.comments?.top?.length) {
    root.append(panel({ title: 'Who you comment on most' }, rankList(act.comments.top, { limit: ctx.pro ? 10 : 5, color: 'var(--c3)' })));
  }
  return root;
}

function lockedMore(ctx, n) {
  if (n <= 0) return null;
  return h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => ctx.upgrade('activity') }, icon('lock'), `${fmtInt(n)} more with Pro`));
}

function privacyView(ds, ctx) {
  const p = ds.privacy || {};
  const parts = privacyParts(ds);
  const root = h('div', { class: 'app-content' }, viewHead('Privacy X-ray', 'What Instagram and its advertisers have on you — straight from your own export.'));
  root.append(
    exposurePanel(parts, [
      p.advertisers?.length && { icon: 'megaphone', title: 'Hide ads from specific advertisers', text: 'Accounts Center → Ad preferences → Advertisers you’ve seen.' },
      p.logins && { icon: 'device', title: 'Log out devices you don’t recognize', text: 'Accounts Center → Password and security → Where you’re logged in.' },
      { icon: 'shield', title: 'Turn on two-factor authentication', text: 'Accounts Center → Password and security → Two-factor authentication.' },
    ]),
  );
  const tiles = h(
    'div',
    { class: 'stats' },
    p.advertisers && stat({ label: 'Advertisers with your data', value: fmtInt(p.advertisers.length), sub: `${fmtInt(p.advertisers.filter((a) => a.dataFile).length)} uploaded a list with you` }),
    p.topics && stat({ label: 'Topics assigned to you', value: fmtInt(p.topics.length) }),
    p.adsViewed !== undefined && stat({ label: 'Ads you’ve seen', value: compact(p.adsViewed) }),
    p.logins && stat({ label: 'Logins recorded', value: fmtInt(p.logins.count), sub: `${fmtInt(p.logins.ips)} IP addresses` }),
  );
  root.append(tiles);
  if (p.advertisers?.length) {
    const items = p.advertisers.map((a) => ({ name: a.name, ts: 0, tags: [a.dataFile && 'Uploaded your info', a.remarketing && 'Retargets you', a.inStore && 'Store visit'].filter(Boolean) }));
    const shown = ctx.pro || ctx.demo ? items : items.slice(0, 12);
    root.append(
      panel(
        { title: `Advertisers using your activity or information · ${fmtInt(items.length)}`, text: '“Uploaded your info” means the company uploaded a customer list that matched you.' },
        h(
          'div',
          { class: 'rows' },
          shown.slice(0, 200).map((a) => h('div', { class: 'row' }, h('div', { class: 'who' }, h('b', null, a.name), h('span', null, a.tags.join(' · ') || 'Interacted with your activity')))),
        ),
        !ctx.pro && !ctx.demo && items.length > 12 ? lockedMore(ctx, items.length - 12) : null,
      ),
    );
  }
  if (p.topics?.length || p.interests?.length) {
    root.append(panel({ title: 'What Instagram thinks you’re into' }, tagCloud([...(p.topics || []), ...(p.interests || [])], { locked: !ctx.pro && !ctx.demo, ctx })));
  }
  if (p.logins) {
    root.append(
      panel(
        { title: 'Devices that logged in', text: `${fmtInt(p.logins.count)} logins between ${dateShort(p.logins.first)} and ${dateShort(p.logins.last)}` },
        rankList(p.logins.devices.map((d) => ({ key: d.name, count: d.count })), { limit: 10, color: 'var(--c3)' }),
      ),
    );
  }
  if (p.searches?.length) {
    root.append(panel({ title: `Your searches · ${fmtInt(p.searches.length)}` }, tagCloud(p.searches.map((s) => s.term), { locked: !ctx.pro && !ctx.demo, ctx, limit: 80 })));
  }
  return root;
}

export function instagramViews(ds, ctx) {
  const keepKey = `${ds.platform}:${ds.account?.username || 'me'}`;
  const views = [{ id: 'overview', label: 'Overview', icon: 'home', render: () => overview(ds, ctx) }];
  if (ds.hasRelationships) views.push(...relationshipViews(ds, ctx, { keepKey }));
  if (ds.hasRelationships) views.push({ id: 'timemachine', label: 'Time Machine', icon: 'clock', badge: 'New', render: () => timeMachineView(ds, ctx) });
  if (ds.platform === 'instagram') {
    const L = ds.lists;
    if (L.pendingSent.length || L.requestsReceived.length || L.recentRequests.length) views.push({ id: 'requests', label: 'Follow requests', icon: 'inbox', count: L.pendingSent.length, render: () => requestsView(ds, ctx) });
    if (['closeFriends', 'blocked', 'restricted', 'hideStoryFrom', 'youUnfollowed', 'favorites', 'removedSuggestions'].some((k) => L[k]?.length)) views.push({ id: 'lists', label: 'Close friends & more', icon: 'list', render: () => listsView(ds, ctx) });
    if (ds.activity) views.push({ id: 'activity', label: 'Activity', icon: 'heart', render: () => activityView(ds, ctx) });
    if (ds.privacy) views.push({ id: 'privacy', label: 'Privacy X-ray', icon: 'fingerprint', render: () => privacyView(ds, ctx) });
  }
  views.push({ id: 'wrapped', label: 'Wrapped cards', icon: 'sparkles', render: () => wrappedView(ds, ctx) });
  return views;
}
