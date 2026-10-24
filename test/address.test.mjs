import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addressGroups, payAddress } from '../public/assets/js/lib/address.js';

const RAW = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // 34-char TRON address

test('address is displayed in groups of 4 (last group may be shorter)', () => {
  const g = addressGroups(RAW);
  assert.deepEqual(g.slice(0, 2), ['TR7N', 'Hqje']);
  assert.equal(g.at(-1), '6t');
  assert.ok(g.slice(0, -1).every((x) => x.length === 4));
  assert.equal(g.join(''), RAW);
});

test('copy and QR values are exactly the raw address (no spaces)', () => {
  const a = payAddress(RAW);
  assert.equal(a.copy, RAW);
  assert.equal(a.qr, RAW);
  assert.equal(a.raw, RAW);
  assert.equal(a.groups.join(''), RAW);
  assert.ok(!/\s/.test(a.copy));
});

test('empty / missing address does not throw', () => {
  assert.deepEqual(payAddress(undefined).groups, []);
  assert.equal(payAddress(null).copy, '');
});

test('pay screen wires Copy and QR to the raw address, not the grouped display', () => {
  const src = readFileSync(new URL('../public/assets/js/lib/checkout.js', import.meta.url), 'utf8');
  assert.match(src, /qrSvg\(addr\.qr\)/);
  assert.match(src, /line\(t\('Address'\), addrView, \{ copy: addr\.copy \}\)/);
});
