import { h } from '../lib/ui.js';
import { fmtInt } from '../lib/format.js';
import { viewHead, stat, panel, userList } from './components.js';

const platformOf = (label) => label.toLowerCase();

export function crossView(cross, ctx) {
  const root = h('div', { class: 'app-content' });
  root.append(viewHead('Cross-platform map', `Matching usernames across ${cross.platforms.join(', ')}. Same handle, same person — usually.`));
  for (const pair of cross.pairs) {
    root.append(
      h(
        'div',
        { class: 'stats' },
        stat({ label: `Follow you on ${pair.a} and ${pair.b}`, value: fmtInt(pair.both.length), color: 'var(--c1)' }),
        stat({ label: `On ${pair.a} only`, value: fmtInt(pair.followsYouOnlyOnA.length), sub: `You follow them on ${pair.b}, they don’t follow back there`, color: 'var(--c2)' }),
        stat({ label: `On ${pair.b} only`, value: fmtInt(pair.followsYouOnlyOnB.length), sub: `You follow them on ${pair.a}, they don’t follow back there`, color: 'var(--c3)' }),
      ),
      h(
        'div',
        { class: 'panels panels--2' },
        panel(
          { title: `They follow you on ${pair.a}… but not on ${pair.b}` },
          userList({ platform: platformOf(pair.b), items: pair.followsYouOnlyOnA.map((u) => ({ u })), ctx, exportName: `${platformOf(pair.a)}-not-${platformOf(pair.b)}` }),
        ),
        panel(
          { title: `They follow you on ${pair.b}… but not on ${pair.a}` },
          userList({ platform: platformOf(pair.a), items: pair.followsYouOnlyOnB.map((u) => ({ u })), ctx, exportName: `${platformOf(pair.b)}-not-${platformOf(pair.a)}` }),
        ),
      ),
      panel({ title: `Loyal on both · ${fmtInt(pair.both.length)}` }, userList({ platform: platformOf(pair.a), items: pair.both.map((u) => ({ u })), ctx, exportName: 'loyal-on-both' })),
    );
  }
  return root;
}
