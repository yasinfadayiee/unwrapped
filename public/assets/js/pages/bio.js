// Unwrapped Bio editor: claim a handle, edit links/socials/theme, see stats.
import { h, clear, icon, toast } from '../lib/ui.js';
import { api, ApiError } from '../lib/api.js';
import { copyText } from '../lib/ui.js';

const KEY = 'unw.bio.token';
const root = document.getElementById('bio-app');
const getToken = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* private mode */ } };
const auth = () => ({ authorization: `Bearer ${getToken()}` });
const THEMES = [['midnight', '#07070b', '#d7ff3a'], ['aurora', '#3b2a8f', '#8ff0d8'], ['sunset', '#ff7a59', '#c2346b'], ['mint', '#d9f7ea', '#0f9d74'], ['paper', '#f7f4ee', '#1d1a14'], ['mono', '#000', '#fff']];
const SOCIALS = [['instagram', 'Instagram username'], ['tiktok', 'TikTok username'], ['youtube', 'YouTube channel'], ['x', 'X username'], ['telegram', 'Telegram username'], ['whatsapp', 'WhatsApp number'], ['threads', 'Threads username'], ['linkedin', 'LinkedIn URL'], ['facebook', 'Facebook page'], ['email', 'E-mail']];
const ERR = { invalid_handle: 'Use 3–30 letters, numbers, dots or underscores.', handle_taken: 'That name is taken — try another.', invalid_email: 'That e-mail doesn’t look right.', too_many_requests: 'Too many attempts — try again later.' };
const errText = (err) => ERR[err?.code] || 'Something went wrong. Please try again.';

// ---------- claim ----------
function claimView() {
  const handle = h('input', { class: 'input', placeholder: 'yourname', autocomplete: 'off', autocapitalize: 'none', spellcheck: false, maxlength: 30, 'aria-label': 'Your page name' });
  const hint = h('div', { class: 'small text-2' }, 'myunwrapped.com/@yourname');
  const email = h('input', { class: 'input', type: 'email', placeholder: 'E-mail for your edit link (recommended)', autocomplete: 'email', 'aria-label': 'E-mail' });
  const go = h('button', { class: 'btn btn--primary btn--lg', type: 'button' }, 'Create my free page');
  const err = h('div', { class: 'err-box', hidden: true, role: 'alert' });
  let timer;
  handle.addEventListener('input', () => {
    handle.value = handle.value.toLowerCase().replace(/[^a-z0-9._]/g, '');
    hint.textContent = `myunwrapped.com/@${handle.value || 'yourname'}`;
    clearTimeout(timer);
    if (handle.value.length < 3) return;
    timer = setTimeout(async () => {
      const r = await api(`/api/bio/check?handle=${encodeURIComponent(handle.value)}`).catch(() => null);
      if (r) hint.textContent = `myunwrapped.com/@${handle.value} — ${r.available ? '✓ available' : r.reason === 'invalid' ? 'not allowed' : 'taken'}`;
    }, 300);
  });
  go.addEventListener('click', async () => {
    err.hidden = true;
    go.disabled = true;
    try {
      const res = await api('/api/bio/create', { method: 'POST', body: { handle: handle.value, email: email.value.trim() || undefined } });
      setToken(res.token);
      toast(res.mailed ? 'Page created — edit link sent to your e-mail' : 'Page created');
      editor(res.page);
    } catch (e) {
      err.textContent = errText(e);
      err.hidden = false;
    } finally {
      go.disabled = false;
    }
  });
  const lostHandle = h('input', { class: 'input', placeholder: 'yourname', 'aria-label': 'Page name' });
  const lostEmail = h('input', { class: 'input', type: 'email', placeholder: 'The e-mail on your page', 'aria-label': 'E-mail' });
  const lostBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, 'Send me an edit link');
  lostBtn.addEventListener('click', async () => {
    await api('/api/bio/login', { method: 'POST', body: { handle: lostHandle.value.toLowerCase(), email: lostEmail.value } }).catch(() => {});
    toast('If that page uses this e-mail, an edit link is on its way');
  });
  clear(root).append(
    h('div', { class: 'card card--pad stack', style: { '--stack': '14px', maxWidth: '560px' } }, h('h2', { class: 'h3' }, 'Claim your page'), handle, hint, email, err, h('div', null, go), h('p', { class: 'tiny muted' }, 'Free · 5 links · six themes · no account, no password.')),
    h('details', { style: { marginTop: '18px', maxWidth: '560px' } }, h('summary', null, 'Already have a page? Get a new edit link'), h('div', { class: 'stack', style: { '--stack': '10px', marginTop: '12px' } }, lostHandle, lostEmail, h('div', null, lostBtn))),
  );
}

