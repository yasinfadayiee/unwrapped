// Views shared by every platform with followers/following.

import { h, icon, clear } from '../lib/ui.js';
import { fmtInt, pct, dateShort, relTime, plural } from '../lib/format.js';
import { relationships, diffSnapshots, exposureScore } from '../core/insights.js';
import { viewHead, stat, panel, insights, userList, emptyState, lockCard, personRow, dataNote, reminderButton } from './components.js';
import { relationshipOrbit } from './orbit.js';
import { barChart, splitBar } from './charts.js';
import { deleteSnapshot } from './snapshots.js';
import { openQueue } from './queue.js';

export const C = { mutual: 'var(--c1)', notBack: 'var(--c2)', fan: 'var(--c3)', other: 'var(--c4)' };

const name = (p, i) => (p === 'x' ? i.id : i.u || i.name);

export function relationshipStats(ds, ctx) {
  const rel = relationships(ds);
  return {
    rel,
    tiles: h(
      'div',
      { class: 'stats stats--5' },
      stat({ label: 'Followers', value: fmtInt(rel.followers) }),
      stat({ label: 'Following', value: fmtInt(rel.following) }),
      stat({ label: 'Mutuals', value: fmtInt(rel.mutuals.length), color: C.mutual, sub: `${pct(rel.followBackRate)} follow back`, onClick: () => ctx.go('mutuals') }),
      stat({ label: 'Not following back', value: fmtInt(rel.notFollowingBack.length), color: C.notBack, sub: 'Tap to review', onClick: () => ctx.go('notBack') }),
      stat({ label: 'Fans', value: fmtInt(rel.fans.length), color: C.fan, sub: 'You don’t follow back', onClick: () => ctx.go('fans') }),
    ),
  };
}

export function networkPanel(ds, rel) {
  const groups = {
    mutual: rel.mutuals.map((i) => name(ds.platform, i)),
    fan: rel.fans.map((i) => name(ds.platform, i)),
    notBack: rel.notFollowingBack.map((i) => name(ds.platform, i)),
  };
  return panel(
    { title: 'Your network orbit', text: 'Every dot is an account. Hover to see who.' },
    relationshipOrbit(groups),
    h(
      'div',
      { style: { marginTop: '16px' } },
      splitBar([
        { label: 'Mutuals', value: rel.mutuals.length, color: C.mutual },
        { label: 'Not following back', value: rel.notFollowingBack.length, color: C.notBack },
        { label: 'Fans', value: rel.fans.length, color: C.fan },
      ]),
    ),
  );
}

export function relationshipInsights(ds, rel) {
  const oldestMutual = [...rel.mutuals].filter((m) => m.since).sort((a, b) => a.since - b.since)[0];
  const recentFollowers = (ds.lists.followers || []).filter((f) => f.ts && f.ts > (ds.exportedAt || Date.now()) - 30 * 864e5).length;
  const staleNotBack = rel.notFollowingBack.filter((f) => f.ts && f.ts < Date.now() - 365 * 864e5).length;
  return insights([
    rel.following && {
      icon: 'users',
      title: `${pct(rel.followBackRate)} of the accounts you follow follow you back`,
      text: rel.followBackRate > 0.75 ? 'That’s a strong, reciprocal network.' : 'A clean-up could make your feed feel more like yours.',
    },
    staleNotBack && {
      icon: 'clock',
      title: `${plural(staleNotBack, 'account')} never followed back in over a year`,
      text: 'Prime candidates for the unfollow queue.',
    },
    recentFollowers && { icon: 'user-plus', title: `${plural(recentFollowers, 'new follower')} in the 30 days before your export`, text: 'Based on the follow dates inside your export.' },
    oldestMutual && {
      icon: 'heart',
      title: `Your oldest mutual: ${ds.platform === 'x' ? 'an account' : `@${oldestMutual.u}`}`,
      text: `Connected since ${dateShort(oldestMutual.since)}.`,
    },
  ]);
}

