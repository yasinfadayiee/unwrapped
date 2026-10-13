// "Your action plan": the few things worth doing after an analysis, ranked,
// with a tick-off list remembered on this device.

import { h, icon, clear, append } from '../lib/ui.js';
import { fmtInt, dateShort, plural } from '../lib/format.js';
import { relationships, diffSnapshots, watchStats } from '../core/insights.js';
import { flaggedCount } from '../core/cleanup.js';
import { panel, reminderButton } from './components.js';
import { t as tl } from '../lib/i18n.js';

const MAX_STEPS = 6;
const SHOWN = 4;

function store(acct) {
  const key = `unw.plan.${acct}`;
  const read = () => {
    try {
      return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
    } catch {
      return new Set();
    }
  };
  return {
    read,
    toggle(id) {
      const set = read();
      if (set.has(id)) set.delete(id);
      else set.add(id);
      try {
        localStorage.setItem(key, JSON.stringify([...set]));
      } catch {
        /* private mode: ticks last for this visit only */
      }
      return set;
    },
  };
}

// Who left between the last two snapshots (Facebook: not counting people you removed).
function lastDiff(ds, snaps) {
  if (snaps.length < 2) return null;
  const from = snaps[snaps.length - 2];
  const to = snaps[snaps.length - 1];
  const diff = diffSnapshots(from, to);
  if (ds.platform === 'facebook') {
    const removed = new Set(to.removed || []);
    diff.unfollowedYou = diff.unfollowedYou.filter((k) => !removed.has(k));
  }
  return { from, to, diff };
}

function snapshotSteps(ds, ctx) {
  const fb = ds.platform === 'facebook';
  const last = lastDiff(ds, ctx.snapshots || []);
  if (!last) {
    return [
      {
        id: 'fresh-export',
        icon: 'calendar',
        title: fb ? tl('Come back in two weeks to see who unfriended you') : tl('Come back in two weeks to see who unfollowed you'),
        text: tl('Today’s snapshot is saved on this device. Drop a fresh export later — or an older one you still have — and we’ll compare them automatically.'),
        action: reminderButton(ds),
        late: true,
      },
    ];
  }
  const n = last.diff.unfollowedYou.length;
  if (!n) return [];
  const following = new Set(last.to.following || []);
  const back = fb ? 0 : last.diff.unfollowedYou.filter((k) => following.has(k)).length;
  return [
    {
      // A new export brings the step back.
      id: `unfollowers:${last.to.takenAt}`,
      icon: 'ghost',
      title: fb ? tl('{v0} unfriended you since {v1}', { v0: plural(n, 'person', 'people'), v1: dateShort(last.from.takenAt) }) : tl('{v0} unfollowed you since {v1}', { v0: plural(n, 'account'), v1: dateShort(last.from.takenAt) }),
      text: back ? tl('You still follow {v0} of them — decide whether to unfollow back.', { v0: fmtInt(back) }) : tl('Compared with the snapshot saved from your previous export.'),
      go: 'unfollowers',
    },
  ];
}

function relationshipSteps(ds) {
  const rel = relationships(ds);
  if (!rel.notFollowingBack.length) return [];
  return [
    {
      id: 'not-back',
      icon: 'user-minus',
      title: tl('Review {v0} that don’t follow you back', { v0: plural(rel.notFollowingBack.length, 'account') }),
      text: tl('Tap “Keep” on friends and creators, then clear the rest with the unfollow queue.'),
      go: 'notBack',
    },
  ];
}

function deviceCount(logins) {
  return new Set(logins.map((l) => l.device || l.name).filter(Boolean)).size;
}

