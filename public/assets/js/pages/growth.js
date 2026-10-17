// Unwrapped Growth dashboard: connect Instagram (official OAuth), manage
// comment-to-DM rules, see results. The session token lives in localStorage.
import { h, clear, icon, toast } from '../lib/ui.js';
import { api, ApiError } from '../lib/api.js';

const KEY = 'unw.growth.session';
const root = document.getElementById('growth-app');
const getSession = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const setSession = (s) => { try { s ? localStorage.setItem(KEY, s) : localStorage.removeItem(KEY); } catch { /* private mode */ } };

const ERRORS = {
  expired: 'The sign-in took too long. Please try again.',
  denied: 'Instagram access was not granted. Nothing was connected.',
  connect: 'Instagram did not accept the connection. Make sure your account is a Business or Creator account, then try again.',
};

function connectButton(label = 'Connect Instagram') {
  const s = getSession();
  return h('a', { class: 'btn btn--primary btn--lg', href: `/api/growth/ig/connect${s ? `?s=${encodeURIComponent(s)}` : ''}` }, icon('instagram'), label);
}

function intro(note) {
  clear(root).append(
    note ? h('div', { class: 'err-box', role: 'alert' }, note) : '',
    h(
      'div',
      { class: 'card card--pad stack', style: { '--stack': '14px' } },
      h('h2', { class: 'h3' }, 'How it works'),
      h(
        'ol',
        { class: 'checklist text-2' },
        h('li', null, icon('check'), h('span', null, h('b', null, 'Connect Instagram'), ' with the official sign-in. You need a Business or Creator account (free to switch in the app).')),
        h('li', null, icon('check'), h('span', null, h('b', null, 'Pick a keyword'), ' — e.g. “link” — and write the DM people should get.')),
        h('li', null, icon('check'), h('span', null, h('b', null, 'Post as usual.'), ' Everyone who comments the keyword gets your DM within seconds.')),
      ),
      h('p', { class: 'small text-2' }, 'Free trial: 7 days or 100 automatic DMs, once per Instagram account. No password, no likes or follows on your behalf — only Instagram’s own messaging API.'),
      h('div', null, connectButton()),
    ),
  );
}

function ruleForm(account, rule, onSaved) {
  const keyword = h('input', { class: 'input', placeholder: 'Keyword, e.g. link', value: rule?.keyword || '', maxlength: 40, 'aria-label': 'Keyword' });
  const dm = h('textarea', { class: 'input', rows: 3, placeholder: 'DM text — use {name} for their @username', maxlength: 900, 'aria-label': 'DM text' }, rule?.dmText || '');
  const pub = h('input', { class: 'input', placeholder: 'Optional public reply, e.g. Sent you a DM ✨', value: rule?.publicReply || '', maxlength: 300, 'aria-label': 'Public reply' });
  const save = h('button', { class: 'btn btn--primary', type: 'button' }, rule ? 'Save' : 'Add rule');
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const res = await api('/api/growth/rules', { method: 'POST', headers: auth(), body: { accountId: account.id, id: rule?.id, keyword: keyword.value, dmText: dm.value, publicReply: pub.value } });
      toast('Saved');
      onSaved(res);
    } catch (err) {
      toast(err?.code === 'missing_fields' ? 'Keyword and DM text are required' : err?.code === 'too_many_rules' ? 'Up to 20 rules per account' : 'Could not save', { iconName: 'warning' });
    } finally {
      save.disabled = false;
    }
  });
  return h('div', { class: 'stack', style: { '--stack': '10px' } }, keyword, dm, pub, h('div', null, save));
}

const auth = () => ({ authorization: `Bearer ${getSession()}` });
const date = (ms) => new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });

function accessLine(a) {
  const x = a.access;
  if (x.mode === 'paid') return h('span', { class: 'badge badge--uv' }, `Active until ${date(x.until)}`);
  if (x.mode === 'trial') return h('span', { class: 'badge' }, x.fresh ? 'Free trial ready — starts with your first DM' : `Free trial · ${x.left} DMs left · until ${date(x.until)}`);
  return h('span', { class: 'badge', style: { background: 'rgba(224,87,74,.18)', color: '#ff8a7e' } }, 'Trial ended — subscribe to keep it running');
}

function render(data) {
  if (!data.accounts.length) return intro();
  clear(root);
  for (const a of data.accounts) {
    const rules = h(
      'div',
      { class: 'stack', style: { '--stack': '12px' } },
      a.rules.length
        ? a.rules.map((r) => {
            const del = h('button', { class: 'row-btn', type: 'button' }, 'Delete');
            del.addEventListener('click', async () => {
              if (!confirm(`Delete the rule “${r.keyword}”?`)) return;
              render(await api('/api/growth/rules/delete', { method: 'POST', headers: auth(), body: { accountId: a.id, id: r.id } }));
            });
            return h('div', { class: 'card card--pad', style: { display: 'flex', gap: '12px', alignItems: 'flex-start', justifyContent: 'space-between' } }, h('div', null, h('b', null, `“${r.keyword}”`), h('p', { class: 'small text-2', style: { margin: '6px 0 0', whiteSpace: 'pre-wrap' } }, r.dmText)), del);
          })
        : h('p', { class: 'text-2' }, 'No rules yet — add your first keyword below.'),
    );
    const off = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, 'Disconnect');
    off.addEventListener('click', async () => {
      if (!confirm(`Disconnect @${a.username}? Its rules are deleted.`)) return;
      await api('/api/growth/disconnect', { method: 'POST', headers: auth(), body: { accountId: a.id } });
      load();
    });
    root.append(
      h(
        'section',
        { class: 'card card--pad stack', style: { '--stack': '16px' } },
        h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } }, h('div', { class: 'h3' }, `@${a.username}`), accessLine(a)),
        h('div', { class: 'proof', style: { display: 'flex', gap: '24px' } }, h('div', null, h('b', { class: 'h2' }, String(a.stats.week)), h('div', { class: 'small text-2' }, 'DMs this week')), h('div', null, h('b', { class: 'h2' }, String(a.stats.total)), h('div', { class: 'small text-2' }, 'DMs in total'))),
        h('h3', { class: 'h3' }, 'Keyword rules'),
        rules,
        h('details', null, h('summary', null, 'Add a rule'), h('div', { style: { marginTop: '12px' } }, ruleForm(a, null, render))),
        h('div', null, off),
      ),
    );
  }
  root.append(h('div', null, connectButton('Connect another account')));
}

async function load(note) {
  if (!getSession()) return intro(note);
  try {
    render(await api('/api/growth/me', { headers: auth() }));
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      setSession('');
      return intro(note);
    }
    if (err instanceof ApiError && err.code === 'growth_disabled') {
      clear(root).append(h('div', { class: 'card card--pad' }, h('h2', { class: 'h3' }, 'Launching soon'), h('p', { class: 'text-2' }, 'Unwrapped Growth is in private beta while Instagram reviews our app.')));
      return;
    }
    clear(root).append(h('div', { class: 'err-box' }, 'Could not load your accounts. Please refresh.'));
  }
}

const hash = new URLSearchParams(location.hash.slice(1));
if (hash.get('session')) setSession(hash.get('session'));
const note = ERRORS[hash.get('error')] || '';
if (location.hash) history.replaceState(null, '', location.pathname);
load(note);
