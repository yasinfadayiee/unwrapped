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

export async function analyze(vfs, progress = () => {}) {
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
