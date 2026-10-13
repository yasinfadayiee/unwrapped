import { h, icon, avatarStyle } from '../lib/ui.js';
import { fmtInt, dateShort, compact, hourLabel, monthLabel, relTime, yearsSince, pct } from '../lib/format.js';
import { viewHead, stat, panel, insights, userList, emptyState, dataNote } from './components.js';
import { relationshipStats, networkPanel, relationshipInsights, relationshipViews, exposurePanel, tagCloud, C } from './views-common.js';
import { barChart, rankList, splitBar } from './charts.js';
import { wrappedView } from './views-wrapped.js';
import { privacyParts } from './wrapped.js';
import { friendsView } from './views-friends.js';
import { messagesView } from './views-messages.js';
import { archiveView } from './views-archive.js';
import { likesView } from './views-finders.js';
import { lookupView } from './views-lookup.js';
import { buildPeopleIndex, engagementScore, relationOf } from '../core/people.js';
import { actionPlan } from './action-plan.js';
import { t as tl } from '../lib/i18n.js';

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
    viewHead(handle, `${tl('{v0} export from {v1}', { v0: ds.label, v1: dateShort(ds.exportedAt) })}${a.createdAt ? ` · ${tl('account {v0} years old', { v0: yearsSince(a.createdAt).toFixed(1) })}` : ''}`),
    tiles,
    actionPlan(ds, ctx),
    h('div', { class: 'panels panels--3-2' }, networkPanel(ds, rel), panel({ title: tl('What stands out') }, relationshipInsights(ds, rel))),
    months.length > 2
      ? panel({ title: tl('New followers by month'), text: tl('When the people who follow you today first followed you') }, barChart(months, { title: tl('New followers'), ariaLabel: tl('New followers by month') }))
      : null,
    dataNote(ds),
  );
}

function requestsView(ds, ctx) {
  const L = ds.lists;
  return h(
    'div',
    { class: 'app-content' },
    viewHead(tl('Follow requests'), tl('Requests you sent that are still waiting, and requests you received.')),
    h(
      'div',
      { class: 'stats' },
      stat({ label: tl('Pending — sent by you'), value: fmtInt(L.pendingSent.length) }),
      stat({ label: tl('Received'), value: fmtInt(L.requestsReceived.length) }),
      stat({ label: tl('Recent requests'), value: fmtInt(L.recentRequests.length) }),
    ),
    panel(
      { title: tl('Pending requests you sent'), text: tl('Private accounts that never accepted. Open one to cancel the request.') },
      userList({ platform: ds.platform, items: L.pendingSent, ctx, subFor: (i) => (i.ts ? tl('Requested {v0}', { v0: relTime(i.ts) }) : ''), exportName: 'pending-requests', emptyText: tl('No pending requests.') }),
    ),
    panel({ title: tl('Requests you received') }, userList({ platform: ds.platform, items: L.requestsReceived, ctx, exportName: 'received-requests', emptyText: tl('No requests waiting.') })),
  );
}

