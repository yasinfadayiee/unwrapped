import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../public/assets/js/core/analyze.js';
import { buildDemoVfs } from '../public/assets/js/core/demo.js';
import { icsReminder } from '../public/assets/js/lib/calendar.js';
import {
  accountHealth,
  audienceQuality,
  bestTimes,
  botScore,
  chatStats,
  conversationDynamics,
  engagementAudit,
  ghostReport,
  growthTimeline,
  median,
  topWindows,
} from '../public/assets/js/core/lab.js';

const H = 3_600_000;
const D = 24 * H;
const T0 = Date.UTC(2026, 0, 5, 10); // a Monday

test('median handles odd, even and empty lists', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('conversation dynamics: reply times, who starts, left on read', () => {
  const log = [
    // Day 1: I start, they answer after 10 minutes, I answer after 2.
    [T0, 'me'],
    [T0 + 10 * 60_000, 'Sam'],
    [T0 + 12 * 60_000, 'me'],
    // No answer: I write again on day 3, and again on day 5 (unanswered twice).
    [T0 + 2 * D, 'me'],
    [T0 + 4 * D, 'me'],
    // They finally answer 30 minutes later.
    [T0 + 4 * D + 30 * 60_000, 'Sam'],
  ];
  const d = conversationDynamics(log, 'me', T0 + 4 * D + H);
  assert.equal(d.startsMe, 3);
  assert.equal(d.startsThem, 0);
  assert.equal(d.ignoredMe, 2);
  assert.equal(d.ignoredThem, 0);
  assert.equal(d.replyThem, 20 * 60_000); // median of 10 and 30 minutes
  assert.equal(d.replyMe, 2 * 60_000);
  assert.equal(d.waitingOnThem, 0);

  const stale = conversationDynamics([[T0, 'Sam'], [T0 + 60_000, 'me']], 'me', T0 + 30 * D);
  assert.equal(stale.waitingOnThem, T0 + 60_000, 'my last message went unanswered for a month');

  const restart = conversationDynamics([[T0, 'Sam'], [T0 + 60_000, 'me'], [T0 + 40 * D, 'me'], [T0 + 40 * D + H, 'Sam']], 'me', T0 + 41 * D);
  assert.equal(restart.ignoredMe, 0, 'starting a new chat weeks later is not being ignored');
});

test('ghost report ranks people who leave you on read', () => {
  const dyn = (over) => ({ turns: 10, startsMe: 3, startsThem: 3, asksMe: 5, asksThem: 5, ignoredMe: 0, ignoredThem: 0, replyMe: 60_000, replyThem: 60_000, waitingOnThem: 0, waitingOnMe: 0, ...over });
  const report = ghostReport({
    all: [
      { title: 'Ana', count: 50, last: T0, dynamics: dyn({ ignoredMe: 3, replyThem: 5 * H }) },
      { title: 'Ben', count: 40, last: T0, dynamics: dyn({ replyThem: 2 * 60_000 }) },
      { title: 'Cy', count: 9, last: T0, dynamics: dyn({ turns: 3 }) }, // too short to judge
    ],
  });
  assert.equal(report.people.length, 2);
  assert.deepEqual(report.ghostsYou.map((p) => p.name), ['Ana']);
  assert.equal(report.slowest[0].name, 'Ana');
  assert.equal(report.fastest[0].name, 'Ben');
  assert.equal(ghostReport({ all: [] }), null);
});

test('engagement audit finds one-way support and dead follows', () => {
  const ds = {
    lists: {
      followers: [{ u: 'friend' }],
      following: [{ u: 'friend', ts: T0 }, { u: 'Celebrity', ts: T0 }, { u: 'old.page', ts: T0 - 900 * D }, { u: 'newer.page', ts: T0 }],
    },
    activity: {
      likes: { authors: [{ key: 'celebrity', count: 40, last: T0 }, { key: 'friend', count: 5, last: T0 }] },
      comments: { authors: [{ key: '@friend', count: 2, last: T0 }] },
    },
  };
  const a = engagementAudit(ds);
  assert.deepEqual(a.oneWay.map((p) => p.u), ['Celebrity']);
  assert.equal(a.oneWay[0].weight, 40);
  assert.deepEqual(a.circle.map((p) => p.u), ['friend']);
  assert.equal(a.circle[0].weight, 5 + 2 * 3);
  assert.deepEqual(a.dead.map((p) => p.u), ['old.page', 'newer.page'], 'oldest follows first');
  assert.equal(a.deadShare, 0.5);
  assert.equal(engagementAudit({ lists: ds.lists, activity: null }), null);
});

test('growth timeline: cumulative curve, follow-back speed and churn', () => {
  const ds = {
    platform: 'instagram',
    exportedAt: T0,
    lists: {
      followers: [{ u: 'a', ts: T0 - 40 * D }, { u: 'b', ts: T0 - 10 * D }, { u: 'c', ts: T0 - 5 * D }, { u: 'd' }],
      following: [{ u: 'a', ts: T0 - 50 * D }, { u: 'b', ts: T0 - 5 * D }, { u: 'c', ts: T0 - 5 * D - H }],
    },
  };
  const snaps = [
    { takenAt: T0 - 60 * D, followers: ['a', 'x', 'y'], following: [] },
    { takenAt: T0, followers: ['a', 'b', 'c', 'd'], following: [] },
  ];
  const g = growthTimeline(ds, snaps);
  assert.equal(g.cumulative[g.cumulative.length - 1].total, 4);
  assert.equal(g.last30, 2);
  assert.equal(g.theyFirst, 1); // b followed you before you followed back
  assert.equal(g.youFirst, 2);
  assert.equal(g.quickFollowBacks, 1); // c followed back within an hour
  assert.deepEqual(g.history.map((h) => [h.gained, h.lost]), [[null, null], [3, 2]]);
  assert.ok(g.churn30 > 0);
});

test('bot scoring flags spam patterns but not ordinary names', () => {
  for (const u of ['user8273645', 'insta_88231', 'f4f.likes.boost.9']) assert.ok(botScore(u).score >= 3, u);
  for (const u of ['luna.studio', 'theo_films', 'maria1994', 'ivy.codes22', 'rhythm.lab']) assert.ok(botScore(u).score < 2, `${u} → ${botScore(u).score}`);
});

test('best times prefer real engagement and fall back to audience activity', () => {
  const tweets = [];
  for (let i = 0; i < 60; i++) {
    const hot = i % 2 === 0;
    const ts = T0 + Math.floor(i / 2) * 7 * D + (hot ? 9 : 22) * H;
    tweets.push({ ts, isRT: false, isReply: false, likes: hot ? 100 : 2, rts: 0 });
  }
  const best = bestTimes({ tweets });
  assert.equal(best.mode, 'engagement');
  const local = new Date(T0 + 9 * H);
  assert.equal(best.top[0].day, (local.getDay() + 6) % 7);
  assert.ok([local.getHours(), (local.getHours() + 23) % 24].includes(best.top[0].hour));
  assert.ok(best.lift > 1);

  const followers = Array.from({ length: 40 }, (_, i) => ({ u: `f${i}`, ts: T0 + i * D + 20 * H }));
  const audience = bestTimes({ followers });
  assert.equal(audience.mode, 'audience');
  assert.equal(bestTimes({ followers: followers.slice(0, 5) }), null);

  const windows = topWindows(Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => (d === 2 && h === 18 ? 10 : d === 2 && h === 19 ? 9 : 0))));
  assert.equal(windows.length, 1, 'neighbouring hours on the same day are one window');
  assert.deepEqual([windows[0].day, windows[0].hour], [2, 18]);
});