export function relationshipViews(ds, ctx, { keepKey }) {
  const rel = relationships(ds);
  const sub = (verb) => (i) => (i.ts ? `${verb} ${relTime(i.ts)}` : '');
  const views = [
    {
      id: 'notBack',
      label: 'Not following back',
      icon: 'user-minus',
      count: rel.notFollowingBack.length,
      render: () => {
        const queueBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('bolt'), 'Start unfollow queue');
        queueBtn.addEventListener('click', () => (ctx.can('queue') ? openQueue(ds, rel.notFollowingBack, ctx, keepKey) : ctx.upgrade('queue')));
        return h(
          'div',
          { class: 'app-content' },
          viewHead('Not following you back', `${fmtInt(rel.notFollowingBack.length)} accounts you follow don’t follow you. Tap “Keep” on the ones you want to keep (creators, brands, friends).`, queueBtn),
          panel(null, userList({ platform: ds.platform, items: rel.notFollowingBack, ctx, subFor: sub('You followed'), exportName: `${ds.platform}-not-following-back`, keepKey })),
          dataNote(ds),
        );
      },
    },
    {
      id: 'fans',
      label: 'Fans',
      icon: 'star',
      count: rel.fans.length,
      render: () =>
        h(
          'div',
          { class: 'app-content' },
          viewHead('Your fans', `${fmtInt(rel.fans.length)} accounts follow you, but you don’t follow them back.`),
          panel(null, userList({ platform: ds.platform, items: rel.fans, ctx, subFor: sub('Followed you'), exportName: `${ds.platform}-fans` })),
          dataNote(ds),
        ),
    },
    {
      id: 'mutuals',
      label: 'Mutuals',
      icon: 'users',
      count: rel.mutuals.length,
      render: () =>
        h(
          'div',
          { class: 'app-content' },
          viewHead('Mutuals', `${fmtInt(rel.mutuals.length)} accounts follow you and you follow them.`),
          panel(null, userList({ platform: ds.platform, items: rel.mutuals.map((m) => ({ ...m, ts: m.since })), ctx, subFor: (i) => (i.ts ? `Mutual since ${dateShort(i.ts)}` : ''), exportName: `${ds.platform}-mutuals` })),
          dataNote(ds),
        ),
    },
    {
      id: 'unfollowers',
      label: 'Who unfollowed you',
      icon: 'ghost',
      pro: true,
      render: () => unfollowersView(ds, ctx),
    },
  ];
  return views;
}

function labelFor(ds, snap, key) {
  const label = snap.labels?.[key] || key;
  if (ds.platform === 'x') return { id: label };
  if (ds.platform === 'facebook') return { name: label };
  return { u: label };
}

