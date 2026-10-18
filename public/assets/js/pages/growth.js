// Unwrapped Growth dashboard: connect Instagram (official OAuth), manage
// comment-to-DM rules, see results. The session token lives in localStorage.
import { h, clear, icon, toast } from '../lib/ui.js';
import { api, ApiError } from '../lib/api.js';
import { t, locale } from '../lib/i18n.js';

const KEY = 'unw.growth.session';
const root = document.getElementById('growth-app');
const getSession = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const setSession = (s) => { try { s ? localStorage.setItem(KEY, s) : localStorage.removeItem(KEY); } catch { /* private mode */ } };

const ERRORS = {
  expired: () => t('The sign-in took too long. Please try again.'),
  denied: () => t('Instagram access was not granted. Nothing was connected.'),
  connect: () => t('Instagram did not accept the connection. Make sure your account is a Business or Creator account, then try again.'),
};
const paidNote = () => t('Thanks! Your payment is being confirmed on the network. Growth switches to paid automatically within a few minutes — refresh this page to check.');

function connectButton(label = t('Connect Instagram')) {
  const s = getSession();
  return h('a', { class: 'btn btn--primary btn--lg', href: `/api/growth/ig/connect${s ? `?s=${encodeURIComponent(s)}` : ''}` }, icon('instagram'), label);
}

function intro(note) {
  clear(root).append(
    note ? h('div', { class: 'err-box', role: 'alert' }, note) : '',
    h(
      'div',
      { class: 'card card--pad stack', style: { '--stack': '14px' } },
      h('h2', { class: 'h3' }, t('How it works')),
      h(
        'ol',
        { class: 'checklist text-2' },
        h('li', null, icon('check'), h('span', null, h('b', null, t('Connect Instagram')), ' ', t('with the official sign-in. You need a Business or Creator account (free to switch in the app).'))),
        h('li', null, icon('check'), h('span', null, h('b', null, t('Pick a keyword')), ' ', t('— e.g. “link” — and write the DM people should get.'))),
        h('li', null, icon('check'), h('span', null, h('b', null, t('Post as usual.')), ' ', t('Everyone who comments the keyword gets your DM within seconds.'))),
      ),
      h('p', { class: 'small text-2' }, t('Free trial: 7 days or 100 automatic DMs, once per Instagram account. No password, no likes or follows on your behalf — only Instagram’s own messaging API.')),
      h('div', null, connectButton()),
    ),
  );
}

function ruleForm(account, rule, onSaved) {
  const keyword = h('input', { class: 'input', placeholder: t('Keyword, e.g. link'), value: rule?.keyword || '', maxlength: 40, 'aria-label': t('Keyword') });
  const dm = h('textarea', { class: 'input', rows: 3, placeholder: t('DM text — use {name} for their @username'), maxlength: 900, 'aria-label': t('DM text') }, rule?.dmText || '');
  const pub = h('input', { class: 'input', placeholder: t('Optional public reply, e.g. Sent you a DM ✨'), value: rule?.publicReply || '', maxlength: 300, 'aria-label': t('Public reply') });
  const save = h('button', { class: 'btn btn--primary', type: 'button' }, rule ? t('Save') : t('Add rule'));
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const res = await api('/api/growth/rules', { method: 'POST', headers: auth(), body: { accountId: account.id, id: rule?.id, keyword: keyword.value, dmText: dm.value, publicReply: pub.value } });
      toast(t('Saved'));
      onSaved(res);
    } catch (err) {
      toast(err?.code === 'missing_fields' ? t('Keyword and DM text are required') : err?.code === 'too_many_rules' ? t('Up to 20 rules per account') : t('Could not save'), { iconName: 'warning' });
    } finally {
      save.disabled = false;
    }
  });
  return h('div', { class: 'stack', style: { '--stack': '10px' } }, keyword, dm, pub, h('div', null, save));
}

const auth = () => ({ authorization: `Bearer ${getSession()}` });
const date = (ms) => new Date(ms).toLocaleDateString(locale, { dateStyle: 'medium' });

function accessLine(a) {
  const x = a.access;
  if (x.mode === 'paid') return h('span', { class: 'badge badge--uv' }, t('Active until {date}', { date: date(x.until) }));
  if (x.mode === 'trial') return h('span', { class: 'badge' }, x.fresh ? t('Free trial ready — starts with your first DM') : t('Free trial · {left} DMs left · until {date}', { left: x.left, date: date(x.until) }));
  return h('span', { class: 'badge', style: { background: 'rgba(224,87,74,.18)', color: '#ff8a7e' } }, t('Trial ended — subscribe to keep it running'));
}

const money = (n) => `$${Number(n).toFixed(Number.isInteger(n) ? 0 : 2)}`;