test('chat stats: longest daily streak and late-night share', () => {
  const day = (n, hour) => new Date(2026, 0, 1 + n, hour).getTime();
  const log = [[day(0, 23), 'a'], [day(1, 2), 'b'], [day(1, 14), 'a'], [day(2, 9), 'b'], [day(5, 3), 'a']];
  const s = chatStats(log);
  assert.equal(s.streak, 3);
  assert.equal(s.activeDays, 4);
  assert.equal(s.nightShare, 2 / 5);
  assert.deepEqual(chatStats([]), { activeDays: 0, streak: 0, nightShare: 0, topHour: null });
});

test('account health combines the measurable factors, weakest first', () => {
  const followers = Array.from({ length: 60 }, (_, i) => ({ u: `friend.${i}`, ts: T0 - i * 5 * D }));
  const following = followers.slice(0, 30).map((f) => ({ ...f }));
  const ds = { platform: 'tiktok', hasRelationships: true, exportedAt: T0, lists: { followers, following } };
  const health = accountHealth(ds);
  assert.ok(health.score > 0 && health.score <= 100);
  assert.ok(['A', 'B', 'C', 'D', 'F'].includes(health.grade));
  assert.deepEqual(health.factors.map((f) => f.id).sort(), ['authentic', 'balance', 'momentum']);
  for (let i = 1; i < health.factors.length; i++) assert.ok(health.factors[i - 1].score <= health.factors[i].score);
  assert.equal(health.factors.find((f) => f.id === 'balance').score, 1, 'everyone you follow follows you back');
  assert.equal(accountHealth({ ...ds, lists: { followers: followers.slice(0, 5), following: [] } }), null, 'too little data');
});

