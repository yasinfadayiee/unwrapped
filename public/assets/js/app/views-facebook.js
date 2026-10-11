import { h } from '../lib/ui.js';
import { fmtInt, dateShort, monthLabel, relTime, yearsSince } from '../lib/format.js';
import { byMonth } from '../core/insights.js';
import { viewHead, stat, panel, insights, userList, emptyState, dataNote } from './components.js';
import { unfollowersView, exposurePanel, tagCloud } from './views-common.js';
import { barChart } from './charts.js';
import { wrappedView } from './views-wrapped.js';
import { privacyParts } from './wrapped.js';

function overview(ds, ctx) {
  const L = ds.lists;
  const years = byMonth(L.friends.map((f) => f.ts)).reduce((map, m) => {
    const y = m.month.slice(0, 4);
    map.set(y, (map.get(y) || 0) + m.count);
    return map;
  }, new Map());
  const bars = [...years.entries()].map(([y, v]) => ({ label: y, value: v }));
  return h(
    'div',
    { class: 'app-content' },
    viewHead(ds.account.name || 'Facebook', `Facebook export from ${dateShort(ds.exportedAt)}${ds.account.createdAt ? ` · member for ${yearsSince(ds.account.createdAt).toFixed(1)} years` : ''}`),
    h(
      'div',
      { class: 'stats' },
      stat({ label: 'Friends', value: fmtInt(L.friends.length), onClick: () => ctx.go('friends') }),
      stat({ label: 'Removed by you', value: fmtInt(L.removed.length) }),
      stat({ label: 'Requests you sent', value: fmtInt(L.sentRequests.length), sub: 'Still pending', onClick: () => ctx.go('requests') }),
      stat({ label: 'Requests received', value: fmtInt(L.receivedRequests.length) }),
    ),
    bars.length > 1 ? panel({ title: 'Friends added per year', text: 'Based on when each current friendship started' }, barChart(bars, { title: 'Friends', ariaLabel: 'Friends added per year' })) : null,
    panel(
      null,
      insights([
        L.friends.length && { icon: 'users', title: `${fmtInt(L.friends.length)} friends`, text: L.friends.length > 500 ? 'A big network — Facebook caps friends at 5,000.' : 'A close-knit circle.' },
        L.sentRequests.length && { icon: 'clock', title: `${fmtInt(L.sentRequests.length)} friend requests never answered`, text: 'You can cancel them from each profile.' },
        { icon: 'ghost', title: 'Find out who unfriended you', text: 'Drop a new export in a couple of weeks — we’ll compare automatically.' },
      ]),
    ),
    dataNote(ds),
  );
}

export function facebookViews(ds, ctx) {
  const L = ds.lists;
  const views = [
    { id: 'overview', label: 'Overview', icon: 'home', render: () => overview(ds, ctx) },
    {
      id: 'friends',
      label: 'Friends',
      icon: 'users',
      count: L.friends.length,
      render: () => h('div', { class: 'app-content' }, viewHead('Friends', `${fmtInt(L.friends.length)} friends in your export.`), panel(null, userList({ platform: 'facebook', items: L.friends, ctx, subFor: (i) => (i.ts ? `Friends since ${dateShort(i.ts)}` : ''), exportName: 'facebook-friends' }))),
    },
    { id: 'unfollowers', label: 'Who unfriended you', icon: 'ghost', pro: true, render: () => unfollowersView(ds, ctx) },
    {
      id: 'requests',
      label: 'Friend requests',
      icon: 'inbox',
      count: L.sentRequests.length,
      render: () =>
        h(
          'div',
          { class: 'app-content' },
          viewHead('Friend requests', 'Requests you sent that are still pending, and requests you received.'),
          panel({ title: `Sent · ${fmtInt(L.sentRequests.length)}` }, userList({ platform: 'facebook', items: L.sentRequests, ctx, subFor: (i) => (i.ts ? `Sent ${relTime(i.ts)}` : ''), exportName: 'sent-requests', emptyText: 'No pending requests.' })),
          panel({ title: `Received · ${fmtInt(L.receivedRequests.length)}` }, userList({ platform: 'facebook', items: L.receivedRequests, ctx, exportName: 'received-requests', emptyText: 'No requests waiting.' })),
          L.removed.length ? panel({ title: `Removed by you · ${fmtInt(L.removed.length)}` }, userList({ platform: 'facebook', items: L.removed, ctx, exportName: 'removed-friends' })) : null,
        ),
    },
  ];
  if (ds.advertisers.length || ds.offFacebook.companies) {
    views.push({
      id: 'privacy',
      label: 'Privacy X-ray',
      icon: 'fingerprint',
      render: () =>
        h(
          'div',
          { class: 'app-content' },
          viewHead('Privacy X-ray', 'Advertisers holding your data, and companies that send Facebook your activity from elsewhere.'),
          exposurePanel(privacyParts(ds), [{ icon: 'globe', title: 'Clear off-Facebook activity', text: 'Accounts Center → Your information and permissions → Your activity off Meta technologies.' }]),
          h('div', { class: 'stats' }, stat({ label: 'Advertisers with your data', value: fmtInt(ds.advertisers.length) }), stat({ label: 'Companies sharing your activity', value: fmtInt(ds.offFacebook.companies) }), stat({ label: 'Off-Facebook events', value: fmtInt(ds.offFacebook.events) })),
          ds.advertisers.length ? panel({ title: 'Advertisers' }, tagCloud(ds.advertisers, { locked: !ctx.pro && !ctx.demo, ctx, limit: 120 })) : null,
        ),
    });
    views.push({ id: 'wrapped', label: 'Wrapped cards', icon: 'sparkles', render: () => wrappedView(ds, ctx) });
  }
  return views;
}
