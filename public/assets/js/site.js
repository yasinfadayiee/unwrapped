// Site-wide behaviour for every page.

import { h, icon, clear, prefersReducedMotion } from './lib/ui.js';
import { getConfig } from './lib/api.js';
import { proState } from './lib/license.js';
import { t } from './lib/i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- header ---------- */
function header() {
  const el = $('.site-header');
  if (!el) return;
  const onScroll = () => el.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  const btn = $('.menu-btn');
  btn?.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    btn.setAttribute('aria-expanded', String(open));
  });
  $$('.mobile-nav a').forEach((a) => a.addEventListener('click', () => document.body.classList.remove('menu-open')));
}

/* ---------- colour themes ---------- */
// [id, label, swatch background, browser bar colour]; theme-init.js applies the saved one early.
const THEMES = [
  ['lime', 'Lime', 'linear-gradient(135deg,#d7ff3a 50%,#07070b 50%)', '#07070b'],
  ['ocean', 'Ocean', 'linear-gradient(135deg,#43d9ff 50%,#050a12 50%)', '#050a12'],
  ['sunset', 'Sunset', 'linear-gradient(135deg,#ffb444 50%,#0d0806 50%)', '#0d0806'],
  ['rose', 'Rose', 'linear-gradient(135deg,#ff7ec4 50%,#0c060b 50%)', '#0c060b'],
  ['mint', 'Mint', 'linear-gradient(135deg,#4dffb8 50%,#040b09 50%)', '#040b09'],
  ['light', 'Light', 'linear-gradient(135deg,#5b3df5 50%,#f5f5f8 50%)', '#f5f5f8'],
];

function applyTheme(id) {
  const theme = THEMES.find((x) => x[0] === id) || THEMES[0];
  if (theme[0] === 'lime') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme[0]);
  $('meta[name="theme-color"]')?.setAttribute('content', theme[3]);
  try {
    localStorage.setItem('unw.theme', theme[0]);
  } catch {}
}

function themePicker() {
  const btn = $('.theme-btn');
  if (!btn) return;
  const current = () => document.documentElement.getAttribute('data-theme') || 'lime';
  $('meta[name="theme-color"]')?.setAttribute('content', (THEMES.find((x) => x[0] === current()) || THEMES[0])[3]);
  const menu = h('div', { class: 'theme-menu', role: 'radiogroup', 'aria-label': t('Colour theme'), hidden: true });
  // The same swatches inside the phone menu, where the header has no room for the button.
  const phone = h('div', { class: 'mobile-themes', role: 'radiogroup', 'aria-label': t('Colour theme') });
  const draw = () => {
    for (const box of [menu, phone]) {
      clear(box);
      for (const [id, label, swatch] of THEMES) {
        const b = h('button', { class: 'theme-sw', type: 'button', role: 'radio', 'aria-checked': String(id === current()) }, h('i', { style: { background: swatch } }), t(label));
        b.addEventListener('click', () => {
          applyTheme(id);
          draw();
        });
        box.append(b);
      }
    }
  };
  draw();
  btn.after(menu);
  $('.mobile-langs')?.before(phone);
  const toggle = (open) => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle(menu.hidden);
  });
  document.addEventListener('click', (e) => !menu.contains(e.target) && toggle(false));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && toggle(false));
}

