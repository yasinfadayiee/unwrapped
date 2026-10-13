// "Your history with anyone": everything one export (plus your saved
// snapshots) knows about a single person, gathered under one key.

import { personKey } from './insights.js';

// Lists that say something about you and that person.
const LISTS = ['closeFriends', 'favorites', 'blocked', 'restricted', 'hideStoryFrom', 'pendingSent', 'requestsReceived', 'recentRequests', 'youUnfollowed', 'removedSuggestions', 'removed', 'sentRequests', 'receivedRequests', 'rejected'];
const squash = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function buildPeopleIndex(ds, snapshots = []) {
  const people = new Map();
  const nameOf = (item) => item.u || item.name || item.id || '';
  const get = (key, name) => {
    if (!people.has(key)) people.set(key, { key, name: name || key, follower: null, following: null, lists: new Set(), activity: {}, thread: null, history: [] });
    const p = people.get(key);
    if (name && p.name === key) p.name = name;
    return p;
  };
  const L = ds.lists || {};
  const primary = ds.platform === 'facebook' ? L.friends || [] : L.followers || [];
  for (const item of primary) get(personKey(ds.platform, item), nameOf(item)).follower = item.ts || 0;
  for (const item of L.following || []) get(personKey(ds.platform, item), nameOf(item)).following = item.ts || 0;
  for (const list of LISTS) for (const item of L[list] || []) get(personKey(ds.platform, item), nameOf(item)).lists.add(list);

  // Likes, comments, story likes and saves you gave them (Instagram).
  const act = ds.activity || {};
  for (const kind of ['likes', 'comments', 'storyLikes', 'saved']) {
    for (const a of act[kind]?.authors || []) {
      if (!a.key) continue;
      get(String(a.key).toLowerCase(), a.key).activity[kind] = { count: a.count, last: a.last };
    }
  }

  // 1:1 chats: Instagram folders start with the other person's username;
  // Facebook (and many Instagram) chats are titled with their name.
  const threads = (act.messages?.every || act.messages?.threads || []).filter((t) => !t.isGroup);
  if (threads.length) {
    const byKey = new Map();
    for (const p of people.values()) {
      byKey.set(squash(p.key), p);
      byKey.set(squash(p.name), p);
    }
    for (const t of threads) {
      const fromFolder = squash(String(t.folder || '').replace(/_\d+$/, ''));
      const p = byKey.get(fromFolder) || byKey.get(squash(t.title));
      if (p && (!p.thread || t.count > p.thread.count)) p.thread = t;
    }
  }

  // When they followed / unfollowed you, between your saved snapshots.
  const snaps = [...snapshots].sort((a, b) => a.takenAt - b.takenAt);
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1];
    const cur = snaps[i];
    const pf = new Set(prev.followers);
    const cf = new Set(cur.followers);
    const pg = new Set(prev.following);
    const cg = new Set(cur.following);
    const label = (k) => cur.labels?.[k] || prev.labels?.[k] || k;
    const add = (k, type) => get(k, label(k)).history.push({ type, from: prev.takenAt, to: cur.takenAt });
    for (const k of prev.followers) if (!cf.has(k)) add(k, 'unfollowedYou');
    for (const k of cur.followers) if (!pf.has(k)) add(k, 'followedYou');
    for (const k of prev.following) if (!cg.has(k)) add(k, 'youUnfollowed');
    for (const k of cur.following) if (!pg.has(k)) add(k, 'youFollowed');
  }
  return people;
}

// How much you engage with someone: likes + comments ×3 + story likes ×2.
export const engagementScore = (p) => (p.activity.likes?.count || 0) + 3 * (p.activity.comments?.count || 0) + 2 * (p.activity.storyLikes?.count || 0);

export function relationOf(p) {
  if (p.follower !== null && p.following !== null) return 'mutual';
  if (p.follower !== null) return 'fan';
  if (p.following !== null) return 'notBack';
  return 'none';
}

// Suggestions for the empty lookup screen.
export function interestingPeople(people) {
  const all = [...people.values()];
  return {
    engaged: all.filter((p) => engagementScore(p) > 0).sort((a, b) => engagementScore(b) - engagementScore(a)).slice(0, 8),
    chats: all.filter((p) => p.thread).sort((a, b) => b.thread.count - a.thread.count).slice(0, 8),
    left: all.filter((p) => p.history.some((h) => h.type === 'unfollowedYou')).sort((a, b) => b.history.at(-1).to - a.history.at(-1).to).slice(0, 8),
    oldest: all.filter((p) => relationOf(p) === 'mutual' && p.follower).sort((a, b) => Math.max(a.follower, a.following || 0) - Math.max(b.follower, b.following || 0)).slice(0, 8),
  };
}

// Prefix matches first, then anywhere in the name.
export function searchPeople(people, query, limit = 8) {
  const q = String(query || '').trim().toLowerCase().replace(/^@/, '');
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const p of people.values()) {
    const name = p.name.toLowerCase();
    if (name.startsWith(q) || p.key.startsWith(q)) starts.push(p);
    else if (name.includes(q)) contains.push(p);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