// Pay for 30 more days of this account (NOWPayments invoice, USDT and other coins).
function payButton(a, data) {
  const plan = data.plans?.[0];
  if (!plan || !data.payments) {
    return a.access.mode === 'expired' ? h('p', { class: 'small text-2' }, t('Payments are being set up. Please check back soon.')) : '';
  }
  const label = a.access.mode === 'paid' ? t('Add {days} days · {price}', { days: plan.days, price: money(plan.priceUsd) }) : t('Subscribe · {price} / {days} days', { price: money(plan.priceUsd), days: plan.days });
  const btn = h('button', { class: a.access.mode === 'expired' ? 'btn btn--primary' : 'btn btn--ghost btn--sm', type: 'button' }, label);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const res = await api('/api/growth/checkout', { method: 'POST', headers: auth(), body: { accountId: a.id, plan: plan.id } });
      location.href = res.redirectUrl;
    } catch (err) {
      toast(err?.code === 'too_many_requests' ? t('Too many attempts — please wait a few minutes.') : t('The payment provider did not respond. Please try again.'), { iconName: 'warning' });
      btn.disabled = false;
    }
  });
  return h('div', { class: 'stack', style: { '--stack': '6px' } }, btn, h('p', { class: 'small text-2', style: { margin: 0 } }, t('Pay with USDT or 150+ other coins. No auto-renewal; paying early adds to the time left.')));
}

function render(data, note) {
  if (!data.accounts.length) return intro(note);
  clear(root);
  if (note) root.append(h('div', { class: 'card card--pad', role: 'status' }, note));
  for (const a of data.accounts) {
    const rules = h(
      'div',
      { class: 'stack', style: { '--stack': '12px' } },
      a.rules.length
        ? a.rules.map((r) => {
            const del = h('button', { class: 'row-btn', type: 'button' }, t('Delete'));
            del.addEventListener('click', async () => {
              if (!confirm(t('Delete the rule “{keyword}”?', { keyword: r.keyword }))) return;
              render(await api('/api/growth/rules/delete', { method: 'POST', headers: auth(), body: { accountId: a.id, id: r.id } }));
            });
            return h('div', { class: 'card card--pad', style: { display: 'flex', gap: '12px', alignItems: 'flex-start', justifyContent: 'space-between' } }, h('div', null, h('b', null, `“${r.keyword}”`), h('p', { class: 'small text-2', style: { margin: '6px 0 0', whiteSpace: 'pre-wrap' } }, r.dmText)), del);
          })
        : h('p', { class: 'text-2' }, t('No rules yet — add your first keyword below.')),
    );
    const off = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, t('Disconnect'));
    off.addEventListener('click', async () => {
      if (!confirm(t('Disconnect @{name}? Its rules are deleted.', { name: a.username }))) return;
      await api('/api/growth/disconnect', { method: 'POST', headers: auth(), body: { accountId: a.id } });
      load();
    });
    root.append(
      h(
        'section',
        { class: 'card card--pad stack', style: { '--stack': '16px' } },
        h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } }, h('div', { class: 'h3' }, `@${a.username}`), accessLine(a)),
        h('div', { class: 'proof', style: { display: 'flex', gap: '24px' } }, h('div', null, h('b', { class: 'h2' }, String(a.stats.week)), h('div', { class: 'small text-2' }, t('DMs this week'))), h('div', null, h('b', { class: 'h2' }, String(a.stats.total)), h('div', { class: 'small text-2' }, t('DMs in total')))),
        h('h3', { class: 'h3' }, t('Keyword rules')),
        payButton(a, data),
        rules,
        h('details', null, h('summary', null, t('Add a rule')), h('div', { style: { marginTop: '12px' } }, ruleForm(a, null, render))),
        h('div', null, off),
      ),
    );
  }
  root.append(h('div', null, connectButton(t('Connect another account'))));
}

async function load(note) {
  if (!getSession()) return intro(note);
  try {
    render(await api('/api/growth/me', { headers: auth() }), note);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      setSession('');
      return intro(note);
    }
    if (err instanceof ApiError && err.code === 'growth_disabled') {
      clear(root).append(h('div', { class: 'card card--pad' }, h('h2', { class: 'h3' }, t('Launching soon')), h('p', { class: 'text-2' }, t('Unwrapped Growth is in private beta while Instagram reviews our app.'))));
      return;
    }
    clear(root).append(h('div', { class: 'err-box' }, t('Could not load your accounts. Please refresh.')));
  }
}

const hash = new URLSearchParams(location.hash.slice(1));
if (hash.get('session')) setSession(hash.get('session'));
const note = hash.get('paid') ? paidNote() : ERRORS[hash.get('error')]?.() || '';
if (location.hash) history.replaceState(null, '', location.pathname);
load(note);
