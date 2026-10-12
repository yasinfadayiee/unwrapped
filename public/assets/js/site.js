// Site-wide behaviour for every page.

import { h, icon, clear, prefersReducedMotion } from './lib/ui.js';
import { getConfig } from './lib/api.js';
import { proState } from './lib/license.js';

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
  const overlay = h('div', { class: 'drop-overlay', 'aria-hidden': 'true' }, h('div', { class: 'box' }, 'Drop to unwrap ✦'));
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
    h('div', { class: 'plan-top' }, h('span', { class: 'plan-name' }, tier.name), featured ? h('span', { class: 'badge' }, 'Most popular') : tier.id === 'creator' ? h('span', { class: 'badge badge--uv' }, 'For creators') : null),
    h('p', { class: 'plan-tagline' }, tier.tagline),
    h(
      'div',
      { class: 'plan-price' },
      h('span', { class: 'amt' }, money(plan.cycle === 'year' ? Math.round((plan.priceUsd / 12) * 100) / 100 : plan.priceUsd)),
      h('span', { class: 'per' }, '/ month'),
    ),
    h('p', { class: 'plan-sub' }, plan.cycle === 'year' ? [`${money(plan.priceUsd)} billed once a year`, save > 0 ? h('span', { class: 'save' }, `save ${save}%`) : null] : `${plan.days} days · no auto-renewal`),
    h('p', { class: 'plan-for' }, icon('target'), tier.bestFor),
    h(
      'ul',
      null,
      below ? h('li', { class: 'plan-inherit' }, icon('arrow'), `Everything in ${below.name}`) : null,
      tier.features.map((f) => h('li', null, icon('check'), f)),
    ),
    h('button', { class: `btn ${featured ? 'btn--primary' : 'btn--ghost'} btn--block btn--lg`, type: 'button', dataset: { plan: plan.id } }, `Get ${tier.name}`),
    lifetime ? h('button', { class: 'plan-alt', type: 'button', dataset: { plan: lifetime.id } }, `or ${money(lifetime.priceUsd)} once — ${tier.name} for life`) : null,
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
    const toggle = h('div', { class: 'billing', role: 'radiogroup', 'aria-label': 'Billing period' });
    const draw = () => {
      clear(toggle);
      for (const [cycle, label] of [['month', 'Monthly'], ['year', 'Yearly']]) {
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
    if (online) online.textContent = navigator.onLine ? 'Online' : 'Offline — and still working';
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
      ['aurora', { kicker: 'Instagram · network', titleA: 'My Instagram,', titleB: 'unwrapped.', hero: '74%', heroLabel: 'of the accounts I follow follow me back', rows: [['Followers', '1,284'], ['Following', '1,032'], ['Mutuals', '764'], ['Don’t follow back', '268']], persona: 'The Magnet', personaLine: 'More people follow you than you follow.', period: 'EXPORT · OCT 9, 2026' }],
      ['signal', { kicker: 'TikTok · screen time', titleA: 'My TikTok,', titleB: 'unwrapped.', hero: '412h', heroLabel: 'watched in 180 days', rows: [['Videos watched', '41.2K'], ['Per day', '137 min'], ['Longest binge', '4 h 17 min'], ['Peak hour', '11 PM']], persona: 'Night Owl', personaLine: 'One more video… at 11 PM. Every night.', period: 'APR 13 – OCT 9, 2026' }],
      ['ember', { kicker: 'Instagram · privacy', titleA: 'What they know,', titleB: 'unwrapped.', hero: 'D', heroLabel: 'exposure score 68/100', rows: [['Advertisers with my data', '214'], ['Interests profiled', '36'], ['Login IP addresses', '20'], ['Connected apps', '6']], persona: 'Open Book', personaLine: 'Advertisers know you well.', period: 'EXPORT · OCT 9, 2026' }],
      ['paper', { kicker: 'X · posts', titleA: 'My X,', titleB: 'unwrapped.', hero: '1.9K', heroLabel: 'posts, replies & reposts', rows: [['Likes earned', '84.1K'], ['Best post', '896 likes'], ['Most active', '9 AM'], ['On X for', '6.6 years']], persona: 'The Original', personaLine: 'You post your own takes.', period: 'EXPORT · OCT 9, 2026' }],
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

header();
reveals();
spotlight();
dropZones();
tabs();
checkoutTriggers();
misc();
heroCanvas();
showcase();
netMonitor();
getConfig().then(() => {
  pricing();
  licenseBadge();
});
import('./lib/referral.js').then(async ({ captureRef }) => {
  if (await captureRef()) {
    const { toast } = await import('./lib/ui.js');
    toast('A friend invited you — 10% off any plan is applied at checkout', { iconName: 'sparkles', timeout: 5000 });
  }
});
window.addEventListener('unw:license', licenseBadge);
