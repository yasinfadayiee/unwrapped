// Pro Lab: the deeper analyses behind Ghost Detector, Engagement Audit,
// Growth Time Machine, Audience Quality and Best Time to Post.
// Pure functions over parsed exports — unit-tested in test/lab.test.mjs.

import { personKey, byMonth, relationships, longestStreak } from './insights.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const sum = (list, fn) => list.reduce((s, x) => s + fn(x), 0);

/* ---------- Ghost Detector ---------- */

const SESSION_GAP = 8 * HOUR; // a pause this long starts a new conversation
const DOUBLE_TEXT_GAP = 24 * HOUR; // texting again after a day without an answer…
const RESTART_GAP = 14 * DAY; // …but restarting a chat weeks later is not being ignored
const MAX_REPLY = 7 * DAY; // slower answers don't count as reply times
const WAITING_AFTER = 7 * DAY; // last message unanswered for this long

// Turns one 1:1 message log ([timestamp, sender][]) into conversation dynamics.
// `latest` is the newest message in the whole export (≈ when it was made).
export function conversationDynamics(log, me, latest = Infinity) {
  const msgs = (log || []).filter(([ts]) => ts).sort((a, b) => a[0] - b[0]);
  const turns = [];
  for (const [ts, sender] of msgs) {
    const mine = sender === me;
    const last = turns[turns.length - 1];
    if (last && last.mine === mine && ts - last.end < SESSION_GAP) last.end = ts;
    else turns.push({ mine, start: ts, end: ts });
  }
  const replyMe = [];
  const replyThem = [];
  const d = { turns: turns.length, startsMe: 0, startsThem: 0, asksMe: 0, asksThem: 0, ignoredMe: 0, ignoredThem: 0 };
  turns.forEach((t, i) => {
    const prev = turns[i - 1];
    const next = turns[i + 1];
    if (!prev || t.start - prev.end >= SESSION_GAP) t.mine ? d.startsMe++ : d.startsThem++;
    if (prev && prev.mine !== t.mine && t.start - prev.end < MAX_REPLY) (t.mine ? replyMe : replyThem).push(t.start - prev.end);
    if (!next) return;
    if (t.mine) d.asksMe++;
    else d.asksThem++;
    // The same person had to write again after a day of silence: left on read.
    const gap = next.start - t.end;
    if (next.mine === t.mine && gap >= DOUBLE_TEXT_GAP && gap < RESTART_GAP) t.mine ? d.ignoredMe++ : d.ignoredThem++;
  });
  const last = turns[turns.length - 1];
  const stale = last && latest - last.end >= WAITING_AFTER;
  return {
    ...d,
    replyMe: median(replyMe),
    replyThem: median(replyThem),
    waitingOnThem: stale && last.mine ? last.end : 0,
    waitingOnMe: stale && !last.mine ? last.end : 0,
  };
}

const localDay = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Shareable facts about one chat: longest daily streak, late-night share.
export function chatStats(log) {
  const days = new Set();
  const hours = new Array(24).fill(0);
  let n = 0;
  for (const [ts] of log || []) {
    if (!ts) continue;
    days.add(localDay(ts));
    hours[new Date(ts).getHours()]++;
    n++;
  }
  const night = hours.slice(0, 5).reduce((a, b) => a + b, 0);
  return { activeDays: days.size, streak: longestStreak(days), nightShare: n ? night / n : 0, topHour: n ? hours.indexOf(Math.max(...hours)) : null };
}