function instagramSteps(ds) {
  const L = ds.lists;
  const act = ds.activity;
  const p = ds.privacy || {};
  const flagged = act?.items?.comments?.length ? flaggedCount(act.items.comments.map((c) => c.text)) : 0;
  const devices = p.logins?.devices?.length || 0;
  return [
    L.pendingSent?.length && {
      id: 'pending',
      icon: 'inbox',
      title: tl('Cancel {v0} follow requests nobody accepted', { v0: fmtInt(L.pendingSent.length) }),
      text: tl('Private accounts that never accepted can still see that you asked.'),
      go: 'requests',
    },
    flagged && {
      id: 'comments',
      icon: 'warning',
      title: tl('Check {v0} comments that might not age well', { v0: fmtInt(flagged) }),
      text: tl('Swearing, party talk or personal details in comments you left on other people’s posts.'),
      go: 'finder',
    },
    devices && {
      id: 'devices',
      icon: 'device',
      title: tl('Check the {v0} devices that logged in to your account', { v0: fmtInt(devices) }),
      text: tl('Log out anything you don’t recognize, then turn on two-factor authentication.'),
      go: 'privacy',
    },
    p.advertisers?.length && {
      id: 'advertisers',
      icon: 'megaphone',
      title: tl('See the {v0} advertisers that have your data', { v0: fmtInt(p.advertisers.length) }),
      text: tl('Hide ads from the ones you never shopped with.'),
      go: 'privacy',
    },
    L.closeFriends?.length && act && {
      id: 'close-friends',
      icon: 'star',
      title: tl('Tidy up your Close Friends list'),
      text: tl('See who’s on it but quiet, and who you’re closest to but left off.'),
      go: 'lists',
    },
    act?.messages?.threadCount && {
      id: 'chats',
      icon: 'message',
      title: tl('Save the chats you want to keep'),
      text: tl('Download any of your {v0} conversations as a text file — before you delete the app or the account.', { v0: fmtInt(act.messages.threadCount) }),
      go: 'messages',
    },
  ];
}

function tiktokSteps(ds) {
  const w = watchStats(ds.watch);
  const devices = deviceCount(ds.logins || []);
  return [
    w && w.perDayMinutes >= 45 && {
      id: 'screen-time',
      icon: 'clock',
      title: tl('Set a daily limit — you average {v0} minutes a day', { v0: fmtInt(w.perDayMinutes) }),
      text: tl('TikTok → Settings and privacy → Screen time → Daily screen time.'),
    },
    devices && {
      id: 'devices',
      icon: 'device',
      title: tl('Check the {v0} devices that logged in to your account', { v0: fmtInt(devices) }),
      text: tl('Remove anything you don’t recognize in Settings → Security.'),
      go: 'privacy',
    },
    ds.offTiktok && {
      id: 'off-tiktok',
      icon: 'globe',
      title: tl('Limit the {v0} activities other apps shared with TikTok', { v0: fmtInt(ds.offTiktok) }),
      text: tl('Settings and privacy → Privacy → Ads and data.'),
      go: 'privacy',
    },
  ];
}

function xSteps(ds) {
  const flagged = flaggedCount(ds.tweets.filter((tw) => !tw.isRT).map((tw) => tw.text));
  return [
    flagged && {
      id: 'posts',
      icon: 'warning',
      title: tl('Check {v0} posts that might not age well', { v0: fmtInt(flagged) }),
      text: tl('Swearing, party talk or personal details — worth a look before a job search.'),
      go: 'search',
    },
    ds.apps?.length && {
      id: 'apps',
      icon: 'key',
      title: tl('Review {v0} connected apps', { v0: fmtInt(ds.apps.length) }),
      text: tl('Settings → Security and account access → Apps and sessions.'),
      go: 'privacy',
    },
    {
      id: 'ads',
      icon: 'megaphone',
      title: tl('Turn off personalized ads'),
      text: tl('Settings → Privacy and safety → Ads preferences.'),
      late: true,
    },
  ];
}

function facebookSteps(ds) {
  const L = ds.lists;
  return [
    L.sentRequests?.length && {
      id: 'sent-requests',
      icon: 'inbox',
      title: tl('Cancel {v0} friend requests nobody answered', { v0: fmtInt(L.sentRequests.length) }),
      text: tl('You can cancel them from each profile.'),
      go: 'requests',
    },
    ds.offFacebook?.companies && {
      id: 'off-facebook',
      icon: 'globe',
      title: tl('Clear the activity {v0} companies sent to Facebook', { v0: fmtInt(ds.offFacebook.companies) }),
      text: tl('Accounts Center → Your information and permissions → Your activity off Meta technologies.'),
      go: 'privacy',
    },
    ds.activity?.messages?.threadCount && {
      id: 'chats',
      icon: 'message',
      title: tl('Save the chats you want to keep'),
      text: tl('Download any of your {v0} conversations as a text file — before you delete the app or the account.', { v0: fmtInt(ds.activity.messages.threadCount) }),
      go: 'messages',
    },
  ];
}

