// Asks for a rating once, a while after someone's first successful analysis.
// Only what the person types is sent — nothing from their export.

import { h, icon, toast } from './ui.js';
import { api } from './api.js';
import { t, lang } from './i18n.js';

const KEY = 'unw.feedback.v1';
const LATER_DAYS = 14;

function state() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}
function save(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

export function maybeAskFeedback({ platform } = {}) {
  const s = state();
  if (s.done || (s.later && s.later > Date.now()) || document.querySelector('.feedback-card')) return;
  let rating = 0;
  const close = (later) => {
    if (later) save({ later: Date.now() + LATER_DAYS * 86_400_000 });
    card.remove();
  };
  const body = h('div', { class: 'stack', style: { '--stack': '10px' } });
  const stars = h(
    'div',
    { class: 'fb-stars', role: 'radiogroup', 'aria-label': t('Your rating') },
    [1, 2, 3, 4, 5].map((n) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': t('{n} of 5', { n }) }, h('span', { class: 'star' }));
      b.addEventListener('click', () => pick(n));
      return b;
    }),
  );
  const card = h(
    'aside',
    { class: 'feedback-card', 'aria-label': t('Feedback') },
    h('button', { class: 'icon-btn fb-close', type: 'button', 'aria-label': t('Not now'), onClick: () => close(true) }, icon('close')),
    h('b', null, t('How useful was Unwrapped for you?')),
    stars,
    body,
  );

  function pick(n) {
    rating = n;
    [...stars.children].forEach((b, i) => {
      b.classList.toggle('on', i < n);
      b.setAttribute('aria-checked', String(i + 1 === n));
    });
    const good = n >= 4;
    const text = h('textarea', { class: 'input', rows: 3, maxlength: 500, placeholder: good ? t('What did you like? (optional)') : t('What should we improve? (optional)'), 'aria-label': t('Your feedback') });
    const name = h('input', { class: 'input', maxlength: 40, placeholder: t('Your name or @handle (optional)'), 'aria-label': t('Name') });
    const share = h('input', { type: 'checkbox', id: 'fb-share' });
    const send = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, t('Send'));
    send.addEventListener('click', async () => {
      send.disabled = true;
      try {
        await api('/api/feedback', { method: 'POST', body: { rating, text: text.value, name: good ? name.value : '', public: good && share.checked, platform, lang } });
        save({ done: true });
        card.remove();
        toast(t('Thank you!'), { iconName: 'heart' });
      } catch {
        send.disabled = false;
        toast(t('Could not send — please try again.'), { iconName: 'warning' });
      }
    });
    body.replaceChildren(
      text,
      good ? name : '',
      good ? h('label', { class: 'small text-2 fb-share', for: 'fb-share' }, share, t('You may show this on the website')) : '',
      h('p', { class: 'tiny muted', style: { margin: 0 } }, t('Only what you type here is sent — nothing from your export.')),
      h('div', null, send),
    );
    text.focus();
  }

  document.body.append(card);
}
