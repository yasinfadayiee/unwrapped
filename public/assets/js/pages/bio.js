// Unwrapped Bio editor: claim a handle, edit photo/links/socials/theme, see stats.
import { h, clear, icon, toast, copyText } from '../lib/ui.js';
import { api, ApiError } from '../lib/api.js';
import { t, lang } from '../lib/i18n.js';
import { qrcode } from '../vendor/qrcode.js';
import { storedKey } from '../lib/license.js';

// Bought a plan in this browser? Attach it to the page without copy-paste.
async function autoPro(page) {
  const key = storedKey();
  if (page.pro || !key) return page;
  try {
    const res = await api('/api/bio/license', { method: 'POST', headers: auth(), body: { key } });
    toast(t('Pro unlocked'));
    return res.page;
  } catch {
    return page; // expired or revoked license: stay on the free page
  }
}

const KEY = 'unw.bio.token';
const root = document.getElementById('bio-app');
const getToken = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const setToken = (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* private mode */ } };
const auth = () => ({ authorization: `Bearer ${getToken()}` });
const pricing = `${lang === 'en' ? '' : `/${lang}`}/pricing/`;
const THEMES = [['midnight', '#07070b', '#d7ff3a'], ['aurora', '#3b2a8f', '#8ff0d8'], ['sunset', '#ff7a59', '#c2346b'], ['mint', '#d9f7ea', '#0f9d74'], ['paper', '#f7f4ee', '#1d1a14'], ['mono', '#000', '#fff']];
const SOCIALS = () => [['instagram', t('Instagram username')], ['tiktok', t('TikTok username')], ['youtube', t('YouTube channel')], ['x', t('X username')], ['telegram', t('Telegram username')], ['whatsapp', t('WhatsApp number')], ['threads', t('Threads username')], ['linkedin', t('LinkedIn URL')], ['facebook', t('Facebook page')], ['email', t('E-mail')]];
const ERR = () => ({ invalid_handle: t('Use 3–30 letters, numbers, dots or underscores.'), handle_taken: t('That name is taken — try another.'), invalid_email: t('That e-mail doesn’t look right.'), too_many_requests: t('Too many attempts — try again later.'), bad_image: t('Please choose a JPG, PNG or WebP photo.') });
const errText = (err) => ERR()[err?.code] || t('Something went wrong. Please try again.');

// Square-crop and shrink a photo in the browser before upload (~20–40 KB).
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const size = 320;
  const side = Math.min(bmp.width, bmp.height);
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  const webp = c.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.85);
}

const SOURCE_NAMES = { instagram: 'Instagram', tiktok: 'TikTok', x: 'X', youtube: 'YouTube', facebook: 'Facebook', telegram: 'Telegram', whatsapp: 'WhatsApp', threads: 'Threads', linkedin: 'LinkedIn', google: 'Google', bing: 'Bing', direct: '', other: '' };
const sourceName = (k) => SOURCE_NAMES[k] || (k === 'direct' ? t('Direct / unknown') : t('Other'));
const regionName = (cc) => { try { return cc === 'XX' ? t('Unknown') : new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'region' }).of(cc); } catch { return cc; } };

// Horizontal bars: [{ key, n }] → small chart rows.
function bars(rows, label) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return h('div', { class: 'stack', style: { '--stack': '6px' } }, rows.length ? rows.map((r) => h('div', null, h('div', { class: 'small', style: { display: 'flex', justifyContent: 'space-between' } }, h('span', null, label(r.key)), h('b', null, String(r.n))), h('div', { style: { height: '6px', borderRadius: '6px', background: 'rgba(255,255,255,.08)' } }, h('i', { style: { display: 'block', height: '100%', width: `${(r.n / max) * 100}%`, borderRadius: '6px', background: 'var(--signal)' } })))) : h('p', { class: 'small text-2' }, t('No visits yet.')));
}

