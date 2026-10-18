import { h, icon } from '../lib/ui.js';
import { effortScore } from '../platforms/whatsapp.js';
import { drawChatCard, downloadCanvas, shareCanvas } from './chat-card.js';
import { fmtInt, dateShort } from '../lib/format.js';
import { viewHead, stat, panel, insights, upsell } from './components.js';
import { barChart, rankList, splitBar } from './charts.js';
import { t as tl } from '../lib/i18n.js';

const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];
const DAYS = () => [tl('Sun'), tl('Mon'), tl('Tue'), tl('Wed'), tl('Thu'), tl('Fri'), tl('Sat')];

function duration(ms) {
  if (ms == null) return '—';
  const m = Math.round(ms / 60000);
  if (m < 1) return tl('under a minute');
  if (m < 60) return tl('{v0} min', { v0: m });
  const hrs = m / 60;
  return tl('{v0} h', { v0: hrs < 10 ? hrs.toFixed(1) : Math.round(hrs) });
}

function overview(chat, ctx) {
  const people = chat.people;
  const full = ctx.pro || ctx.demo;
  const perDay = chat.spanDays ? chat.total / chat.spanDays : 0;
  const peak = chat.byHour.indexOf(Math.max(...chat.byHour));
  const topDay = chat.byWeekday.indexOf(Math.max(...chat.byWeekday));
  const fastest = people.filter((p) => p.replyMs != null).sort((a, b) => a.replyMs - b.replyMs)[0];
  const starter = [...people].sort((a, b) => b.starts - a.starts)[0];
  const owl = [...people].sort((a, b) => b.nightShare - a.nightShare)[0];
  const months = Object.entries(chat.byMonth).sort().map(([k, v]) => ({ label: k, value: v }));
  return h(
    'div',
    { class: 'app-content' },
    viewHead(chat.title || tl('WhatsApp chat'), tl('{v0} – {v1} · {v2} people', { v0: dateShort(chat.first), v1: dateShort(chat.last), v2: fmtInt(people.length) })),
    h(
      'div',
      { class: 'stats' },
      stat({ label: tl('Messages'), value: fmtInt(chat.total) }),
      stat({ label: tl('Per day'), value: perDay.toFixed(perDay < 10 ? 1 : 0) }),
      stat({ label: tl('Days you talked'), value: fmtInt(chat.activeDays), sub: tl('of {v0}', { v0: fmtInt(chat.spanDays) }) }),
      stat({ label: tl('Longest streak'), value: tl('{v0} days', { v0: fmtInt(chat.longestStreak) }) }),
    ),
    panel({ title: tl('Who talks more') }, splitBar(people.slice(0, 5).map((p, i) => ({ label: p.name, value: p.messages, color: COLORS[i] })))),
    panel(
      null,
      insights([
        fastest && people.length > 1 && { icon: 'clock', title: tl('{v0} replies fastest', { v0: fastest.name }), text: tl('Typical reply time: {v0}.', { v0: duration(fastest.replyMs) }) },
        starter && people.length > 1 && { icon: 'send', title: tl('{v0} starts most conversations', { v0: starter.name }), text: tl('{v0} times after a quiet spell of 6+ hours.', { v0: fmtInt(starter.starts) }) },
        chat.busiestDay && { icon: 'calendar', title: tl('Busiest day: {v0}', { v0: dateShort(new Date(`${chat.busiestDay.day}T12:00:00`).getTime()) }), text: tl('{v0} messages in one day.', { v0: fmtInt(chat.busiestDay.count) }) },
        owl && owl.nightShare > 0.05 && { icon: 'moon', title: tl('Night owl: {v0}', { v0: owl.name }), text: tl('{v0}% of their messages are sent between midnight and 5 am.', { v0: Math.round(owl.nightShare * 100) }) },
        { icon: 'clock', title: tl('You talk most around {v0}:00', { v0: peak }), text: tl('{v0} is your busiest weekday.', { v0: DAYS()[topDay] }) },
      ]),
    ),
    months.length > 1 ? panel({ title: tl('Messages per month') }, barChart(months, { title: tl('Messages'), ariaLabel: tl('Messages per month') })) : null,
    h(
      'div',
      { class: 'panels panels--2' },
      panel({ title: tl('By hour of day') }, barChart(chat.byHour.map((v, i) => ({ label: String(i), value: v })), { title: tl('Messages'), height: 180 })),
      panel({ title: tl('By weekday') }, barChart(chat.byWeekday.map((v, i) => ({ label: DAYS()[i], value: v })), { title: tl('Messages'), height: 180, color: 'var(--c3)' })),
    ),
    h(
      'div',
      { class: 'panels panels--2' },
      panel({ title: tl('Most used words') }, chat.topWords.length ? rankList(chat.topWords, { limit: full ? 20 : 5 }) : h('p', { class: 'text-2' }, tl('Not enough text yet.'))),
      panel({ title: tl('Favourite emojis') }, chat.topEmojis.length ? rankList(chat.topEmojis, { limit: full ? 12 : 5, color: 'var(--c2)' }) : h('p', { class: 'text-2' }, tl('No emojis in this chat.'))),
    ),
    full ? null : upsell({ title: tl('Unlock the whole chat'), text: tl('Full word and emoji rankings, a detailed card for every person and every chat you drop.'), onUpgrade: () => ctx.upgrade('chat') }),
  );
}

