import { test } from 'node:test';
import assert from 'node:assert/strict';

test('a transient config failure does not disable checkout for the rest of the visit', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  let calls = 0;
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) throw new TypeError('temporary connection failure');
    return Response.json({ ok: true, plans: [], tiers: [], methods: [{ id: 'stars' }], publicKey: null });
  };
  try {
    const { getConfig } = await import('../public/assets/js/lib/api.js');
    assert.equal((await getConfig()).offline, true);
    const [recovered, concurrent] = await Promise.all([getConfig(), getConfig()]);
    assert.equal(recovered.methods[0].id, 'stars');
    assert.equal(concurrent, recovered);
    assert.equal(await getConfig(), recovered);
    assert.equal(calls, 2, 'successful config stays cached; concurrent retries share a request');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});
