// Floating "Help" button on every page: an AI help bot for quick answers, a
// message form that reaches the owner (e-mail + Telegram), and the direct
// contacts from SUPPORT_CONTACT. Opened by the button or any [data-support-open].

import { h, icon, clear } from './ui.js';
import { api, getConfig } from './api.js';
import { t, lang } from './i18n.js';

const STORE = 'unw.support';
const load = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE)) || {};
  } catch {
    return {};
  }
};
const save = (v) => {
  try {
    sessionStorage.setItem(STORE, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};

// Plain text with site paths (/pricing/) and links made clickable — never innerHTML.
function richText(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(/(https?:\/\/[^\s)]+|(?<![\w/])\/[a-z0-9][\w\-/#]*\/?)/gi)) {
    const href = m[0].replace(/[.,;:!?]+$/, '');
    out.push(text.slice(last, m.index));
    const external = /^https?:/.test(href) && !href.startsWith(location.origin);
    out.push(h('a', { href, ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }, href));
    last = m.index + href.length;
  }
  out.push(text.slice(last));
  return out;
}

function contactLinks(text) {
  if (!text) return [];
  return String(text)
    .split(/\s*·\s*/)
    .map((part) => {
      const [, label = '', value = part] = part.match(/^([^:]+):\s*(.+)$/) || [];
      if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value)) return { kind: 'inbox', label: t('E-mail'), value, href: `mailto:${value}` };
      if (/telegram/i.test(label) && /^@?\w{4,}$/.test(value)) return { kind: 'send', label: 'Telegram', value, href: `https://t.me/${value.replace(/^@/, '')}` };
      if (/whatsapp/i.test(label) && /^\+?[\d\s]{7,}$/.test(value)) return { kind: 'message', label: 'WhatsApp', value, href: `https://wa.me/${value.replace(/\D/g, '')}` };
      return null;
    })
    .filter(Boolean);
}

let panel;
let fab;

export async function initSupport() {
  const config = await getConfig().catch(() => ({}));
  const state = load();
  state.messages ||= [];
  const contacts = contactLinks(config.support);
  const botOn = Boolean(config.supportBot);

  fab = h('button', { class: 'sw-fab', type: 'button', 'aria-label': t('Help & contact'), 'aria-expanded': 'false', title: t('Help & contact') }, icon('message'), h('span', { class: 'sw-fab-label' }, t('Help')));
  const log = h('div', { class: 'sw-log', role: 'log', 'aria-live': 'polite' });
  const input = h('textarea', { class: 'input sw-input', rows: 1, maxLength: 1000, placeholder: t('Ask a question…'), 'aria-label': t('Your question') });
  const sendBtn = h('button', { class: 'btn btn--primary btn--sm sw-send', type: 'submit', 'aria-label': t('Send') }, icon('send'));
  const askForm = h('form', { class: 'sw-ask' }, input, sendBtn);

  const tabs = { chat: null, form: null };
  const chatView = h('div', { class: 'sw-view' }, log, askForm);
  const formView = h('div', { class: 'sw-view' });
  const head = h(
    'div',
    { class: 'sw-head' },
    h('div', { class: 'sw-title' }, h('span', { class: 'sw-dot' }), h('div', null, h('b', null, t('Unwrapped support')), h('span', null, botOn ? t('Instant answers · a human replies within 24 h') : t('We reply within 24 hours')))),
    h('button', { class: 'icon-btn sw-close', type: 'button', 'aria-label': t('Close'), onclick: () => toggle(false) }, icon('close')),
  );
  const tabBar = h('div', { class: 'sw-tabs', role: 'tablist' });
  const body = h('div', { class: 'sw-body' });
  const direct = contacts.length
    ? h('div', { class: 'sw-direct' }, h('span', null, t('Or contact us directly:')), h('div', { class: 'sw-direct-links' }, contacts.map((c) => h('a', { href: c.href, target: c.kind === 'inbox' ? null : '_blank', rel: 'noopener noreferrer', title: c.value }, icon(c.kind), c.label))))
    : null;
  panel = h('div', { class: 'sw-panel', role: 'dialog', 'aria-label': t('Help & contact'), hidden: true }, head, tabBar, body, direct);

  const show = (name) => {
    for (const [k, b] of Object.entries(tabs)) b?.setAttribute('aria-selected', String(k === name));
    clear(body).append(name === 'chat' ? chatView : formView);
    if (name === 'form') drawForm();
    state.tab = name;
    save(state);
    (name === 'chat' ? input : formView.querySelector('textarea, input'))?.focus({ preventScroll: true });
  };
  if (botOn) {
    tabs.chat = h('button', { class: 'sw-tab', type: 'button', role: 'tab', onclick: () => show('chat') }, icon('bot'), t('Ask the assistant'));
    tabs.form = h('button', { class: 'sw-tab', type: 'button', role: 'tab', onclick: () => show('form') }, icon('inbox'), t('Message the team'));
    tabBar.append(tabs.chat, tabs.form);
  } else tabBar.hidden = true;

  // ---- chat ----
  const bubble = (m) => h('div', { class: `sw-msg sw-msg--${m.role === 'user' ? 'me' : 'bot'}` }, m.role === 'user' ? m.content : richText(m.content), m.handoff ? h('button', { class: 'btn btn--ghost btn--sm sw-handoff', type: 'button', onclick: () => show('form') }, icon('user'), t('Message a human')) : null);
  const drawLog = () => {
    clear(log).append(h('div', { class: 'sw-msg sw-msg--bot' }, t('Hi! Ask me anything about Unwrapped: downloading your data, uploading, results, plans or payments.')));
    if (!state.messages.length) {
      log.append(
        h(
          'div',
          { class: 'sw-chips' },
          [t('How do I download my Instagram data?'), t('Who unfollowed me is empty'), t('How can I pay without crypto?'), t('I paid but got no license')].map((q) => h('button', { type: 'button', class: 'sw-chip', onclick: () => ask(q) }, q)),
        ),
      );
    }
    state.messages.forEach((m) => log.append(bubble(m)));
    log.scrollTop = log.scrollHeight;
  };
  let busy = false;
  async function ask(text) {
    const q = text.trim().slice(0, 1000);
    if (!q || busy) return;
    busy = true;
    sendBtn.disabled = true;
    state.messages.push({ role: 'user', content: q });
    input.value = '';
    drawLog();
    const typing = h('div', { class: 'sw-msg sw-msg--bot sw-typing' }, h('span'), h('span'), h('span'));
    log.append(typing);
    log.scrollTop = log.scrollHeight;
    try {
      const res = await api('/api/support/ask', { method: 'POST', body: { lang, page: location.pathname, messages: state.messages.slice(-8).map(({ role, content }) => ({ role, content })) }, timeout: 30000 });
      state.messages.push(res.answer ? { role: 'assistant', content: res.answer, handoff: res.handoff } : { role: 'assistant', content: t('I can’t answer that one — please send your question to the team and we’ll reply by e-mail.'), handoff: true });
    } catch (err) {
      state.messages.push({ role: 'assistant', content: err?.status === 429 ? t('You’ve asked a lot of questions — please message the team instead.') : t('Something went wrong. Please message the team instead.'), handoff: true });
    }
    state.messages = state.messages.slice(-30);
    save(state);
    busy = false;
    sendBtn.disabled = false;
    drawLog();
    input.focus({ preventScroll: true });
  }
  askForm.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(input.value);
    }
  });

  // ---- message form ----
  function drawForm() {
    if (state.sent) {
      clear(formView).append(
        h('div', { class: 'sw-done' }, h('span', { class: 'sw-done-ico' }, icon('check')), h('b', null, t('Message sent!')), h('p', null, t('We usually reply within 24 hours to {email}. Check your spam folder too.', { email: state.sent })), h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { state.sent = null; save(state); drawForm(); } }, t('Send another message'))),
      );
      return;
    }
    const transcript = state.messages.filter((m) => m.role === 'user').map((m) => m.content).slice(-3).join('\n');
    const email = h('input', { class: 'input', type: 'email', required: true, maxLength: 120, autocomplete: 'email', placeholder: 'you@example.com', value: state.email || '' });
    const name = h('input', { class: 'input', type: 'text', maxLength: 60, autocomplete: 'given-name', placeholder: t('Your name (optional)'), value: state.name || '' });
    const msg = h('textarea', { class: 'input', rows: 5, required: true, minLength: 5, maxLength: 3000, placeholder: t('How can we help? For payments, add your order ID or transaction hash.') });
    msg.value = state.draft || transcript;
    const err = h('div', { class: 'err-box', hidden: true });
    const submit = h('button', { class: 'btn btn--primary', type: 'submit' }, icon('send'), t('Send message'));
    const form = h(
      'form',
      { class: 'sw-form' },
      h('label', null, h('span', null, t('Your e-mail')), email),
      h('label', null, h('span', null, t('Name')), name),
      h('label', null, h('span', null, t('Message')), msg),
      err,
      submit,
      h('p', { class: 'sw-note' }, icon('shield'), t('Never send us your password or export file — we don’t need them.')),
    );
    msg.addEventListener('input', () => {
      state.draft = msg.value;
      save(state);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      submit.disabled = true;
      try {
        await api('/api/support', { method: 'POST', body: { email: email.value.trim(), name: name.value.trim(), message: msg.value.trim(), lang, page: location.pathname } });
        Object.assign(state, { sent: email.value.trim(), email: email.value.trim(), name: name.value.trim(), draft: '' });
        save(state);
        drawForm();
      } catch (ex) {
        err.textContent = ex?.code === 'bad_email' ? t('Please enter a valid e-mail address so we can reply.') : ex?.status === 429 ? t('Too many messages — please try again in an hour.') : t('Could not send. Please try again or use one of the contacts below.');
        err.hidden = false;
        submit.disabled = false;
      }
    });
    clear(formView).append(form);
  }

  function toggle(open = panel.hidden) {
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('sw-open', open);
    if (open) {
      if (botOn) drawLog();
      show(botOn ? state.tab || 'chat' : 'form');
    } else fab.focus({ preventScroll: true });
  }
  fab.addEventListener('click', () => toggle());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) toggle(false);
  });
  document.body.append(fab, panel);
  return {
    open(tab) {
      if (panel.hidden) toggle(true);
      if (tab === 'form' || !botOn) show('form');
    },
  };
}