function insightsSection(page) {
  const box = h('div', { class: 'stack', style: { '--stack': '16px' } });
  const days = page.stats.daily;
  if (days.length > 1) {
    const max = Math.max(1, ...days.map((d) => d.n));
    box.append(h('div', { style: { display: 'flex', gap: '3px', alignItems: 'flex-end', height: '60px' }, 'aria-label': t('Views per day') }, days.map((d) => h('i', { title: `${new Date(d.day).toLocaleDateString()} · ${d.n}`, style: { flex: '1', height: `${Math.max(6, (d.n / max) * 100)}%`, background: 'var(--uv)', borderRadius: '3px' } }))));
  }
  if (page.insights) {
    box.append(
      h('div', { style: { display: 'grid', gap: '18px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' } },
        h('div', null, h('b', { class: 'small' }, t('Where visitors come from')), bars(page.insights.sources, sourceName)),
        h('div', null, h('b', { class: 'small' }, t('Countries')), bars(page.insights.countries, regionName)),
        h('div', null, h('b', { class: 'small' }, t('Devices')), bars(page.insights.devices, (k) => (k === 'mobile' ? t('Mobile') : t('Desktop'))))),
    );
  } else {
    box.append(h('div', { class: 'note' }, icon('lock'), h('span', null, t('Pro shows where your visitors come from (Instagram, TikTok, Telegram…), their countries and devices, and clicks per link.'))));
  }
  return box;
}

