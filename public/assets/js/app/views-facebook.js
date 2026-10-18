import { h, icon } from '../lib/ui.js';
import { openQueue } from './queue.js';
import { fmtInt, dateShort, monthLabel, relTime, yearsSince } from '../lib/format.js';
import { byMonth } from '../core/insights.js';
import { viewHead, stat, panel, insights, userList, emptyState, dataNote } from './components.js';
import { unfollowersView, exposurePanel, tagCloud } from './views-common.js';
import { barChart, rankList } from './charts.js';
import { wrappedView } from './views-wrapped.js';
import { privacyParts } from './wrapped.js';
import { messagesView } from './views-messages.js';
import { lookupView } from './views-lookup.js';
import { actionPlan } from './action-plan.js';
import { t as tl } from '../lib/i18n.js';

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
    viewHead(ds.account.name || tl('Facebook'), `${tl('{v0} export from {v1}', { v0: 'Facebook', v1: dateShort(ds.exportedAt) })}${ds.account.createdAt ? ` · ${tl('member for {v0} years', { v0: yearsSince(ds.account.createdAt).toFixed(1) })}` : ''}`),
    h(
      'div',
      { class: 'stats' },
      stat({ label: tl('Friends'), value: fmtInt(L.friends.length), onClick: () => ctx.go('friends') }),
      stat({ label: tl('Removed by you'), value: fmtInt(L.removed.length) }),
      stat({ label: tl('Requests you sent'), value: fmtInt(L.sentRequests.length), sub: tl('Still pending'), onClick: () => ctx.go('requests') }),
      stat({ label: tl('Requests received'), value: fmtInt(L.receivedRequests.length) }),
    ),
    actionPlan(ds, ctx),
    bars.length > 1 ? panel({ title: tl('Friends added per year'), text: tl('Based on when each current friendship started') }, barChart(bars, { title: tl('Friends'), ariaLabel: tl('Friends added per year') })) : null,
    panel(
      null,
      insights([
        L.friends.length && { icon: 'users', title: tl('{v0} friends', { v0: fmtInt(L.friends.length) }), text: L.friends.length > 500 ? tl('A big network — Facebook caps friends at 5,000.') : tl('A close-knit circle.') },
        L.sentRequests.length && { icon: 'clock', title: tl('{v0} friend requests never answered', { v0: fmtInt(L.sentRequests.length) }), text: tl('You can cancel them from each profile.') },
        { icon: 'ghost', title: tl('Find out who unfriended you'), text: tl('Drop a new export in a couple of weeks — we’ll compare automatically.') },
      ]),
    ),
    dataNote(ds),
  );
}

const REACTION = { LIKE: '👍', LOVE: '❤️', HAHA: '😆', WOW: '😮', SORRY: '😢', SAD: '😢', ANGER: '😡', ANGRY: '😡', CARE: '🤗' };

function activityView(ds, ctx) {
  const a = ds.posted;
  const full = ctx.pro || ctx.demo;
  const years = Object.entries(a.byYear).sort();
  const peak = years.slice().sort((x, y) => y[1].posts - x[1].posts)[0];
  const types = Object.entries(a.reactionTypes).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ key: `${REACTION[k] || ''} ${k[0]}${k.slice(1).toLowerCase()}`.trim(), count: v }));
  const oldest = [...ds.lists.friends].filter((f) => f.ts).sort((x, y) => x.ts - y.ts).slice(0, full ? 10 : 3);
  return h(
    'div',
    { class: 'app-content' },
    viewHead(tl('Your Facebook life'), tl('Everything you posted, commented and reacted to — year by year.')),
    h(
      'div',
      { class: 'stats' },
      stat({ label: tl('Posts'), value: fmtInt(a.posts) }),
      stat({ label: tl('Comments'), value: fmtInt(a.comments) }),
      stat({ label: tl('Reactions given'), value: fmtInt(a.reactions) }),
      stat({ label: tl('Groups joined'), value: fmtInt(a.groups.length) }),
    ),
    years.length > 1 ? panel({ title: tl('Posts per year') }, barChart(years.map(([label, v]) => ({ label, value: v.posts })), { title: tl('Posts'), ariaLabel: tl('Posts per year') })) : null,
    panel(
      null,
      insights([
        peak && peak[1].posts && { icon: 'star', title: tl('Your most active year: {v0}', { v0: peak[0] }), text: tl('{v0} posts that year.', { v0: fmtInt(peak[1].posts) }) },
        a.firstPost && { icon: 'calendar', title: tl('First post: {v0}', { v0: dateShort(a.firstPost.ts) }), text: a.firstPost.text },
        types[0] && { icon: 'heart', title: tl('Your go-to reaction: {v0}', { v0: types[0].key }), text: tl('{v0} times.', { v0: fmtInt(types[0].count) }) },
      ]),
    ),
    h(
      'div',
      { class: 'panels panels--2' },
      types.length ? panel({ title: tl('How you react') }, rankList(types, { limit: 8, color: 'var(--c2)' })) : null,
      oldest.length ? panel({ title: tl('Your oldest friendships') }, h('div', { class: 'rows' }, oldest.map((f) => h('div', { class: 'row' }, h('div', { class: 'who' }, h('b', null, f.name), h('span', null, tl('Friends since {v0}', { v0: dateShort(f.ts) }))))))) : null,
    ),
    a.groups.length ? panel({ title: tl('Groups you joined') }, userList({ platform: 'facebook', items: a.groups, ctx, subFor: (g) => (g.ts ? tl('Joined {v0}', { v0: dateShort(g.ts) }) : ''), exportName: 'facebook-groups' })) : null,
  );
}

