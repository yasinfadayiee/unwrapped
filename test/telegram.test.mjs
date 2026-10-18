import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telegramChats, detectTelegram, parseTelegram } from '../public/assets/js/platforms/telegram.js';

const CHAT = {
  name: 'Sara',
  type: 'personal_chat',
  messages: [
    { id: 1, type: 'service', date: '2024-01-13T21:00:00', action: 'create_group' },
    { id: 2, type: 'message', date: '2024-01-13T21:41:05', date_unixtime: '1705182065', from: 'Sara', text: 'Hey 😀' },
    { id: 3, type: 'message', date: '2024-01-13T21:43:10', date_unixtime: '1705182190', from: 'Ali', text: ['see ', { type: 'link', text: 'https://example.com' }] },
    { id: 4, type: 'message', date: '2024-01-14T08:00:00', date_unixtime: '1705219200', from: 'Ali', text: '', photo: 'photos/1.jpg' },
  ],
};

test('reads a single-chat export with rich text and media', () => {
  const [chat] = telegramChats(CHAT);
  assert.equal(chat.title, 'Sara');
  assert.equal(chat.total, 3);
  const ali = chat.people.find((p) => p.name === 'Ali');
  assert.equal(ali.links, 1);
  assert.equal(ali.media, 1);
  assert.equal(ali.replyMs, 125000);
});

test('reads the full account export with many chats', async () => {
  const full = { personal_information: { first_name: 'Ana' }, chats: { list: [CHAT, { name: 'Empty', messages: [] }] } };
  const vfs = { entries: [{ path: 'DataExport/result.json', lower: 'dataexport/result.json', json: async () => full }] };
  assert.ok(detectTelegram(vfs));
  const ds = await parseTelegram(vfs);
  assert.equal(ds.platform, 'telegram');
  assert.equal(ds.account.name, 'Ana');
  assert.equal(ds.chats.length, 1);
});