function leadsSection(page, d) {
  d.lead = d.lead || { on: false, title: '', button: '', phone: false };
  const on = h('input', { type: 'checkbox', checked: !!d.lead.on, 'aria-label': t('Show a sign-up form on my page') });
  const phone = h('input', { type: 'checkbox', checked: !!d.lead.phone, 'aria-label': t('Also ask for a WhatsApp / phone number') });
  const title = h('input', { class: 'input', value: d.lead.title || '', maxlength: 80, placeholder: t('Form title, e.g. Get 10% off — join my list'), 'aria-label': t('Form title') });
  const button = h('input', { class: 'input', value: d.lead.button || '', maxlength: 30, placeholder: t('Button, e.g. Join'), 'aria-label': t('Form button') });
  on.addEventListener('change', () => (d.lead.on = on.checked));
  phone.addEventListener('change', () => (d.lead.phone = phone.checked));
  title.addEventListener('input', () => (d.lead.title = title.value));
  button.addEventListener('input', () => (d.lead.button = button.value));
  const list = h('div', { class: 'stack', style: { '--stack': '8px' } }, h('p', { class: 'small text-2' }, t('Loading…')));
  const csv = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', disabled: !page.pro }, icon('download'), page.pro ? t('Export CSV') : t('CSV export is Pro'));
  let rows = [];
  csv.addEventListener('click', () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const text = ['date,name,email,phone', ...rows.map((r) => [new Date(r.ts).toISOString(), r.name, r.email, r.phone].map(esc).join(','))].join('\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: `${page.handle}-contacts.csv` });
    a.click();
  });
  const draw = (res) => {
    rows = res.leads;
    clear(list).append(
      ...(rows.length
        ? rows.map((r) => {
            const del = h('button', { class: 'row-btn', type: 'button', 'aria-label': t('Remove') }, '✕');
            del.addEventListener('click', async () => draw(await api('/api/bio/leads/delete', { method: 'POST', headers: auth(), body: { id: r.id } })));
            return h('div', { class: 'card card--pad', style: { display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center' } }, h('div', { class: 'small' }, h('b', null, r.name || r.email || r.phone), h('div', { class: 'text-2' }, [r.email, r.phone].filter(Boolean).join(' · ')), h('div', { class: 'tiny muted' }, new Date(r.ts).toLocaleString())), del);
          })
        : [h('p', { class: 'small text-2' }, t('No contacts yet. Turn on the form and share your page.'))]),
      !res.pro && res.total > rows.length ? h('div', { class: 'note' }, icon('lock'), h('span', null, t('{n} more contacts are waiting — unlock Pro to see all of them.', { n: res.total - rows.length }))) : '',
    );
  };
  api('/api/bio/leads', { headers: auth() }).then(draw).catch(() => clear(list));
  return [
    h('p', { class: 'small text-2' }, t('Turn visitors into your own customer list — e-mails and WhatsApp numbers that don’t depend on any app. We e-mail you each new contact.')),
    h('label', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, on, t('Show a sign-up form on my page')),
    title,
    button,
    h('label', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, phone, t('Also ask for a WhatsApp / phone number')),
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' } }, h('b', null, t('Contacts: {n}', { n: page.leads.total })), csv),
    list,
  ];
}

function styleSection(d, pro) {
  d.style = d.style || {};
  const s = d.style;
  const seg = (options, key, fallback) => {
    const box = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' }, role: 'radiogroup' });
    const draw = () =>
      clear(box).append(
        ...options.map(([v, label]) => {
          const b = h('button', { type: 'button', role: 'radio', class: `btn btn--sm ${(s[key] || fallback) === v ? 'btn--primary' : 'btn--ghost'}`, 'aria-checked': String((s[key] || fallback) === v) }, label);
          b.addEventListener('click', () => { s[key] = v; draw(); });
          return b;
        }),
      );
    draw();
    return box;
  };
  const outline = h('input', { type: 'checkbox', checked: !!s.outline });
  outline.addEventListener('change', () => (s.outline = outline.checked));
  const color = (key, label) => {
    const inp = h('input', { type: 'color', value: s[key] || (key === 'accent' ? '#d7ff3a' : '#07070b'), disabled: !pro, 'aria-label': label, style: { width: '48px', height: '36px', border: 0, background: 'none' } });
    inp.addEventListener('input', () => (s[key] = inp.value));
    const reset = h('button', { class: 'row-btn', type: 'button', disabled: !pro }, t('Theme default'));
    reset.addEventListener('click', () => { delete s[key]; inp.value = key === 'accent' ? '#d7ff3a' : '#07070b'; });
    return h('label', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, inp, h('span', null, label), reset);
  };
  return [
    h('b', { class: 'small' }, t('Buttons')),
    seg([['rounded', t('Rounded')], ['pill', t('Pill')], ['square', t('Square')]], 'buttons', 'rounded'),
    h('label', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, outline, t('Outline buttons')),
    h('b', { class: 'small' }, t('Font')),
    seg([['modern', t('Modern')], ['elegant', t('Elegant')], ['classic', t('Classic')], ['mono', t('Mono')]], 'font', 'modern'),
    h('b', { class: 'small' }, t('Your brand colours')),
    color('accent', t('Button colour')),
    color('background', t('Background colour')),
    pro ? '' : h('div', { class: 'note' }, icon('lock'), h('span', null, t('Custom brand colours are part of Pro.'))),
  ];
}

const toLocal = (ms) => (ms ? new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocal = (v) => (v ? new Date(v).getTime() : null);

function qrSection(page) {
  const url = `${location.origin}/@${page.handle}`;
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  const box = h('div', { style: { width: '160px', background: '#fff', borderRadius: '12px', padding: '8px' } });
  box.innerHTML = svg;
  const dl = h('a', { class: 'btn btn--ghost btn--sm', href: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), download: `${page.handle}-qr.svg` }, icon('download'), t('Download QR code'));
  return [h('p', { class: 'small text-2' }, t('Print it on business cards, packaging or your shop window — it opens your page.')), box, h('div', null, dl)];
}

// ---------- claim ----------
function claimView() {
  const handle = h('input', { class: 'input', placeholder: t('yourname'), autocomplete: 'off', autocapitalize: 'none', spellcheck: false, maxlength: 30, 'aria-label': t('Your page name') });
  const hint = h('div', { class: 'small text-2' }, 'myunwrapped.com/@…');
  const email = h('input', { class: 'input', type: 'email', placeholder: t('E-mail for your edit link (recommended)'), autocomplete: 'email', 'aria-label': t('E-mail') });
  const go = h('button', { class: 'btn btn--primary btn--lg', type: 'button' }, t('Create my free page'));
  const err = h('div', { class: 'err-box', hidden: true, role: 'alert' });
  let timer;
  handle.addEventListener('input', () => {
    handle.value = handle.value.toLowerCase().replace(/[^a-z0-9._]/g, '');
    hint.textContent = `myunwrapped.com/@${handle.value || '…'}`;
    clearTimeout(timer);
    if (handle.value.length < 3) return;
    timer = setTimeout(async () => {
      const r = await api(`/api/bio/check?handle=${encodeURIComponent(handle.value)}`).catch(() => null);
      if (r) hint.textContent = `myunwrapped.com/@${handle.value} — ${r.available ? t('✓ available') : r.reason === 'invalid' ? t('not allowed') : t('taken')}`;
    }, 300);
  });
  go.addEventListener('click', async () => {
    err.hidden = true;
    go.disabled = true;
    try {
      const res = await api('/api/bio/create', { method: 'POST', body: { handle: handle.value, email: email.value.trim() || undefined } });
      setToken(res.token);
      toast(res.mailed ? t('Page created — edit link sent to your e-mail') : t('Page created'));
      editor(res.page);
    } catch (e) {
      err.textContent = errText(e);
      err.hidden = false;
    } finally {
      go.disabled = false;
    }
  });
  const lostHandle = h('input', { class: 'input', placeholder: t('yourname'), 'aria-label': t('Your page name') });
  const lostEmail = h('input', { class: 'input', type: 'email', placeholder: t('The e-mail on your page'), 'aria-label': t('E-mail') });
  const lostBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, t('Send me an edit link'));
  lostBtn.addEventListener('click', async () => {
    await api('/api/bio/login', { method: 'POST', body: { handle: lostHandle.value.toLowerCase(), email: lostEmail.value } }).catch(() => {});
    toast(t('If that page uses this e-mail, an edit link is on its way'));
  });
  clear(root).append(
    h('div', { class: 'card card--pad stack', style: { '--stack': '14px', maxWidth: '560px' } }, h('h2', { class: 'h3' }, t('Claim your page')), handle, hint, email, err, h('div', null, go), h('p', { class: 'tiny muted' }, t('Free · 5 links · six themes · no account, no password.'))),
    h('details', { style: { marginTop: '18px', maxWidth: '560px' } }, h('summary', null, t('Already have a page? Get a new edit link')), h('div', { class: 'stack', style: { '--stack': '10px', marginTop: '12px' } }, lostHandle, lostEmail, h('div', null, lostBtn))),
  );
}

// ---------- editor ----------
function editor(page) {
  const d = structuredClone(page.data);
  d.cta = d.cta || { label: '', url: '' };
  const pro = !!page.pro;
  const name = h('input', { class: 'input', value: d.name, maxlength: 60, placeholder: t('Display name'), 'aria-label': t('Display name') });
  const emoji = h('input', { class: 'input', value: d.emoji, maxlength: 4, placeholder: '😀', style: { maxWidth: '90px' }, 'aria-label': t('Avatar emoji') });
  const bio = h('textarea', { class: 'input', rows: 3, maxlength: 240, placeholder: t('A short bio'), 'aria-label': t('Bio') }, d.bio);

  // Photo
  const photoPreview = page.avatar ? h('img', { src: page.avatar, width: 72, height: 72, alt: '', style: { borderRadius: '50%', objectFit: 'cover' } }) : h('div', { class: 'small text-2' }, t('No photo yet — your emoji or initials are shown.'));
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const pick = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('image'), page.avatar ? t('Change photo') : t('Upload photo'));
  pick.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    try {
      const res = await api('/api/bio/avatar', { method: 'POST', headers: auth(), body: { data: await shrink(file.files[0]) } });
      toast(t('Photo updated'));
      editor({ ...res.page, data: d });
    } catch (e) {
      toast(errText(e), { iconName: 'warning' });
    }
  });
  const unpick = page.avatar ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, t('Remove')) : '';
  unpick && unpick.addEventListener('click', async () => editor({ ...(await api('/api/bio/avatar', { method: 'POST', headers: auth(), body: { remove: true } })).page, data: d }));

  const themeBox = h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' }, role: 'radiogroup', 'aria-label': t('Theme') });
  const drawThemes = () =>
    clear(themeBox).append(
      ...THEMES.map(([id, a, b]) => {
        const btn = h('button', { type: 'button', role: 'radio', 'aria-checked': String(d.theme === id), 'aria-label': id, title: id, style: { width: '44px', height: '44px', borderRadius: '12px', border: d.theme === id ? '3px solid var(--signal)' : '1px solid rgba(255,255,255,.2)', background: `linear-gradient(135deg, ${a} 50%, ${b} 50%)`, cursor: 'pointer' } });
        btn.addEventListener('click', () => { d.theme = id; drawThemes(); });
        return btn;
      }),
    );
  drawThemes();

  const ctaLabel = h('input', { class: 'input', value: d.cta.label, maxlength: 60, placeholder: t('Button text, e.g. Join my Telegram channel'), 'aria-label': t('Button text') });
  const ctaUrl = h('input', { class: 'input', value: d.cta.url, placeholder: 'https://t.me/…', 'aria-label': t('Button link') });
  ctaLabel.addEventListener('input', () => (d.cta.label = ctaLabel.value));
  ctaUrl.addEventListener('input', () => (d.cta.url = ctaUrl.value));

  const linkBox = h('div', { class: 'stack', style: { '--stack': '10px' } });
  const drawLinks = () => {
    clear(linkBox);
    d.links.forEach((l, i) => {
      const ti = h('input', { class: 'input', value: l.title, placeholder: t('Title, e.g. My shop'), maxlength: 80, 'aria-label': t('Link title') });
      const u = h('input', { class: 'input', value: l.url, placeholder: 'https://…', 'aria-label': t('Link URL') });
      ti.addEventListener('input', () => (l.title = ti.value));
      u.addEventListener('input', () => (l.url = u.value));
      const up = h('button', { class: 'row-btn', type: 'button', 'aria-label': t('Move up'), disabled: i === 0 }, '↑');
      const del = h('button', { class: 'row-btn', type: 'button', 'aria-label': t('Remove') }, '✕');
      up.addEventListener('click', () => { [d.links[i - 1], d.links[i]] = [d.links[i], d.links[i - 1]]; drawLinks(); });
      del.addEventListener('click', () => { d.links.splice(i, 1); drawLinks(); });
      const clicks = page.stats.clicks && l.id ? h('span', { class: 'tiny muted' }, t('{n} clicks / 30 days', { n: page.stats.clicks[l.id] || 0 })) : '';
      const hot = h('input', { type: 'checkbox', checked: !!l.hot, disabled: !pro });
      hot.addEventListener('change', () => (l.hot = hot.checked));
      const start = h('input', { class: 'input', type: 'datetime-local', value: toLocal(l.start), disabled: !pro, 'aria-label': t('Show from') });
      const end = h('input', { class: 'input', type: 'datetime-local', value: toLocal(l.end), disabled: !pro, 'aria-label': t('Hide after') });
      start.addEventListener('change', () => (l.start = fromLocal(start.value)));
      end.addEventListener('change', () => (l.end = fromLocal(end.value)));
      const expired = l.end && l.end < Date.now();
      const extras = h(
        'details',
        null,
        h('summary', { class: 'small' }, expired ? t('Scheduled — ended') : l.start || l.end ? t('Scheduled') : t('Highlight & schedule'), pro ? '' : ' · Pro'),
        h('div', { class: 'stack', style: { '--stack': '8px', marginTop: '8px' } }, h('label', { class: 'small', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, hot, t('Highlight this link (gentle pulse)')), h('label', { class: 'small' }, t('Show from'), start), h('label', { class: 'small' }, t('Hide after'), end)),
      );
      linkBox.append(h('div', { class: 'card card--pad stack', style: { '--stack': '8px', opacity: expired ? '.6' : '1' } }, ti, u, extras, h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, up, del, clicks)));
    });
    const limit = pro ? page.limits.max : page.limits.free;
    const full = d.links.length >= limit;
    const add = h('button', { class: 'btn btn--ghost', type: 'button', disabled: full }, icon('sparkles'), full ? (pro ? t('Link limit reached') : t('Free pages have {n} links — unlock Pro for more', { n: limit })) : t('Add link'));
    add.addEventListener('click', () => { d.links.push({ title: '', url: '', on: true }); drawLinks(); });
    linkBox.append(h('div', null, add));
  };
  drawLinks();

  const socialInputs = SOCIALS().map(([k, label]) => {
    const inp = h('input', { class: 'input', value: d.socials[k] || '', placeholder: label, 'aria-label': label });
    inp.addEventListener('input', () => (d.socials[k] = inp.value));
    return inp;
  });

  const email = h('input', { class: 'input', type: 'email', placeholder: page.email ? t('Current: {email}', { email: page.email }) : t('E-mail for edit links'), 'aria-label': t('E-mail') });
  const save = h('button', { class: 'btn btn--primary btn--lg', type: 'button' }, t('Save & publish'));
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      d.name = name.value;
      d.emoji = emoji.value;
      d.bio = bio.value;
      const res = await api('/api/bio/save', { method: 'POST', headers: auth(), body: { data: d, ...(email.value.trim() ? { email: email.value.trim() } : {}) } });
      toast(t('Published'));
      editor(res.page);
    } catch (e) {
      toast(errText(e), { iconName: 'warning' });
    } finally {
      save.disabled = false;
    }
  });

  const fullUrl = `${location.origin}/@${page.handle}`;
  const copy = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('copy'), t('Copy link'));
  copy.addEventListener('click', () => copyText(fullUrl, copy));
  const licKey = h('input', { class: 'input mono', placeholder: 'UNW-XXXX-XXXX-XXXX-XXXX', 'aria-label': t('License key') });
  const licBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, t('Unlock Pro'));
  licBtn.addEventListener('click', async () => {
    try {
      const res = await api('/api/bio/license', { method: 'POST', headers: auth(), body: { key: licKey.value } });
      toast(t('Pro unlocked'));
      editor(res.page);
    } catch {
      toast(t('That license is not active'), { iconName: 'warning' });
    }
  });
  const logout = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, t('Sign out on this device'));
  logout.addEventListener('click', () => { if (confirm(t('Sign out? You will need your edit link (e-mail) to edit again.'))) { setToken(''); claimView(); } });

  const section = (title, ...kids) => h('section', { class: 'card card--pad stack', style: { '--stack': '12px' } }, h('h2', { class: 'h3' }, title), ...kids);
  clear(root).append(
    h(
      'div',
      { class: 'stack', style: { '--stack': '18px', maxWidth: '680px' } },
      h('div', { class: 'card card--pad', style: { display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } }, h('div', null, h('div', { class: 'small text-2' }, t('Your page')), h('a', { href: `/@${page.handle}`, target: '_blank', rel: 'noopener', class: 'h3', style: { overflowWrap: 'anywhere' } }, `myunwrapped.com/@${page.handle}`)), h('div', { style: { display: 'flex', gap: '8px' } }, copy, h('a', { class: 'btn btn--ghost btn--sm', href: `/@${page.handle}`, target: '_blank', rel: 'noopener' }, icon('external'), t('View')))),
      h('div', { class: 'card card--pad', style: { display: 'flex', gap: '28px', flexWrap: 'wrap', alignItems: 'center' } }, h('div', null, h('b', { class: 'h2' }, String(page.stats.views30)), h('div', { class: 'small text-2' }, t('views · 30 days'))), h('div', null, h('b', { class: 'h2' }, String(page.stats.clicks30)), h('div', { class: 'small text-2' }, t('link clicks · 30 days'))), pro ? h('span', { class: 'badge badge--uv' }, 'Pro') : ''),
      section(t('Insights · 30 days'), insightsSection(page)),
      section(t('Profile'), h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } }, photoPreview, pick, unpick, file), h('div', { style: { display: 'flex', gap: '10px' } }, emoji, name), bio),
      section(t('Theme'), themeBox, ...styleSection(d, pro)),
      section(t('Featured button'), h('p', { class: 'small text-2' }, t('A big button above your links — perfect for your Telegram channel, WhatsApp or newest offer.')), ctaLabel, ctaUrl),
      section(t('Links'), linkBox),
      section(t('Socials'), ...socialInputs),
      section(t('Collect contacts'), ...leadsSection(page, d)),
      section(t('QR code'), ...qrSection(page)),
      section(t('E-mail'), h('p', { class: 'small text-2' }, t('We send your private edit link here — so you can edit from any device.')), email),
      h('div', { style: { position: 'sticky', bottom: '12px', zIndex: 2 } }, save),
      pro ? '' : section(t('Unlock Pro'), h('p', { class: 'small text-2' }, t('Up to 100 links, unlimited contacts, full visitor insights, CSV export and no “Made with” badge — included in every Unwrapped plan.')), licKey, h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, licBtn, h('button', { class: 'btn btn--primary', type: 'button', 'data-checkout': '', 'data-tier': 'plus' }, t('Get Pro — from $2.42/month')), h('a', { class: 'btn btn--ghost', href: pricing }, t('See plans')))),
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
    editor(await autoPro((await api('/api/bio/mine', { headers: auth() })).page));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      setToken('');
      return claimView();
    }
    clear(root).append(h('div', { class: 'err-box' }, t('Could not load your page. Please refresh.')));
  }
}
load();