// Close Friends check: who is on the list but quiet, and who you are closest
// to but left off — from likes, comments, story likes and chats.
function closeFriendsCheck(ds, ctx) {
  const L = ds.lists;
  if (!L.closeFriends?.length || !ds.activity) return null;
  const people = buildPeopleIndex(ds, []);
  const closeness = (p) => engagementScore(p) + (p.thread ? p.thread.count / 10 : 0);
  const onList = new Set(L.closeFriends.map((i) => i.u.toLowerCase()));
  const quiet = [...onList].map((k) => people.get(k)).filter((p) => p && closeness(p) === 0);
  const missing = [...people.values()].filter((p) => !onList.has(p.key) && relationOf(p) === 'mutual' && closeness(p) > 0).sort((a, b) => closeness(b) - closeness(a)).slice(0, 12);
  if (!quiet.length && !missing.length) return null;
  const FREE = 6;
  const column = (title, text, list, sub) =>
    h(
      'div',
      { class: 'cf-col' },
      h('h4', null, `${title} · ${fmtInt(list.length)}`),
      h('p', { class: 'tiny muted' }, text),
      list.length
        ? h(
            'div',
            { class: 'lk-chips' },
            list.slice(0, ctx.pro ? 12 : FREE).map((p) => {
              const b = h('button', { class: 'lk-chip', type: 'button' }, h('span', { class: 'lk-mini', style: avatarStyle(p.key) }, (p.name[0] || '?').toUpperCase()), p.name, sub ? h('em', null, sub(p)) : null);
              b.addEventListener('click', () => {
                ctx.pendingLookup = p.key;
                ctx.go('lookup');
              });
              return b;
            }),
            !ctx.pro && list.length > FREE ? h('button', { class: 'lk-chip', type: 'button', onClick: () => ctx.upgrade('lists') }, icon('lock'), tl('{v0} more with Plus', { v0: fmtInt(list.length - FREE) })) : null,
          )
        : h('p', { class: 'small text-2' }, tl('Nobody here — nice.')),
    );
  return panel(
    { title: tl('Close Friends check'), text: tl('Who is on your list but quiet, and who you’re closest to but left off — from likes, comments and chats.') },
    h(
      'div',
      { class: 'cf-grid' },
      column(tl('On your list, but you never interact'), tl('Maybe they don’t need to see your close-friends stories.'), quiet),
      column(tl('You interact a lot — not on your list'), tl('Mutuals you like, comment on and message most.'), missing, (p) => fmtInt(Math.round(closeness(p)))),
    ),
  );
}

function listsView(ds, ctx) {
  const L = ds.lists;
  const sections = [
    ['closeFriends', tl('Close friends'), tl('People on your Close Friends list.')],
    ['youUnfollowed', tl('Recently unfollowed by you'), tl('Accounts you unfollowed recently.')],
    ['blocked', tl('Blocked'), tl('Accounts you blocked.')],
    ['restricted', tl('Restricted'), tl('Accounts you restricted.')],
    ['hideStoryFrom', tl('Story hidden from'), tl('People who can’t see your stories.')],
    ['favorites', tl('Favorites'), tl('Accounts you marked as favorites.')],
    ['removedSuggestions', tl('Removed suggestions'), tl('Suggested accounts you dismissed.')],
  ].filter(([key]) => L[key]?.length);
  return h(
    'div',
    { class: 'app-content' },
    viewHead(tl('Close friends & more'), tl('Every other list inside your export.')),
    closeFriendsCheck(ds, ctx),
    sections.length
      ? sections.map(([key, title, text]) => panel({ title: `${title} · ${fmtInt(L[key].length)}`, text }, userList({ platform: ds.platform, items: L[key], ctx, exportName: key })))
      : panel(null, emptyState(tl('Your export doesn’t include these lists.'), 'inbox')),
  );
}

