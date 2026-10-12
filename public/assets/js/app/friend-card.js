// Friendship Wrapped (Pro): a story card about you and one friend, made to be
// sent to them. It shows only the nickname the user types, never a username.

import { h, icon } from '../lib/ui.js';
import { compact, dateShort, fmtInt, pct } from '../lib/format.js';
import { THEMES, drawCard, fontsReady } from './wrapped.js';
import { cardButtons } from './views-wrapped.js';
import { panel, lockCard } from './components.js';
import { replyTime } from './views-lab.js';

const YEAR = 365.25 * 86_400_000;

function persona(t) {
  const d = t.dynamics || {};
  const c = t.chat;
  const share = t.count ? t.sent / t.count : 0.5;
  const years = (t.last - t.first) / YEAR;
  if (c.streak >= 30) return ['Daily Duo', 'Not a day goes by without a message.'];
  if (c.nightShare >= 0.25) return ['Night Owls', 'Your best talks happen after midnight.'];
  if (d.replyThem != null && d.replyMe != null && d.replyThem < 300_000 && d.replyMe < 300_000) return ['Speed Texters', 'Neither of you ever keeps the other waiting.'];
  if (Math.abs(share - 0.5) <= 0.05) return ['Perfect Balance', 'You both carry this friendship equally.'];
  if (years >= 3) return ['Old Friends', `${Math.floor(years)} years and still talking.`];
  return ['Ride or Die', 'One of the busiest chats on your phone.'];
}

export function friendCard(t, nickname, label) {
  const d = t.dynamics || {};
  const share = t.count ? t.sent / t.count : 0.5;
  const replies = [d.replyMe, d.replyThem].filter((v) => v != null);
  const [title, line] = persona(t);
  return {
    kicker: `${label} · friendship`,
    titleA: `Me & ${nickname},`,
    titleB: 'unwrapped.',
    hero: compact(t.count),
    heroLabel: `messages since ${new Date(t.first).getFullYear()}`,
    rows: [
      ['Longest streak', `${fmtInt(t.chat.streak)} ${t.chat.streak === 1 ? 'day' : 'days'}`],
      ['Who texts more', share >= 0.55 ? 'Me' : share <= 0.45 ? 'Them' : 'Dead even'],
      ['Typical reply', replies.length ? replyTime(replies.reduce((a, b) => a + b, 0) / replies.length) : '—'],
      ['Late-night chats', pct(t.chat.nightShare)],
    ],
    persona: title,
    personaLine: line,
    period: `${dateShort(t.first).toUpperCase()} – ${dateShort(t.last).toUpperCase()}`,
  };
}

export function friendCardPanel(ds, ctx) {
  const people = (ds.activity?.messages?.all || []).filter((t) => t.chat && t.first && t.count >= 30).slice(0, 25);
  if (!people.length) return null;
  const can = ctx.can('friends');
  let index = 0;
  let theme = 'aurora';
  const select = h(
    'select',
    { class: 'select', id: 'fc-friend', 'aria-label': 'Friend' },
    people.map((p, i) => h('option', { value: String(i) }, `${can ? p.title : `Friend #${i + 1}`} · ${compact(p.count)} messages`)),
  );
  const nick = h('input', { class: 'input', type: 'text', id: 'fc-nick', maxlength: '20', placeholder: 'e.g. my bestie' });
  const canvas = h('canvas', { width: 1080, height: 1920, role: 'img', 'aria-label': 'Friendship card preview' });
  const themes = h('div', { class: 'theme-row', role: 'group', 'aria-label': 'Card theme' });
  for (const [id, t] of Object.entries(THEMES)) {
    const dot = h('button', { class: 'theme-dot', type: 'button', style: { background: t.swatch }, 'aria-pressed': String(id === theme), 'aria-label': `${t.label} theme` });
    dot.addEventListener('click', () => {
      theme = id;
      themes.querySelectorAll('.theme-dot').forEach((x) => x.setAttribute('aria-pressed', String(x === dot)));
      draw();
    });
    themes.append(dot);
  }
  async function draw() {
    await fontsReady();
    drawCard(canvas, friendCard(people[index], nick.value.trim() || 'my bestie', ds.label), theme, { watermark: !ctx.pro, site: ctx.site });
  }
  select.addEventListener('change', () => {
    index = Number(select.value);
    draw();
  });
  nick.addEventListener('input', draw);
  draw();

  return panel(
    { title: 'Friendship Wrapped', text: 'A story card about you and one friend — made to send to them. It shows only the nickname you type.' },
    h(
      'div',
      { class: 'friend-card' },
      h('div', { class: `friend-card-preview${can ? '' : ' is-locked'}` }, canvas, can ? cardButtons(canvas, 'unwrapped-friendship.png', 'Our friendship, unwrapped') : null),
      h(
        'div',
        { class: 'stack', style: { '--stack': '14px' } },
        h('div', { class: 'field' }, h('label', { for: 'fc-friend' }, 'Friend'), select),
        h('div', { class: 'field' }, h('label', { for: 'fc-nick' }, 'Nickname on the card'), nick),
        h('div', { class: 'field' }, h('span', { class: 'small text-2' }, 'Theme'), themes),
        can
          ? h('p', { class: 'tiny muted' }, icon('shield'), ' Made on your device. Nothing is sent to your friend unless you share it.')
          : lockCard({ tier: 'pro', title: 'Friendship Wrapped is part of Pro', text: 'Make a story card for any friend — streaks, reply times and your friendship type.', onUpgrade: () => ctx.upgrade('friends') }),
      ),
    ),
  );
}
