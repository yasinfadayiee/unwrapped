// Follow Time Machine — pure analysis of follow timestamps.
// Every Instagram/Threads export stamps *when* you followed each account and
// *when* each follower followed you. For mutuals we have both moments, which
// tells us who made the first move and how long the other side took.

const HOUR = 36e5;
const DAY = 24 * HOUR;

function median(values) {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const monthKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function monthRange(fromTs, toTs) {
  const out = [];
  const d = new Date(fromTs);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  while (d.getTime() <= toTs) {
    out.push(monthKey(d.getTime()));
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

/**
 * @param {{followers: {u:string,ts:number}[], following: {u:string,ts:number}[]}} lists
 * @returns null when the export has too few timestamps to say anything.
 */
export function timeMachine(lists) {
  const followers = (lists.followers || []).filter((x) => x.ts > 0);
  const following = (lists.following || []).filter((x) => x.ts > 0);
  if (followers.length + following.length < 10) return null;

  const followedAt = new Map(following.map((x) => [x.u.toLowerCase(), x.ts]));
  const pairs = [];
  for (const f of followers) {
    const mine = followedAt.get(f.u.toLowerCase());
    if (!mine) continue;
    // `you` = when you followed them, `them` = when they followed you
    pairs.push({ u: f.u, you: mine, them: f.ts, lag: Math.abs(mine - f.ts), youFirst: mine < f.ts, since: Math.max(mine, f.ts) });
  }

  const youFirst = pairs.filter((p) => p.youFirst);
  const theyFirst = pairs.filter((p) => !p.youFirst);
  const instant = pairs.filter((p) => p.lag <= HOUR);

  // Monthly timeline (accounts you still follow / that still follow you).
  const all = [...followers, ...following].map((x) => x.ts);
  const start = Math.min(...all);
  const end = Math.max(...all);
  const keys = monthRange(start, end);
  const index = new Map(keys.map((k, i) => [k, i]));
  const gained = new Array(keys.length).fill(0);
  const followed = new Array(keys.length).fill(0);
  for (const f of followers) gained[index.get(monthKey(f.ts))]++;
  for (const f of following) followed[index.get(monthKey(f.ts))]++;
  let a = 0;
  let b = 0;
  const months = keys.map((key, i) => ({ key, gained: gained[i], followed: followed[i], followers: (a += gained[i]), following: (b += followed[i]) }));

  // Eras: months that stand far above your usual pace.
  const eras = [];
  for (const [field, kind] of [['followed', 'spree'], ['gained', 'wave']]) {
    const vals = months.map((m) => m[field]);
    const mean = vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length || 1));
    for (const m of months) {
      if (m[field] >= 8 && m[field] > mean + 2 * sd) eras.push({ key: m.key, kind, count: m[field], times: mean ? m[field] / mean : 0 });
    }
  }
  eras.sort((x, y) => y.count - x.count);

  return {
    pairs: pairs.length,
    youFirst: youFirst.length,
    theyFirst: theyFirst.length,
    instant: instant.length,
    // how long people take to follow you back, and how long you take
    theirReply: median(youFirst.map((p) => p.lag)),
    yourReply: median(theyFirst.map((p) => p.lag)),
    fastest: [...pairs].sort((x, y) => x.lag - y.lag).slice(0, 25),
    slowBurns: [...pairs].sort((x, y) => y.lag - x.lag).slice(0, 25),
    dayOnes: [...pairs].sort((x, y) => x.since - y.since).slice(0, 25),
    firstFollower: [...followers].sort((x, y) => x.ts - y.ts)[0] || null,
    firstFollow: [...following].sort((x, y) => x.ts - y.ts)[0] || null,
    months,
    eras: eras.slice(0, 6),
    start,
    end,
  };
}

/** "3 min", "5 h", "12 days", "2.4 years" */
export function lagLabel(ms) {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 6e4))} min`;
  if (ms < 2 * DAY) return `${Math.round(ms / HOUR)} h`;
  if (ms < 60 * DAY) return `${Math.round(ms / DAY)} days`;
  if (ms < 730 * DAY) return `${Math.round(ms / (30.4 * DAY))} months`;
  return `${(ms / (365.25 * DAY)).toFixed(1)} years`;
}
