// The results dashboard. Everything here runs on the user's device.

import { h, icon, clear, append, toast, modal } from '../lib/ui.js';
import { fmtInt, compact } from '../lib/format.js';
import { buildVfs } from '../core/vfs.js';
import { analyze } from '../core/analyze.js';
import { buildDemoVfs, demoPreviousSnapshot } from '../core/demo.js';
import { crossPlatform } from '../core/insights.js';
import { proState } from '../lib/license.js';
import { getConfig } from '../lib/api.js';
import { TIER_NAME, TIER_RANK, atLeast, tierFor } from '../lib/tiers.js';
import { labViews, tierPill } from './views-lab.js';
import { saveSnapshot, listSnapshots, snapshotFromDataset } from './snapshots.js';
import { instagramViews } from './views-instagram.js';
import { tiktokViews } from './views-tiktok.js';
import { xViews } from './views-x.js';
import { facebookViews } from './views-facebook.js';
import { linkedinViews } from './views-linkedin.js';
import { crossView } from './views-cross.js';
import { playStory } from './story.js';

const VIEW_BUILDERS = {
  instagram: instagramViews,
  threads: instagramViews,
  tiktok: tiktokViews,
  x: xViews,
  facebook: facebookViews,
  linkedin: linkedinViews,
};

let active = null;

function loader() {
  const label = h('div', { class: 'text-2' }, 'Unwrapping your export…');
  const bar = h('i');
  const sparks = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return h('span', { class: 'spark', style: { '--x': `${Math.cos(a) * 60}px`, '--y': `${Math.sin(a) * 60}px`, animationDelay: `${i * 0.12}s` } });
  });
  const root = h(
    'div',
    { class: 'loading-screen', role: 'alert', 'aria-live': 'assertive' },
    h(
      'div',
      { class: 'loading-card' },
      h('div', { class: 'unwrap-anim', 'aria-hidden': 'true' }, h('div', { class: 'box' }), sparks),
      h('div', { class: 'h3' }, 'Unwrapping…'),
      label,
      h('div', { class: 'bar' }, bar),
      h('div', { class: 'tiny muted', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, icon('shield'), 'Processing on your device — nothing is uploaded.'),
    ),
  );
  document.body.append(root);
  return {
    set(text, fraction) {
      label.textContent = text;
      bar.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
    },
    close: () => root.remove(),
  };
}

function noDataHelp(result) {
  const m = modal({ title: 'We couldn’t find social media data' });
  m.body.append(
    h(
      'div',
      { class: 'stack', style: { '--stack': '14px' } },
      h('p', { class: 'text-2' }, `We looked through ${fmtInt(result.files)} files but none of them look like an Instagram, TikTok, X, Facebook, Threads or LinkedIn export.`),
      h(
        'ul',
        { class: 'checklist text-2' },
        h('li', null, icon('check'), 'Upload the ZIP exactly as the platform sent it — or the unzipped folder.'),
        h('li', null, icon('check'), 'Instagram: choose “Followers and following” (or “All available information”), format JSON or HTML.'),
        h('li', null, icon('check'), 'TikTok: choose JSON or TXT. X: upload the archive ZIP. LinkedIn: the ZIP with Connections.csv.'),
      ),
      result.problems.length ? h('div', { class: 'err-box' }, result.problems.join(' · ')) : null,
      h('a', { class: 'btn btn--ghost', href: '/#how' }, 'See how to download your data'),
    ),
  );
}

function networkMonitor(startTime) {
  const value = h('b', null, '0');
  const el = h('span', { class: 'net-indicator', title: 'Counted live by your browser. Your files are never sent anywhere.' }, h('span', { class: 'pulse-dot' }), value, ' network requests since you opened your file');
  let count = 0;
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.startTime >= startTime) count++;
      value.textContent = fmtInt(count);
    });
    po.observe({ type: 'resource', buffered: true });
    el._po = po;
  } catch {
    /* unsupported */
  }
  return el;
}