export function facebookViews(ds, ctx) {
  const L = ds.lists;
  const views = [
    { id: 'overview', label: tl('Overview'), icon: 'home', render: () => overview(ds, ctx) },
    ...(ds.posted && (ds.posted.posts || ds.posted.comments || ds.posted.reactions || ds.posted.groups.length) ? [{ id: 'activity', label: tl('Your Facebook life'), icon: 'calendar', render: () => activityView(ds, ctx) }] : []),
    {
      id: 'friends',
      label: tl('Friends'),
      icon: 'users',
      count: L.friends.length,
      render: () => h('div', { class: 'app-content' }, viewHead(tl('Friends'), tl('{v0} friends in your export.', { v0: fmtInt(L.friends.length) })), panel(null, userList({ platform: 'facebook', items: L.friends, ctx, subFor: (i) => (i.ts ? tl('Friends since {v0}', { v0: dateShort(i.ts) }) : ''), exportName: 'facebook-friends' }))),
    },
    { id: 'unfollowers', label: tl('Who unfriended you'), icon: 'ghost', pro: true, render: () => unfollowersView(ds, ctx) },
    {
      id: 'requests',
      label: tl('Friend requests'),
      icon: 'inbox',
      count: L.sentRequests.length,
      render: () =>
        h(
          'div',
          { class: 'app-content' },
          viewHead(
            tl('Friend requests'),
            tl('Requests you sent that are still pending, and requests you received.'),
            L.sentRequests.length
              ? h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => (ctx.can('queue') ? openQueue(ds, L.sentRequests, ctx, `facebook:${ds.account?.name || 'me'}`, { mode: 'cancel' }) : ctx.upgrade('queue')) }, icon('bolt'), tl('Cancel them one by one'))
              : null,
          ),
          panel({ title: tl('Sent · {v0}', { v0: fmtInt(L.sentRequests.length) }) }, userList({ platform: 'facebook', items: L.sentRequests, ctx, subFor: (i) => (i.ts ? tl('Sent {v0}', { v0: relTime(i.ts) }) : ''), exportName: 'sent-requests', emptyText: tl('No pending requests.') })),
          panel({ title: tl('Received · {v0}', { v0: fmtInt(L.receivedRequests.length) }) }, userList({ platform: 'facebook', items: L.receivedRequests, ctx, exportName: 'received-requests', emptyText: tl('No requests waiting.') })),
          L.removed.length ? panel({ title: tl('Removed by you · {v0}', { v0: fmtInt(L.removed.length) }) }, userList({ platform: 'facebook', items: L.removed, ctx, exportName: 'removed-friends' })) : null,
        ),
    },
  ];
  if (L.friends.length) views.push({ id: 'lookup', label: tl('Look up anyone'), icon: 'search', render: () => lookupView(ds, ctx) });
  if (ds.activity?.messages) views.push({ id: 'messages', label: tl('Message viewer'), icon: 'message', render: () => messagesView(ds, ctx) });
  if (ds.advertisers.length || ds.offFacebook.companies) {
    views.push({
      id: 'privacy',
      label: tl('Privacy X-ray'),
      icon: 'fingerprint',
      render: () =>
        h(
          'div',
          { class: 'app-content' },
          viewHead(tl('Privacy X-ray'), tl('Advertisers holding your data, and companies that send Facebook your activity from elsewhere.')),
          exposurePanel(privacyParts(ds), [{ icon: 'globe', title: tl('Clear off-Facebook activity'), text: tl('Accounts Center → Your information and permissions → Your activity off Meta technologies.') }]),
          h('div', { class: 'stats' }, stat({ label: tl('Advertisers with your data'), value: fmtInt(ds.advertisers.length) }), stat({ label: tl('Companies sharing your activity'), value: fmtInt(ds.offFacebook.companies) }), stat({ label: tl('Off-Facebook events'), value: fmtInt(ds.offFacebook.events) })),
          ds.advertisers.length ? panel({ title: tl('Advertisers') }, tagCloud(ds.advertisers, { locked: !ctx.pro && !ctx.demo, ctx, limit: 120 })) : null,
        ),
    });
    views.push({ id: 'wrapped', label: tl('Wrapped cards'), icon: 'sparkles', render: () => wrappedView(ds, ctx) });
  }
  return views;
}