test('calendar reminders are valid, folded .ics files', () => {
  const ics = icsReminder({ title: 'Download a fresh Instagram export', description: 'Drop it on https://example.com, then compare; it shows who unfollowed you since your last snapshot — a long line that must be folded.', url: 'https://example.com/#how', days: 14, now: new Date(2026, 9, 13, 12) });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261027\r\n/);
  assert.match(ics, /SUMMARY:Download a fresh Instagram export\r\n/);
  assert.match(ics, /https:\/\/example\.com\\, then compare\\;/, 'commas and semicolons are escaped');
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});

test('the demo export exercises every Pro Lab tool', async () => {
  const { vfs } = buildDemoVfs(Date.UTC(2026, 9, 1));
  const { datasets } = await analyze(vfs);
  const ig = datasets.find((d) => d.platform === 'instagram');
  const x = datasets.find((d) => d.platform === 'x');

  const ghosts = ghostReport(ig.activity.messages);
  assert.ok(ghosts.people.length >= 20);
  assert.ok(ghosts.replyThem > 0 && ghosts.replyMe > 0);
  assert.ok(ghosts.ghostsYou.length > 0, 'someone leaves the demo user on read');

  const audit = engagementAudit(ig);
  assert.ok(audit.oneWay.length > 0 && audit.dead.length > 0 && audit.circle.length > 0);

  const quality = audienceQuality(ig.lists.followers);
  assert.ok(quality.likely.length >= 30, `likely bots ${quality.likely.length}`);
  assert.ok(quality.bursts.length >= 2, 'both bot waves are detected');
  assert.ok(quality.likely.length + quality.suspicious.length < 200, 'ordinary demo names stay clean');

  assert.equal(bestTimes({ tweets: x.tweets }).mode, 'engagement');
  assert.equal(bestTimes({ followers: ig.lists.followers, inbound: ig.activity.messages.inHeat }).mode, 'audience');
  assert.ok(growthTimeline(ig).cumulative.length > 12);

  const health = accountHealth(ig);
  assert.equal(health.factors.length, 5, 'Instagram measures balance, authenticity, reciprocity, active following and momentum');
  const friend = ig.activity.messages.all[0];
  assert.ok(friend.chat.streak >= 1 && friend.chat.activeDays >= friend.chat.streak);
});
