// Views shared by every platform with followers/following.

import { h, icon, clear, toast, downloadBlob } from '../lib/ui.js';
import { fmtInt, pct, dateShort, relTime, plural } from '../lib/format.js';
import { relationships, diffSnapshots, exposureScore } from '../core/insights.js';
import { viewHead, stat, panel, insights, userList, emptyState, lockCard, personRow, dataNote, reminderButton } from './components.js';
import { relationshipOrbit } from './orbit.js';
import { barChart, splitBar } from './charts.js';
import { deleteSnapshot, exportSnapshots, importSnapshots } from './snapshots.js';
import { openQueue } from './queue.js';
import { t as tl } from '../lib/i18n.js';

export const C = { mutual: 'var(--c1)', notBack: 'var(--c2)', fan: 'var(--c3)', other: 'var(--c4)' };

const name = (p, i) => (p === 'x' ? i.id : i.u || i.name);

export function relationshipStats(ds, ctx) {
  const rel = relationships(ds);
  return {
    rel,
    tiles: h(
      'div',
      { class: 'stats stats--5' },
      stat({ label: tl('Followers'), value: fmtInt(rel.followers) }),
      stat({ label: tl('Following'), value: fmtInt(rel.following) }),
      stat({ label: tl('Mutuals'), value: fmtInt(rel.mutuals.length), color: C.mutual, sub: tl('{v0} follow back', { v0: pct(rel.followBackRate) }), onClick: () => ctx.go('mutuals') }),
      stat({ label: tl('Not following back'), value: fmtInt(rel.notFollowingBack.length), color: C.notBack, sub: tl('Tap to review'), onClick: () => ctx.go('notBack') }),
      stat({ label: tl('Fans'), value: fmtInt(rel.fans.length), color: C.fan, sub: tl('You don’t follow back'), onClick: () => ctx.go('fans') }),
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
    { title: tl('Your network orbit'), text: tl('Every dot is an account. Hover or tap to see who.') },
    relationshipOrbit(groups),
    h(
      'div',
      { style: { marginTop: '16px' } },
      splitBar([
        { label: tl('Mutuals'), value: rel.mutuals.length, color: C.mutual },
        { label: tl('Not following back'), value: rel.notFollowingBack.length, color: C.notBack },
        { label: tl('Fans'), value: rel.fans.length, color: C.fan },
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
      title: tl('{v0} of the accounts you follow follow you back', { v0: pct(rel.followBackRate) }),
      text: rel.followBackRate > 0.75 ? tl('That’s a strong, reciprocal network.') : tl('A clean-up could make your feed feel more like yours.'),
    },
    staleNotBack && {
      icon: 'clock',
      title: tl('{v0} never followed back in over a year', { v0: plural(staleNotBack, 'account') }),
      text: tl('Prime candidates for the unfollow queue.'),
    },
    recentFollowers && { icon: 'user-plus', title: tl('{v0} in the 30 days before your export', { v0: plural(recentFollowers, 'new follower') }), text: tl('Based on the follow dates inside your export.') },
    oldestMutual && {
      icon: 'heart',
      title: tl('Your oldest mutual: {v0}', { v0: ds.platform === 'x' ? tl('an account') : `@${oldestMutual.u}` }),
      text: tl('Connected since {v0}.', { v0: dateShort(oldestMutual.since) }),
    },
  ]);
}

export function relationshipViews(ds, ctx, { keepKey }) {
  const rel = relationships(ds);
  const sub = (verb) => (i) => (i.ts ? `${verb} ${relTime(i.ts)}` : '');
  const views = [
    {
      id: 'notBack',
      label: tl('Not following back'),
      icon: 'user-minus',
      count: rel.notFollowingBack.length,
      render: () => {
        const queueBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('bolt'), tl('Start unfollow queue'));
        queueBtn.addEventListener('click', () => (ctx.can('queue') ? openQueue(ds, rel.notFollowingBack, ctx, keepKey) : ctx.upgrade('queue')));
        return h(
          'div',
          { class: 'app-content' },
          viewHead(tl('Not following you back'), tl('{v0} accounts you follow don’t follow you. Tap “Keep” on the ones you want to keep (creators, brands, friends).', { v0: fmtInt(rel.notFollowingBack.length) }), queueBtn),
          panel(null, userList({ platform: ds.platform, items: rel.notFollowingBack, ctx, subFor: sub(tl('You followed')), exportName: `${ds.platform}-not-following-back`, keepKey })),
          dataNote(ds),
        );
      },
    },
    {
      id: 'fans',
      label: tl('Fans'),
      icon: 'star',
      count: rel.fans.length,
      render: () =>
        h(
          'div',
          { class: 'app-content' },
          viewHead(tl('Your fans'), tl('{v0} accounts follow you, but you don’t follow them back.', { v0: fmtInt(rel.fans.length) })),
          panel(null, userList({ platform: ds.platform, items: rel.fans, ctx, subFor: sub(tl('Followed you')), exportName: `${ds.platform}-fans` })),
          dataNote(ds),
        ),
    },
    {
      id: 'mutuals',
      label: tl('Mutuals'),
      icon: 'users',
      count: rel.mutuals.length,
      render: () =>
        h(
          'div',
          { class: 'app-content' },
          viewHead(tl('Mutuals'), tl('{v0} accounts follow you and you follow them.', { v0: fmtInt(rel.mutuals.length) })),
          panel(null, userList({ platform: ds.platform, items: rel.mutuals.map((m) => ({ ...m, ts: m.since })), ctx, subFor: (i) => (i.ts ? tl('Mutual since {v0}', { v0: dateShort(i.ts) }) : ''), exportName: `${ds.platform}-mutuals` })),
          dataNote(ds),
        ),
    },
    {
      id: 'unfollowers',
      label: tl('Who unfollowed you'),
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
  const fb = ds.platform === 'facebook';
  const leftLabel = fb ? tl('Unfriended you') : tl('Unfollowed you');
  root.append(viewHead(fb ? tl('Who unfriended you') : tl('Who unfollowed you'), tl('Every export you analyze is saved as a private snapshot in this browser. Comparing snapshots shows exactly who left — no login, no tracking.'), reminderButton(ds), reminderButton(ds, { monthly: true })));

  if (snaps.length < 2) {
    root.append(
      panel(
        { title: tl('Your first snapshot is saved'), text: snaps[0] ? (fb ? tl('Snapshot from {v0} · {v1} friends', { v0: dateShort(snaps[0].takenAt), v1: fmtInt(snaps[0].followers.length) }) : tl('Snapshot from {v0} · {v1} followers', { v0: dateShort(snaps[0].takenAt), v1: fmtInt(snaps[0].followers.length) })) : '' },
        insights([
          { icon: 'upload', title: tl('Have an older export on your computer?'), text: tl('Drop it together with this one (select both files at once) and we’ll show who unfollowed you in between — right away.') },
          { icon: 'calendar', title: tl('Download a fresh export in a week or two'), text: tl('Request the same data again and drop it here — we’ll compare it with this snapshot automatically.') },
          { icon: 'ghost', title: tl('You’ll see who left, by name'), text: tl('Plus new followers, and who you unfollowed in between.') },
          { icon: 'shield', title: tl('Stored only on this device'), text: tl('Snapshots live in your browser’s storage. Clearing site data deletes them.') },
          !ctx.pro && { icon: 'bolt', title: tl('Seeing the names needs Plus'), text: tl('Free shows how many unfollowed you; Plus reveals who.') },
        ]),
      ),
      backupPanel(ctx),
    );
    return root;
  }

  let toIdx = snaps.length - 1;
  let fromIdx = snaps.length - 2;
  const body = h('div', { class: 'panels' });
  const pick = (value, cb) => {
    const sel = h('select', { class: 'select', 'aria-label': tl('Compare snapshots') }, snaps.map((s, i) => h('option', { value: String(i), selected: i === value }, `${dateShort(s.takenAt)} · ${fmtInt(s.followers.length)}`)));
    sel.addEventListener('change', () => cb(Number(sel.value)));
    return sel;
  };
  const controls = h(
    'div',
    { class: 'list-tools' },
    h('span', { class: 'small muted' }, tl('Compare')),
    pick(fromIdx, (v) => {
      fromIdx = v;
      draw();
    }),
    h('span', { class: 'small muted' }, tl('with')),
    pick(toIdx, (v) => {
      toIdx = v;
      draw();
    }),
  );

  function list(keys, snap, title, { stillFollowing = null } = {}) {
    // People who left but you still follow come first, flagged.
    if (stillFollowing) keys = [...keys].sort((a, b) => Number(stillFollowing.has(b)) - Number(stillFollowing.has(a)));
    const items = keys.map((k) => labelFor(ds, snap, k));
    if (!items.length) return panel({ title }, emptyState(tl('Nobody in this period.'), 'check'));
    const back = stillFollowing ? keys.filter((k) => stillFollowing.has(k)).length : 0;
    if (!ctx.pro) {
      return panel(
        { title: `${title} · ${fmtInt(items.length)}`, text: back ? tl('You still follow {v0} of them — Plus shows who.', { v0: fmtInt(back) }) : '' },
        h(
          'div',
          { class: 'locked', style: { minHeight: '260px' } },
          h('div', { class: 'locked-rows' }, items.slice(0, 5).map((i) => personRow(ds.platform, { ...i, u: i.u && 'hidden.account', name: i.name && tl('Hidden name'), id: i.id && '•••' }, { sub: tl('Locked') }))),
          lockCard({ count: items.length, what: tl('names'), title: tl('See all {v0} names', { v0: fmtInt(items.length) }), text: tl('Plus shows exactly who it was — and keeps your full unfollower history.'), onUpgrade: () => ctx.upgrade('unfollowers'), trial: ctx.trial }),
        ),
      );
    }
    return panel(
      { title: `${title} · ${fmtInt(items.length)}`, text: back ? tl('{v0} of them you still follow — they’re listed first.', { v0: fmtInt(back) }) : '' },
      h('div', { class: 'rows' }, items.map((i, n) => personRow(ds.platform, i, { sub: stillFollowing?.has(keys[n]) ? tl('You still follow them') : '' }))),
    );
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
        stat({ label: leftLabel, value: fmtInt(diff.unfollowedYou.length), color: C.notBack, sub: `${dateShort(from.takenAt)} → ${dateShort(to.takenAt)}` }),
        stat({ label: tl('New followers'), value: fmtInt(diff.newFollowers.length), color: C.fan }),
        ds.platform !== 'facebook' ? stat({ label: tl('You unfollowed'), value: fmtInt(diff.youUnfollowed.length) }) : null,
        ds.platform !== 'facebook' ? stat({ label: tl('You followed'), value: fmtInt(diff.youFollowed.length) }) : null,
      ),
      list(diff.unfollowedYou, from, leftLabel, { stillFollowing: ds.platform === 'facebook' ? null : new Set(to.following) }),
      h('div', { class: 'panels panels--2' }, list(diff.newFollowers, to, tl('New followers')), ds.platform !== 'facebook' ? list(diff.youUnfollowed, from, tl('You unfollowed')) : null),
      h('p', { class: 'tiny muted' }, tl('Accounts that were deactivated or deleted also disappear from follower lists.')),
    );
  }

  const timeline = panel(
    { title: tl('Followers over time'), text: tl('{v0} snapshots saved on this device', { v0: snaps.length }) },
    barChart(
      snaps.map((s) => ({ label: dateShort(s.takenAt), short: dateShort(s.takenAt).replace(/, \d{4}$/, ''), value: s.followers.length })),
      { title: tl('Followers'), ariaLabel: tl('Followers per snapshot'), height: 200 },
    ),
  );
  const manage = panel(
    { title: tl('Manage snapshots') },
    h(
      'div',
      { class: 'rows' },
      snaps.map((s) => {
        const del = h('button', { class: 'row-btn', type: 'button' }, icon('trash'), tl('Delete'));
        del.addEventListener('click', async () => {
          if (!s.id) return;
          await deleteSnapshot(s.id);
          ctx.reloadSnapshots();
        });
        return h('div', { class: 'row' }, h('div', { class: 'who' }, h('b', null, dateShort(s.takenAt)), h('span', null, tl('{v0} followers · {v1} following', { v0: fmtInt(s.followers.length), v1: fmtInt(s.following.length) }))), s.id ? h('div', { class: 'acts' }, del) : h('span', { class: 'badge badge--uv' }, 'demo'));
      }),
    ),
  );
  root.append(controls, body, timeline, manage, backupPanel(ctx));
  draw();
  return root;
}

// Snapshots live only in this browser; a backup file protects the history
// against cleared site data and lets it move to another device.
function backupPanel(ctx) {
  const save = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('download'), tl('Download backup'));
  const input = h('input', { type: 'file', accept: '.json,application/json', class: 'drop-file', tabindex: '-1', 'aria-hidden': 'true' });
  const restore = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('upload'), tl('Restore backup'));
  save.addEventListener('click', async () => {
    const backup = await exportSnapshots();
    if (!backup.snapshots.length) return toast(tl('No snapshots to back up yet.'), { iconName: 'info' });
    downloadBlob(new Blob([JSON.stringify(backup)], { type: 'application/json' }), `unwrapped-history-${new Date().toISOString().slice(0, 10)}.json`);
    toast(tl('Backup saved — keep the file somewhere safe'));
  });
  restore.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const added = await importSnapshots(JSON.parse(await file.text()));
      toast(tl('{v0} snapshots restored', { v0: fmtInt(added) }));
      ctx.reloadSnapshots();
    } catch {
      toast(tl('That file is not an Unwrapped backup.'), { iconName: 'close' });
    }
  });
  return panel(
    { title: tl('Back up your history'), text: tl('Your snapshots exist only in this browser. Save a backup file to keep your unfollower history safe if you clear your browser data — or to move it to another device.') },
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, save, restore, input),
  );
}