/* ---------- reveal + spotlight ---------- */
function reveals() {
  document.documentElement.classList.add('reveal-ready');
  const items = $$('.reveal');
  if (!items.length) return;
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    items.forEach((i) => i.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  items.forEach((i) => io.observe(i));
}

// Real usage, shown next to the drop zone's trust badges once there is enough of it.
async function liveCount() {
  const row = $('.trust-row');
  if (!row) return;
  try {
    const res = await fetch('/api/stats');
    const { analyzed30d: n } = await res.json();
    if (!n) return;
    const num = new Intl.NumberFormat(document.documentElement.lang || 'en').format(n);
    row.append(h('span', { class: 'live-count' }, icon('users'), t('{n} exports analyzed in the last 30 days', { n: num })));
  } catch {
    /* offline or old server: keep the static badges */
  }
}

// Approved testimonials on the home page; nothing is shown until there are three.
async function testimonials() {
  const slot = $('[data-testimonials]');
  if (!slot) return;
  try {
    const lang = (document.documentElement.lang || 'en').slice(0, 2);
    const { items } = await (await fetch(`/api/testimonials?lang=${lang}`)).json();
    if (!items || items.length < 3) return;
    const stars = (n) => h('div', { class: 'q-stars', 'aria-label': t('{n} of 5', { n }) }, Array.from({ length: n }, () => h('span', { class: 'star' })));
    slot.replaceWith(
      h(
        'section',
        { class: 'section section--tight', id: 'reviews' },
        h(
          'div',
          { class: 'container' },
          h('div', { class: 'sec-head sec-head--center' }, h('span', { class: 'eyebrow' }, t('Reviews')), h('h2', { class: 'h2' }, t('What people say'))),
          h('div', { class: 'quotes' }, items.map((q) => h('figure', { class: 'card quote' }, stars(q.rating), h('blockquote', null, h('p', null, `“${q.text}”`)), h('figcaption', { class: 'q-who' }, q.name || t('Unwrapped user'))))),
        ),
      ),
    );
  } catch {
    /* offline or not deployed yet */
  }
}

function spotlight() {
  document.addEventListener(
    'pointermove',
    (e) => {
      const card = e.target.closest?.('.card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    },
    { passive: true },
  );
}

/* ---------- drop zones ---------- */
async function filesFromDataTransfer(dt) {
  const entries = [...(dt.items || [])]
    .filter((i) => i.kind === 'file')
    .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
    .filter(Boolean);
  if (!entries.length || entries.every((e) => e.isFile)) return [...dt.files];
  const out = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      Object.defineProperty(file, 'relativePath', { value: `${prefix}${file.name}` });
      out.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      } while (batch.length);
    }
  };
  for (const entry of entries) await walk(entry, '');
  return out;
}

async function launch(files) {
  if (!files || !files.length) return;
  const { openApp } = await import('./app/app.js');
  openApp({ files });
}

async function launchDemo() {
  const { openApp } = await import('./app/app.js');
  openApp({ demo: true });
}

function dropZones() {
  const zones = $$('[data-drop]');
  if (!zones.length) return;
  for (const zone of zones) {
    const input = $('input[type=file]:not([webkitdirectory])', zone);
    const folder = $('input[webkitdirectory]', zone);
    $$('[data-pick]', zone).forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      input?.click();
    }));
    $$('[data-pick-folder]', zone).forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      folder?.click();
    }));
    zone.addEventListener('click', (e) => {
      if (e.target.closest('a,button,input')) return;
      input?.click();
    });
    zone.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === zone) {
        e.preventDefault();
        input?.click();
      }
    });
    input?.addEventListener('change', () => {
      launch([...input.files]);
      input.value = '';
    });
    folder?.addEventListener('change', () => {
      launch([...folder.files]);
      folder.value = '';
    });
  }

  // Page-wide drag & drop.
  const overlay = h('div', { class: 'drop-overlay', 'aria-hidden': 'true' }, h('div', { class: 'box' }, t('Drop to unwrap ✦')));
  document.body.append(overlay);
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    depth++;
    overlay.classList.add('is-on');
    zones.forEach((z) => z.closest('.drop')?.classList.add('is-over'));
  });
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) {
      overlay.classList.remove('is-on');
      zones.forEach((z) => z.closest('.drop')?.classList.remove('is-over'));
    }
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener('drop', async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    overlay.classList.remove('is-on');
    zones.forEach((z) => z.closest('.drop')?.classList.remove('is-over'));
    launch(await filesFromDataTransfer(e.dataTransfer));
  });
}

/* ---------- tabs ---------- */
function tabs() {
  for (const group of $$('[data-tabs]')) {
    const buttons = $$('[role=tab]', group);
    const panels = buttons.map((b) => document.getElementById(b.getAttribute('aria-controls')));
    const select = (i, focus = false) => {
      buttons.forEach((b, j) => {
        b.setAttribute('aria-selected', String(i === j));
        b.tabIndex = i === j ? 0 : -1;
        if (panels[j]) panels[j].hidden = i !== j;
      });
      if (focus) buttons[i].focus();
    };
    buttons.forEach((b, i) => {
      b.addEventListener('click', () => select(i));
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') select((i + 1) % buttons.length, true);
        if (e.key === 'ArrowLeft') select((i - 1 + buttons.length) % buttons.length, true);
      });
    });
  }
}

