// Follower snapshots, stored only in this browser (IndexedDB). Comparing a new
// export with an older one is how "who unfollowed you" works without a login.

import { personKey } from '../core/insights.js';

const DB_NAME = 'unwrapped';
const STORE = 'snapshots';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('acct', 'acct');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const result = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(result?.result ?? result);
        t.onerror = () => reject(t.error);
      }),
  );
}

export function accountId(ds) {
  const who = ds.account?.username || ds.account?.name || ds.account?.id || 'me';
  return `${ds.platform}:${String(who).toLowerCase()}`;
}

export function snapshotFromDataset(ds) {
  const followers = ds.platform === 'facebook' ? ds.lists.friends : ds.lists.followers || [];
  const following = ds.platform === 'facebook' ? [] : ds.lists.following || [];
  const keyOf = (item) => personKey(ds.platform, item);
  const labels = {};
  for (const item of [...followers, ...following]) labels[keyOf(item)] = item.u || item.name || item.id;
  return {
    acct: accountId(ds),
    platform: ds.platform,
    account: ds.account?.username || ds.account?.name || '',
    takenAt: ds.exportedAt || Date.now(),
    followers: followers.map(keyOf),
    following: following.map(keyOf),
    labels,
    removed: ds.platform === 'facebook' ? (ds.lists.removed || []).map((p) => p.name.toLowerCase()) : [],
  };
}

export async function listSnapshots(acct) {
  try {
    const all = await tx('readonly', (store) => store.index('acct').getAll(acct));
    return (all || []).sort((a, b) => a.takenAt - b.takenAt);
  } catch {
    return [];
  }
}

// Saves unless an identical snapshot (same export time and counts) exists.
export async function saveSnapshot(snap) {
  try {
    const existing = await listSnapshots(snap.acct);
    const dupe = existing.find(
      (s) =>
        Math.abs(s.takenAt - snap.takenAt) < 120_000 &&
        s.followers.length === snap.followers.length &&
        s.following.length === snap.following.length,
    );
    if (dupe) return dupe.id;
    return await tx('readwrite', (store) => store.add(snap));
  } catch {
    return null;
  }
}

export async function deleteSnapshot(id) {
  return tx('readwrite', (store) => store.delete(id));
}

export async function deleteAllSnapshots() {
  return tx('readwrite', (store) => store.clear());
}

// Backup file: every snapshot of every account, without the local ids.
export async function exportSnapshots() {
  let all = [];
  try {
    all = await tx('readonly', (store) => store.getAll());
  } catch {
    /* no storage */
  }
  return { app: 'unwrapped', kind: 'snapshots', version: 1, exportedAt: Date.now(), snapshots: (all || []).map(({ id, ...rest }) => rest) };
}

// Restores a backup; snapshots that are already here are skipped by saveSnapshot.
export async function importSnapshots(backup) {
  if (backup?.app !== 'unwrapped' || !Array.isArray(backup.snapshots)) throw new Error('Not a backup');
  let added = 0;
  for (const s of backup.snapshots) {
    if (typeof s?.acct !== 'string' || !Array.isArray(s.followers) || !Array.isArray(s.following) || !Number.isFinite(s.takenAt)) continue;
    const before = (await listSnapshots(s.acct)).length;
    await saveSnapshot({ acct: s.acct, platform: String(s.platform || ''), account: String(s.account || ''), takenAt: s.takenAt, followers: s.followers.map(String), following: s.following.map(String), labels: s.labels && typeof s.labels === 'object' ? s.labels : {}, removed: Array.isArray(s.removed) ? s.removed.map(String) : [] });
    if ((await listSnapshots(s.acct)).length > before) added++;
  }
  return added;
}

export async function countAllSnapshots() {
  try {
    return await tx('readonly', (store) => store.count());
  } catch {
    return 0;
  }
}