export function unfollowersView(ds, ctx) {
  const root = h('div', { class: 'app-content' });
  const snaps = ctx.snapshots || [];
  const word = ds.platform === 'facebook' ? 'unfriended' : 'unfollowed';
  root.append(viewHead(`Who ${word} you`, `Every export you analyze is saved as a private snapshot in this browser. Comparing snapshots shows exactly who left — no login, no tracking.`, reminderButton(ds)));

  if (snaps.length < 2) {
    root.append(
      panel(
        { title: 'Your first snapshot is saved', text: snaps[0] ? `Snapshot from ${dateShort(snaps[0].takenAt)} · ${fmtInt(snaps[0].followers.length)} ${ds.platform === 'facebook' ? 'friends' : 'followers'}` : '' },
        insights([
          { icon: 'calendar', title: 'Download a fresh export in a week or two', text: 'Request the same data again and drop it here — we’ll compare it with this snapshot automatically.' },
          { icon: 'ghost', title: 'You’ll see who left, by name', text: 'Plus new followers, and who you unfollowed in between.' },
          { icon: 'shield', title: 'Stored only on this device', text: 'Snapshots live in your browser’s storage. Clearing site data deletes them.' },
          !ctx.pro && { icon: 'bolt', title: 'Seeing the names needs Plus', text: 'Free shows how many unfollowed you; Plus reveals who.' },
        ]),
      ),
    );
    return root;
  }

  let toIdx = snaps.length - 1;
  let fromIdx = snaps.length - 2;
  const body = h('div', { class: 'panels' });
  const pick = (value, cb) => {
    const sel = h('select', { class: 'select', 'aria-label': 'Compare snapshots' }, snaps.map((s, i) => h('option', { value: String(i), selected: i === value }, `${dateShort(s.takenAt)} · ${fmtInt(s.followers.length)}`)));
    sel.addEventListener('change', () => cb(Number(sel.value)));
    return sel;
  };
  const controls = h(
    'div',
    { class: 'list-tools' },
    h('span', { class: 'small muted' }, 'Compare'),
    pick(fromIdx, (v) => {
      fromIdx = v;
      draw();
    }),
    h('span', { class: 'small muted' }, 'with'),
    pick(toIdx, (v) => {
      toIdx = v;
      draw();
    }),
  );

  function list(keys, snap, title, verb) {
    const items = keys.map((k) => labelFor(ds, snap, k));
    if (!items.length) return panel({ title }, emptyState(`Nobody ${verb} in this period.`, 'check'));
    if (!ctx.pro) {
      return panel(
        { title: `${title} · ${fmtInt(items.length)}` },
        h(
          'div',
          { class: 'locked', style: { minHeight: '260px' } },
          h('div', { class: 'locked-rows' }, items.slice(0, 5).map((i) => personRow(ds.platform, { ...i, u: i.u && 'hidden.account', name: i.name && 'Hidden name', id: i.id && '•••' }, { sub: 'Locked' }))),
          lockCard({ count: items.length, what: 'names', title: `See all ${fmtInt(items.length)} names`, text: 'Plus shows exactly who it was — and keeps your full unfollower history.', onUpgrade: () => ctx.upgrade('unfollowers') }),
        ),
      );
    }
    return panel({ title: `${title} · ${fmtInt(items.length)}` }, h('div', { class: 'rows' }, items.map((i) => personRow(ds.platform, i))));
  }

  function draw() {
    clear(body);
    const from = snaps[Math.min(fromIdx, toIdx)];
    const to = snaps[Math.max(fromIdx, toIdx)];
    const diff = diffSnapshots(from, to);
    if (ds.platform === 'facebook') {
      const removed = new Set(to.removed || []);
      diff.unfollowedYou = diff.unfollowedYou.filter((k) => !removed.has(k));
    }
    body.append(
      h(
        'div',
        { class: 'stats' },
        stat({ label: `${word[0].toUpperCase()}${word.slice(1)} you`, value: fmtInt(diff.unfollowedYou.length), color: C.notBack, sub: `${dateShort(from.takenAt)} → ${dateShort(to.takenAt)}` }),
        stat({ label: 'New followers', value: fmtInt(diff.newFollowers.length), color: C.fan }),
        ds.platform !== 'facebook' ? stat({ label: 'You unfollowed', value: fmtInt(diff.youUnfollowed.length) }) : null,
        ds.platform !== 'facebook' ? stat({ label: 'You followed', value: fmtInt(diff.youFollowed.length) }) : null,
      ),
      list(diff.unfollowedYou, from, `${word[0].toUpperCase()}${word.slice(1)} you`, word + ' you'),
      h('div', { class: 'panels panels--2' }, list(diff.newFollowers, to, 'New followers', 'followed you'), ds.platform !== 'facebook' ? list(diff.youUnfollowed, from, 'You unfollowed', 'was unfollowed') : null),
      h('p', { class: 'tiny muted' }, 'Accounts that were deactivated or deleted also disappear from follower lists.'),
    );
  }

  const timeline = panel(
    { title: 'Followers over time', text: `${snaps.length} snapshots saved on this device` },
    barChart(
      snaps.map((s) => ({ label: dateShort(s.takenAt), short: dateShort(s.takenAt).replace(/, \d{4}$/, ''), value: s.followers.length })),
      { title: 'Followers', ariaLabel: 'Followers per snapshot', height: 200 },
    ),
  );
  const manage = panel(
    { title: 'Manage snapshots' },
    h(
      'div',
      { class: 'rows' },
      snaps.map((s) => {
        const del = h('button', { class: 'row-btn', type: 'button' }, icon('trash'), 'Delete');
        del.addEventListener('click', async () => {
          if (!s.id) return;
          await deleteSnapshot(s.id);
          ctx.reloadSnapshots();
        });
        return h('div', { class: 'row' }, h('div', { class: 'who' }, h('b', null, dateShort(s.takenAt)), h('span', null, `${fmtInt(s.followers.length)} followers · ${fmtInt(s.following.length)} following`)), s.id ? h('div', { class: 'acts' }, del) : h('span', { class: 'badge badge--uv' }, 'demo'));
      }),
    ),
  );
  root.append(controls, body, timeline, manage);
  draw();
  return root;
}

