import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Browser modules can't be imported in Node (they touch the DOM), so at least
// make sure every file parses — one stray bracket breaks a whole page.
const root = path.resolve(import.meta.dirname, '..');
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})(path.join(root, 'public/assets/js'));

test('every browser script parses', () => {
  const broken = [];
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (err) {
      broken.push(`${path.relative(root, file)}: ${String(err.stderr).split('\n').slice(0, 4).join(' ')}`);
    }
  }
  assert.deepEqual(broken, []);
});
