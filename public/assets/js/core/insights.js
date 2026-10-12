// Everything we compute on top of the raw export. Pure functions.

const DAY = 86_400_000;

export function personKey(platform, item) {
  if (platform === 'x') return item.id;
  if (platform === 'facebook') return item.name.toLowerCase();
  return item.u.toLowerCase();
}

// Mutuals / not following back / fans.
export function relationships(ds) {
  const followers = ds.lists.followers || [];
  const following = ds.lists.following || [];
  const key = (item) => personKey(ds.platform, item);
  const followerMap = new Map(followers.map((f) => [key(f), f]));
  const followingMap = new Map(following.map((f) => [key(f), f]));
  const mutuals = following
    .filter((f) => followerMap.has(key(f)))
    .map((f) => ({ ...f, since: Math.max(f.ts || 0, followerMap.get(key(f)).ts || 0) }));
  const notFollowingBack = following.filter((f) => !followerMap.has(key(f)));
  const fans = followers.filter((f) => !followingMap.has(key(f)));
  return {
    followers: followers.length,
    following: following.length,
    mutuals,
    notFollowingBack,
    fans,
    followBackRate: following.length ? mutuals.length / following.length : 0,
    ratio: following.length ? followers.length / following.length : 0,
  };
}

export function byMonth(timestamps) {
  const map = new Map();
  for (const ts of timestamps) {
    if (!ts) continue;
    const d = new Date(ts);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].sort().map(([month, count]) => ({ month, count }));
}

export function heatmap(timestamps) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const ts of timestamps) {
    if (!ts) continue;
    const d = new Date(ts);
    grid[(d.getDay() + 6) % 7][d.getHours()]++; // Monday first
  }
  return grid;
}

