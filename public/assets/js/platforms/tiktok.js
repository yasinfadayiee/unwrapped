// TikTok "Download your data" — JSON (user_data_tiktok.json) or TXT folders.

import { get, parseDate, parseKeyValueBlocks, walk } from '../core/text.js';

// [id, array key, optional parent-key test]
const JSON_RULES = [
  ['watch', /^videolist$/i, /(browsing|watch) history/i],
  ['posted', /^videolist$/i, /^(videos?|posts?)$/i],
  ['likes', /^itemfavoritelist$/i],
  ['favorites', /^favoritevideolist$/i],
  ['following', /^following(list)?$/i],
  ['followers', /^fanslist$/i],
  ['searches', /^searchlist$/i],
  ['shares', /^sharehistorylist$/i],
  ['logins', /^loginhistorylist$/i],
  ['comments', /^commentslist$/i],
  ['blocked', /^blocklist$/i],
  ['offTiktok', /^offtiktokactivitydatalist$/i],
];

const TXT_RULES = [
  ['watch', /(browsing|watch) history\.txt$/],
  ['likes', /like ?list\.txt$|likes\.txt$/],
  ['favorites', /favorite videos\.txt$/],
  ['following', /following( list)?\.txt$/],
  ['followers', /(follower|fans)( list)?\.txt$/],
  ['searches', /search(es| history)\.txt$/],
  ['shares', /share history\.txt$/],
  ['logins', /login history\.txt$/],
  ['comments', /comments?\.txt$/],
  ['blocked', /block ?list\.txt$/],
];

const isTikTokTxt = (lower) => /\.txt$/.test(lower) && /tiktok|activity\/|comments\/|profile\/|video\//.test(lower);

export function detectTikTok(vfs) {
  return Boolean(
    vfs.find(/(^|\/)user_data(_tiktok)?\.json$/) ||
      vfs.find((e) => isTikTokTxt(e.lower) && TXT_RULES.some(([, re]) => re.test(e.lower))) ||
      vfs.find((e) => /\.txt$/.test(e.lower) && /tiktok/.test(e.source.toLowerCase())),
  );
}

function normalize(kind, rows) {
  const ts = (r) => parseDate(get(r, 'Date', 'date', 'Time', 'TimeStamp'));
  switch (kind) {
    case 'watch':
    case 'likes':
    case 'favorites':
    case 'posted':
    case 'shares':
    case 'offTiktok':
      return rows.map((r) => ({ ts: ts(r), link: get(r, 'Link', 'VideoLink', 'link') || '' }));
    case 'following':
    case 'followers':
    case 'blocked':
      return rows
        .map((r) => ({ u: String(get(r, 'UserName', 'Username', 'User Name') || '').trim(), ts: ts(r) }))
        .filter((r) => r.u);
    case 'searches':
      return rows
        .map((r) => ({ term: String(get(r, 'SearchTerm', 'Search Term', 'Term') || '').trim(), ts: ts(r) }))
        .filter((r) => r.term);
    case 'logins':
      return rows.map((r) => ({
        ts: ts(r),
        ip: get(r, 'IP') || '',
        device: [get(r, 'DeviceModel', 'Device Model'), get(r, 'DeviceSystem', 'Device System')].filter(Boolean).join(' · '),
        network: get(r, 'NetworkType', 'Network Type') || '',
        carrier: get(r, 'Carrier') || '',
      }));
    case 'comments':
      return rows.map((r) => ({ ts: ts(r), text: String(get(r, 'Comment', 'comment') || '') }));
    default:
      return rows;
  }
}

function fromJson(data) {
  const found = {};
  for (const [key, value, parent] of walk(data)) {
    if (!Array.isArray(value)) continue;
    for (const [id, keyRe, parentRe] of JSON_RULES) {
      if (!keyRe.test(key) || (parentRe && !parentRe.test(parent))) continue;
      if (id === 'following' && value.length && typeof value[0] !== 'object') continue;
      found[id] = (found[id] || []).concat(value);
      break;
    }
  }
  const profile = {};
  for (const [key, value] of walk(data)) {
    if (/^profilemap$/i.test(key) && value && typeof value === 'object') Object.assign(profile, value);
    if (/^adinterestcategories$/i.test(key) && typeof value === 'string') profile.adInterests = value;
  }
  return { found, profile };
}

function pickNumber(value) {
  const n = Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export async function parseTikTok(vfs, progress) {
  progress?.('Reading your TikTok history…', 0.2);
  let found = {};
  let profile = {};
  const jsonEntry = vfs.find(/(^|\/)user_data(_tiktok)?\.json$/);
  if (jsonEntry) {
    ({ found, profile } = fromJson(await jsonEntry.json()));
  } else {
    for (const entry of vfs.all((e) => /\.txt$/.test(e.lower))) {
      const rule = TXT_RULES.find(([, re]) => re.test(entry.lower));
      if (!rule) continue;
      found[rule[0]] = (found[rule[0]] || []).concat(parseKeyValueBlocks(await entry.text()));
    }
    const profileTxt = vfs.find(/profile( information)?\.txt$/);
    if (profileTxt) for (const block of parseKeyValueBlocks(await profileTxt.text())) Object.assign(profile, block);
  }
  progress?.('Measuring your screen time…', 0.6);

  const data = {};
  for (const [id] of JSON_RULES) data[id] = normalize(id, found[id] || []);
  data.watch = data.watch.filter((w) => w.ts).sort((a, b) => a.ts - b.ts);

  const adInterests = String(profile.adInterests || get(profile, 'Ad Interests') || '')
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    platform: 'tiktok',
    label: 'TikTok',
    account: {
      username: get(profile, 'userName', 'Username', 'User Name') || '',
      bio: get(profile, 'bioDescription', 'Bio Description') || '',
      followerCount: pickNumber(get(profile, 'followerCount', 'Follower Count')),
      followingCount: pickNumber(get(profile, 'followingCount', 'Following Count')),
      likesReceived: pickNumber(get(profile, 'likesReceived', 'Likes Received')),
    },
    lists: { followers: data.followers, following: data.following, blocked: data.blocked },
    watch: data.watch.map((w) => w.ts),
    // Every video with its link, for the Video finder.
    history: {
      watched: data.watch.filter((w) => w.link),
      liked: data.likes.filter((l) => l.ts && l.link),
      favorites: data.favorites.filter((f) => f.link),
      shared: data.shares.filter((s) => s.ts && s.link),
    },
    likes: data.likes.map((l) => l.ts).filter(Boolean),
    favorites: data.favorites.length,
    posted: data.posted.length,
    shares: data.shares.length,
    searches: data.searches,
    logins: data.logins,
    comments: data.comments,
    offTiktok: data.offTiktok.length,
    adInterests,
    hasRelationships: data.followers.length > 0 || data.following.length > 0,
  };
}