/* ---------- pricing ---------- */
const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
let billing = 'year';
const PLAN_ICON = { plus: 'search', pro: 'ghost', creator: 'trend' };

function tierCard(config, tier, cycle) {
  const plans = config.plans.filter((p) => p.tier === tier.id);
  const plan = plans.find((p) => p.cycle === cycle) || plans[0];
  const monthly = plans.find((p) => p.cycle === 'month');
  const lifetime = plans.find((p) => p.cycle === 'life');
  const featured = tier.id === 'pro';
  const below = config.tiers.find((t) => t.rank === tier.rank - 1);
  const save = plan.cycle === 'year' && monthly ? Math.round((1 - plan.priceUsd / (monthly.priceUsd * 12)) * 100) : 0;
  return h(
    'div',
    { class: `card plan plan--${tier.id}${featured ? ' is-featured' : ''}` },
    h('div', { class: 'plan-top' }, PLAN_ICON[tier.id] ? h('img', { class: 'ico3d plan-ico', src: `/assets/img/icons/${PLAN_ICON[tier.id]}.webp`, width: 64, height: 64, alt: '', loading: 'lazy', decoding: 'async' }) : null, h('span', { class: 'plan-name' }, tier.name), featured ? h('span', { class: 'badge' }, t('Most popular')) : tier.id === 'creator' ? h('span', { class: 'badge badge--uv' }, t('For creators')) : null),
    h('p', { class: 'plan-tagline' }, t(tier.tagline)),
    h(
      'div',
      { class: 'plan-price' },
      h('span', { class: 'amt' }, money(plan.cycle === 'year' ? Math.round((plan.priceUsd / 12) * 100) / 100 : plan.priceUsd)),
      h('span', { class: 'per' }, t('/ month')),
    ),
    h('p', { class: 'plan-sub' }, plan.cycle === 'year' ? [t('{price} billed once a year', { price: money(plan.priceUsd) }), save > 0 ? h('span', { class: 'save' }, t('save {n}%', { n: save })) : null] : t('{n} days · no auto-renewal', { n: plan.days })),
    h('p', { class: 'plan-for' }, icon('target'), t(tier.bestFor)),
    h(
      'ul',
      null,
      below ? h('li', { class: 'plan-inherit' }, icon('arrow'), t('Everything in {tier}', { tier: below.name })) : null,
      tier.features.map((f) => h('li', null, icon('check'), t(f))),
    ),
    h('button', { class: `btn ${featured ? 'btn--primary' : 'btn--ghost'} btn--block btn--lg`, type: 'button', dataset: { plan: plan.id } }, t('Get {tier}', { tier: tier.name })),
    lifetime ? h('button', { class: 'plan-alt', type: 'button', dataset: { plan: lifetime.id } }, t('or {price} once — {tier} for life', { price: money(lifetime.priceUsd), tier: tier.name })) : null,
  );
}

async function pricing() {
  const boxes = $$('[data-pricing]');
  if (!boxes.length) return;
  const config = await getConfig();
  // Only advertise coins that the configured payment methods really accept.
  const methods = (config.methods || []).map((m) => m.id);
  if (!config.offline && !methods.includes('nowpayments')) {
    for (const coins of $$('[data-coins]')) {
      clear(coins).append(h('span', { class: 'coin' }, h('i', { style: { background: '#26a17b' } }), 'USDT · TRC20'));
    }
  }
  if (!config.tiers?.length) return; // offline: keep the static fallback
  const bestSave = Math.max(
    ...config.tiers.map((t) => {
      const m = config.plans.find((p) => p.tier === t.id && p.cycle === 'month');
      const y = config.plans.find((p) => p.tier === t.id && p.cycle === 'year');
      return m && y ? Math.round((1 - y.priceUsd / (m.priceUsd * 12)) * 100) : 0;
    }),
  );
  for (const box of boxes) {
    const cards = h('div', { class: 'pricing pricing--tiers' });
    const toggle = h('div', { class: 'billing', role: 'radiogroup', 'aria-label': t('Billing period') });
    const draw = () => {
      clear(toggle);
      for (const [cycle, label] of [['month', t('Monthly')], ['year', t('Yearly')]]) {
        const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(billing === cycle) }, label, cycle === 'year' && bestSave > 0 ? h('span', { class: 'save' }, `−${bestSave}%`) : null);
        b.addEventListener('click', () => {
          billing = cycle;
          boxes.forEach((x) => x._draw?.());
        });
        toggle.append(b);
      }
      clear(cards).append(...config.tiers.map((t) => tierCard(config, t, billing)));
    };
    box._draw = draw;
    clear(box).append(toggle, cards);
    draw();
  }
}

