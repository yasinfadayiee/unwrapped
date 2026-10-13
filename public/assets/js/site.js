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

/* ---------- reveal + spotlight ---------- */
function reveals() {
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
    h('div', { class: 'plan-top' }, h('span', { class: 'plan-name' }, tier.name), featured ? h('span', { class: 'badge' }, t('Most popular')) : tier.id === 'creator' ? h('span', { class: 'badge badge--uv' }, t('For creators')) : null),
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
  const { heroOrbit } = await import('./app/orbit.js');
  heroOrbit(canvas);
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
  box.querySelector('[data-support-value]').textContent = config.support;
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
localizedNotFound();
inAppBrowserNotice();
supportContact();
import('./lib/stats.js').then(({ trackView }) => trackView()).catch(() => {});
reveals();
spotlight();
dropZones();
tabs();
checkoutTriggers();
misc();
heroCanvas();
showcase();
netMonitor();
stickyCta();
getConfig().then(() => {
  pricing();
  licenseBadge();
});
import('./lib/referral.js').then(async ({ captureRef }) => {
  if (await captureRef()) {
    const { toast } = await import('./lib/ui.js');
    toast(t('A friend invited you — 10% off any plan is applied at checkout'), { iconName: 'sparkles', timeout: 5000 });
  }
});
window.addEventListener('unw:license', licenseBadge);
