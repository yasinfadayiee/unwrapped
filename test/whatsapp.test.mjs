import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChatText, chatStats, detectWhatsApp, parseWhatsApp } from '../public/assets/js/platforms/whatsapp.js';

const IOS = [
  '[13/01/24, 21:41:05] Sara: ‎Messages and calls are end-to-end encrypted.',
  '[13/01/24, 21:41:05] Sara: Hey! 😀😀',
  '[13/01/24, 21:43:10] Ali: hi there',
  'second line of the same message',
  '[14/01/24, 08:00:00] Ali: ‎image omitted',
  '[14/01/24, 08:05:00] Sara: look https://example.com',
].join('\n');

const ANDROID = [
  '1/13/24, 9:41 PM - Messages and calls are end-to-end encrypted. No one outside of this chat can read them.',
  '1/13/24, 9:41 PM - Sara: Hey',
  '1/13/24, 9:50 PM - Ali: <Media omitted>',
  '1/14/24, 12:05 AM - Ali: This message was deleted',
].join('\n');

test('parses iPhone exports with day-first dates and multi-line messages', () => {
  const msgs = parseChatText(IOS);
  assert.equal(msgs.length, 4);
  assert.equal(msgs[1].text, 'hi there\nsecond line of the same message');
  assert.equal(new Date(msgs[0].ts).getDate(), 13);
  assert.equal(new Date(msgs[0].ts).getMonth(), 0);
  assert.equal(msgs[2].kind, 'media');
});

test('parses Android exports with 12-hour clocks and skips system lines', () => {
  const msgs = parseChatText(ANDROID);
  assert.equal(msgs.length, 3);
  assert.equal(new Date(msgs[0].ts).getHours(), 21);
  assert.equal(new Date(msgs[2].ts).getHours(), 0);
  assert.equal(msgs[1].kind, 'media');
  assert.equal(msgs[2].kind, 'deleted');
});

test('computes per-person stats, replies, emojis and streaks', () => {
  const s = chatStats(parseChatText(IOS), 'Sara');
  assert.equal(s.total, 4);
  assert.equal(s.longestStreak, 2);
  const sara = s.people.find((p) => p.name === 'Sara');
  const ali = s.people.find((p) => p.name === 'Ali');
  assert.equal(sara.links, 1);
  assert.equal(ali.media, 1);
  assert.equal(ali.replyMs, 125000);
  assert.equal(s.topEmojis[0].key, '😀');
  assert.equal(s.topEmojis[0].count, 2);
});

test('detects and parses a chat file from a dropped export', async () => {
  const entry = { path: 'WhatsApp Chat with Sara.txt', lower: 'whatsapp chat with sara.txt', source: 'WhatsApp Chat with Sara.txt', text: async () => IOS };
  const vfs = { entries: [entry] };
  assert.ok(detectWhatsApp(vfs));
  assert.ok(!detectWhatsApp({ entries: [{ path: 'notes.txt', lower: 'notes.txt' }] }));
  const ds = await parseWhatsApp(vfs);
  assert.equal(ds.platform, 'whatsapp');
  assert.equal(ds.account.name, 'Sara');
  assert.equal(ds.chats[0].total, 4);
});