export function exposurePanel(parts, tips) {
  const ex = exposureScore(parts);
  const R = 70;
  const circ = 2 * Math.PI * R;
  const color = ex.score > 60 ? 'var(--critical)' : ex.score > 30 ? 'var(--warning)' : 'var(--good)';
  const label = ex.score > 60 ? 'High exposure' : ex.score > 30 ? 'Moderate exposure' : 'Low exposure';
  const ring = h('div', { class: 'score-ring' });
  ring.innerHTML = `<svg viewBox="0 0 168 168" aria-hidden="true"><circle cx="84" cy="84" r="${R}" fill="none" stroke="#1e1e2a" stroke-width="12"/><circle cx="84" cy="84" r="${R}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(ex.score / 100) * circ} ${circ}"/></svg>`;
  ring.append(h('div', { class: 'center' }, h('div', null, h('b', null, String(ex.score)), h('span', { style: { display: 'block' } }, 'out of 100'))));
  return panel(
    { title: 'Exposure score', text: 'How much of you is out there — computed only from facts inside your export.' },
    h(
      'div',
      { style: { display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' } },
      ring,
      h(
        'div',
        { style: { flex: '1', minWidth: '220px', display: 'grid', gap: '12px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } }, h('span', { class: 'grade', style: { background: 'var(--surface-3)', color: 'var(--text)' } }, ex.grade), h('div', null, h('b', null, label), h('div', { class: 'small muted' }, 'Grade A = hard to profile · F = an open book'))),
        h('div', { class: 'rank' }, ex.factors.map((f) => h('div', { class: 'rank-row', style: { gridTemplateColumns: 'minmax(0,1fr) auto' } }, h('div', { class: 'lbl' }, h('b', null, f.label), h('div', { class: 'track' }, h('i', { style: { width: `${(f.points / 35) * 100}%`, background: 'var(--c1)' } }))), h('span', { class: 'v' }, fmtInt(f.value))))),
      ),
    ),
    tips?.length ? h('div', { style: { marginTop: '18px' } }, insights(tips)) : null,
  );
}

export function tagCloud(items, { limit = 60, locked = false, ctx } = {}) {
  const shown = locked ? items.slice(0, 12) : items.slice(0, limit);
  return h(
    'div',
    null,
    h('div', { class: 'tags' }, shown.map((t) => h('span', { class: 'tag' }, t))),
    locked && items.length > 12
      ? h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => ctx.upgrade('privacy') }, icon('lock'), `See all ${fmtInt(items.length)} with Plus`))
      : items.length > limit
        ? h('p', { class: 'tiny muted', style: { marginTop: '10px' } }, `+ ${fmtInt(items.length - limit)} more`)
        : null,
  );
}
