import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dmStats, circleOf, reachByYear } from '../public/assets/js/platforms/x.js';
import { activityOf } from '../public/assets/js/platforms/facebook.js';

test('X: DM partners and unanswered chats', () => {
  const conv = (id, msgs) => ({ dmConversation: { conversationId: id, messages: msgs.map(([s, d]) => ({ messageCreate: { senderId: s, recipientId: '0', createdAt: d } })) } });
  const r = dmStats([conv('1-2', [['1', '2024-01-01T10:00:00Z'], ['2', '2024-01-01T11:00:00Z'], ['1', '2024-01-02T10:00:00Z']]), conv('1-3', [['3', '2024-02-01T10:00:00Z']])], '1');
  assert.equal(r.sent, 2);
  assert.equal(r.partners[0].id, '2');
  assert.deepEqual(r.unanswered.map((p) => p.id), ['3']);
});

test('X: circle and reach', () => {
  const tw = [
    { text: 'hi', replyTo: 'bob', mentions: ['bob', 'amy'], isRT: false, isReply: true, likes: 1, rts: 0, ts: Date.UTC(2022, 1, 1) },
    { text: 'yo', replyTo: 'bob', mentions: ['bob'], isRT: false, isReply: true, likes: 0, rts: 0, ts: Date.UTC(2022, 1, 2) },
    { text: 'post', replyTo: '', mentions: [], isRT: false, isReply: false, likes: 10, rts: 2, ts: Date.UTC(2022, 5, 1) },
    { text: 'post2', replyTo: '', mentions: [], isRT: false, isReply: false, likes: 30, rts: 0, ts: Date.UTC(2023, 5, 1) },
  ];
  const c = circleOf(tw, 'me');
  assert.equal(c[0].key, '@bob');
  assert.equal(c[0].replies, 2);
  assert.equal(c[1].key, '@amy');
  assert.deepEqual(reachByYear(tw).map((r) => [r.year, r.avgLikes]), [['2022', 10], ['2023', 30]]);
});

test('Facebook: posts, comments, reactions and groups', async () => {
  const file = (path, json) => ({ path, lower: path.toLowerCase(), source: 'facebook.zip', json: async () => json });
  const vfs = {
    entries: [
      file('your_facebook_activity/posts/your_posts__check_ins__photos_and_videos_1.json', [{ timestamp: 1500000000, data: [{ post: 'Hello world' }] }, { timestamp: 1600000000 }]),
      file('your_facebook_activity/comments_and_reactions/comments.json', { comments_v2: [{ timestamp: 1600000000 }] }),
      file('your_facebook_activity/comments_and_reactions/likes_and_reactions_1.json', [{ timestamp: 1600000000, data: [{ reaction: { reaction: 'LOVE' } }] }, { timestamp: 1600000001, data: [{ reaction: { reaction: 'LOVE' } }] }]),
      file('your_facebook_activity/groups/your_group_membership_activity.json', { groups_joined_v2: [{ timestamp: 1600000000, title: 'Hikers' }] }),
    ],
  };
  vfs.all = (fn) => vfs.entries.filter(typeof fn === 'function' ? fn : (e) => fn.test(e.lower));
  vfs.find = (fn) => vfs.all(fn)[0] || null;
  const a = await activityOf(vfs);
  assert.equal(a.posts, 2);
  assert.equal(a.comments, 1);
  assert.equal(a.reactions, 2);
  assert.equal(a.reactionTypes.LOVE, 2);
  assert.equal(a.groups[0].name, 'Hikers');
  assert.equal(a.firstPost.text, 'Hello world');
});