function keepStore() {
  const read = (key) => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`unw.keep.${key}`) || '[]'));
    } catch {
      return new Set();
    }
  };
  return {
    get: read,
    toggle(key, value) {
      const set = read(key);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      try {
        localStorage.setItem(`unw.keep.${key}`, JSON.stringify([...set]));
      } catch {
        /* ignore */
      }
      return set;
    },
  };
}

// What the sidebar offers next, depending on the tier the user has.
const NEXT_UP = {
  free: { tier: 'plus', title: 'Unlock everything', text: 'Full lists, who unfollowed you, search & CSV, every Wrapped theme.' },
  plus: { tier: 'pro', title: 'Open the Pro Lab', text: 'Ghost Detector, Engagement Audit, Growth Time Machine and Friendship Radar.' },
  pro: { tier: 'creator', title: 'Grow like a pro', text: 'Bot detector, Best Time to Post and white-label client reports.' },
};

function mount(result, { tier, demo, config, netStart, onNewFiles }) {
  const pro = atLeast(tier, 'plus');
  const datasets = result.datasets;
  const cross = crossPlatform(datasets);
  const tabs = datasets.map((ds, i) => ({ key: `ds${i}`, label: ds.label, icon: ds.platform, ds }));
  if (cross) tabs.push({ key: 'cross', label: 'Cross-platform', icon: 'orbit', cross });
  const keeps = keepStore();
  let tabIndex = 0;
  let viewId = 'overview';
  const viewCache = new Map();

  const root = h('div', { class: 'app', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your results' });
  const nav = h('nav', { class: 'app-nav', 'aria-label': 'Sections' });
  const mobileTabs = h('nav', { class: 'app-tabs', 'aria-label': 'Sections' });
  const main = h('main', { class: 'app-main', id: 'app-main', tabindex: '-1' });
  const dsSwitch = h('div', { class: 'ds-switch', role: 'group', 'aria-label': 'Platform' });

  const upgradeBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('bolt'), 'Upgrade');
  upgradeBtn.addEventListener('click', () => ctx.upgrade(NEXT_UP[tier] ? NEXT_UP[tier].tier : 'header'));
  const newBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'Analyze another export' }, icon('upload'), h('span', { class: 'hide-sm' }, 'New file'));
  const fileInput = h('input', { type: 'file', multiple: true, accept: '.zip,.json,.html,.htm,.js,.txt,.csv', class: 'drop-file', tabindex: '-1', 'aria-hidden': 'true' });
  newBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => fileInput.files.length && onNewFiles([...fileInput.files]));
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close results' }, icon('close'));

  const bar = h(
    'header',
    { class: 'app-bar' },
    h('a', { class: 'logo', href: '/', 'aria-label': 'Unwrapped home' }, icon('logo'), h('span', { class: 'hide-sm' }, 'Unwrapped')),
    dsSwitch,
    h('span', { class: 'spacer' }),
    networkMonitor(netStart),
    demo ? h('span', { class: 'badge badge--uv' }, 'Live demo') : pro ? h('span', { class: 'badge' }, icon('check'), TIER_NAME[tier]) : null,
    !demo && NEXT_UP[tier] ? upgradeBtn : null,
    newBtn,
    fileInput,
    closeBtn,
  );
  root.append(bar, h('div', { class: 'app-body' }, nav, h('div', { class: 'app-mainwrap' }, mobileTabs, main)));

  const ctx = {
    // `pro` means any paid tier (what used to be "Pro"); `can` checks one tool.
    pro,
    tier,
    can: (feature) => demo || atLeast(tier, tierFor(feature)),
    demo,
    freeLimit: config.freeListLimit || 20,
    site: location.host,
    snapshots: [],
    upgrade: async (reason) => {
      if (demo) {
        toast('This is the demo — everything is unlocked. Upgrade to unlock your own data.', { iconName: 'sparkles', timeout: 4200 });
        return;
      }
      const { openCheckout } = await import('../lib/checkout.js');
      openCheckout(TIER_RANK[reason] ? { tier: reason } : { reason });
    },
    keepSet: (key) => keeps.get(key),
    toggleKeep: (key, value) => keeps.toggle(key, value),
    go: (id) => {
      viewId = id;
      render();
    },
    reloadSnapshots: async () => {
      const ds = tabs[tabIndex].ds;
      if (ds?._snapshots && ds._acct) ds._snapshots = await listSnapshots(ds._acct);
      viewCache.clear();
      render();
    },
  };

  function viewsFor(tab) {
    if (!viewCache.has(tab.key)) {
      if (tab.cross) viewCache.set(tab.key, [{ id: 'overview', label: 'Cross-platform map', icon: 'orbit', render: () => crossView(tab.cross, ctx) }]);
      else {
        // Platform views first, then the Pro Lab, then Wrapped cards last.
        const ds = tab.ds;
        const base = VIEW_BUILDERS[ds.platform](ds, ctx);
        const lab = [...base.filter((v) => v.group === 'lab'), ...labViews(ds, ctx, { keepKey: `${ds.platform}:${ds.account?.username || 'me'}` })];
        const rest = base.filter((v) => v.group !== 'lab');
        const wrapped = rest.filter((v) => v.id === 'wrapped');
        viewCache.set(tab.key, [...rest.filter((v) => v.id !== 'wrapped'), ...lab, ...wrapped]);
      }
    }
    return viewCache.get(tab.key);
  }

  function navButton(v, compactMode) {
    const btn = h(
      'button',
      { class: 'nav-item', type: 'button', 'aria-current': String(v.id === viewId) },
      compactMode ? null : icon(v.icon || 'dot'),
      v.label,
      !compactMode && v.count !== undefined ? h('span', { class: 'count' }, compact(v.count)) : null,
      !compactMode && v.pro && !ctx.pro ? icon('lock', 'lock') : null,
      !compactMode && v.feature && !ctx.can(v.feature) ? tierPill(tierFor(v.feature)) : null,
    );
    btn.addEventListener('click', () => {
      viewId = v.id;
      render();
      main.scrollTo({ top: 0 });
      main.focus({ preventScroll: true });
    });
    return btn;
  }

  function render() {
    const tab = tabs[tabIndex];
    ctx.snapshots = tab.ds?._snapshots || [];
    const views = viewsFor(tab);
    if (!views.some((v) => v.id === viewId)) viewId = views[0].id;
    clear(dsSwitch);
    if (tabs.length > 1) {
      tabs.forEach((t, i) => {
        const b = h('button', { class: 'ds-btn', type: 'button', 'aria-pressed': String(i === tabIndex) }, icon(t.icon), t.label);
        b.addEventListener('click', () => {
          tabIndex = i;
          viewId = 'overview';
          render();
        });
        dsSwitch.append(b);
      });
    }
    const firstLab = views.find((v) => v.group === 'lab');
    append(clear(nav), [
      h('div', { class: 'group' }, tab.label),
      views.map((v) => [v === firstLab ? h('div', { class: 'group group--lab' }, icon('sparkles'), 'Pro Lab') : null, navButton(v, false)]),
    ]);
    const next = NEXT_UP[tier];
    if (next && !demo) {
      nav.append(
        h(
          'div',
          { class: 'panel nav-upsell', style: { marginTop: '18px', padding: '18px', display: 'grid', gap: '10px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, tierPill(next.tier), h('b', null, next.title)),
          h('span', { class: 'small text-2' }, next.text),
          h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => ctx.upgrade(next.tier) }, icon('bolt'), `Get ${TIER_NAME[next.tier]}`),
        ),
      );
    }
    append(clear(mobileTabs), views.map((v) => navButton(v, true)));
    const view = views.find((v) => v.id === viewId);
    let content;
    try {
      content = view.render();
    } catch (err) {
      console.error(err);
      content = h(
        'div',
        { class: 'app-content' },
        h('div', { class: 'err-box' }, `This section couldn’t be displayed (${err.message}). The rest of your results still work.`),
      );
    }
    clear(main);
    if (demo) {
      content.prepend(
        h(
          'div',
          { class: 'demo-banner' },
          h('span', null, 'You’re exploring a demo with made-up data. Your own results look exactly like this.'),
          h('a', { class: 'btn btn--primary btn--sm', href: '/#how' }, 'Get my export'),
        ),
      );
    }
    main.append(content);
    mobileTabs.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function close({ replacing = false } = {}) {
    root.remove();
    document.body.classList.remove('app-open');
    window.removeEventListener('popstate', onPop);
    if (!replacing && history.state && history.state.unwApp) history.back();
    active = null;
  }
  function onPop() {
    if (!history.state || !history.state.unwApp) {
      root.remove();
      document.body.classList.remove('app-open');
      window.removeEventListener('popstate', onPop);
      active = null;
    }
  }
  closeBtn.addEventListener('click', () => close());
  if (history.state && history.state.unwApp) history.replaceState({ unwApp: true }, '', demo ? '#demo' : '#results');
  else history.pushState({ unwApp: true }, '', demo ? '#demo' : '#results');
  window.addEventListener('popstate', onPop);
  document.body.classList.add('app-open');
  document.body.append(root);
  render();
  main.focus({ preventScroll: true });
  return { close, root };
}

