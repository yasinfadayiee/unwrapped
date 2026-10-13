// A virtual file system over everything the user dropped: ZIP archives (also
// multi-part and nested ones), loose files or whole unzipped folders.

import { isZip, listZip, readZipEntry } from './zip.js';

const decoder = new TextDecoder('utf-8');

// `group` is the dropped ZIP or top-level folder an entry came from, so several
// exports dropped together can be told apart.
function makeEntry(path, size, read, source, mtime = 0, group = source) {
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '');
  return {
    path: clean,
    lower: clean.toLowerCase(),
    name: clean.split('/').pop(),
    size,
    source,
    group,
    mtime,
    bytes: read,
    async text() {
      return decoder.decode(await read()).replace(/^﻿/, '');
    },
    async json() {
      return JSON.parse(await this.text());
    },
  };
}

export class Vfs {
  constructor() {
    this.entries = [];
    this.sources = [];
  }
  add(entry) {
    this.entries.push(entry);
  }
  get totalBytes() {
    return this.entries.reduce((sum, e) => sum + (e.size || 0), 0);
  }
  // `test` is a RegExp matched against the lower-cased path, or a predicate.
  all(test) {
    const fn = typeof test === 'function' ? test : (e) => test.test(e.lower);
    return this.entries.filter(fn);
  }
  find(test) {
    return this.all(test)[0] || null;
  }
  byName(...names) {
    const set = new Set(names.map((n) => n.toLowerCase()));
    return this.entries.filter((e) => set.has(e.name.toLowerCase()));
  }
  // A Vfs over some of the entries (one export out of several).
  subset(entries) {
    const vfs = new Vfs();
    vfs.sources = this.sources;
    for (const e of entries) vfs.add(e);
    return vfs;
  }
}

async function addZip(vfs, blob, label, depth, group = label) {
  const entries = await listZip(blob);
  for (const en of entries) {
    if (depth < 1 && /\.zip$/i.test(en.path) && en.size < 600_000_000) {
      const inner = new Blob([await readZipEntry(blob, en)]);
      await addZip(vfs, inner, `${label} › ${en.path}`, depth + 1, group);
      continue;
    }
    vfs.add(makeEntry(en.path, en.size, () => readZipEntry(blob, en), label, en.mtime, group));
  }
}

export async function buildVfs(files, { onProgress } = {}) {
  const vfs = new Vfs();
  let done = 0;
  for (const file of files) {
    const path = file.relativePath || file.webkitRelativePath || file.name;
    vfs.sources.push({ name: file.name, size: file.size });
    if (/\.zip$/i.test(file.name) || (await isZip(file))) {
      await addZip(vfs, file, file.name, 0);
    } else {
      const folder = path.replace(/\\/g, '/').replace(/^\/+/, '').split('/');
      vfs.add(
        makeEntry(path, file.size, async () => new Uint8Array(await file.arrayBuffer()), file.name, file.lastModified || 0, folder.length > 1 ? `${folder[0]}/` : '(files)'),
      );
    }
    done++;
    if (onProgress) onProgress(done / files.length);
  }
  return vfs;
}
