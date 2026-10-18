import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closestPeople, nameKey } from '../public/assets/js/core/closest.js';

const NOW = Date.UTC(2024, 5, 1);
const day = 864e5;

test('names match across platforms despite accents, emoji and case', () => {
  assert.equal(nameKey('Sára Ahmadi 🌸'), nameKey('sara ahmadi'));
});

test('ranks by volume, balance and recency and merges platforms', () => {
  const ig = { platform: 'instagram', activity: { messages: { all: [
    { title: 'Sara Ahmadi', count: 400, sent: 200, last: NOW - 2 * day },
    { title: 'Old Friend', count: 5000, sent: 2500, last: NOW - 900 * day },
    { title: 'Spammer', count: 300, sent: 0, last: NOW - day },
  ] } } };
  const wa = { platform: 'whatsapp', chats: [{ title: 'Sara Ahmadi', total: 900, last: NOW - day, people: [{ name: 'Sara Ahmadi', messages: 450 }, { name: 'Me', messages: 450 }] }] };
  const list = closestPeople([ig, wa], NOW);
  assert.equal(list[0].name, 'Sara Ahmadi');
  assert.deepEqual(list[0].platforms, ['instagram', 'whatsapp']);
  assert.equal(list[0].messages, 1300);
  assert.equal(list[0].closeness, 100);
  assert.ok(list.findIndex((p) => p.name === 'Spammer') > list.findIndex((p) => p.name === 'Old Friend') || list.find((p) => p.name === 'Spammer').closeness < 60);
});