function checkoutTriggers() {
  document.addEventListener('click', async (e) => {
    const trigger = e.target.closest('[data-plan],[data-checkout]');
    if (!trigger) return;
    e.preventDefault();
    const { openCheckout } = await import('./lib/checkout.js');
    openCheckout({ plan: trigger.dataset.plan, tier: trigger.dataset.tier });
  });
}

/* ---------- license badge ---------- */
async function licenseBadge() {
  const state = await proState().catch(() => ({ pro: false }));
  document.body.classList.toggle('is-pro', Boolean(state.pro));
  const names = { plus: 'Plus', pro: 'Pro', creator: 'Creator' };
  $$('[data-tier-name]').forEach((el) => (el.textContent = names[state.tier] || 'Pro'));
}

/* ---------- sticky mobile CTA ---------- */
// Shows once the hero's drop zone has scrolled away, hides near the bottom CTA.
function stickyCta() {
  const bar = $('[data-sticky-cta]');
  const drop = $('.hero .drop, .hero [data-drop]');
  if (!bar || !drop || !('IntersectionObserver' in window)) return;
  const seen = new Map();
  const update = () => bar.classList.toggle('is-on', !seen.get('drop') && !seen.get('cta') && !seen.get('foot'));
  const watch = (el, key) => {
    if (!el) return;
    new IntersectionObserver(([e]) => {
      seen.set(key, e.isIntersecting);
      update();
    }).observe(el);
  };
  seen.set('drop', true);
  watch(drop, 'drop');
  watch($('.cta-band'), 'cta');
  watch($('.site-footer'), 'foot');
}

/* ---------- "remind me tomorrow" ---------- */
// Exports take minutes to hours; a calendar reminder brings people back.
// When the server can send e-mail, the button first offers a one-time e-mail
// reminder (the address is deleted after sending); the .ics stays as fallback.
async function calendarReminder() {
  const [{ icsReminder }, { downloadBlob, toast }] = await Promise.all([import('./lib/calendar.js'), import('./lib/ui.js')]);
  const prefix = (document.documentElement.lang || 'en').slice(0, 2);
  const url = `${location.origin}${prefix === 'en' ? '' : `/${prefix}`}/#start`;
  const ics = icsReminder({ title: t('Drop your data export on Unwrapped'), description: t('Your export should be ready. Download the ZIP from the e-mail and drop it here: {v0}', { v0: url }), url, days: 1 });
  downloadBlob(new Blob([ics], { type: 'text/calendar' }), 'unwrapped-reminder.ics');
  toast(t('Reminder saved — open it to add it to your calendar'), { iconName: 'calendar', timeout: 4200 });
}

function remindForm(btn) {
  const form = document.createElement('form');
  form.className = 'stack';
  form.style.cssText = '--stack:8px;max-width:420px;margin-top:10px';
  form.dataset.remindForm = '';
  form.innerHTML = `<label class="small muted" for="remind-email-${btn.dataset.remind}"></label>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" style="flex:1 1 200px" type="email" required autocomplete="email" inputmode="email" maxlength="254" id="remind-email-${btn.dataset.remind}"><button class="btn btn--primary btn--sm" type="submit"></button></div>
    <button class="btn btn--ghost btn--sm" type="button" style="align-self:flex-start" data-remind-ics></button>`;
  form.querySelector('label').textContent = t('E-mail me once when my export should be ready. Your address is deleted after that one e-mail.');
  form.querySelector('[type=submit]').textContent = t('E-mail me');
  form.querySelector('[data-remind-ics]').textContent = t('Use a calendar file instead');
  form.querySelector('[data-remind-ics]').addEventListener('click', calendarReminder);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    const [{ api }, { toast }] = await Promise.all([import('./lib/api.js'), import('./lib/ui.js')]);
    try {
      const lang = (document.documentElement.lang || 'en').slice(0, 2);
      const { hours } = await api('/api/remind', { method: 'POST', body: { email: form.querySelector('input').value.trim(), platform: btn.dataset.remind || 'instagram', lang } });
      form.replaceChildren(Object.assign(document.createElement('p'), { className: 'small muted', textContent: t('Done — we’ll e-mail you in about {v0} hours.', { v0: hours }) }));
    } catch {
      submit.disabled = false;
      toast(t('Couldn’t save the reminder — try the calendar file instead'), { iconName: 'calendar', timeout: 4200 });
    }
  });
  return form;
}

