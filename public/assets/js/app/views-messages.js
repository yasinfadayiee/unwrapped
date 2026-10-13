// Message viewer: read, search and save your own DM history from the export.
// The export's raw files are unreadable for most people; here every chat opens
// like a messenger — on the device, nothing is uploaded.

import { h, icon, clear, toast, downloadBlob, avatarStyle } from '../lib/ui.js';
import { fmtInt, dateShort } from '../lib/format.js';
import { viewHead, emptyState, lockCard } from './components.js';
import { locale } from '../lib/i18n.js';
import { lazySrc } from '../lib/media.js';
import { t as tl } from '../lib/i18n.js';

const PAGE = 300;
const timeFmt = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const cache = new WeakMap();
function loadCached(thread) {
  if (!cache.has(thread)) cache.set(thread, thread.load());
  return cache.get(thread);
}

function mediaEl(m) {
  if (!m.entry) return h('span', { class: 'msg-media-missing' }, icon(m.kind === 'photo' ? 'image' : 'play'), tl('Media not included in this export'));
  const el = m.kind === 'photo' ? h('img', { alt: '', loading: 'lazy' }) : h(m.kind, { controls: true, preload: 'none' });
  el.className = 'msg-media';
  return lazySrc(el, m.entry);
}

function bubble(msg, me, isGroup, query) {
  const mine = msg.sender === me;
  const textEl = msg.text ? h('div', { class: 'msg-text' }, highlight(msg.text, query)) : null;
  return h(
    'div',
    { class: `msg${mine ? ' msg--me' : ''}` },
    isGroup && !mine ? h('div', { class: 'msg-from' }, msg.sender) : null,
    h(
      'div',
      { class: 'msg-bubble' },
      msg.unsent ? h('div', { class: 'msg-text muted' }, tl('Unsent message')) : textEl,
      msg.media.map(mediaEl),
      msg.link ? h('a', { class: 'msg-link', href: msg.link, target: '_blank', rel: 'noopener noreferrer nofollow' }, icon('external'), msg.link.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)) : null,
      h('span', { class: 'msg-time' }, msg.ts ? timeFmt.format(msg.ts) : ''),
    ),
    msg.reactions.length ? h('div', { class: 'msg-reacts' }, msg.reactions.join(' ')) : null,
  );
}

function highlight(text, query) {
  if (!query) return text;
  const out = [];
  const lower = text.toLowerCase();
  let i = 0;
  let j;
  while ((j = lower.indexOf(query, i)) !== -1) {
    out.push(text.slice(i, j), h('mark', null, text.slice(j, j + query.length)));
    i = j + query.length;
  }
  out.push(text.slice(i));
  return out;
}

function transcript(thread, messages) {
  const lines = [`${thread.title}`, `${tl('{v0} messages', { v0: fmtInt(messages.length) })} · ${dateShort(thread.first)} – ${dateShort(thread.last)}`, ''];
  let day = '';
  for (const m of messages) {
    const d = m.ts ? dayFmt.format(m.ts) : '';
    if (d !== day) lines.push('', `— ${d} —`);
    day = d;
    const extras = [m.media.length ? `[${m.media.map((x) => x.kind).join(', ')}]` : '', m.link, m.reactions.join(' ')].filter(Boolean).join(' ');
    lines.push(`[${m.ts ? timeFmt.format(m.ts) : ''}] ${m.sender}: ${m.unsent ? tl('Unsent message') : m.text}${extras ? ` ${extras}` : ''}`);
  }
  return lines.join('\n');
}