// ---------- editor ----------
function editor(page) {
  const d = structuredClone(page.data);
  const pro = !!page.pro;
  const name = h('input', { class: 'input', value: d.name, maxlength: 60, placeholder: 'Display name', 'aria-label': 'Display name' });
  const emoji = h('input', { class: 'input', value: d.emoji, maxlength: 4, placeholder: '😀', style: { maxWidth: '90px' }, 'aria-label': 'Avatar emoji' });
  const bio = h('textarea', { class: 'input', rows: 3, maxlength: 240, placeholder: 'A short bio', 'aria-label': 'Bio' }, d.bio);
  const themeBox = h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' }, role: 'radiogroup', 'aria-label': 'Theme' });
  const drawThemes = () =>
    clear(themeBox).append(
      ...THEMES.map(([id, a, b]) => {
        const btn = h('button', { type: 'button', role: 'radio', 'aria-checked': String(d.theme === id), title: id, style: { width: '44px', height: '44px', borderRadius: '12px', border: d.theme === id ? '3px solid var(--signal)' : '1px solid var(--line, #333)', background: `linear-gradient(135deg, ${a} 50%, ${b} 50%)`, cursor: 'pointer' } });
        btn.addEventListener('click', () => { d.theme = id; drawThemes(); });
        return btn;
      }),
    );
  drawThemes();

  const linkBox = h('div', { class: 'stack', style: { '--stack': '10px' } });
  const drawLinks = () => {
    clear(linkBox);
    d.links.forEach((l, i) => {
      const t = h('input', { class: 'input', value: l.title, placeholder: 'Title, e.g. My shop', maxlength: 80, 'aria-label': `Link ${i + 1} title` });
      const u = h('input', { class: 'input', value: l.url, placeholder: 'https://…', 'aria-label': `Link ${i + 1} URL` });
      t.addEventListener('input', () => (l.title = t.value));
      u.addEventListener('input', () => (l.url = u.value));
      const up = h('button', { class: 'row-btn', type: 'button', 'aria-label': 'Move up', disabled: i === 0 }, '↑');
      const del = h('button', { class: 'row-btn', type: 'button', 'aria-label': 'Remove' }, '✕');
      up.addEventListener('click', () => { [d.links[i - 1], d.links[i]] = [d.links[i], d.links[i - 1]]; drawLinks(); });
      del.addEventListener('click', () => { d.links.splice(i, 1); drawLinks(); });
      const clicks = page.stats.clicks && l.id ? h('span', { class: 'tiny muted' }, `${page.stats.clicks[l.id] || 0} clicks / 30 days`) : '';
      linkBox.append(h('div', { class: 'card card--pad stack', style: { '--stack': '8px' } }, t, u, h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, up, del, clicks)));
    });
    const limit = pro ? page.limits.max : page.limits.free;
    const add = h('button', { class: 'btn btn--ghost', type: 'button', disabled: d.links.length >= limit }, icon('sparkles'), d.links.length >= limit ? (pro ? 'Link limit reached' : `Free pages have ${limit} links — unlock Pro for more`) : 'Add link');
    add.addEventListener('click', () => { d.links.push({ title: '', url: '', on: true }); drawLinks(); });
    linkBox.append(h('div', null, add));
  };
  drawLinks();

  const socialInputs = SOCIALS.map(([k, label]) => {
    const inp = h('input', { class: 'input', value: d.socials[k] || '', placeholder: label, 'aria-label': label });
    inp.addEventListener('input', () => (d.socials[k] = inp.value));
    return inp;
  });

  const email = h('input', { class: 'input', type: 'email', placeholder: page.email ? `Current: ${page.email}` : 'E-mail for edit links', 'aria-label': 'E-mail' });
  const save = h('button', { class: 'btn btn--primary btn--lg', type: 'button' }, 'Save & publish');
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      d.name = name.value;
      d.emoji = emoji.value;
      d.bio = bio.value;
      const res = await api('/api/bio/save', { method: 'POST', headers: auth(), body: { data: d, ...(email.value.trim() ? { email: email.value.trim() } : {}) } });
      toast('Published');
      editor(res.page);
    } catch (e) {
      toast(errText(e), { iconName: 'warning' });
    } finally {
      save.disabled = false;
    }
  });

  const full = `${location.origin}/@${page.handle}`;
  const copy = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('copy'), 'Copy link');
  copy.addEventListener('click', () => copyText(full, copy));
  const licKey = h('input', { class: 'input mono', placeholder: 'UNW-XXXX-XXXX-XXXX-XXXX', 'aria-label': 'License key' });
  const licBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, 'Unlock Pro');
  licBtn.addEventListener('click', async () => {
    try {
      const res = await api('/api/bio/license', { method: 'POST', headers: auth(), body: { key: licKey.value } });
      toast('Pro unlocked');
      editor(res.page);
    } catch {
      toast('That license is not active', { iconName: 'warning' });
    }
  });
  const logout = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, 'Sign out on this device');
  logout.addEventListener('click', () => { if (confirm('Sign out? You will need your edit link (e-mail) to edit again.')) { setToken(''); claimView(); } });

  const section = (title, ...kids) => h('section', { class: 'card card--pad stack', style: { '--stack': '12px' } }, h('h2', { class: 'h3' }, title), ...kids);
  clear(root).append(
    h(
      'div',
      { class: 'stack', style: { '--stack': '18px', maxWidth: '680px' } },
      h('div', { class: 'card card--pad', style: { display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } }, h('div', null, h('div', { class: 'small text-2' }, 'Your page'), h('a', { href: `/@${page.handle}`, target: '_blank', rel: 'noopener', class: 'h3', style: { overflowWrap: 'anywhere' } }, `myunwrapped.com/@${page.handle}`)), h('div', { style: { display: 'flex', gap: '8px' } }, copy, h('a', { class: 'btn btn--ghost btn--sm', href: `/@${page.handle}`, target: '_blank', rel: 'noopener' }, icon('external'), 'View'))),
      h('div', { class: 'card card--pad', style: { display: 'flex', gap: '28px', flexWrap: 'wrap' } }, h('div', null, h('b', { class: 'h2' }, String(page.stats.views30)), h('div', { class: 'small text-2' }, 'views · 30 days')), h('div', null, h('b', { class: 'h2' }, String(page.stats.clicks30)), h('div', { class: 'small text-2' }, 'link clicks · 30 days')), pro ? h('span', { class: 'badge badge--uv' }, 'Pro') : ''),
      section('Profile', h('div', { style: { display: 'flex', gap: '10px' } }, emoji, name), bio),
      section('Theme', themeBox),
      section('Links', linkBox),
      section('Socials', ...socialInputs),
      section('E-mail', h('p', { class: 'small text-2' }, 'We send your private edit link here — so you can edit from any device.'), email),
      h('div', { style: { position: 'sticky', bottom: '12px', zIndex: 2 } }, save),
      pro ? '' : section('Unlock Pro', h('p', { class: 'small text-2' }, 'Unlimited links, per-link click analytics and no “Made with” badge — included in every Unwrapped plan.'), licKey, h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, licBtn, h('a', { class: 'btn btn--primary', href: '/pricing/' }, 'See plans'))),
      h('div', null, logout),
    ),
  );
}

async function load() {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (/^[a-f0-9]{48}$/.test(hash.get('edit') || '')) {
    setToken(hash.get('edit'));
    history.replaceState(null, '', location.pathname);
  }
  if (!getToken()) return claimView();
  try {
    editor((await api('/api/bio/mine', { headers: auth() })).page);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      setToken('');
      return claimView();
    }
    clear(root).append(h('div', { class: 'err-box' }, 'Could not load your page. Please refresh.'));
  }
}
load();