function remindButtons() {
  $$('[data-remind]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const row = btn.parentElement;
      if (row.nextElementSibling?.matches('[data-remind-form]')) return row.nextElementSibling.querySelector('input')?.focus();
      let email = false;
      try {
        email = Boolean((await (await import('./lib/api.js')).getConfig()).email);
      } catch {
        /* offline: calendar file only */
      }
      if (!email) return calendarReminder();
      const form = remindForm(btn);
      row.after(form);
      form.querySelector('input').focus();
    }),
  );
}

/* ---------- welcome back ---------- */
// Returning visitors with a saved snapshot older than ~10 days get a nudge:
// a fresh export now shows who unfollowed them. Read from this browser only.
async function welcomeBack() {
  const drop = $('.hero .drop');
  if (!drop || !window.indexedDB) return;
  try {
    // Don't create the database for first-time visitors.
    if (indexedDB.databases && !(await indexedDB.databases()).some((d) => d.name === 'unwrapped')) return;
    const { latestSnapshot } = await import('./app/snapshots.js');
    const snap = await latestSnapshot();
    if (!snap) return;
    const days = Math.floor((Date.now() - snap.takenAt) / 864e5);
    if (days < 10) return;
    const { dateShort } = await import('./lib/format.js');
    const label = { instagram: 'Instagram', tiktok: 'TikTok', x: 'X', facebook: 'Facebook', threads: 'Threads' }[snap.platform] || snap.platform;
    const who = snap.account ? (snap.platform === 'facebook' ? snap.account : `@${snap.account}`) : label;
    const box = h(
      'div',
      { class: 'welcome-back', role: 'status' },
      icon('ghost'),
      h('div', null, h('b', null, t('Welcome back, {v0}', { v0: who })), h('span', null, t('Your last {v0} export is from {v1} — {v2} days ago. Download a fresh one and drop it here to see who unfollowed you since.', { v0: label, v1: dateShort(snap.takenAt), v2: days }))),
      h('a', { class: 'btn btn--primary btn--sm', href: '#how' }, t('How to download')),
    );
    drop.parentElement.before(box);
  } catch {
    /* storage blocked: no reminder */
  }
}

/* ---------- privacy monitor ---------- */
function netMonitor() {
  const box = $('[data-netmon]');
  if (!box) return;
  const total = $('[data-netmon-total]', box);
  const during = $('[data-netmon-during]', box);
  const online = $('[data-netmon-online]', box);
  const update = () => {
    const entries = performance.getEntriesByType('resource');
    total.textContent = String(entries.length);
    const start = window.__unwAnalysisStart;
    if (start !== undefined && during) during.textContent = String(entries.filter((e) => e.startTime >= start).length);
    if (online) online.textContent = navigator.onLine ? t('Online') : t('Offline — and still working');
  };
  update();
  setInterval(update, 1000);
}