export function ghostReport(messages, { minTurns = 6 } = {}) {
  const people = (messages?.all || [])
    .filter((t) => t.dynamics && t.dynamics.turns >= minTurns)
    .map((t) => {
      const d = t.dynamics;
      const starts = d.startsMe + d.startsThem;
      return {
        name: t.title,
        count: t.count,
        last: t.last,
        ...d,
        startShare: starts ? d.startsMe / starts : 0.5,
        ghostRate: d.asksMe ? d.ignoredMe / d.asksMe : 0,
        youGhostRate: d.asksThem ? d.ignoredThem / d.asksThem : 0,
      };
    });
  if (!people.length) return null;
  const pick = (filter, order) => people.filter(filter).sort(order);
  const startsMe = sum(people, (p) => p.startsMe);
  const startsAll = startsMe + sum(people, (p) => p.startsThem);
  return {
    people,
    replyMe: median(people.map((p) => p.replyMe).filter((v) => v !== null)),
    replyThem: median(people.map((p) => p.replyThem).filter((v) => v !== null)),
    startShare: startsAll ? startsMe / startsAll : 0.5,
    ignoredMe: sum(people, (p) => p.ignoredMe),
    ignoredThem: sum(people, (p) => p.ignoredThem),
    ghostsYou: pick((p) => p.ignoredMe >= 2 && p.ghostRate >= 0.08, (a, b) => b.ghostRate - a.ghostRate || b.ignoredMe - a.ignoredMe),
    youGhost: pick((p) => p.ignoredThem >= 2 && p.youGhostRate >= 0.08, (a, b) => b.youGhostRate - a.youGhostRate || b.ignoredThem - a.ignoredThem),
    waiting: pick((p) => p.waitingOnThem > 0, (a, b) => b.waitingOnThem - a.waitingOnThem),
    slowest: pick((p) => p.replyThem !== null, (a, b) => b.replyThem - a.replyThem),
    fastest: pick((p) => p.replyThem !== null, (a, b) => a.replyThem - b.replyThem),
    youStart: pick((p) => p.startsMe + p.startsThem >= 5 && p.startShare >= 0.7, (a, b) => b.startShare - a.startShare),
  };
}

/* ---------- Engagement Audit ---------- */

const handle = (s) => String(s || '').trim().replace(/^@/, '').toLowerCase();

// Joins who you like / comment on / react to with who follows you back.
export function engagementAudit(ds) {
  const act = ds.activity;
  if (!act || !(act.likes || act.comments || act.storyLikes)) return null;
  const given = new Map();
  const add = (tally, field) => {
    for (const a of tally?.authors || []) {
      const k = handle(a.key);
      if (!k) continue;
      const e = given.get(k) || { likes: 0, comments: 0, stories: 0, last: 0 };
      e[field] += a.count;
      e.last = Math.max(e.last, a.last || 0);
      given.set(k, e);
    }
  };
  add(act.likes, 'likes');
  add(act.comments, 'comments');
  add(act.storyLikes, 'stories');
  const weight = (e) => e.likes + e.comments * 3 + e.stories * 2;
  const followers = new Set((ds.lists.followers || []).map((f) => handle(f.u)));
  const following = ds.lists.following || [];
  const oneWay = [];
  const circle = [];
  const dead = [];
  for (const f of following) {
    const k = handle(f.u);
    const e = given.get(k);
    if (!e) dead.push(f);
    else (followers.has(k) ? circle : oneWay).push({ ...f, ...e, weight: weight(e) });
  }
  oneWay.sort((a, b) => b.weight - a.weight);
  circle.sort((a, b) => b.weight - a.weight);
  dead.sort((a, b) => (a.ts || Infinity) - (b.ts || Infinity));
  const totalGiven = sum([...given.values()], weight);
  return {
    oneWay,
    circle,
    dead,
    following: following.length,
    engaged: given.size,
    deadShare: following.length ? dead.length / following.length : 0,
    oneWayShare: totalGiven ? sum(oneWay, (p) => p.weight) / totalGiven : 0,
  };
}

/* ---------- Growth Time Machine ---------- */

