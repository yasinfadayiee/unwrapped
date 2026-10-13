import { h } from '../lib/ui.js';
import { fmtInt } from '../lib/format.js';
import { viewHead, stat, panel, userList } from './components.js';
import { t as tl } from '../lib/i18n.js';

const platformOf = (label) => label.toLowerCase();

export function crossView(cross, ctx) {
  const root = h('div', { class: 'app-content' });
  root.append(viewHead(tl('Cross-platform map'), tl('Matching usernames across {v0}. Same handle, same person — usually.', { v0: cross.platforms.join(', ') })));
  for (const pair of cross.pairs) {
    root.append(
      h(
        'div',
        { class: 'stats' },
        stat({ label: tl('Follow you on {v0} and {v1}', { v0: pair.a, v1: pair.b }), value: fmtInt(pair.both.length), color: 'var(--c1)' }),
        stat({ label: tl('On {v0} only', { v0: pair.a }), value: fmtInt(pair.followsYouOnlyOnA.length), sub: tl('You follow them on {v0}, they don’t follow back there', { v0: pair.b }), color: 'var(--c2)' }),
        stat({ label: tl('On {v0} only', { v0: pair.b }), value: fmtInt(pair.followsYouOnlyOnB.length), sub: tl('You follow them on {v0}, they don’t follow back there', { v0: pair.a }), color: 'var(--c3)' }),
      ),
      h(
        'div',
        { class: 'panels panels--2' },
        panel(
          { title: tl('They follow you on {v0}… but not on {v1}', { v0: pair.a, v1: pair.b }) },
          userList({ platform: platformOf(pair.b), items: pair.followsYouOnlyOnA.map((u) => ({ u })), ctx, exportName: `${platformOf(pair.a)}-not-${platformOf(pair.b)}` }),
        ),
        panel(
          { title: tl('They follow you on {v0}… but not on {v1}', { v0: pair.b, v1: pair.a }) },
          userList({ platform: platformOf(pair.a), items: pair.followsYouOnlyOnB.map((u) => ({ u })), ctx, exportName: `${platformOf(pair.b)}-not-${platformOf(pair.a)}` }),
        ),
      ),
      panel({ title: tl('Loyal on both · {v0}', { v0: fmtInt(pair.both.length) }) }, userList({ platform: platformOf(pair.a), items: pair.both.map((u) => ({ u })), ctx, exportName: 'loyal-on-both' })),
    );
  }
  return root;
}