export function exposurePanel(parts, tips) {
  const ex = exposureScore(parts);
  const R = 70;
  const circ = 2 * Math.PI * R;
  const color = ex.score > 60 ? 'var(--critical)' : ex.score > 30 ? 'var(--warning)' : 'var(--good)';
  const label = ex.score > 60 ? tl('High exposure') : ex.score > 30 ? tl('Moderate exposure') : tl('Low exposure');
  const ring = h('div', { class: 'score-ring' });
  ring.innerHTML = `<svg viewBox="0 0 168 168" aria-hidden="true"><circle cx="84" cy="84" r="${R}" fill="none" stroke="#1e1e2a" stroke-width="12"/><circle cx="84" cy="84" r="${R}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(ex.score / 100) * circ} ${circ}"/></svg>`;
  ring.append(h('div', { class: 'center' }, h('div', null, h('b', null, String(ex.score)), h('span', { style: { display: 'block' } }, tl('out of 100')))));
  return panel(
    { title: tl('Exposure score'), text: tl('How much of you is out there — computed only from facts inside your export.') },
    h(
      'div',
      { style: { display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' } },
      ring,
      h(
        'div',
        { style: { flex: '1', minWidth: '220px', display: 'grid', gap: '12px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } }, h('span', { class: 'grade', style: { background: 'var(--surface-3)', color: 'var(--text)' } }, ex.grade), h('div', null, h('b', null, label), h('div', { class: 'small muted' }, tl('Grade A = hard to profile · F = an open book')))),
        h('div', { class: 'rank' }, ex.factors.map((f) => h('div', { class: 'rank-row', style: { gridTemplateColumns: 'minmax(0,1fr) auto' } }, h('div', { class: 'lbl' }, h('b', null, tl(f.label)), h('div', { class: 'track' }, h('i', { style: { width: `${(f.points / 35) * 100}%`, background: 'var(--c1)' } }))), h('span', { class: 'v' }, fmtInt(f.value))))),
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
      ? h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => ctx.upgrade('privacy') }, icon('lock'), tl('See all {v0} with Plus', { v0: fmtInt(items.length) })))
      : items.length > limit
        ? h('p', { class: 'tiny muted', style: { marginTop: '10px' } }, tl('+ {v0} more', { v0: fmtInt(items.length - limit) }))
        : null,
  );
}