function activityView(ds, ctx) {
  const act = ds.activity;
  const root = h('div', { class: 'app-content' }, viewHead(tl('Your activity'), tl('Likes, comments and messages — what you actually do on Instagram.')));
  const tiles = h(
    'div',
    { class: 'stats' },
    act.likes && stat({ label: tl('Posts liked'), value: compact(act.likes.total) }),
    act.comments && stat({ label: tl('Comments'), value: compact(act.comments.total) }),
    act.messages && stat({ label: tl('Messages'), value: compact(act.messages.total), sub: tl('{v0} conversations', { v0: fmtInt(act.messages.threadCount) }) }),
    act.storyLikes && stat({ label: tl('Story likes'), value: compact(act.storyLikes.total) }),
    act.saved && stat({ label: tl('Saved posts'), value: compact(act.saved.total) }),
  );
  root.append(tiles);
  if (act.likes) {
    const months = act.likes.byMonth.slice(-24).map((m) => ({ label: monthLabel(m.month), short: monthLabel(m.month, true), value: m.count }));
    root.append(
      h(
        'div',
        { class: 'panels panels--3-2' },
        panel({ title: tl('Likes by month') }, barChart(months, { title: tl('Likes'), ariaLabel: tl('Likes by month') })),
        panel({ title: tl('Accounts you like the most'), text: tl('Ranked by how many of their posts you liked') }, ctx.pro ? rankList(act.likes.top, { limit: 15 }) : h('div', null, rankList(act.likes.top, { limit: 5 }), lockedMore(ctx, act.likes.top.length - 5))),
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
          { title: tl('Your DM besties'), text: tl('Conversations with the most messages') },
          ctx.pro || ctx.demo ? rankList(msg.threads.map((t) => ({ key: t.title, count: t.count })), { limit: 10 }) : h('div', null, rankList(msg.threads.map((t) => ({ key: t.title, count: t.count })), { limit: 3 }), lockedMore(ctx, msg.threads.length - 3)),
        ),
        panel(
          { title: tl('Sent vs received') },
          splitBar([
            { label: tl('Sent by you'), value: msg.sent, color: C.mutual },
            { label: tl('Received'), value: msg.received, color: C.fan },
          ]),
          h('div', { style: { marginTop: '20px' } }, barChart(hours, { title: tl('Messages'), ariaLabel: tl('Messages by hour of day'), height: 180 })),
        ),
      ),
    );
  }
  if (act.comments?.top?.length) {
    root.append(panel({ title: tl('Who you comment on most') }, rankList(act.comments.top, { limit: ctx.pro ? 10 : 5, color: 'var(--c3)' })));
  }
  return root;
}

function lockedMore(ctx, n) {
  if (n <= 0) return null;
  return h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => ctx.upgrade('activity') }, icon('lock'), tl('{v0} more with Plus', { v0: fmtInt(n) })));
}

function privacyView(ds, ctx) {
  const p = ds.privacy || {};
  const parts = privacyParts(ds);
  const root = h('div', { class: 'app-content' }, viewHead(tl('Privacy X-ray'), tl('What Instagram and its advertisers have on you — straight from your own export.')));
  root.append(
    exposurePanel(parts, [
      p.advertisers?.length && { icon: 'megaphone', title: tl('Hide ads from specific advertisers'), text: tl('Accounts Center → Ad preferences → Advertisers you’ve seen.') },
      p.logins && { icon: 'device', title: tl('Log out devices you don’t recognize'), text: tl('Accounts Center → Password and security → Where you’re logged in.') },
      { icon: 'shield', title: tl('Turn on two-factor authentication'), text: tl('Accounts Center → Password and security → Two-factor authentication.') },
    ]),
  );
  const tiles = h(
    'div',
    { class: 'stats' },
    p.advertisers && stat({ label: tl('Advertisers with your data'), value: fmtInt(p.advertisers.length), sub: tl('{v0} uploaded a list with you', { v0: fmtInt(p.advertisers.filter((a) => a.dataFile).length) }) }),
    p.topics && stat({ label: tl('Topics assigned to you'), value: fmtInt(p.topics.length) }),
    p.adsViewed !== undefined && stat({ label: tl('Ads you’ve seen'), value: compact(p.adsViewed) }),
    p.logins && stat({ label: tl('Logins recorded'), value: fmtInt(p.logins.count), sub: tl('{v0} IP addresses', { v0: fmtInt(p.logins.ips) }) }),
  );
  root.append(tiles);
  if (p.advertisers?.length) {
    const items = p.advertisers.map((a) => ({ name: a.name, ts: 0, tags: [a.dataFile && tl('Uploaded your info'), a.remarketing && tl('Retargets you'), a.inStore && tl('Store visit')].filter(Boolean) }));
    const shown = ctx.pro || ctx.demo ? items : items.slice(0, 12);
    root.append(
      panel(
        { title: tl('Advertisers using your activity or information · {v0}', { v0: fmtInt(items.length) }), text: tl('“Uploaded your info” means the company uploaded a customer list that matched you.') },
        h(
          'div',
          { class: 'rows' },
          shown.slice(0, 200).map((a) => h('div', { class: 'row' }, h('div', { class: 'who' }, h('b', null, a.name), h('span', null, a.tags.join(' · ') || tl('Interacted with your activity'))))),
        ),
        !ctx.pro && !ctx.demo && items.length > 12 ? lockedMore(ctx, items.length - 12) : null,
      ),
    );
  }
  if (p.topics?.length || p.interests?.length) {
    root.append(panel({ title: tl('What Instagram thinks you’re into') }, tagCloud([...(p.topics || []), ...(p.interests || [])], { locked: !ctx.pro && !ctx.demo, ctx })));
  }
  if (p.logins) {
    root.append(
      panel(
        { title: tl('Devices that logged in'), text: tl('{v0} logins between {v1} and {v2}', { v0: fmtInt(p.logins.count), v1: dateShort(p.logins.first), v2: dateShort(p.logins.last) }) },
        rankList(p.logins.devices.map((d) => ({ key: d.name, count: d.count })), { limit: 10, color: 'var(--c3)' }),
      ),
    );
  }
  if (p.searches?.length) {
    root.append(panel({ title: tl('Your searches · {v0}', { v0: fmtInt(p.searches.length) }) }, tagCloud(p.searches.map((s) => s.term), { locked: !ctx.pro && !ctx.demo, ctx, limit: 80 })));
  }
  return root;
}

