import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryForPath, entrySelection } from '../public/assets/js/lib/entry.js';
import { buildDemoVfs } from '../public/assets/js/core/demo.js';
import { analyze } from '../public/assets/js/core/analyze.js';

test('localized landing pages retain the requested tool', () => {
  for (const prefix of ['', '/es', '/pt', '/tr', '/fr', '/de']) {
    assert.deepEqual(entryForPath(`${prefix}/instagram-message-viewer/`), { platform: 'instagram', view: 'messages' });
    assert.equal(entryForPath(`${prefix}/instagram-follower-tracker`).view, 'unfollowers');
  }
  assert.equal(entryForPath('/pricing/'), null);
  assert.equal(entryForPath('/not-es/instagram/'), null);
});

test('entry selects the matching export and falls back for a different platform', async () => {
  const { vfs } = buildDemoVfs();
  const { datasets } = await analyze(vfs);
  const chosen = entrySelection([...datasets].reverse(), entryForPath('/es/blog/who-unfollowed-me-on-tiktok/'));
  assert.equal([...datasets].reverse()[chosen.index].platform, 'tiktok');
  assert.equal(chosen.view, 'unfollowers');
  assert.deepEqual(entrySelection([{ platform: 'spotify' }], entryForPath('/instagram/')), { index: 0, view: 'overview' });
});
