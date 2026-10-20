// The signed-in part of /account/: password-free sign-up and sign-in with an
// e-mailed code, then everything tied to that e-mail in one place.

import { h, icon, toast } from '../lib/ui.js';
import { api, ApiError } from '../lib/api.js';
import { activateKey } from '../lib/license.js';
import { TIER_NAME } from '../lib/tiers.js';
import { t, lang, locale } from '../lib/i18n.js';

const local = (path) => `${lang === 'en' ? '' : `/${lang}`}${path}`;
const day = (ts) => new Date(ts).toLocaleDateString(locale, { dateStyle: 'medium' });
const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

const ERRORS = {
  invalid_email: () => t('Please enter a valid e-mail address.'),
  email_disabled: () => t('Sign-in by e-mail isn’t available right now. Please try again later.'),
  too_many_requests: () => t('Too many attempts. Please wait a few minutes and try again.'),
  code_expired: () => t('This code has expired. Ask for a new one.'),
  wrong_code: () => t('That code isn’t right. Check the e-mail and try again.'),
  not_found: () => t('We couldn’t find that key. Check for typos — it looks like UNW-XXXX-XXXX-XXXX-XXXX.'),
  linked_elsewhere: () => t('This key belongs to another e-mail address.'),
};
const errorText = (err) => (err instanceof ApiError && ERRORS[err.code] ? ERRORS[err.code]() : t('Something went wrong. Please try again.'));

const TOOLS = [
  ['/instagram/', 'Instagram'],
  ['/tiktok/', 'TikTok'],
  ['/x/', 'X (Twitter)'],
  ['/facebook/', 'Facebook'],
  ['/linkedin/', 'LinkedIn'],
  ['/threads-unfollowers/', 'Threads'],
  ['/whatsapp-chat-analyzer/', 'WhatsApp'],
  ['/telegram-chat-analyzer/', 'Telegram'],
  ['/spotify-stats/', 'Spotify'],
  ['/bio/', 'Link in bio'],
  ['/growth/', 'Growth'],
];

export async function loadAccount() {
  try {
    return await api('/api/me');
  } catch {
    return { ok: false, user: null };
  }
}

// One-tap links from the e-mail land on /account/#login=<email>:<code>.
export async function signInFromHash() {
  const m = location.hash.match(/^#login=([^:]+):(\d{6})$/);
  if (!m) return false;
  history.replaceState(null, '', location.pathname);
  try {
    await api('/api/auth/verify', { method: 'POST', body: { email: decodeURIComponent(m[1]), code: m[2] } });
    toast(t('You’re signed in.'));
    return true;
  } catch (err) {
    toast(errorText(err), { iconName: 'warning' });
    return false;
  }
}

function signInPanel(onDone) {
  const err = h('div', { class: 'err-box', hidden: true });
  const showErr = (text) => {
    err.textContent = text;
    err.hidden = !text;
  };
  const email = h('input', { class: 'input', type: 'email', placeholder: 'you@example.com', autocomplete: 'email', required: true, 'aria-label': t('E-mail') });
  const name = h('input', { class: 'input', type: 'text', placeholder: t('Your name (optional)'), autocomplete: 'name', maxlength: '60', 'aria-label': t('Your name (optional)') });
  const send = h('button', { class: 'btn btn--primary', type: 'submit' }, t('E-mail me a code'));
  const step1 = h('form', { class: 'stack', style: { '--stack': '10px' } }, email, name, send);

  const code = h('input', { class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '123456', 'aria-label': t('6-digit code'), style: { letterSpacing: '6px', fontSize: '20px', textAlign: 'center' } });
  const verify = h('button', { class: 'btn btn--primary', type: 'submit' }, t('Sign in'));
  const sentTo = h('p', { class: 'small text-2' });
  const back = h('button', { class: 'copy-btn', type: 'button' }, t('Use another e-mail'));
  const step2 = h('form', { class: 'stack', style: { '--stack': '10px' }, hidden: true }, sentTo, h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, h('div', { style: { flex: '1', minWidth: '180px' } }, code), verify), back);

  step1.addEventListener('submit', async (e) => {
    e.preventDefault();
    showErr('');
    send.disabled = true;
    try {
      const res = await api('/api/auth/start', { method: 'POST', body: { email: email.value.trim(), name: name.value.trim(), lang } });
      sentTo.textContent = t('We sent a 6-digit code to {v0}. It works for 15 minutes.', { v0: email.value.trim() });
      if (res.devCode) code.value = res.devCode;
      step1.hidden = true;
      step2.hidden = false;
      code.focus();
    } catch (error) {
      showErr(errorText(error));
    } finally {
      send.disabled = false;
    }
  });
  step2.addEventListener('submit', async (e) => {
    e.preventDefault();
    showErr('');
    verify.disabled = true;
    try {
      const res = await api('/api/auth/verify', { method: 'POST', body: { email: email.value.trim(), code: code.value } });
      toast(res.isNew ? t('Welcome! Your account is ready.') : t('You’re signed in.'));
      onDone();
    } catch (error) {
      showErr(errorText(error));
      verify.disabled = false;
    }
  });
  back.addEventListener('click', () => {
    step2.hidden = true;
    step1.hidden = false;
    code.value = '';
    email.focus();
  });

  return h(
    'section',
    { class: 'panel', id: 'sign-in' },
    h('div', { class: 'panel-head' }, h('div', null, h('h3', null, t('Your account')), h('p', null, t('Create a free account or sign in with your e-mail. No password: we send you a 6-digit code.')))),
    h('ul', { class: 'checklist small', style: { marginBottom: '14px' } }, ...[t('All your licenses and orders in one place'), t('Use your plan on any device without copying keys'), t('Your social data still never leaves your device')].map((x) => h('li', null, icon('check'), x))),
    err,
    step1,
    step2,
  );
}