export function instagramViews(ds, ctx) {
  const keepKey = `${ds.platform}:${ds.account?.username || 'me'}`;
  const views = [{ id: 'overview', label: tl('Overview'), icon: 'home', render: () => overview(ds, ctx) }];
  if (ds.hasRelationships) views.push(...relationshipViews(ds, ctx, { keepKey }));
  if (ds.hasRelationships) views.push({ id: 'lookup', label: tl('Look up anyone'), icon: 'search', render: () => lookupView(ds, ctx) });
  if (ds.platform === 'instagram') {
    const L = ds.lists;
    if (L.pendingSent.length || L.requestsReceived.length || L.recentRequests.length) views.push({ id: 'requests', label: tl('Follow requests'), icon: 'inbox', count: L.pendingSent.length, render: () => requestsView(ds, ctx) });
    if (['closeFriends', 'blocked', 'restricted', 'hideStoryFrom', 'youUnfollowed', 'favorites', 'removedSuggestions'].some((k) => L[k]?.length)) views.push({ id: 'lists', label: tl('Close friends & more'), icon: 'list', render: () => listsView(ds, ctx) });
    if (ds.activity?.messages) views.push({ id: 'friends', label: tl('Friendship Radar'), icon: 'orbit', group: 'lab', feature: 'friends', render: () => friendsView(ds, ctx) });
    if (ds.media?.length) views.push({ id: 'archive', label: tl('Your posts & stories'), icon: 'image', count: ds.media.length, render: () => archiveView(ds, ctx) });
    if (ds.activity?.items && Object.values(ds.activity.items).some((l) => l.length)) views.push({ id: 'finder', label: tl('Likes & comments finder'), icon: 'search', render: () => likesView(ds, ctx) });
    if (ds.activity?.messages) views.push({ id: 'messages', label: tl('Message viewer'), icon: 'message', render: () => messagesView(ds, ctx) });
    if (ds.activity) views.push({ id: 'activity', label: tl('Activity'), icon: 'heart', render: () => activityView(ds, ctx) });
    if (ds.privacy) views.push({ id: 'privacy', label: tl('Privacy X-ray'), icon: 'fingerprint', render: () => privacyView(ds, ctx) });
  }
  views.push({ id: 'wrapped', label: tl('Wrapped cards'), icon: 'sparkles', render: () => wrappedView(ds, ctx) });
  return views;
}
