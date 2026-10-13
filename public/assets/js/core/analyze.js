// Detects which platforms are inside the dropped files and parses each one.

import { detectInstagram, detectThreads, parseInstagram, parseThreads } from '../platforms/instagram.js';
import { detectTikTok, parseTikTok } from '../platforms/tiktok.js';
import { detectX, parseX } from '../platforms/x.js';
import { detectFacebook, parseFacebook } from '../platforms/facebook.js';
import { detectLinkedIn, parseLinkedIn } from '../platforms/linkedin.js';

const PLATFORMS = [
  { id: 'instagram', detect: detectInstagram, parse: parseInstagram },
  { id: 'threads', detect: detectThreads, parse: parseThreads },
  { id: 'tiktok', detect: detectTikTok, parse: parseTikTok },
  { id: 'x', detect: detectX, parse: parseX },
  { id: 'facebook', detect: detectFacebook, parse: parseFacebook },
  { id: 'linkedin', detect: detectLinkedIn, parse: parseLinkedIn },
];

// When the export was made: newest modification time of the files we used.
function exportDate(vfs) {
  let best = 0;
  for (const e of vfs.entries) if (e.mtime && e.mtime > best && e.mtime < Date.now() + 86_400_000) best = e.mtime;
  return best || Date.now();
}

// Files that only exist once per export: the list of who you follow (or your
// friends / connections). Two dropped ZIPs or folders that both have one are
// two different exports — typically an old and a new download.
const EXPORT_MARKERS = [
  /(^|\/)following\.(json|html?)$/, // Instagram, Threads
  /(^|\/)user_data(_tiktok)?\.json$/, // TikTok
  /(^|\/)data\/following\.js$/, // X
  /(^|\/)(your_)?friends\.json$/, // Facebook
  /(^|\/)connections\.csv$/, // LinkedIn
];

const newestMtime = (entries) => entries.reduce((max, e) => Math.max(max, e.mtime || 0), 0);

// Splits the dropped files into separate exports. Extra parts without a marker
// (e.g. the media part of a multi-part download) join the export that was
// generated closest in time.
export function splitExports(vfs) {
  const groups = new Map();
  for (const e of vfs.entries) {
    if (!groups.has(e.group)) groups.set(e.group, []);
    groups.get(e.group).push(e);
  }
  if (groups.size < 2) return [vfs];
  const roots = [];
  const parts = [];
  for (const entries of groups.values()) (entries.some((e) => EXPORT_MARKERS.some((re) => re.test(e.lower))) ? roots : parts).push(entries);
  if (roots.length < 2) return [vfs];
  for (const part of parts) {
    const t = newestMtime(part);
    roots.reduce((best, r) => (Math.abs(newestMtime(r) - t) < Math.abs(newestMtime(best) - t) ? r : best)).push(...part);
  }
  return roots.map((entries) => vfs.subset(entries));
}

// One tab per account: the newest export is shown and older exports of the
// same account ride along as `previous`, to be compared with it.
function newestPerAccount(datasets) {
  const who = (ds) => String(ds.account?.username || ds.account?.name || ds.account?.id || '').toLowerCase();
  const named = new Map();
  for (const ds of datasets) {
    if (!who(ds)) continue;
    if (!named.has(ds.platform)) named.set(ds.platform, new Set());
    named.get(ds.platform).add(who(ds));
  }
  // An export without a username belongs to the only named account of its platform.
  const keyOf = (ds) => {
    const names = named.get(ds.platform);
    return `${ds.platform}:${who(ds) || (names?.size === 1 ? [...names][0] : '')}`;
  };
  const byAccount = new Map();
  for (const ds of datasets) {
    const key = keyOf(ds);
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key).push(ds);
  }
  const shown = new Set();
  for (const list of byAccount.values()) {
    list.sort((a, b) => a.exportedAt - b.exportedAt);
    const main = list.pop();
    // The same export dropped twice is not an older one.
    main.previous = list.filter((d) => main.exportedAt - d.exportedAt > 120_000);
    if (!main.account?.username && !main.account?.name) {
      const withName = list.find((d) => d.account?.username || d.account?.name);
      if (withName) main.account = { ...main.account, username: withName.account.username, name: withName.account.name };
    }
    shown.add(main);
  }
  return datasets.filter((d) => shown.has(d));
}

export async function analyze(vfs, progress = () => {}) {
  const exports = splitExports(vfs);
  if (exports.length === 1) return analyzeOne(vfs, progress);
  const datasets = [];
  const problems = [];
  for (let i = 0; i < exports.length; i++) {
    const r = await analyzeOne(exports[i], (label, f) => progress(label, (i + f) / exports.length));
    datasets.push(...r.datasets);
    problems.push(...r.problems);
  }
  return { datasets: newestPerAccount(datasets), problems, files: vfs.entries.length, bytes: vfs.totalBytes, exports: exports.length };
}

async function analyzeOne(vfs, progress) {
  const datasets = [];
  const problems = [];
  const found = PLATFORMS.filter((p) => {
    try {
      return p.detect(vfs);
    } catch {
      return false;
    }
  });
  for (let i = 0; i < found.length; i++) {
    const p = found[i];
    const sub = (label, f = 0) => progress(label, (i + Math.min(1, f)) / found.length);
    try {
      const ds = await p.parse(vfs, sub);
      ds.exportedAt = exportDate(vfs);
      ds.fileCount = vfs.entries.length;
      datasets.push(ds);
    } catch (err) {
      console.error(err);
      problems.push(`${p.id}: ${err.message}`);
    }
  }
  return { datasets, problems, files: vfs.entries.length, bytes: vfs.totalBytes };
}