function stat(label, value, sub) {
  return h('div', { class: 'stat' }, h('span', { class: 'label' }, label), h('span', { class: 'value', style: { fontSize: '24px' } }, value), sub ? h('span', { class: 'sub' }, sub) : null);
}

const STATUS = { active: () => t('Active'), expired: () => t('Expired'), revoked: () => t('Revoked') };

function dashboard(data, localKey, onChange) {
  const { user, licenses, orders, invites } = data;
  const active = licenses.filter((l) => l.status === 'active');
  const best = active.find((l) => l.lifetime) || active.sort((a, b) => b.expiresAt - a.expiresAt)[0];
  const daysLeft = best && !best.lifetime ? Math.max(0, Math.ceil((best.expiresAt - Date.now()) / 86_400_000)) : null;
  const spent = orders.filter((o) => o.status === 'paid').reduce((sum, o) => sum + o.priceUsd, 0);

  const logout = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, t('Sign out'));
  logout.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    onChange();
  });

  const head = h(
    'section',
    { class: 'panel', id: 'profile' },
    h('div', { class: 'panel-head' }, h('div', null, h('h3', null, user.name ? t('Hi, {v0}', { v0: user.name }) : t('Your account')), h('p', null, t('{v0} · member since {v1}', { v0: user.email, v1: day(user.createdAt) }))), logout),
    h(
      'div',
      { class: 'stats' },
      stat(t('Plan'), best ? `${TIER_NAME[best.tier] || best.planName}${best.lifetime ? ` · ${t('Lifetime')}` : ''}` : t('Free'), best ? (best.lifetime ? t('Forever') : t('{v0} days left', { v0: daysLeft })) : null),
      stat(t('Active licenses'), String(active.length), t('{v0} in total', { v0: licenses.length })),
      stat(t('Free days earned'), String(invites.earnedDays), t('{v0} friends invited', { v0: invites.friends })),
      stat(t('Total spent'), usd(spent), t('{v0} orders', { v0: orders.filter((o) => o.status === 'paid').length })),
    ),
  );

  // Licenses
  const rows = licenses.map((l) => {
    const use = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, t('Use in this browser'));
    use.disabled = l.status !== 'active' || l.key === localKey;
    if (l.key === localKey) use.textContent = t('In use here');
    use.addEventListener('click', async () => {
      use.disabled = true;
      try {
        const res = await activateKey(l.key);
        if (!res.ok) throw new Error(res.reason);
        toast(t('{v0} is active in this browser.', { v0: TIER_NAME[l.tier] || l.planName }));
        window.dispatchEvent(new CustomEvent('unw:license'));
      } catch {
        toast(t('Something went wrong. Please try again.'), { iconName: 'warning' });
        use.disabled = false;
      }
    });
    const when = l.lifetime ? t('Lifetime') : `${t('Valid until')} ${day(l.expiresAt)}`;
    return h(
      'div',
      { class: 'row' },
      h('div', { class: 'who' }, h('b', null, l.planName), h('span', null, `${l.key.slice(0, 9)}••••-${l.key.slice(-4)} · ${when}`)),
      h('span', { class: l.status === 'active' ? 'badge' : 'badge badge--muted' }, (STATUS[l.status] || STATUS.revoked)()),
      h('div', { class: 'acts' }, use),
    );
  });

  const keyInput = h('input', { class: 'input', type: 'text', placeholder: 'UNW-XXXX-XXXX-XXXX-XXXX', 'aria-label': t('License key') });
  if (localKey && !licenses.some((l) => l.key === localKey)) keyInput.value = localKey;
  const link = h('button', { class: 'btn btn--ghost', type: 'submit' }, t('Add to my account'));
  const linkForm = h('form', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' } }, h('div', { style: { flex: '1', minWidth: '220px' } }, keyInput), link);
  linkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    link.disabled = true;
    try {
      await api('/api/me/link-license', { method: 'POST', body: { key: keyInput.value } });
      toast(t('License added to your account.'));
      onChange();
    } catch (error) {
      toast(errorText(error), { iconName: 'warning' });
      link.disabled = false;
    }
  });

  const licensesPanel = h(
    'section',
    { class: 'panel', id: 'licenses' },
    h('div', { class: 'panel-head' }, h('div', null, h('h3', null, t('My licenses')), h('p', null, t('Licenses bought with {v0} show up here automatically.', { v0: user.email }))), h('a', { class: 'btn btn--primary btn--sm', href: local('/pricing/') }, best ? t('Renew or upgrade') : t('Get Pro'))),
    rows.length ? h('div', { class: 'rows' }, ...rows) : h('p', { class: 'small text-2' }, t('No licenses yet. Have a key from an earlier purchase? Add it below.')),
    linkForm,
  );

  // Orders
  const ordersPanel = orders.length
    ? h(
        'section',
        { class: 'panel', id: 'orders' },
        h('div', { class: 'panel-head' }, h('div', null, h('h3', null, t('Order history')))),
        h(
          'div',
          { class: 'rows' },
          ...orders.map((o) =>
            h(
              'div',
              { class: 'row' },
              h('div', { class: 'who' }, h('b', null, o.planName), h('span', null, `${day(o.createdAt)} · ${o.method === 'tron' ? 'USDT · TRC20' : t('Crypto')} · ${o.id}`)),
              h('span', { class: 'badge badge--muted' }, o.status === 'paid' ? t('Paid') : o.status === 'pending' ? t('Waiting for payment') : t('Expired')),
              h('b', null, usd(o.priceUsd)),
            ),
          ),
        ),
      )
    : null;

  // Tools
  const tools = h(
    'section',
    { class: 'panel', id: 'tools' },
    h('div', { class: 'panel-head' }, h('div', null, h('h3', null, t('Your tools')), h('p', null, t('Open a tool and drop your export. Your plan unlocks everything in it.')))),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, ...TOOLS.map(([href, label]) => h('a', { class: 'btn btn--ghost btn--sm', href: local(href) }, label))),
  );

  // Danger zone
  const del = h('button', { class: 'copy-btn', type: 'button' }, t('Delete my account'));
  del.addEventListener('click', async () => {
    if (!confirm(t('Delete your account? Your licenses keep working with their keys.'))) return;
    await api('/api/me/delete', { method: 'POST' }).catch(() => {});
    toast(t('Account deleted'));
    onChange();
  });
  const foot = h('p', { class: 'small muted' }, del);

  return [head, licensesPanel, ordersPanel, tools, foot].filter(Boolean);
}

export function accountSection(data, localKey, onChange) {
  if (!data.ok) return [];
  if (!data.user) return [signInPanel(onChange)];
  return dashboard(data, localKey, onChange);
}
