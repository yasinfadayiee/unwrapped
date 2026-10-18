import { h } from '../lib/ui.js';
import { fmtInt, dateShort } from '../lib/format.js';
import { closestPeople } from '../core/closest.js';
import { viewHead, panel, emptyState, lockCard } from './components.js';
import { t as tl } from '../lib/i18n.js';

const LABEL = { instagram: 'Instagram', facebook: 'Messenger', whatsapp: 'WhatsApp', telegram: 'Telegram' };

export const hasClosest = (datasets) => datasets.some((d) => d.activity?.messages?.all?.length || d.chats?.some((c) => c.people.length === 2));

export function closestView(datasets, ctx) {
  const list = closestPeople(datasets);
  const full = ctx.pro || ctx.demo;
  const root = h('div', { class: 'app-content' }, viewHead(tl('Your closest people'), tl('One ranking from all your chats — how much you talk, how balanced it is and how recent. Drop WhatsApp, Telegram and Instagram together for the full picture.')));
  if (!list.length) return root.appendChild(panel(null, emptyState(tl('No one-to-one chats in what you dropped.'), 'users'))) && root;
  const shown = full ? list.slice(0, 30) : list.slice(0, 1);
  const row = (p, i) =>
    h(
      'div',
      { class: 'rank-row' },
      h('span', { class: 'n' }, String(i + 1).padStart(2, '0')),
      h(
        'div',
        { class: 'lbl' },
        h('b', null, p.name),
        h('div', { class: 'track' }, h('i', { style: { width: `${Math.max(3, p.closeness)}%`, background: i === 0 ? 'var(--signal, var(--c1))' : 'var(--c1)' } })),
        h('span', { class: 'text-2 small' }, `${p.platforms.map((x) => LABEL[x] || x).join(' · ')} · ${tl('{v0} messages', { v0: fmtInt(p.messages) })}${p.last ? ` · ${tl('last {v0}', { v0: dateShort(p.last) })}` : ''}`),
      ),
      h('span', { class: 'v' }, `${p.closeness}`),
    );
  root.append(panel({ title: tl('Your number one: {v0}', { v0: list[0].name }) }, h('div', { class: 'rank' }, shown.map(row))));
  if (!full && list.length > 1) {
    root.append(
      h(
        'div',
        { class: 'locked', style: { minHeight: '260px' } },
        h('div', { class: 'locked-rows' }, list.slice(1, 7).map((p, i) => row({ ...p, name: '•••••••' }, i + 1))),
        lockCard({ title: tl('Who are #2 to #{v0}?', { v0: fmtInt(Math.min(list.length, 30)) }), text: tl('See your full closeness ranking across every platform.'), onUpgrade: () => ctx.upgrade('closest') }),
      ),
    );
  }
  return root;
}