function linkedinSteps(ds) {
  const recruiters = ds.roles?.find((r) => r.key === 'Recruiters & HR')?.count || 0;
  return [
    ds.invitations?.sent && {
      id: 'invitations',
      icon: 'send',
      title: tl('Withdraw old invitations ({v0} sent)', { v0: fmtInt(ds.invitations.sent) }),
      text: tl('My Network → Manage invitations → Sent. Pending invitations count against LinkedIn’s weekly limit.'),
    },
    recruiters && {
      id: 'recruiters',
      icon: 'briefcase',
      title: tl('Say hi to {v0} already in your network', { v0: plural(recruiters, 'recruiter') }),
      text: tl('Find them in your connections and send a short hello — before you need a job.'),
      go: 'connections',
    },
    {
      id: 'email-visibility',
      icon: 'shield',
      title: tl('Choose who can see your e-mail address'),
      text: tl('Settings → Visibility → Who can see or download your email address.'),
      late: true,
    },
    {
      id: 'ai-data',
      icon: 'fingerprint',
      title: tl('Decide if LinkedIn may train AI on your data'),
      text: tl('Settings → Data privacy → Data for Generative AI Improvement.'),
      late: true,
    },
  ];
}

export function planSteps(ds, ctx) {
  const steps = [];
  const follows = ds.hasRelationships && ['instagram', 'threads', 'tiktok', 'x'].includes(ds.platform);
  if (follows || ds.platform === 'facebook') steps.push(...snapshotSteps(ds, ctx));
  if (follows) steps.push(...relationshipSteps(ds));
  if (ds.platform === 'instagram' || ds.platform === 'threads') steps.push(...instagramSteps(ds));
  if (ds.platform === 'tiktok') steps.push(...tiktokSteps(ds));
  if (ds.platform === 'x') steps.push(...xSteps(ds));
  if (ds.platform === 'facebook') steps.push(...facebookSteps(ds));
  if (ds.platform === 'linkedin') steps.push(...linkedinSteps(ds));
  const usable = steps.filter((s) => s && (!s.go || !ctx.hasView || ctx.hasView(s.go)));
  // Reminders and settings tips go last; the cap keeps the list short.
  return [...usable.filter((s) => !s.late), ...usable.filter((s) => s.late)].slice(0, MAX_STEPS);
}

export function actionPlan(ds, ctx) {
  const steps = planSteps(ds, ctx);
  if (!steps.length) return null;
  const acct = `${ds.platform}:${ds.account?.username || ds.account?.name || 'me'}`;
  const ticks = store(acct);
  const body = h('div', { class: 'ap' });
  const count = h('span', { class: 'ap-count' });
  let expanded = false;

  function draw() {
    const done = ticks.read();
    const finished = steps.filter((s) => done.has(s.id)).length;
    count.textContent = tl('{v0} of {v1} done', { v0: fmtInt(finished), v1: fmtInt(steps.length) });
    append(clear(body), [
      h('div', { class: 'ap-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(steps.length), 'aria-valuenow': String(finished), 'aria-label': tl('Action plan progress') }, h('i', { style: { width: `${(finished / steps.length) * 100}%` } })),
      finished === steps.length
        ? h('div', { class: 'ap-done' }, icon('check'), h('div', null, h('b', null, tl('All done — nice work.')), h('span', null, tl('Come back with a fresh export in a couple of weeks to see what changed.'))))
        : null,
      h(
        'ol',
        { class: 'ap-steps' },
        (expanded ? steps : steps.slice(0, SHOWN)).map((s) => {
          const isDone = done.has(s.id);
          const check = h('button', { class: 'ap-check', type: 'button', 'aria-pressed': String(isDone), title: isDone ? tl('Mark as not done') : tl('Mark as done') }, icon('check'), h('span', { class: 'sr-only' }, s.title));
          check.addEventListener('click', () => {
            ticks.toggle(s.id);
            draw();
          });
          const text = h('div', { class: 'ap-body' }, h('b', null, s.title), h('span', null, s.text), s.action ? h('div', { class: 'ap-acts' }, s.action) : null);
          // Steps that live in another section open it with one tap.
          const main = s.go ? h('button', { class: 'ap-link', type: 'button', onClick: () => ctx.go(s.go) }, text, icon('arrow', 'ap-arrow')) : text;
          return h('li', { class: `ap-step${isDone ? ' is-done' : ''}` }, check, h('span', { class: 'ap-ico', 'aria-hidden': 'true' }, icon(s.icon)), main);
        }),
      ),
      steps.length > SHOWN
        ? h(
            'button',
            {
              class: 'ap-more',
              type: 'button',
              'aria-expanded': String(expanded),
              onClick: () => {
                expanded = !expanded;
                draw();
              },
            },
            expanded ? tl('Show fewer steps') : tl('Show {v0} more steps', { v0: fmtInt(steps.length - SHOWN) }),
          )
        : null,
    ]);
  }
  draw();
  return panel({ title: tl('Your action plan'), text: tl('The few things worth doing next. Tick them off as you go — saved on this device.'), actions: count }, body);
}
