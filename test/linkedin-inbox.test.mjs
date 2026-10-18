import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inboxStats } from '../public/assets/js/platforms/linkedin.js';

const row = (id, from, to, date, fromUrl = '', toUrl = '') => ({ 'CONVERSATION ID': id, FROM: from, 'SENDER PROFILE URL': fromUrl, TO: to, 'RECIPIENT PROFILE URLS': toUrl, DATE: date });

test('inbox: who you talk to and who never got an answer', () => {
  const rows = [
    row('a', 'Ana Me', 'Bo Lee', '2024-01-01 10:00:00 UTC', 'https://www.linkedin.com/in/me', 'https://www.linkedin.com/in/bo'),
    row('a', 'Bo Lee', 'Ana Me', '2024-01-02 10:00:00 UTC', 'https://www.linkedin.com/in/bo', 'https://www.linkedin.com/in/me'),
    row('b', 'Recruiter Rae', 'Ana Me', '2024-02-01 09:00:00 UTC', 'https://www.linkedin.com/in/rae', 'https://www.linkedin.com/in/me'),
    row('c', 'Ana Me', 'Cy Doe', '2024-03-01 09:00:00 UTC', 'https://www.linkedin.com/in/me', 'https://www.linkedin.com/in/cy'),
  ];
  const ib = inboxStats(rows, 'Ana Me');
  assert.equal(ib.me, 'Ana Me');
  assert.equal(ib.sent, 2);
  assert.equal(ib.received, 2);
  assert.equal(ib.conversations, 3);
  assert.deepEqual(ib.unanswered.map((u) => u.name), ['Recruiter Rae']);
  assert.equal(ib.people[0].name, 'Bo Lee');
});