export function growthTimeline(ds, snapshots = [], now = Date.now()) {
  const followers = ds.lists?.followers || [];
  const following = ds.lists?.following || [];
  const key = (i) => personKey(ds.platform, i);
  const dated = followers.filter((f) => f.ts);
  let running = followers.length - dated.length; // undated followers count from the start
  const cumulative = byMonth(dated.map((f) => f.ts)).map((m) => ({ month: m.month, added: m.count, total: (running += m.count) }));
  const ref = ds.exportedAt || now;
  const recent = (days) => dated.filter((f) => f.ts > ref - days * DAY).length;

  // Who followed first, and how fast people follow back after you follow them.
  const followedAt = new Map(dated.map((f) => [key(f), f.ts]));
  let theyFirst = 0;
  let youFirst = 0;
  const delays = [];
  for (const g of following) {
    const t = followedAt.get(key(g));
    if (!t || !g.ts) continue;
    if (t <= g.ts) theyFirst++;
    else {
      youFirst++;
      delays.push(t - g.ts);
    }
  }

  const history = snapshots.map((s, i) => {
    const prev = snapshots[i - 1];
    const row = { takenAt: s.takenAt, followers: s.followers.length, following: s.following.length, gained: null, lost: null };
    if (prev) {
      const before = new Set(prev.followers);
      const after = new Set(s.followers);
      row.gained = s.followers.filter((k) => !before.has(k)).length;
      row.lost = prev.followers.filter((k) => !after.has(k)).length;
    }
    return row;
  });
  let churn30 = null;
  if (history.length >= 2) {
    const span = history[history.length - 1].takenAt - history[0].takenAt;
    const avg = sum(history, (h) => h.followers) / history.length;
    if (span > 0 && avg > 0) churn30 = (sum(history, (h) => h.lost || 0) / avg) * ((30 * DAY) / span);
  }
  return {
    total: followers.length,
    hasDates: dated.length > 0,
    cumulative,
    last30: recent(30),
    last90: recent(90),
    theyFirst,
    youFirst,
    followBackMedian: median(delays),
    quickFollowBacks: delays.filter((d) => d <= 2 * DAY).length,
    history,
    churn30,
  };
}

/* ---------- Audience Quality ---------- */

const SPAM = /(crypto|bitcoin|forex|nft|giveaway|follow4follow|followback|f4f|l4l|likes4|4likes|freefollow|followers|smm|onlyfans|xxx|casino|promo|discount|deals|invest|trading|boost|^shop[._]|[._]shop$|^store[._]|[._]store$)/;
const GENERIC = /^(user|insta|ig|account|profile|real|official)[._]?\d/;

// Heuristic red flags in a username. Higher = more bot/spam-like.
export function botScore(username) {
  const name = String(username || '').toLowerCase();
  const reasons = [];
  let score = 0;
  const flag = (points, why) => {
    score += points;
    reasons.push(why);
  };
  const tail = (name.match(/\d+$/) || [''])[0];
  if (tail.length >= 5) flag(2, 'Long number at the end');
  else if (tail.length === 4 && !/^(19|20)\d\d$/.test(tail)) flag(1, 'Number at the end');
  if ((name.match(/\d/g) || []).length >= 6) flag(1, 'Mostly digits');
  const letters = name.replace(/[^a-z]/g, '');
  const vowels = (letters.match(/[aeiouy]/g) || []).length;
  if (letters.length >= 6 && vowels / letters.length < 0.2) flag(2, 'Random-looking letters');
  else if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(letters)) flag(1, 'Unpronounceable');
  if (SPAM.test(name)) flag(2, 'Spam or promo word');
  if (GENERIC.test(name)) flag(1, 'Generic name + number');
  if ((name.match(/[._]/g) || []).length >= 3) flag(1, 'Many separators');
  if (name.length >= 25) flag(1, 'Very long');
  return { score, reasons };
}

const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);

// Days when far more people followed you than usual (bought or bot waves).
export function followBursts(followers) {
  const days = new Map();
  for (const f of followers) if (f.ts) days.set(dayKey(f.ts), (days.get(dayKey(f.ts)) || 0) + 1);
  if (days.size < 10) return [];
  const threshold = Math.max(8, Math.ceil((median([...days.values()]) || 1) * 6));
  return [...days.entries()]
    .filter(([, n]) => n >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([day, count]) => ({ day, count }));
}