function peopleView(chat, ctx) {
  const full = ctx.pro || ctx.demo;
  const list = full ? chat.people : chat.people.slice(0, 2);
  return h(
    'div',
    { class: 'app-content' },
    viewHead(tl('Person by person'), tl('How everyone in “{v0}” writes.', { v0: chat.title })),
    list.map((p) =>
      panel(
        { title: p.name },
        h(
          'div',
          { class: 'stats' },
          stat({ label: tl('Messages'), value: fmtInt(p.messages), sub: tl('{v0}% of the chat', { v0: Math.round((p.messages / chat.total) * 100) }) }),
          stat({ label: tl('Words per message'), value: p.messages - p.media ? (p.words / Math.max(1, p.messages - p.media - p.deleted)).toFixed(1) : '—' }),
          stat({ label: tl('Typical reply time'), value: duration(p.replyMs) }),
          stat({ label: tl('Media sent'), value: fmtInt(p.media) }),
          stat({ label: tl('Links shared'), value: fmtInt(p.links) }),
          stat({ label: tl('Deleted messages'), value: fmtInt(p.deleted) }),
        ),
        p.topEmojis.length ? h('p', { class: 'text-2' }, `${tl('Top emojis')}: ${p.topEmojis.map((e) => e.key).join(' ')}`) : null,
      ),
    ),
    !full && chat.people.length > 2 ? upsell({ title: tl('{v0} more people in this chat', { v0: fmtInt(chat.people.length - 2) }), text: tl('See how every person writes: reply times, words, media and emojis.'), onUpgrade: () => ctx.upgrade('chat') }) : null,
  );
}

function chatsView(ds, ctx) {
  return h(
    'div',
    { class: 'app-content' },
    viewHead(tl('All chats'), tl('{v0} chats in what you dropped.', { v0: fmtInt(ds.chats.length) })),
    panel(null, rankList(ds.chats.map((c) => ({ key: c.title, count: c.total })), { limit: ctx.pro || ctx.demo ? 50 : 3 })),
    ctx.pro || ctx.demo || ds.chats.length <= 3 ? null : upsell({ title: tl('{v0} more chats', { v0: fmtInt(ds.chats.length - 3) }), text: tl('Full word and emoji rankings, a detailed card for every person and every chat you drop.'), onUpgrade: () => ctx.upgrade('chat') }),
  );
}

const PART_LABEL = () => ({ starts: tl('Starts the conversation'), speed: tl('Replies faster'), messages: tl('Sends more messages'), words: tl('Writes longer messages'), doubles: tl('Double-texts after silence') });