let lastInput = null;
let activeTier = 'free';

// After a purchase inside the dashboard, re-render the same files unlocked.
window.addEventListener('unw:license', async () => {
  const state = await proState().catch(() => ({ tier: 'free' }));
  if (active && lastInput && !lastInput.demo && TIER_RANK[state.tier] > TIER_RANK[activeTier]) openApp(lastInput);
});

export async function openApp({ files = [], demo = false } = {}) {
  if (active) active.close({ replacing: true });
  lastInput = { files, demo };
  const [state, config] = await Promise.all([proState().catch(() => ({ pro: false, tier: 'free' })), getConfig()]);
  const load = loader();
  const netStart = performance.now();
  window.__unwAnalysisStart = netStart;
  // The demo shows every tool unlocked.
  activeTier = demo ? 'creator' : state.tier || 'free';
  try {
    let vfs;
    let rand;
    if (demo) {
      ({ vfs, rand } = buildDemoVfs());
    } else {
      vfs = await buildVfs(files, { onProgress: (f) => load.set('Opening your files…', f * 0.2) });
    }
    const result = await analyze(vfs, (label, f) => load.set(label, 0.2 + f * 0.75));
    if (!result.datasets.length) {
      load.close();
      noDataHelp(result);
      return;
    }
    load.set('Saving a private snapshot on this device…', 0.97);
    for (const ds of result.datasets) {
      if (!ds.hasRelationships || ds.platform === 'linkedin') continue;
      const snap = snapshotFromDataset(ds);
      ds._acct = snap.acct;
      if (demo) ds._snapshots = [demoPreviousSnapshot(snap, rand), snap];
      else {
        await saveSnapshot(snap);
        ds._snapshots = await listSnapshots(snap.acct);
      }
    }
    load.close();
    if (!openApp.skipStory) {
      playStory(result.datasets, { onDone: () => active?.root?.querySelector('.app-main')?.focus() });
    }
    active = mount(result, { tier: activeTier, demo, config, netStart, onNewFiles: (f) => openApp({ files: f }) });
  } catch (err) {
    console.error(err);
    load.close();
    const m = modal({ title: 'Something went wrong' });
    m.body.append(h('div', { class: 'err-box' }, err.message || String(err)), h('p', { class: 'small text-2', style: { marginTop: '12px' } }, 'If your export is split into several ZIP files, select all of them at once. Damaged downloads can also cause this — try downloading the export again.'));
  }
}