/* ---------- wrapped showcase ---------- */
function showcase() {
  const box = $('[data-showcase]');
  if (!box) return;
  const io = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    const { drawCard, fontsReady } = await import('./app/wrapped.js');
    await fontsReady();
    const cards = [
      ['aurora', { kicker: t('{v0} · network', { v0: 'Instagram' }), titleA: t('My Instagram,'), titleB: t('unwrapped.'), hero: '74%', heroLabel: t('of the accounts I follow follow me back'), rows: [[t('Followers'), '1,284'], [t('Following'), '1,032'], [t('Mutuals'), '764'], [t('Don’t follow back'), '268']], persona: 'The Magnet', personaLine: 'More people follow you than you follow.', period: 'EXPORT · OCT 9, 2026' }],
      ['signal', { kicker: t('TikTok · screen time'), titleA: t('My TikTok,'), titleB: t('unwrapped.'), hero: '412h', heroLabel: t('watched in {v0} days', { v0: 180 }), rows: [[t('Videos watched'), '41.2K'], [t('Per day'), t('{v0} min', { v0: 137 })], [t('Longest binge'), '4 h 17 min'], [t('Peak hour'), '23:00']], persona: 'Night Owl', personaLine: 'One more video… at 11 PM. Every night.', period: 'APR 13 – OCT 9, 2026' }],
      ['ember', { kicker: t('{v0} · privacy', { v0: 'Instagram' }), titleA: t('What they know,'), titleB: t('unwrapped.'), hero: 'D', heroLabel: t('exposure score {v0}/100', { v0: 68 }), rows: [[t('Advertisers with my data'), '214'], [t('Interests profiled'), '36'], [t('Login IP addresses'), '20'], [t('Connected apps'), '6']], persona: 'Open Book', personaLine: 'Advertisers know you well.', period: 'EXPORT · OCT 9, 2026' }],
      ['paper', { kicker: t('X · posts'), titleA: t('My X,'), titleB: t('unwrapped.'), hero: '1.9K', heroLabel: t('posts, replies & reposts'), rows: [[t('Likes earned'), '84.1K'], [t('Best post'), t('{v0} likes', { v0: 896 })], [t('Most active'), '09:00'], [t('On X for'), t('{v0} years', { v0: '6.6' })]], persona: 'The Original', personaLine: 'You post your own takes.', period: 'EXPORT · OCT 9, 2026' }],
    ];
    for (const [theme, card] of cards) {
      const canvas = h('canvas', { role: 'img', 'aria-label': `Example card: ${card.titleA} ${card.hero} ${card.heroLabel}` });
      drawCard(canvas, card, theme, { watermark: false });
      box.append(canvas);
    }
  });
  io.observe(box);
}

/* ---------- hero orbit ---------- */
async function heroCanvas() {
  const canvas = $('[data-hero-orbit]');
  if (!canvas) return;
  // Decorative only: start once the page has loaded and the browser is idle,
  // so it never competes with the first paint.
  if (document.readyState !== 'complete') await new Promise((r) => addEventListener('load', r, { once: true }));
  await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 2500 }) : setTimeout(r, 1200)));
  const { heroOrbit } = await import('./app/orbit.js');
  heroOrbit(canvas);
}

/* ---------- hero video ---------- */
// The hero picture becomes a short looping clip on wider screens, once the page
// is idle. Phones, data-saver and reduced-motion users keep the still image.
async function heroVideo() {
  const box = $('[data-hero-video]');
  if (!box || innerWidth < 760 || navigator.connection?.saveData || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.readyState !== 'complete') await new Promise((r) => addEventListener('load', r, { once: true }));
  await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 3000 }) : setTimeout(r, 1500)));
  const img = box.querySelector('img');
  const v = h('video', { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'auto', poster: img.currentSrc, width: img.width, height: img.height });
  v.muted = true;
  v.src = box.dataset.heroVideo;
  v.className = 'hero-video';
  // Sits on top of the picture and fades in once it actually plays.
  v.addEventListener('playing', () => v.classList.add('is-playing'), { once: true });
  box.append(v);
  v.play().catch(() => v.remove());
}

/* ---------- misc ---------- */
function misc() {
  $$('[data-year]').forEach((el) => (el.textContent = String(new Date().getFullYear())));
  $$('[data-demo]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      launchDemo();
    }),
  );
  if (location.hash === '#demo') launchDemo();
  // Same-page "#demo" links (e.g. the footer) only change the hash.
  addEventListener('hashchange', () => location.hash === '#demo' && launchDemo());
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}

/* ---------- support contact (set by the site owner in SUPPORT_CONTACT) ---------- */
async function supportContact() {
  const box = document.querySelector('[data-support]');
  if (!box) return;
  const config = await getConfig().catch(() => null);
  if (!config?.support) return;
  const { supportLinks } = await import('./lib/support.js');
  clear(box.querySelector('[data-support-value]')).append(...supportLinks(config.support));
  box.hidden = false;
}