export function messagesView(ds, ctx) {
  const msgs = ds.activity.messages;
  const threads = (msgs.every || msgs.threads).filter((t) => t.load);
  const canSearchAll = ctx.can('messages');
  const root = h('div', { class: 'app-content' });
  root.append(viewHead(tl('Message viewer'), tl('Read, search and save your own DM history — {v0} chats, {v1} messages. Opened on this device only.', { v0: fmtInt(threads.length), v1: fmtInt(msgs.total) })));
  if (!threads.length) {
    root.append(emptyState(tl('Your export has no messages. Request “All available information” to read your chats here.'), 'inbox'));
    return root;
  }

  const filter = h('input', { class: 'input', type: 'search', placeholder: tl('Find a chat…'), 'aria-label': tl('Find a chat') });
  const list = h('div', { class: 'msg-list', role: 'list' });
  const pane = h('div', { class: 'msg-pane' });
  const globalInput = h('input', { class: 'input', type: 'search', placeholder: canSearchAll ? tl('Search every chat…') : tl('Search every chat (Plus)'), 'aria-label': tl('Search every chat'), disabled: !canSearchAll });
  const layout = h('div', { class: 'msg-layout' }, h('aside', { class: 'msg-side' }, filter, list), pane);
  root.append(h('div', { class: 'msg-global' }, icon('search'), globalInput), layout);

  let current = null;
  function renderList() {
    const q = filter.value.trim().toLowerCase();
    clear(list);
    for (const t of threads) {
      if (q && !t.title.toLowerCase().includes(q)) continue;
      const btn = h(
        'button',
        { class: 'msg-item', type: 'button', role: 'listitem', 'aria-current': String(t === current) },
        h('span', { class: 'avatar', style: avatarStyle(t.title) }, (t.title[0] || '?').toUpperCase()),
        h('span', { class: 'msg-item-main' }, h('b', null, t.title), h('span', { class: 'tiny muted' }, `${tl('{v0} messages', { v0: fmtInt(t.count) })} · ${dateShort(t.last)}`)),
        t.isGroup ? icon('users') : null,
      );
      btn.addEventListener('click', () => open(t));
      list.append(btn);
    }
  }

  async function open(thread, { query = '' } = {}) {
    current = thread;
    renderList();
    layout.classList.add('is-open');
    clear(pane).append(h('div', { class: 'msg-loading' }, tl('Opening chat…')));
    const messages = await loadCached(thread);
    if (current !== thread) return;
    let shown = PAGE;
    const search = h('input', { class: 'input input--sm', type: 'search', placeholder: tl('Search this chat…'), 'aria-label': tl('Search this chat'), value: query });
    const back = h('button', { class: 'icon-btn msg-back', type: 'button', 'aria-label': tl('All chats') }, icon('arrow-left'));
    back.addEventListener('click', () => layout.classList.remove('is-open'));
    const save = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('download'), tl('Save chat'));
    save.addEventListener('click', () => {
      if (!ctx.can('messages')) return ctx.upgrade('messages');
      downloadBlob(new Blob([transcript(thread, messages)], { type: 'text/plain;charset=utf-8' }), `${thread.title.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'chat'}.txt`);
      toast(tl('Chat saved as a text file'));
    });
    const count = h('span', { class: 'tiny muted' });
    const body = h('div', { class: 'msg-body' });
    pane.replaceChildren(
      h('div', { class: 'msg-head' }, back, h('div', { class: 'msg-head-title' }, h('b', null, thread.title), count), search, save),
      body,
    );

    function draw() {
      const q = search.value.trim().toLowerCase();
      const hits = q ? messages.filter((m) => m.text.toLowerCase().includes(q)) : messages;
      count.textContent = q ? tl('{v0} matches', { v0: fmtInt(hits.length) }) : `${tl('{v0} messages', { v0: fmtInt(messages.length) })} · ${dateShort(thread.first)} – ${dateShort(thread.last)}`;
      clear(body);
      const slice = hits.slice(Math.max(0, hits.length - shown));
      if (hits.length > slice.length) {
        const more = h('button', { class: 'btn btn--ghost btn--sm msg-more', type: 'button' }, tl('Show earlier messages ({v0} left)', { v0: fmtInt(hits.length - slice.length) }));
        more.addEventListener('click', () => {
          const prevHeight = body.scrollHeight;
          shown += PAGE;
          draw();
          body.scrollTop = body.scrollHeight - prevHeight;
        });
        body.append(more);
      }
      if (!hits.length) body.append(emptyState(tl('No matches.'), 'search'));
      let day = '';
      for (const m of slice) {
        const d = m.ts ? dayFmt.format(m.ts) : '';
        if (d !== day) body.append(h('div', { class: 'msg-day' }, d));
        day = d;
        body.append(bubble(m, msgs.me, thread.isGroup, q));
      }
    }
    let timer;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        shown = PAGE;
        draw();
        body.scrollTop = body.scrollHeight;
      }, 200);
    });
    draw();
    body.scrollTop = body.scrollHeight;
  }

  // Search across every conversation: reads them one by one, newest hits first.
  let searchRun = 0;
  globalInput.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const q = globalInput.value.trim().toLowerCase();
    if (q.length < 2) return;
    const run = ++searchRun;
    current = null;
    renderList();
    layout.classList.add('is-open');
    const status = h('div', { class: 'tiny muted' }, tl('Searching…'));
    const results = h('div', { class: 'msg-results' });
    pane.replaceChildren(h('div', { class: 'msg-head' }, h('div', { class: 'msg-head-title' }, h('b', null, tl('Results for “{v0}”', { v0: globalInput.value.trim() })), status)), results);
    let total = 0;
    for (let i = 0; i < threads.length; i++) {
      if (run !== searchRun) return;
      const t = threads[i];
      const hits = (await loadCached(t)).filter((m) => m.text.toLowerCase().includes(q));
      total += hits.length;
      status.textContent = tl('{v0} matches · {v1} of {v2} chats searched', { v0: fmtInt(total), v1: fmtInt(i + 1), v2: fmtInt(threads.length) });
      for (const m of hits.slice(-5).reverse()) {
        const row = h('button', { class: 'msg-hit', type: 'button' }, h('b', null, t.title), h('span', { class: 'tiny muted' }, `${m.sender} · ${dateShort(m.ts)}`), h('span', null, highlight(m.text.length > 180 ? `${m.text.slice(0, 180)}…` : m.text, q)));
        row.addEventListener('click', () => open(t, { query: q }));
        results.append(row);
      }
    }
    if (!total) results.append(emptyState(tl('No matches.'), 'search'));
  });

  filter.addEventListener('input', renderList);
  renderList();
  const wanted = ctx.pendingChat && threads.includes(ctx.pendingChat) ? ctx.pendingChat : null;
  ctx.pendingChat = null;
  open(wanted || threads[0]);
  if (!canSearchAll) root.append(lockCard({ tier: 'plus', title: tl('Search every chat and save conversations with Plus'), text: tl('Find any message across all your chats in seconds, and save a chat as a readable text file.'), onUpgrade: () => ctx.upgrade('messages') }));
  return root;
}