function effortView(chat, ctx) {
  const e = effortScore(chat);
  const full = ctx.pro || ctx.demo;
  const winner = e.scoreA >= e.scoreB ? e.a : e.b;
  const gap = Math.abs(e.scoreA - e.scoreB);
  const verdict = gap < 6 ? tl('A perfectly balanced friendship.') : gap < 16 ? tl('{v0} puts in a little more effort.', { v0: winner.name }) : tl('{v0} clearly cares more.', { v0: winner.name });
  const labels = PART_LABEL();
  return h(
    'div',
    { class: 'app-content' },
    viewHead(tl('Who cares more?'), tl('Five signals from the whole chat, weighed into one effort score.')),
    panel(
      { title: verdict },
      splitBar([
        { label: e.a.name, value: e.scoreA, color: 'var(--c1)' },
        { label: e.b.name, value: e.scoreB, color: 'var(--c3)' },
      ]),
    ),
    full
      ? panel(
          { title: tl('Why'), text: tl('Each signal shows how much of it comes from {v0}.', { v0: e.a.name }) },
          rankList(Object.keys(labels).map((k) => ({ key: labels[k], count: Math.round(e.parts[k] * 100) })), { max: 100, valueLabel: (v) => `${v}% · ${100 - v}%` }),
          h('p', { class: 'text-2' }, tl('Left: {v0} · right: {v1}.', { v0: e.a.name, v1: e.b.name })),
        )
      : upsell({ title: gap < 6 ? tl('See the full breakdown') : tl('See why {v0} scores higher', { v0: winner.name }), text: tl('The breakdown: who starts, who replies faster, who double-texts and who writes more.'), onUpgrade: () => ctx.upgrade('chat') }),
  );
}

function cardView(chat, ctx) {
  const full = ctx.pro || ctx.demo;
  const canvas = drawChatCard(chat, effortScore(chat), { watermark: !full });
  canvas.style.cssText = 'width:100%;max-width:420px;height:auto;border-radius:18px;display:block;margin:0 auto';
  const name = `chat-wrapped-${String(chat.title || 'chat').replace(/[^\w-]+/g, '-').slice(0, 30)}.png`;
  const share = h('button', { class: 'btn btn--primary', type: 'button' }, icon('share'), tl('Share'));
  share.addEventListener('click', async () => {
    if (!(await shareCanvas(canvas, name).catch(() => false))) downloadCanvas(canvas, name);
  });
  const save = h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => downloadCanvas(canvas, name) }, icon('download'), tl('Save image'));
  return h(
    'div',
    { class: 'app-content' },
    viewHead(tl('Chat Wrapped'), tl('Your chat as a card — made on your device, ready for your story.')),
    panel(null, canvas, h('div', { class: 'drop-actions', style: { justifyContent: 'center', marginTop: '18px' } }, share, save)),
    full ? null : upsell({ title: tl('Remove the watermark'), text: tl('Plus gives you clean cards for every chat.'), onUpgrade: () => ctx.upgrade('chat') }),
  );
}

export function whatsappViews(ds, ctx) {
  const chat = ds.chats[0];
  const views = [
    { id: 'overview', label: tl('Chat overview'), icon: 'home', render: () => overview(chat, ctx) },
    ...(chat.people.length === 2 ? [{ id: 'effort', label: tl('Who cares more?'), icon: 'heart', render: () => effortView(chat, ctx) }] : []),
    { id: 'card', label: tl('Chat Wrapped'), icon: 'sparkles', render: () => cardView(chat, ctx) },
    { id: 'people', label: tl('Person by person'), icon: 'users', count: chat.people.length, render: () => peopleView(chat, ctx) },
  ];
  if (ds.chats.length > 1) views.push({ id: 'chats', label: tl('All chats'), icon: 'message', count: ds.chats.length, render: () => chatsView(ds, ctx) });
  return views;
}