/* ---------- in-app browsers (Instagram, TikTok, Facebook links) ---------- */
// Most visitors arrive from a bio link. In-app browsers often can't pick ZIP
// files or keep big downloads, so suggest the real browser before they try.
function inAppBrowserNotice() {
  const ua = navigator.userAgent || '';
  const app = /Instagram/i.test(ua) ? 'Instagram' : /musical_ly|BytedanceWebview|TikTok/i.test(ua) ? 'TikTok' : /FBAN|FBAV|FB_IAB/i.test(ua) ? 'Facebook' : /Snapchat/i.test(ua) ? 'Snapchat' : null;
  if (!app || !$('[data-drop], .drop')) return;
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const copy = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, t('Copy link'));
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      copy.textContent = t('Copied');
    } catch {
      prompt(t('Copy this link'), location.href);
    }
  });
  const bar = h(
    'div',
    { class: 'inapp-notice', role: 'note' },
    icon('globe'),
    h('span', null, t('You’re in the {v0} browser. For uploading your ZIP, open this page in {v1}: tap ⋯ and choose “Open in browser”.', { v0: app, v1: ios ? 'Safari' : 'Chrome' })),
    copy,
  );
  document.body.prepend(bar);
}

/* ---------- 404 in the visitor's language ---------- */
// There is one 404 page for all languages; pick the language from the URL
// (/es/…) or, failing that, from the browser.
const NOT_FOUND = {
  es: ['Esta página nunca estuvo en la exportación.', 'Quizá nos dejó de seguir. Volvamos al inicio.', 'Ir al inicio', 'Centro de ayuda'],
  pt: ['Esta página nunca esteve na exportação.', 'Talvez ela tenha deixado de nos seguir. Vamos voltar.', 'Ir para o início', 'Central de ajuda'],
  tr: ['Bu sayfa hiç dışa aktarımda yoktu.', 'Belki bizi takipten çıktı. Seni geri götürelim.', 'Ana sayfaya git', 'Yardım merkezi'],
};
function localizedNotFound() {
  if (!$('[data-404]')) return;
  const fromPath = (location.pathname.match(/^\/(es|pt|tr)\//) || [])[1];
  const code = fromPath || (navigator.language || '').slice(0, 2).toLowerCase();
  const texts = NOT_FOUND[code];
  if (!texts) return;
  const [title, text, home, help] = texts;
  document.documentElement.lang = code;
  $('[data-404-title]').textContent = title;
  $('[data-404-text]').textContent = text;
  Object.assign($('[data-404-home]'), { textContent: home, href: `/${code}/` });
  Object.assign($('[data-404-help]'), { textContent: help, href: `/${code}/help/` });
}

header();
themePicker();

// Platforms dropdown: opens on hover/focus via CSS; the button adds tap and Escape support.
(() => {
  const dd = $('.nav-dd');
  const b = $('.nav-dd-btn');
  if (!dd || !b) return;
  const set = (open) => {
    dd.classList.toggle('is-open', open);
    b.setAttribute('aria-expanded', String(open));
  };
  b.addEventListener('click', () => set(!dd.classList.contains('is-open')));
  document.addEventListener('click', (e) => { if (!dd.contains(e.target)) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
})();
localizedNotFound();
inAppBrowserNotice();
supportContact();
import('./lib/stats.js').then(({ trackView }) => trackView()).catch(() => {});
reveals();
liveCount();
testimonials();
spotlight();
dropZones();
tabs();
checkoutTriggers();
misc();
heroCanvas();
heroVideo();
showcase();
netMonitor();
stickyCta();
welcomeBack();
remindButtons();
if (document.readyState === 'complete') setTimeout(featuredPlanFirst, 50);
else window.addEventListener('load', () => setTimeout(featuredPlanFirst, 50), { once: true });
// Phones show the plans as a swipe row: start on the featured one.
function featuredPlanFirst() {
  swipeRowsFocusable();
  $$('.pricing--tiers').forEach((row) => {
    const featured = $('.is-featured', row);
    if (!featured || row.scrollWidth <= row.clientWidth) return;
    const delta = featured.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - featured.offsetWidth) / 2;
    row.scrollTo({ left: row.scrollLeft + delta, behavior: 'instant' });
  });
}
// A swipe row or wide table with nothing focusable inside can't be scrolled from the keyboard,
// so it becomes a tab stop itself.
function swipeRowsFocusable() {
  $$('.lab-grid, .pricing--tiers, #tools .bento, #how .steps, .table-wrap, .compare-wrap, .card--pad').forEach((row) => {
    if (row.scrollWidth <= row.clientWidth || row.querySelector('a[href], button, input, select, textarea, [tabindex]')) return;
    const head = row.closest('section')?.querySelector('h2');
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'region');
    if (head) row.setAttribute('aria-label', head.textContent.trim());
  });
}
// Phones: plan names above the swipe row, so it's clear there are three plans and which one is shown.
function planTabs() {
  $$('.pricing--tiers').forEach((row) => {
    row.previousElementSibling?.classList.contains('plan-tabs') && row.previousElementSibling.remove();
    const cards = [...row.children];
    const tabs = h('div', { class: 'plan-tabs' }, ...cards.map((card) => h('button', { type: 'button', 'aria-current': String(card.classList.contains('is-featured')) }, $('.plan-name', card)?.textContent || '')));
    const buttons = [...tabs.children];
    // The billing toggle redraws the cards, so look them up on each use.
    const card = (i) => row.children[i];
    buttons.forEach((b, i) => b.addEventListener('click', () => row.scrollTo({ left: row.scrollLeft + card(i).getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - card(i).offsetWidth) / 2, behavior: 'smooth' })));
    let tick = 0;
    row.addEventListener('scroll', () => {
      cancelAnimationFrame(tick);
      tick = requestAnimationFrame(() => {
        const box = row.getBoundingClientRect();
        const off = (c) => { const r = c.getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - box.left - box.width / 2); };
        const live = [...row.children];
        let best = 0;
        live.forEach((c, i) => { if (off(c) < off(live[best])) best = i; });
        buttons.forEach((b, i) => b.setAttribute('aria-current', String(i === best)));
      });
    }, { passive: true });
    row.before(tabs);
  });
}
// Long card lists (the blog): filter by the topic badge on each card.
function tileFilter() {
  for (const grid of $$('[data-filter]')) {
    const tiles = [...grid.children];
    const topic = (tile) => $('.badge', tile)?.textContent.trim() || '';
    const counts = new Map();
    tiles.forEach((tile) => counts.set(topic(tile), (counts.get(topic(tile)) || 0) + 1));
    const topics = [...counts].filter(([name, n]) => name && n > 1).sort((a, b) => b[1] - a[1]);
    if (tiles.length < 9 || topics.length < 2) continue;
    const bar = h('div', { class: 'tile-filter', role: 'toolbar', 'aria-label': grid.dataset.filter });
    const pick = (name) => {
      tiles.forEach((tile) => (tile.hidden = !!name && topic(tile) !== name));
      [...bar.children].forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.topic || '') === name)));
    };
    for (const [name, n] of [['', tiles.length], ...topics]) {
      const b = h('button', { type: 'button', 'aria-pressed': String(!name), dataset: { topic: name } }, name || grid.dataset.filter, h('span', null, String(n)));
      b.addEventListener('click', () => pick(name));
      bar.append(b);
    }
    grid.before(bar);
  }
}
// Phones: the compare table shows Free plus one paid plan at a time, picked with the buttons above it.
function compareColumns() {
  const table = $('.compare');
  const wrap = table?.closest('.compare-wrap');
  const heads = table ? $$('thead th', table).slice(2) : [];
  if (!wrap || heads.length < 2) return;
  const phone = matchMedia('(max-width: 760px)');
  const groups = $$('tr.grp th[colspan]', table).map((th) => [th, th.colSpan]);
  const buttons = heads.map((th) => h('button', { type: 'button', 'aria-pressed': 'false' }, th.textContent.trim()));
  const pick = (i) => {
    table.dataset.col = String(i);
    buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
  };
  buttons.forEach((b, i) => b.addEventListener('click', () => pick(i)));
  wrap.before(h('div', { class: 'compare-pick', role: 'group', 'aria-label': $('#compare h2')?.textContent.trim() || '' }, ...buttons));
  pick(Math.max(0, heads.findIndex((th) => th.classList.contains('is-featured'))));
  const apply = () => {
    table.classList.toggle('is-picked', phone.matches);
    groups.forEach(([th, span]) => (th.colSpan = phone.matches ? 3 : span));
  };
  phone.addEventListener('change', apply);
  apply();
}
tileFilter();
compareColumns();
planTabs();
getConfig().then(async () => {
  await pricing();
  planTabs();
  featuredPlanFirst();
  licenseBadge();
});
import('./lib/referral.js').then(async ({ captureRef }) => {
  if (await captureRef()) {
    const { toast } = await import('./lib/ui.js');
    toast(t('A friend invited you — 10% off any plan is applied at checkout'), { iconName: 'sparkles', timeout: 5000 });
  }
});
window.addEventListener('unw:license', licenseBadge);
