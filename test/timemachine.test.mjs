import test from 'node:test';
import assert from 'node:assert/strict';
import { timeMachine, lagLabel } from '../public/assets/js/core/timemachine.js';

const D = 864e5;
const T = Date.UTC(2025, 0, 1);

test('time machine works out who made the first move', () => {
  const following = [
    { u: 'ana', ts: T },            // you first, they reply in 10 min
    { u: 'ben', ts: T + 30 * D },   // they followed first, you replied 5 days later
    { u: 'cy', ts: T + 40 * D },    // never followed back
    ...Array.from({ length: 10 }, (_, i) => ({ u: `x${i}`, ts: T + i * D })),
  ];
  const followers = [
    { u: 'ANA', ts: T + 10 * 6e4 },
    { u: 'ben', ts: T + 25 * D },
    { u: 'dee', ts: T + 50 * D },
  ];
  const tm = timeMachine({ followers, following });
  assert.equal(tm.pairs, 2);
  assert.equal(tm.youFirst, 1);
  assert.equal(tm.theyFirst, 1);
  assert.equal(tm.instant, 1);
  assert.equal(tm.fastest[0].u, 'ANA');
  assert.equal(lagLabel(tm.yourReply), '5 days');
  assert.equal(tm.months.at(-1).followers, 3);
  assert.equal(tm.months.at(-1).following, 13);
});

test('time machine needs timestamps', () => {
  assert.equal(timeMachine({ followers: [{ u: 'a', ts: 0 }], following: [] }), null);
});
