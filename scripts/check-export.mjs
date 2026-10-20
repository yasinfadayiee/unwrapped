// Run real export files through the same parsers the site uses, locally, and print a summary.
// Usage: node scripts/check-export.mjs <export.zip | folder> [more...]
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';
import { buildVfs } from '../public/assets/js/core/vfs.js';
import { analyze } from '../public/assets/js/core/analyze.js';

async function collect(path, root, out) {
  const s = await stat(path);
  if (s.isDirectory()) {
    for (const name of await readdir(path)) await collect(join(path, name), root, out);
    return;
  }
  const file = new File([await readFile(path)], basename(path), { lastModified: s.mtimeMs });
  if (root) file.relativePath = `${basename(root)}/${relative(root, path).replace(/\\/g, '/')}`;
  out.push(file);
}

const args = process.argv.slice(2);
if (!args.length) {
  console.log('Usage: node scripts/check-export.mjs <export.zip | folder> [more...]');
  process.exit(1);
}
const files = [];
for (const arg of args) await collect(arg, (await stat(arg)).isDirectory() ? arg : '', files);

const result = await analyze(await buildVfs(files));
console.log(`files: ${result.files}, bytes: ${result.bytes}, exports: ${result.exports || 1}`);
for (const d of result.datasets) {
  const who = d.account?.username || d.account?.name || '';
  console.log(`\n[${d.platform}] ${who}`.trimEnd());
  const m = d.activity?.messages || d.messages;
  if (m?.total) console.log(`  messages: ${m.total} in ${m.threadCount} chats (sent ${m.sent})`);
  for (const [key, value] of Object.entries(d)) {
    if (Array.isArray(value)) console.log(`  ${key}: ${value.length}`);
    else if (value && typeof value === 'object') {
      const counts = Object.entries(value).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k}=${v.length}`);
      if (counts.length) console.log(`  ${key}: ${counts.join(', ')}`);
    }
  }
}
if (result.problems.length) {
  console.log('\nproblems:');
  for (const p of result.problems) console.log(`  - ${typeof p === 'string' ? p : JSON.stringify(p)}`);
}
process.exit(result.datasets.length ? 0 : 2);