const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function longestStreak(days) {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of sorted) {
    const t = new Date(`${k}T12:00:00`).getTime();
    run = prev !== null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

export function scrollPersona(peakHour) {
  if (peakHour >= 0 && peakHour < 5) return { title: 'Midnight Doomscroller', line: 'Your feed peaks while the world sleeps.' };
  if (peakHour < 9) return { title: 'Sunrise Scroller', line: 'Coffee in one hand, For You page in the other.' };
  if (peakHour < 12) return { title: 'Morning Drifter', line: 'You warm up the algorithm before lunch.' };
  if (peakHour < 15) return { title: 'Lunch-Break Looper', line: 'Midday is your prime scrolling hour.' };
  if (peakHour < 18) return { title: 'Afternoon Escapist', line: 'The 3 PM slump runs on short videos.' };
  if (peakHour < 21) return { title: 'Prime-Time Viewer', line: 'Evenings belong to your feed.' };
  return { title: 'Night Owl', line: 'One more video… at 11 PM. Every night.' };
}

// Rebuilds viewing sessions from watch-history timestamps.
export function watchStats(watch, { gapMinutes = 10, tailSeconds = 20 } = {}) {
  if (!watch || !watch.length) return null;
  const ts = [...watch].sort((a, b) => a - b);
  const gap = gapMinutes * 60_000;
  const tail = tailSeconds * 1000;
  const sessions = [];
  let start = ts[0];
  let prev = ts[0];
  let count = 1;
  for (let i = 1; i < ts.length; i++) {
    const t = ts[i];
    if (t - prev > gap) {
      sessions.push({ start, end: prev, count, ms: prev - start + tail });
      start = t;
      count = 0;
    }
    count++;
    prev = t;
  }
  sessions.push({ start, end: prev, count, ms: prev - start + tail });

  const totalMs = sessions.reduce((s, x) => s + x.ms, 0);
  const longest = sessions.reduce((a, b) => (b.ms > a.ms ? b : a));
  const days = new Map();
  const hours = new Array(24).fill(0);
  for (const t of ts) {
    days.set(dayKey(t), (days.get(dayKey(t)) || 0) + 1);
    hours[new Date(t).getHours()]++;
  }
  const peakHour = hours.indexOf(Math.max(...hours));
  const [topDayKey, topDayCount] = [...days.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
  const spanDays = Math.max(1, Math.round((ts[ts.length - 1] - ts[0]) / DAY) + 1);
  const night = hours.slice(0, 5).reduce((a, b) => a + b, 0);
  return {
    videos: ts.length,
    first: ts[0],
    last: ts[ts.length - 1],
    spanDays,
    activeDays: days.size,
    totalMs,
    hours: totalMs / 3_600_000,
    perDayMinutes: totalMs / spanDays / 60_000,
    perDayVideos: ts.length / spanDays,
    sessions: sessions.length,
    avgSessionMinutes: totalMs / sessions.length / 60_000,
    longest,
    topDay: { day: topDayKey, count: topDayCount },
    peakHour,
    nightShare: night / ts.length,
    streak: longestStreak(days.keys()),
    byHour: hours,
    heat: heatmap(ts),
    months: byMonth(ts),
    persona: scrollPersona(peakHour),
  };
}

const STOP = new Set(
  'the a an and or but to of in on at for with is are was were be been it its this that i you he she we they me my your our their not no yes so if as by from just like do did does have has had will would can could rt amp https http co t im dont its'.split(' '),
);

export function tweetStats(tweets) {
  if (!tweets || !tweets.length) return null;
  const originals = tweets.filter((t) => !t.isRT);
  const replies = originals.filter((t) => t.isReply);
  const own = originals.filter((t) => !t.isReply);
  const hashtags = new Map();
  const mentions = new Map();
  const words = new Map();
  for (const t of originals) {
    for (const h of t.hashtags) hashtags.set(`#${h}`, (hashtags.get(`#${h}`) || 0) + 1);
    for (const m of t.mentions) mentions.set(`@${m}`, (mentions.get(`@${m}`) || 0) + 1);
    for (const w of t.text.toLowerCase().replace(/https?:\/\/\S+/g, ' ').match(/[\p{L}][\p{L}'’-]{2,}/gu) || []) {
      if (!STOP.has(w)) words.set(w, (words.get(w) || 0) + 1);
    }
  }
  const top = (map, n = 12) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));
  const hours = new Array(24).fill(0);
  for (const t of tweets) if (t.ts) hours[new Date(t.ts).getHours()]++;
  const days = new Set(tweets.filter((t) => t.ts).map((t) => dayKey(t.ts)));
  const best = [...originals].sort((a, b) => b.likes + b.rts * 2 - (a.likes + a.rts * 2)).slice(0, 10);
  return {
    total: tweets.length,
    originals: own.length,
    replies: replies.length,
    retweets: tweets.length - originals.length,
    likesEarned: originals.reduce((s, t) => s + t.likes, 0),
    rtsEarned: originals.reduce((s, t) => s + t.rts, 0),
    first: tweets.find((t) => t.ts) || null,
    best,
    hashtags: top(hashtags),
    mentions: top(mentions),
    words: top(words, 30),
    months: byMonth(tweets.map((t) => t.ts)),
    heat: heatmap(tweets.map((t) => t.ts)),
    peakHour: hours.indexOf(Math.max(...hours)),
    streak: longestStreak(days),
  };
}

// 0–100, higher = more of you is out there. Built only from facts in the export.
export function exposureScore(parts) {
  const clamp = (v, max) => Math.min(max, v);
  const factors = [
    { label: 'Advertisers holding your data', value: parts.advertisers || 0, points: clamp((parts.advertisers || 0) * 0.35, 35) },
    { label: 'Interests profiled about you', value: parts.interests || 0, points: clamp((parts.interests || 0) * 0.2, 20) },
    { label: 'Off-platform tracking sources', value: parts.offPlatform || 0, points: clamp((parts.offPlatform || 0) * 0.2, 20) },
    { label: 'Login locations (IP addresses)', value: parts.ips || 0, points: clamp((parts.ips || 0) * 0.5, 15) },
    { label: 'Connected third-party apps', value: parts.apps || 0, points: clamp((parts.apps || 0) * 2, 10) },
  ].filter((f) => f.value > 0);
  const score = Math.round(Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  const grade = score <= 20 ? 'A' : score <= 40 ? 'B' : score <= 60 ? 'C' : score <= 80 ? 'D' : 'F';
  return { score, grade, factors };
}

// Compares two snapshots of the same account.
export function diffSnapshots(previous, current) {
  const prevF = new Set(previous.followers);
  const currF = new Set(current.followers);
  const prevG = new Set(previous.following);
  const currG = new Set(current.following);
  return {
    from: previous.takenAt,
    to: current.takenAt,
    unfollowedYou: previous.followers.filter((k) => !currF.has(k)),
    newFollowers: current.followers.filter((k) => !prevF.has(k)),
    youUnfollowed: previous.following.filter((k) => !currG.has(k)),
    youFollowed: current.following.filter((k) => !prevG.has(k)),
  };
}

// Friendship Radar: classifies 1:1 DM conversations by balance and momentum.
export function friendshipRadar(messages) {
  if (!messages || !messages.all) return null;
  const DAY = 86_400_000;
  const people = messages.all
    .filter((t) => t.count >= 10)
    .map((t) => {
      const share = t.count ? t.sent / t.count : 0;
      const momentum = t.recent - t.previous;
      // Closeness blends volume, recency and balance (0–100).
      const balance = 1 - Math.min(1, Math.abs(share - 0.5) * 2);
      const volume = Math.min(1, Math.log10(1 + t.count) / 3.5);
      const recency = Math.min(1, t.recent / 60);
      const score = Math.round(100 * (0.45 * volume + 0.35 * recency + 0.2 * balance));
      let tag = null;
      if (t.last < messages.latest - 180 * DAY && t.count >= 40) tag = 'quiet';
      else if (t.previous >= 10 && t.recent < t.previous * 0.4) tag = 'fading';
      else if (t.recent >= 10 && t.recent > t.previous * 1.6) tag = 'rising';
      else if (share >= 0.68) tag = 'you-chase';
      else if (share <= 0.32) tag = 'they-chase';
      return { name: t.title, count: t.count, share, recent: t.recent, previous: t.previous, momentum, last: t.last, score, tag };
    })
    .sort((a, b) => b.score - a.score);
  if (!people.length) return null;
  const by = (tag) => people.filter((p) => p.tag === tag);
  return {
    people,
    innerCircle: people.slice(0, 5),
    fading: by('fading').sort((a, b) => a.momentum - b.momentum),
    rising: by('rising').sort((a, b) => b.momentum - a.momentum),
    youChase: by('you-chase').sort((a, b) => b.share - a.share),
    theyChase: by('they-chase').sort((a, b) => a.share - b.share),
    quiet: by('quiet').sort((a, b) => b.count - a.count),
  };
}

// People who appear on more than one platform (matched by username).
export function crossPlatform(datasets) {
  const sets = datasets
    .filter((d) => ['instagram', 'tiktok', 'threads'].includes(d.platform) && d.hasRelationships)
    .map((d) => ({
      platform: d.platform,
      label: d.label,
      followers: new Set((d.lists.followers || []).map((f) => f.u.toLowerCase())),
      following: new Set((d.lists.following || []).map((f) => f.u.toLowerCase())),
    }));
  if (sets.length < 2) return null;
  const pairs = [];
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const a = sets[i];
      const b = sets[j];
      const both = [...a.followers].filter((u) => b.followers.has(u));
      const onlyA = [...a.followers].filter((u) => !b.followers.has(u) && b.following.has(u));
      const onlyB = [...b.followers].filter((u) => !a.followers.has(u) && a.following.has(u));
      pairs.push({ a: a.label, b: b.label, both, followsYouOnlyOnA: onlyA, followsYouOnlyOnB: onlyB });
    }
  }
  return { platforms: sets.map((s) => s.label), pairs };
}