export function audienceQuality(followers) {
  const people = (followers || []).filter((f) => f.u);
  if (people.length < 20) return null;
  const bursts = followBursts(people);
  const burstDays = new Set(bursts.map((b) => b.day));
  const likely = [];
  const suspicious = [];
  const reasonCount = new Map();
  for (const f of people) {
    const r = botScore(f.u);
    if (f.ts && burstDays.has(dayKey(f.ts))) {
      r.score += 1;
      r.reasons.push('Followed during a spike');
    }
    if (r.score < 2) continue;
    for (const why of r.reasons) reasonCount.set(why, (reasonCount.get(why) || 0) + 1);
    (r.score >= 4 ? likely : suspicious).push({ ...f, score: r.score, reasons: r.reasons });
  }
  likely.sort((a, b) => b.score - a.score);
  suspicious.sort((a, b) => b.score - a.score);
  const score = Math.max(0, Math.round(100 * (1 - (likely.length + 0.4 * suspicious.length) / people.length)));
  const grade = score >= 92 ? 'A' : score >= 84 ? 'B' : score >= 75 ? 'C' : score >= 65 ? 'D' : 'F';
  return {
    total: people.length,
    likely,
    suspicious,
    clean: people.length - likely.length - suspicious.length,
    score,
    grade,
    bursts,
    reasons: [...reasonCount.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count })),
  };
}

/* ---------- Best Time to Post ---------- */

const grid = () => Array.from({ length: 7 }, () => new Array(24).fill(0));
const weekday = (d) => (d.getDay() + 6) % 7; // Monday first

// The best two-hour windows, at most one per day-and-neighbourhood.
export function topWindows(scores, n = 3) {
  const candidates = [];
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) candidates.push({ day: d, hour: h, value: scores[d][h] + scores[d][(h + 1) % 24] });
  candidates.sort((a, b) => b.value - a.value);
  const out = [];
  for (const c of candidates) {
    if (c.value <= 0) break;
    if (out.some((o) => o.day === c.day && Math.abs(o.hour - c.hour) < 3)) continue;
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

function totals(values, counts) {
  const byHour = new Array(24).fill(0);
  const byDay = new Array(7).fill(0);
  const nHour = new Array(24).fill(0);
  const nDay = new Array(7).fill(0);
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      byHour[h] += values[d][h];
      byDay[d] += values[d][h];
      nHour[h] += counts ? counts[d][h] : 0;
      nDay[d] += counts ? counts[d][h] : 0;
    }
  }
  if (!counts) return { byHour, byDay };
  return { byHour: byHour.map((v, i) => (nHour[i] ? v / nHour[i] : 0)), byDay: byDay.map((v, i) => (nDay[i] ? v / nDay[i] : 0)) };
}

// Real engagement when the export has it (X posts), otherwise when your
// audience is active: when people followed you and when they message you.
export function bestTimes({ tweets = null, followers = [], inbound = null } = {}) {
  const posts = (tweets || []).filter((t) => t.ts && !t.isRT && !t.isReply);
  if (posts.length >= 30) {
    const total = grid();
    const count = grid();
    for (const t of posts) {
      const d = new Date(t.ts);
      total[weekday(d)][d.getHours()] += (t.likes || 0) + 2 * (t.rts || 0);
      count[weekday(d)][d.getHours()]++;
    }
    const avg = total.map((row, d) => row.map((v, h) => (count[d][h] >= 2 ? v / count[d][h] : 0)));
    const top = topWindows(avg);
    const overall = sum(posts, (t) => (t.likes || 0) + 2 * (t.rts || 0)) / posts.length;
    let lift = null;
    if (top[0] && overall) {
      // Average engagement of the posts inside the best window vs all posts.
      const { day, hour } = top[0];
      const next = (hour + 1) % 24;
      lift = (total[day][hour] + total[day][next]) / (count[day][hour] + count[day][next]) / overall;
    }
    return { mode: 'engagement', grid: avg, top, ...totals(total, count), samples: posts.length, lift };
  }
  const follows = grid();
  let nFollows = 0;
  for (const f of followers) {
    if (!f.ts) continue;
    const d = new Date(f.ts);
    follows[weekday(d)][d.getHours()]++;
    nFollows++;
  }
  const nInbound = inbound ? sum(inbound, (row) => sum(row, (v) => v)) : 0;
  if (nFollows + nInbound < 30) return null;
  // Each source gets equal say, whatever its size; the result sums to 1.
  const raw = follows.map((row, d) => row.map((v, h) => (nFollows ? v / nFollows : 0) + (nInbound ? inbound[d][h] / nInbound : 0)));
  const scale = sum(raw, (row) => sum(row, (v) => v)) || 1;
  const combined = raw.map((row) => row.map((v) => v / scale));
  return { mode: 'audience', grid: combined, top: topWindows(combined), ...totals(combined), samples: nFollows + nInbound, sources: { follows: nFollows, messages: nInbound } };
}

