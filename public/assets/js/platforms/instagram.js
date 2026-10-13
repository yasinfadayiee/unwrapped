// Instagram (and Threads) "Download your information" exports — JSON or HTML.

import { describeUserAgent, fixMeta, parseDate, toMs } from '../core/text.js';
import { chatStats, conversationDynamics } from '../core/lab.js';
import {
  dedupeUsers,
  firstArray,
  metaRecords,
  relationshipsFromHtml,
  relationshipsFromJson,
  stripExt,
} from './meta-common.js';

const REL_FILES = [
  ['followers', /^followers(_\d+)?$/],
  ['following', /^following$/],
  ['closeFriends', /^close_friends$/],
  ['blocked', /^blocked_(profiles|accounts)$/],
  ['restricted', /^restricted_(profiles|accounts)$/],
  ['pendingSent', /^pending_follow_requests$/],
  ['recentRequests', /^recent_follow_requests$/],
  ['requestsReceived', /^follow_requests_you'?ve_received$/],
  ['youUnfollowed', /^recently_unfollowed_(profiles|accounts)$/],
  ['removedSuggestions', /^removed_suggestions$/],
  ['hideStoryFrom', /^hide_story_from$/],
  ['favorites', /^profiles_you'?ve_favorited$/],
];

const isThreadsPath = (lower) => /(^|\/)threads(\/|_)/.test(lower);
const isFacebookPath = (lower) => /your_facebook_activity|\/friends\/|facebook-/.test(lower);

function relEntries(vfs, threads) {
  return vfs.all((e) => {
    if (!/\.(json|html?)$/.test(e.lower)) return false;
    if (isFacebookPath(e.lower)) return false;
    if (isThreadsPath(e.lower) !== threads) return false;
    const base = stripExt(e.name);
    return REL_FILES.some(([, re]) => re.test(base));
  });
}

// Your own posts, stories and reels: content/ in older exports, media/ in newer ones.
const MEDIA_FILE = /(^|\/)(content|media)\/(posts_\d+|stories|reels|archived_posts|profile_photos|igtv_videos)\.json$/;

export function detectInstagram(vfs) {
  return (
    relEntries(vfs, false).some((e) => /^followers(_\d+)?$|^following$/.test(stripExt(e.name))) ||
    Boolean(vfs.find((e) => MEDIA_FILE.test(e.lower) && !isFacebookPath(e.lower))) ||
    Boolean(vfs.find(/(^|\/)your_instagram_activity\//)) ||
    Boolean(vfs.find((e) => /personal_information\.json$/.test(e.lower) && /instagram/.test(e.source.toLowerCase())))
  );
}

export function detectThreads(vfs) {
  return relEntries(vfs, true).some((e) => /^followers(_\d+)?$|^following$/.test(stripExt(e.name)));
}

async function readLists(vfs, threads) {
  const lists = Object.fromEntries(REL_FILES.map(([key]) => [key, []]));
  for (const entry of relEntries(vfs, threads)) {
    const base = stripExt(entry.name);
    const [key] = REL_FILES.find(([, re]) => re.test(base));
    try {
      const items = /\.html?$/.test(entry.lower)
        ? relationshipsFromHtml(await entry.text())
        : relationshipsFromJson(await entry.json());
      lists[key].push(...items);
    } catch (err) {
      console.warn('Could not read', entry.path, err);
    }
  }
  for (const key of Object.keys(lists)) lists[key] = dedupeUsers(lists[key]);
  return lists;
}

async function readJson(vfs, re) {
  const entry = vfs.find((e) => re.test(e.lower) && !isFacebookPath(e.lower));
  if (!entry) return null;
  try {
    return await entry.json();
  } catch {
    return null;
  }
}

async function readAccount(vfs) {
  const account = { username: '', name: '', private: null, createdAt: 0 };
  const info = await readJson(vfs, /personal_information\.json$/);
  if (info) {
    const rec = metaRecords(info.profile_user || info)[0];
    if (rec) {
      account.username = rec.values.Username || '';
      account.name = rec.values.Name || '';
      const priv = rec.values['Private Account'] ?? rec.values['Private account'];
      if (priv !== undefined) account.private = /true|yes/i.test(priv);
    }
  }
  const signup = await readJson(vfs, /signup_(information|details)\.json$/);
  if (signup) {
    const rec = metaRecords(signup)[0];
    if (rec) {
      account.createdAt = rec.ts || parseDate(rec.values.Time);
      if (!account.username) account.username = rec.values.Username || '';
    }
  }
  return account;
}

function monthKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function tally(records, authorOf) {
  const byAuthor = new Map();
  const lastBy = new Map();
  const byMonth = new Map();
  for (const r of records) {
    const a = authorOf(r);
    if (a) {
      byAuthor.set(a, (byAuthor.get(a) || 0) + 1);
      if (r.ts) lastBy.set(a, Math.max(lastBy.get(a) || 0, r.ts));
    }
    if (r.ts) byMonth.set(monthKey(r.ts), (byMonth.get(monthKey(r.ts)) || 0) + 1);
  }
  const ranked = [...byAuthor.entries()].sort((a, b) => b[1] - a[1]);
  return {
    total: records.length,
    top: ranked.slice(0, 25).map(([key, count]) => ({ key, count })),
    // Every account, for the Engagement Audit.
    authors: ranked.map(([key, count]) => ({ key, count, last: lastBy.get(key) || 0 })),
    byMonth: [...byMonth.entries()].sort().map(([month, count]) => ({ month, count })),
  };
}

// Instagram and Facebook (Messenger) store DMs in the same format; only the folders differ.
export async function readMessages(vfs, selfName, progress, { facebook = false } = {}) {
  const files = facebook
    ? vfs.all((e) => /messages\/(inbox|archived_threads|e2ee_cutover|filtered_threads)\/[^/]+\/message_\d+\.json$/.test(e.lower) && isFacebookPath(e.lower))
    : vfs.all((e) => /messages\/inbox\/[^/]+\/message_\d+\.json$/.test(e.lower) && !isFacebookPath(e.lower));
  if (!files.length) return null;
  const threads = new Map();
  const senders = new Map();
  const byHour = new Array(24).fill(0);
  let i = 0;
  for (const file of files) {
    if (++i % 25 === 0 && progress) progress(`Reading messages… ${i}/${files.length}`, i / files.length);
    let data;
    try {
      data = await file.json();
    } catch {
      continue;
    }
    const folder = file.path.split('/').slice(-2, -1)[0];
    const t = threads.get(folder) || {
      title: fixMeta(data.title || folder),
      participants: (data.participants || []).map((p) => fixMeta(p.name)),
      count: 0,
      sent: 0,
      first: Infinity,
      last: 0,
      files: [],
    };
    // Kept so the Message viewer can read the full text later, on demand.
    t.files.push(file);
    for (const msg of data.messages || []) {
      const sender = fixMeta(msg.sender_name || '');
      senders.set(sender, (senders.get(sender) || 0) + 1);
      t.count++;
      t.senders = t.senders || new Map();
      t.senders.set(sender, (t.senders.get(sender) || 0) + 1);
      const ts = toMs(msg.timestamp_ms);
      (t.log = t.log || []).push([ts, sender]);
      if (ts) {
        t.first = Math.min(t.first, ts);
        t.last = Math.max(t.last, ts);
        byHour[new Date(ts).getHours()]++;
      }
    }
    threads.set(folder, t);
  }
  // You are whoever appears in the most threads.
  let me = selfName;
  if (!me) {
    const presence = new Map();
    for (const t of threads.values()) for (const p of t.participants) presence.set(p, (presence.get(p) || 0) + 1);
    me = [...presence.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }
  let total = 0;
  let sent = 0;
  const list = [];
  let latest = 0;
  for (const t of threads.values()) latest = Math.max(latest, t.last);
  const W = 90 * 86_400_000;
  // When people message you, by weekday (Monday first) and hour — for Best Time to Post.
  const inHeat = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const t of threads.values()) {
    t.sent = t.senders?.get(me) || 0;
    total += t.count;
    sent += t.sent;
    const isGroup = t.participants.length > 2;
    // Activity in the last 90 days vs the 90 days before, and who carried it.
    let recent = 0;
    let previous = 0;
    let recentMine = 0;
    for (const [ts, s] of t.log || []) {
      if (ts > latest - W) {
        recent++;
        if (s === me) recentMine++;
      } else if (ts > latest - 2 * W) previous++;
      if (ts && s !== me) {
        const d = new Date(ts);
        inHeat[(d.getDay() + 6) % 7][d.getHours()]++;
      }
    }
    list.push({
      title: t.title,
      isGroup,
      count: t.count,
      sent: t.sent,
      received: t.count - t.sent,
      first: Number.isFinite(t.first) ? t.first : 0,
      last: t.last,
      recent,
      previous,
      recentMine,
      dynamics: isGroup ? null : conversationDynamics(t.log, me, latest),
      chat: isGroup ? null : chatStats(t.log),
      load: () => loadThread(t.files, vfs),
    });
  }
  list.sort((a, b) => b.count - a.count);
  return { me, total, sent, received: total - sent, threads: list.slice(0, 50), all: list.filter((t) => !t.isGroup), every: list, latest, threadCount: list.length, byHour, inHeat };
}

// Media in the export is referenced by a path inside the archive.
function mediaFinder(vfs) {
  return (uri) => {
    if (!uri || /^https?:/i.test(uri)) return null;
    const tail = uri.replace(/\\/g, '/').toLowerCase().split('/').slice(-3).join('/');
    return vfs.find((e) => e.lower.endsWith(tail)) || null;
  };
}

// Every message of one conversation, oldest first, with text and media references.
async function loadThread(files, vfs) {
  const findMedia = mediaFinder(vfs);
  const messages = [];
  for (const file of files) {
    let data;
    try {
      data = await file.json();
    } catch {
      continue;
    }
    for (const m of data.messages || []) {
      const media = [
        ...(m.photos || []).map((p) => ({ kind: 'photo', entry: findMedia(p.uri) })),
        ...(m.videos || []).map((p) => ({ kind: 'video', entry: findMedia(p.uri) })),
        ...(m.audio_files || []).map((p) => ({ kind: 'audio', entry: findMedia(p.uri) })),
      ];
      messages.push({
        ts: toMs(m.timestamp_ms),
        sender: fixMeta(m.sender_name || ''),
        text: m.content ? fixMeta(m.content) : '',
        link: m.share?.link || '',
        media,
        reactions: (m.reactions || []).map((r) => fixMeta(r.reaction || '')).filter(Boolean),
        unsent: Boolean(m.is_unsent),
      });
    }
  }
  return messages.sort((a, b) => a.ts - b.ts);
}

async function readActivity(vfs, account, progress) {
  const likes = await readJson(vfs, /liked_posts\.json$/);
  const comments = vfs.all((e) => /(post|reels)_comments(_\d+)?\.json$/.test(e.lower) && !isFacebookPath(e.lower));
  const storyLikes = await readJson(vfs, /story_likes\.json$/);
  const saved = await readJson(vfs, /saved_posts\.json$/);

  const commentRecs = [];
  for (const entry of comments) {
    try {
      commentRecs.push(...metaRecords(await entry.json()));
    } catch {
      /* skip unreadable file */
    }
  }
  const likeRecs = likes ? metaRecords(likes) : [];
  const savedRecs = saved ? metaRecords(saved) : [];
  const ownerOfComment = (r) => r.values['Media Owner'] || r.values['Media owner'] || r.title;
  const activity = {
    likes: likes ? tally(likeRecs, (r) => r.title) : null,
    comments: commentRecs.length ? tally(commentRecs, ownerOfComment) : null,
    storyLikes: storyLikes ? tally(metaRecords(storyLikes), (r) => r.title) : null,
    saved: saved ? tally(savedRecs, (r) => r.title) : null,
    messages: await readMessages(vfs, account.name, progress),
    // Every item with its link, for the Likes & comments finder.
    items: {
      liked: likeRecs.map((r) => ({ ts: r.ts, owner: r.title, href: r.href })),
      saved: savedRecs.map((r) => ({ ts: r.ts, owner: r.title, href: r.href })),
      comments: commentRecs.map((r) => ({ ts: r.ts, owner: ownerOfComment(r), text: r.values.Comment || r.values.comment || '', href: r.href })),
    },
  };
  const { items, ...rest } = activity;
  return Object.values(rest).some(Boolean) ? activity : null;
}

async function readPrivacy(vfs) {
  const privacy = {};

  const advertisers = await readJson(vfs, /advertisers_using_your_activity_or_information\.json$/);
  if (advertisers) {
    privacy.advertisers = firstArray(advertisers)
      .map((a) => ({
        name: fixMeta(a.advertiser_name || a.title || metaRecords([a])[0]?.values['Advertiser name'] || ''),
        dataFile: Boolean(a.has_data_file_custom_audience),
        remarketing: Boolean(a.has_remarketing_custom_audience),
        inStore: Boolean(a.has_in_person_store_visit),
      }))
      .filter((a) => a.name);
  }

  const topics = (await readJson(vfs, /(your_topics|recommended_topics)\.json$/)) || null;
  if (topics) privacy.topics = metaRecords(topics).map((r) => r.values.Name || r.title).filter(Boolean);
  const interests = await readJson(vfs, /ads_interests\.json$/);
  if (interests) privacy.interests = metaRecords(interests).map((r) => r.values.Interest || r.title).filter(Boolean);

  for (const [key, re] of [
    ['adsViewed', /ads_viewed\.json$/],
    ['postsViewed', /posts_viewed\.json$/],
    ['videosWatched', /videos_watched\.json$/],
    ['adsClicked', /ads_clicked\.json$/],
  ]) {
    const json = await readJson(vfs, re);
    if (json) privacy[key] = firstArray(json).length;
  }

  const logins = await readJson(vfs, /login_activity\.json$/);
  if (logins) {
    const recs = metaRecords(logins);
    const ips = new Map();
    const devices = new Map();
    let first = Infinity;
    let last = 0;
    for (const r of recs) {
      const ip = r.values['IP Address'] || r.values['IP address'];
      if (ip) ips.set(ip, (ips.get(ip) || 0) + 1);
      const device = describeUserAgent(r.values['User Agent'] || r.values['User agent']);
      devices.set(device, (devices.get(device) || 0) + 1);
      const ts = r.ts || parseDate(r.values.Time);
      if (ts) {
        first = Math.min(first, ts);
        last = Math.max(last, ts);
      }
    }
    privacy.logins = {
      count: recs.length,
      ips: ips.size,
      devices: [...devices.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      first: Number.isFinite(first) ? first : 0,
      last,
    };
  }

  const searchFiles = vfs.all((e) => /(word_or_phrase|account|keyword|tag)_searches\.json$|recent_searches\.json$/.test(e.lower) && !isFacebookPath(e.lower));
  const searches = [];
  for (const entry of searchFiles) {
    try {
      for (const r of metaRecords(await entry.json())) {
        const term = r.values.Search || r.values.search || r.title || r.value;
        if (term) searches.push({ term, ts: r.ts });
      }
    } catch {
      /* skip */
    }
  }
  if (searches.length) privacy.searches = searches.sort((a, b) => b.ts - a.ts);
  return Object.keys(privacy).length ? privacy : null;
}

const MEDIA_KIND = { posts: 'post', stories: 'story', reels: 'reel', archived_posts: 'archived', profile_photos: 'profile', igtv_videos: 'reel' };

// Every photo/video you posted, with its caption and date, oldest data first.
async function readMedia(vfs) {
  const findMedia = mediaFinder(vfs);
  const items = [];
  const seen = new Set();
  for (const file of vfs.all((e) => MEDIA_FILE.test(e.lower) && !isFacebookPath(e.lower))) {
    const kind = MEDIA_KIND[file.name.replace(/(_\d+)?\.json$/i, '').toLowerCase()] || 'post';
    let data;
    try {
      data = await file.json();
    } catch {
      continue;
    }
    // Walk the JSON: any object with a media `uri` is one photo or video; a
    // post's caption and date sit on its parent when the media has none.
    const visit = (node, parent) => {
      if (Array.isArray(node)) return node.forEach((n) => visit(n, parent));
      if (!node || typeof node !== 'object') return;
      if (typeof node.uri === 'string' && /\.(jpe?g|png|webp|heic|gif|mp4|mov|srt|svg)$/i.test(node.uri)) {
        if (seen.has(node.uri) || /\.srt$/i.test(node.uri)) return;
        seen.add(node.uri);
        const entry = findMedia(node.uri);
        items.push({
          kind,
          video: /\.(mp4|mov)$/i.test(node.uri),
          ts: toMs(node.creation_timestamp || parent?.creation_timestamp),
          caption: fixMeta(node.title || parent?.title || ''),
          entry,
        });
        return;
      }
      for (const v of Object.values(node)) visit(v, Array.isArray(node.media) ? node : parent);
    };
    visit(data, null);
  }
  if (!items.length) return null;
  return items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

export async function parseInstagram(vfs, progress) {
  progress?.('Reading followers & following…', 0.1);
  const lists = await readLists(vfs, false);
  const account = await readAccount(vfs);
  progress?.('Reading your activity…', 0.4);
  const activity = await readActivity(vfs, account, progress);
  progress?.('Running the privacy X-ray…', 0.8);
  const privacy = await readPrivacy(vfs);
  const media = await readMedia(vfs);
  return {
    platform: 'instagram',
    label: 'Instagram',
    account,
    lists,
    activity,
    privacy,
    media,
    hasRelationships: lists.followers.length > 0 || lists.following.length > 0,
  };
}

export async function parseThreads(vfs) {
  const lists = await readLists(vfs, true);
  return {
    platform: 'threads',
    label: 'Threads',
    account: { username: '', name: '' },
    lists,
    activity: null,
    privacy: null,
    hasRelationships: lists.followers.length > 0 || lists.following.length > 0,
  };
}
