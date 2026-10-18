// Facebook "Download your information" (JSON).

import { fixMeta, toMs } from '../core/text.js';
import { firstArray, metaRecords } from './meta-common.js';
import { readMessages } from './instagram.js';

const FILES = [
  ['friends', /(^|\/)(your_)?friends\.json$/],
  ['removed', /(^|\/)removed_friends\.json$/],
  ['sentRequests', /(^|\/)sent_friend_requests\.json$/],
  ['receivedRequests', /(^|\/)received_friend_requests\.json$/],
  ['rejected', /(^|\/)rejected_friend_requests\.json$/],
  ['following', /(^|\/)(who_you('|’)?ve_followed|who_you_follow|following)\.json$/],
];

const isFacebook = (lower) => /(^|\/)(connections\/friends|friends_and_followers|friends)\//.test(lower) || /your_facebook_activity/.test(lower);

export function detectFacebook(vfs) {
  return Boolean(vfs.find((e) => isFacebook(e.lower) && /friends\.json$/.test(e.lower)) || vfs.find(/your_facebook_activity\//));
}

function people(json) {
  return metaRecords(json)
    .map((r) => ({ name: fixMeta(r.title || r.values.Name || r.value || ''), ts: r.ts }))
    .filter((p) => p.name);
}

async function readJson(vfs, re) {
  const entry = vfs.find((e) => re.test(e.lower) && (isFacebook(e.lower) || /facebook/.test(e.source.toLowerCase())));
  if (!entry) return null;
  try {
    return await entry.json();
  } catch {
    return null;
  }
}

const yearOf = (sec) => (sec ? String(new Date(sec * 1000).getFullYear()) : '');

// Your own activity: posts, comments, reactions (by type) and groups joined.
export async function activityOf(vfs) {
  const out = { posts: 0, comments: 0, reactions: 0, groups: [], reactionTypes: {}, byYear: {}, firstPost: null };
  const year = (sec, kind) => {
    const y = yearOf(sec);
    if (!y) return;
    out.byYear[y] = out.byYear[y] || { posts: 0, comments: 0, reactions: 0 };
    out.byYear[y][kind]++;
  };
  for (const e of vfs.all((x) => isFacebook(x.lower) && /(^|\/)your_posts[^/]*\.json$/.test(x.lower))) {
    let json;
    try {
      json = await e.json();
    } catch {
      continue;
    }
    for (const p of Array.isArray(json) ? json : firstArray(json)) {
      out.posts++;
      year(p.timestamp, 'posts');
      const text = fixMeta((p.data || []).map((d) => d.post).filter(Boolean).join(' '));
      if (p.timestamp && text && (!out.firstPost || p.timestamp < out.firstPost.ts / 1000)) out.firstPost = { ts: p.timestamp * 1000, text: text.slice(0, 200) };
    }
  }
  const comments = await readJson(vfs, /(^|\/)comments\.json$/);
  for (const c of comments ? firstArray(comments) : []) {
    out.comments++;
    year(c.timestamp, 'comments');
  }
  for (const e of vfs.all((x) => isFacebook(x.lower) && /(^|\/)(likes_and_reactions|posts_and_comments)(_\d+)?\.json$/.test(x.lower))) {
    let json;
    try {
      json = await e.json();
    } catch {
      continue;
    }
    for (const r of Array.isArray(json) ? json : firstArray(json)) {
      out.reactions++;
      year(r.timestamp, 'reactions');
      const type = String(r.data?.[0]?.reaction?.reaction || metaRecords([r])[0]?.values?.Reaction || '').toUpperCase();
      if (type) out.reactionTypes[type] = (out.reactionTypes[type] || 0) + 1;
    }
  }
  const groups = await readJson(vfs, /(^|\/)your_group_membership_activity\.json$/);
  if (groups) out.groups = firstArray(groups).map((g) => ({ name: fixMeta(g.title || g.name || metaRecords([g])[0]?.title || ''), ts: (g.timestamp || 0) * 1000 })).filter((g) => g.name);
  return out;
}

export async function parseFacebook(vfs, progress) {
  progress?.('Reading your Facebook friends…', 0.3);
  const lists = {};
  for (const [key, re] of FILES) {
    const json = await readJson(vfs, re);
    lists[key] = json ? people(json) : [];
  }

  const profile = await readJson(vfs, /profile_information\.json$/);
  const name = fixMeta(profile?.profile_v2?.name?.full_name || profile?.profile?.name?.full_name || '');
  const createdAt = toMs(profile?.profile_v2?.registration_timestamp || profile?.profile?.registration_timestamp);

  progress?.('Looking at advertisers…', 0.7);
  const advertisersJson = await readJson(vfs, /advertisers_using_your_activity_or_information\.json$/);
  const advertisers = advertisersJson
    ? firstArray(advertisersJson)
        .map((a) => fixMeta(a.advertiser_name || metaRecords([a])[0]?.values['Advertiser name'] || a.title || ''))
        .filter(Boolean)
    : [];

  const offJson = await readJson(vfs, /off[-_]facebook_activity\.json$|activity_off_meta_technologies\.json$/);
  let offCompanies = 0;
  let offEvents = 0;
  for (const item of offJson ? firstArray(offJson) : []) {
    offCompanies++;
    offEvents += Array.isArray(item.events) ? item.events.length : 1;
  }

  progress?.('Reading your Messenger chats…', 0.85);
  const messages = await readMessages(vfs, name, null, { facebook: true });

  progress?.('Reading your posts and reactions…', 0.92);
  const posted = await activityOf(vfs);

  return {
    posted,
    platform: 'facebook',
    label: 'Facebook',
    account: { name, createdAt },
    lists,
    advertisers,
    activity: messages ? { messages } : null,
    offFacebook: { companies: offCompanies, events: offEvents },
    hasRelationships: lists.friends.length > 0,
  };
}