/* ---------- Account Health ---------- */

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const pctText = (x) => `${Math.round(x * 100)}%`;
// detailKey + vars let the UI translate the sentence; detail is the English text.
const fill = (key, vars) => key.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const detail = (detailKey, vars) => ({ detailKey, vars, detail: fill(detailKey, vars) });

// One 0–100 score from the factors this export can measure. Each factor
// points at the Pro Lab view (`fix`) that helps improve it.
export function accountHealth(ds, { snapshots = [] } = {}) {
  if (!ds.hasRelationships) return null;
  const factors = [];
  const rel = relationships(ds);
  if (rel.following >= 20) {
    factors.push({ id: 'balance', label: 'Follow-back balance', weight: 30, score: clamp01(rel.followBackRate / 0.75), ...detail('{n} of the accounts you follow follow you back', { n: pctText(rel.followBackRate) }), fix: 'notBack' });
  }
  const quality = ds.platform === 'x' ? null : audienceQuality(ds.lists.followers);
  if (quality) {
    factors.push({ id: 'authentic', label: 'Audience authenticity', weight: 30, score: quality.score / 100, ...detail('{n} likely bot or spam followers', { n: quality.likely.length }), fix: 'audience' });
  }
  const audit = ds.platform === 'instagram' ? engagementAudit(ds) : null;
  if (audit) {
    factors.push({ id: 'reciprocity', label: 'Two-way engagement', weight: 20, score: clamp01(1 - audit.oneWayShare), ...detail('{n} of your likes and comments go unreturned', { n: pctText(audit.oneWayShare) }), fix: 'audit' });
    factors.push({ id: 'active', label: 'Active following', weight: 20, score: clamp01(1 - audit.deadShare), ...detail('{n} follows you never interact with', { n: audit.dead.length }), fix: 'audit' });
  }
  const growth = growthTimeline(ds, snapshots);
  const dated = (ds.lists.followers || []).filter((f) => f.ts);
  if (growth.hasDates && dated.length >= 50) {
    const first = Math.min(...dated.map((f) => f.ts));
    const spanDays = Math.max(90, ((ds.exportedAt || Date.now()) - first) / DAY);
    const usual = (dated.length / spanDays) * 90; // typical new followers per 90 days
    factors.push({ id: 'momentum', label: 'Growth momentum', weight: 20, score: clamp01(growth.last90 / usual), ...detail('{n} new followers in 90 days vs {usual} usually', { n: growth.last90, usual: Math.round(usual) }), fix: 'growth' });
  }
  if (growth.churn30 != null) {
    factors.push({ id: 'retention', label: 'Follower retention', weight: 15, score: clamp01(1 - growth.churn30 / 0.1), ...detail('{n} of followers lost per month', { n: pctText(growth.churn30) }), fix: 'growth' });
  }
  if (factors.length < 2) return null;
  const weight = sum(factors, (f) => f.weight);
  const score = Math.round((100 * sum(factors, (f) => f.score * f.weight)) / weight);
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
  return { score, grade, factors: factors.sort((a, b) => a.score - b.score) };
}

// The right inputs for each platform's export.
export function bestTimesFor(ds) {
  if (ds.platform === 'x') return bestTimes({ tweets: ds.tweets });
  if (!['instagram', 'tiktok', 'threads'].includes(ds.platform)) return null;
  return bestTimes({ followers: ds.lists?.followers || [], inbound: ds.activity?.messages?.inHeat || null });
}
