import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickYear, yearInReview } from '../public/assets/js/core/year.js';

test('picks last year early in the year', () => {
  assert.equal(pickYear(new Date(2025, 0, 15).getTime()), 2024);
  assert.equal(pickYear(new Date(2025, 6, 1).getTime()), 2025);
});

test('collects one year across platforms and merges chats', () => {
  const ts = (y, m = 5) => new Date(y, m, 1).getTime();
  const ig = { platform: 'instagram', lists: { followers: [{ ts: ts(2024) }, { ts: ts(2024) }, { ts: ts(2023) }] }, activity: { messages: { all: [{ title: 'Sara', count: 50, last: ts(2024) }] } } };
  const wa1 = { platform: 'whatsapp', chats: [{ title: 'Sara', byMonth: { '2024-01': 100, '2023-12': 9 } }, { title: 'Ali', byMonth: { '2024-02': 300 } }] };
  const sp = { platform: 'spotify', stats: { byMonth: { '2024-03': 600 }, yearTop: [{ year: '2024', key: 'Adele' }] } };
  const items = yearInReview([ig, wa1, sp], 2024);
  const get = (p, k) => items.find((i) => i.platform === p && i.key === k);
  assert.equal(get('instagram', 'followers').value, 2);
  assert.equal(get('instagram', 'chats').top, 'Sara');
  assert.equal(get('whatsapp', 'messages').value, 400);
  assert.equal(get('whatsapp', 'messages').top, 'Ali');
  assert.equal(get('spotify', 'minutes').top, 'Adele');
});
