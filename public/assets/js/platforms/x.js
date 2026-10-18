// X (Twitter) archive — data/*.js files of the form `window.YTD.name.part0 = [...]`.

import { parseDate } from '../core/text.js';

export function parseYtd(text) {
  const start = text.indexOf('=');
  if (start < 0) return [];
  try {
    const value = JSON.parse(text.slice(start + 1).trim().replace(/;\s*$/, ''));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

const dataFile = (name) => new RegExp(`(^|/)data/${name}(-part\\d+)?\\.js$`);

export function detectX(vfs) {
  return Boolean(vfs.find(dataFile('account')) || vfs.find(dataFile('tweets?')) || vfs.find(dataFile('follower')));
}

async function readAll(vfs, name) {
  const out = [];
  for (const entry of vfs.all(dataFile(name))) out.push(...parseYtd(await entry.text()));
  return out;
}

const n = (v) => Number(v) || 0;

// One-to-one DMs: per partner (by account ID — the archive has no names), who
// wrote how much, and chats where they wrote last and you never replied.
export function dmStats(rows, myId) {
  const partners = [];
  let sent = 0;
  for (const row of rows) {
    const msgs = (row.dmConversation?.messages || []).map((m) => m.messageCreate).filter(Boolean);
    if (!msgs.length) continue;
    const ids = String(row.dmConversation?.conversationId || '').split('-');
    const other = ids.find((id) => id !== myId) || msgs.find((m) => m.senderId !== myId)?.senderId || '';
    let mine = 0;
    let last = null;
    for (const m of msgs) {
      if (m.senderId === myId) mine++;
      const ts = parseDate(m.createdAt);
      if (!last || ts > last.ts) last = { ts, mine: m.senderId === myId };
    }
    sent += mine;
    partners.push({ id: other, messages: msgs.length, sent: mine, received: msgs.length - mine, ts: last.ts, unanswered: !last.mine && mine === 0 });
  }
  partners.sort((a, b) => b.messages - a.messages);
  return { sent, partners, unanswered: partners.filter((p) => p.unanswered).sort((a, b) => b.ts - a.ts) };
}

// The accounts you reply to and mention most: your real circle on X.
export function circleOf(tweets, me = '') {
  const self = String(me).toLowerCase();
  const counts = new Map();
  const add = (u, kind) => {
    const k = String(u || '').toLowerCase();
    if (!k || k === self) return;
    const v = counts.get(k) || { key: `@${u}`, count: 0, replies: 0, mentions: 0 };
    v.count++;
    v[kind]++;
    counts.set(k, v);
  };
  for (const t of tweets) {
    if (t.isRT) continue;
    if (t.replyTo) add(t.replyTo, 'replies');
    for (const m of new Set(t.mentions)) if (String(m).toLowerCase() !== String(t.replyTo).toLowerCase()) add(m, 'mentions');
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 50);
}

// Average likes per own post, per year: is your reach growing?
export function reachByYear(tweets) {
  const years = new Map();
  for (const t of tweets) {
    if (t.isRT || t.isReply || !t.ts) continue;
    const y = String(new Date(t.ts).getFullYear());
    const v = years.get(y) || { posts: 0, likes: 0, rts: 0 };
    v.posts++;
    v.likes += t.likes;
    v.rts += t.rts;
    years.set(y, v);
  }
  return [...years.entries()].sort().map(([year, v]) => ({ year, posts: v.posts, avgLikes: v.posts ? v.likes / v.posts : 0, avgRts: v.posts ? v.rts / v.posts : 0 }));
}

export async function parseX(vfs, progress) {
  progress?.('Opening your X archive…', 0.15);
  const accountRow = (await readAll(vfs, 'account'))[0]?.account || {};
  const profile = (await readAll(vfs, 'profile'))[0]?.profile || {};

  const followers = (await readAll(vfs, 'follower')).map((r) => ({ id: String(r.follower?.accountId || '') })).filter((r) => r.id);
  const following = (await readAll(vfs, 'following')).map((r) => ({ id: String(r.following?.accountId || '') })).filter((r) => r.id);
  const blocked = (await readAll(vfs, 'block')).length;
  const muted = (await readAll(vfs, 'mute')).length;

  progress?.('Reading your tweets…', 0.35);
  const rawTweets = [...(await readAll(vfs, 'tweets')), ...(await readAll(vfs, 'tweet'))];
  const seen = new Set();
  const tweets = [];
  for (const row of rawTweets) {
    const t = row.tweet || row;
    const id = String(t.id_str || t.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const text = String(t.full_text || t.text || '');
    tweets.push({
      id,
      text,
      ts: parseDate(t.created_at),
      likes: n(t.favorite_count),
      rts: n(t.retweet_count),
      isReply: Boolean(t.in_reply_to_status_id_str || t.in_reply_to_screen_name),
      replyTo: t.in_reply_to_screen_name || '',
      isRT: text.startsWith('RT @'),
      hashtags: (t.entities?.hashtags || []).map((h) => h.text).filter(Boolean),
      mentions: (t.entities?.user_mentions || []).map((m) => m.screen_name).filter(Boolean),
    });
  }
  tweets.sort((a, b) => a.ts - b.ts);

  const likes = (await readAll(vfs, 'like')).map((r) => ({ text: String(r.like?.fullText || '') }));

  progress?.('Checking what X knows about you…', 0.65);
  const p13n = (await readAll(vfs, 'personalization'))[0]?.p13nData || {};
  const interests = (p13n.interests?.interests || []).filter((i) => !i.isDisabled).map((i) => i.name).filter(Boolean);
  const advertisersListed = [
    ...(p13n.interests?.audienceAndAdvertisers?.advertisers || []),
    ...(p13n.interests?.audienceAndAdvertisers?.lookalikeAdvertisers || []),
  ];
  const inferred = {
    age: (p13n.inferredAgeInfo?.age || []).join(', '),
    gender: p13n.demographics?.genderInfo?.gender || '',
    languages: (p13n.demographics?.languages || []).filter((l) => !l.isDisabled).map((l) => l.language),
  };

  const advertisers = new Map();
  const targeting = new Map();
  let adImpressions = 0;
  for (const name of ['ad-impressions', 'ad-engagements']) {
    for (const row of await readAll(vfs, name)) {
      const data = row.ad?.adsUserData || {};
      const list = data.adImpressions?.impressions || data.adEngagements?.engagements || [];
      for (const item of list) {
        const attrs = item.impressionAttributes || item;
        adImpressions++;
        const adv = attrs.advertiserInfo?.advertiserName;
        if (adv) advertisers.set(adv, (advertisers.get(adv) || 0) + 1);
        for (const c of attrs.matchedTargetingCriteria || []) {
          const key = `${c.targetingType}${c.targetingValue ? ` · ${c.targetingValue}` : ''}`;
          targeting.set(key, (targeting.get(key) || 0) + 1);
        }
      }
    }
  }
  for (const name of advertisersListed) if (!advertisers.has(name)) advertisers.set(name, 0);

  const logins = (await readAll(vfs, 'ip-audit'))
    .map((r) => ({ ts: parseDate(r.ipAudit?.createdAt), ip: r.ipAudit?.loginIp || '' }))
    .filter((r) => r.ip);
  const apps = (await readAll(vfs, 'connected-application')).map((r) => {
    const a = r.connectedApplication || {};
    return { name: a.name || 'Unknown app', org: a.organization?.name || '', approvedAt: parseDate(a.approvedAt), permissions: a.permissions || [] };
  });

  let dmConversations = 0;
  let dmMessages = 0;
  const dmRows = [];
  for (const name of ['direct-messages', 'direct-messages-group']) {
    for (const row of await readAll(vfs, name)) {
      dmConversations++;
      dmMessages += (row.dmConversation?.messages || []).length;
      if (name === 'direct-messages') dmRows.push(row);
    }
  }
  const myId = String(accountRow.accountId || '');

  return {
    platform: 'x',
    label: 'X',
    account: {
      username: accountRow.username || '',
      name: accountRow.accountDisplayName || '',
      id: accountRow.accountId || '',
      createdAt: parseDate(accountRow.createdAt),
      bio: profile.description?.bio || '',
    },
    lists: { followers, following },
    blocked,
    muted,
    tweets,
    likes,
    interests,
    inferred,
    advertisers: [...advertisers.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    targeting: [...targeting.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([key, count]) => ({ key, count })),
    adImpressions,
    logins,
    apps,
    dms: { conversations: dmConversations, messages: dmMessages, ...dmStats(dmRows, myId) },
    circle: circleOf(tweets, accountRow.username),
    reach: reachByYear(tweets),
    hasRelationships: followers.length > 0 || following.length > 0,
  };
}
