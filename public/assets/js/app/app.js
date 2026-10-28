// The results dashboard. Everything here runs on the user's device.

import { h, icon, clear, append, toast, modal } from '../lib/ui.js';
import { fmtInt, compact, dateShort } from '../lib/format.js';
import { buildVfs } from '../core/vfs.js';
import { analyze } from '../core/analyze.js';
import { buildDemoVfs, demoPreviousSnapshot } from '../core/demo.js';
import { crossPlatform } from '../core/insights.js';
import { proState } from '../lib/license.js';
import { getConfig } from '../lib/api.js';
import { TIER_NAME, TIER_RANK, atLeast, tierFor } from '../lib/tiers.js';
import { labViews, tierPill, healthView } from './views-lab.js';
import { saveSnapshot, listSnapshots, snapshotFromDataset } from './snapshots.js';
import { instagramViews } from './views-instagram.js';
import { tiktokViews } from './views-tiktok.js';
import { xViews } from './views-x.js';
import { facebookViews } from './views-facebook.js';
import { linkedinViews } from './views-linkedin.js';
import { whatsappViews } from './views-whatsapp.js';
import { spotifyViews } from './views-spotify.js';
import { closestView, hasClosest } from './views-closest.js';
import { yearView } from './views-year.js';
import { pickYear } from '../core/year.js';
import { crossView } from './views-cross.js';
import { timelineView } from './views-timeline.js';

const ICONS_3D = new Set(['instagram', 'tiktok', 'x', 'facebook', 'linkedin', 'threads', 'whatsapp', 'telegram', 'spotify', 'orbit']);
import { playStory } from './story.js';
import { t as tl, lang } from '../lib/i18n.js';
import { track } from '../lib/stats.js';

const VIEW_BUILDERS = {
  instagram: instagramViews,
  threads: instagramViews,
  tiktok: tiktokViews,
  x: xViews,
  facebook: facebookViews,
  linkedin: linkedinViews,
  whatsapp: whatsappViews,
  telegram: whatsappViews,
  spotify: spotifyViews,
};

// Chat and listening exports get their own dashboard only: no timeline or intro story.
const CHAT_PLATFORMS = new Set(['whatsapp', 'telegram', 'spotify']);

const SECTIONS = ['start', 'people', 'content', 'privacy', 'lab', 'share'];
const SECTION_TITLE = { start: () => tl('Start here'), people: () => tl('Followers & people'), content: () => tl('Your posts & activity'), privacy: () => tl('Privacy'), lab: () => tl('Pro Lab'), share: () => tl('Share') };
const SECTION_OF = {
  overview: 'start', health: 'start', timeline: 'start', closest: 'people', year: 'share',
  notBack: 'people', fans: 'people', mutuals: 'people', unfollowers: 'people', lookup: 'people', requests: 'people', lists: 'people', friends: 'people', connections: 'people',
  privacy: 'privacy',
};

let active = null;
const trackedTools = new Set();

function loader() {
  const label = h('div', { class: 'text-2' }, tl('Unwrapping your export…'));
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
      h('div', { class: 'h3' }, tl('Unwrapping…')),
      label,
      h('div', { class: 'bar' }, bar),
      h('div', { class: 'tiny muted', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, icon('shield'), tl('Processing on your device — nothing is uploaded.')),
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

// Plain-language explanations for diagnose() results.
const HINTS = {
  parts: () => tl('Your export seems to be split into several parts. Select all of the parts at once (hold Ctrl or Shift), or drop the whole folder.'),
  empty: () => tl('The file is empty or could not be opened. Download the export again — the first download sometimes breaks off.'),
  other: (v) =>
    /telegram/i.test(v.v0)
      ? tl('This is a Telegram export in HTML. Export it again in Telegram Desktop and choose “Machine-readable JSON” as the format.')
      : tl('This looks like a {v0} export. Unwrapped reads Instagram, TikTok, X, Facebook, Threads, LinkedIn, WhatsApp, Telegram and Spotify exports.', v),
  media: () => tl('This download only contains photos or videos. Request your data again and choose “Followers and following” (Instagram) or “All data” (TikTok) in JSON format.'),
  pdf: () => tl('PDF files can’t be analyzed. Request the download in JSON (or HTML) format instead.'),
  'meta-partial': () => tl('This is a real Instagram/Facebook export — but it doesn’t include your followers or activity. Request it again and tick “Followers and following” (or choose “All available information”).'),
  few: (v) => tl('Only a few files were found ({v0}). Drop the whole ZIP exactly as the platform sent it, not single files from inside it.', v),
};

function noDataHelp(result, hints = []) {
  const m = modal({ title: tl('We couldn’t find social media data') });
  m.body.append(
    h(
      'div',
      { class: 'stack', style: { '--stack': '14px' } },
      hints.length ? h('div', { class: 'err-box', role: 'alert' }, hints.map((x) => h('p', { style: { margin: '0 0 6px' } }, HINTS[x.id](x.vars)))) : null,
      h('p', { class: 'text-2' }, tl('We looked through {v0} files but none of them look like an export from a supported platform.', { v0: fmtInt(result.files) })),
      h(
        'ul',
        { class: 'checklist text-2' },
        h('li', null, icon('check'), tl('Upload the ZIP exactly as the platform sent it — or the unzipped folder.')),
        h('li', null, icon('check'), tl('Instagram: choose “Followers and following” (or “All available information”), format JSON or HTML.')),
        h('li', null, icon('check'), tl('TikTok: choose JSON or TXT. X: upload the archive ZIP. LinkedIn: the ZIP with Connections.csv.')),
        h('li', null, icon('check'), tl('WhatsApp: open the chat → Export chat. Telegram Desktop: Export chat history → format JSON.')),
      ),
      result.problems.length ? h('div', { class: 'err-box' }, result.problems.join(' · ')) : null,
      h(
        'div',
        { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('a', { class: 'btn btn--ghost', href: `${lang === 'en' ? '' : `/${lang}`}/help/` }, tl('Open the help center')),
        h('a', { class: 'btn btn--ghost', href: `${lang === 'en' ? '' : `/${lang}`}/#how` }, tl('See how to download your data')),
      ),
    ),
  );
}

const PASSIVE_TYPES = new Set(['img', 'css', 'link', 'script']);
function isPassiveAsset(e) {
  try {
    return PASSIVE_TYPES.has(e.initiatorType) && new URL(e.name, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

function networkMonitor(startTime) {
  const value = h('b', null, '0');
  const el = h('span', { class: 'net-indicator', title: tl('Counted live by your browser. Your files are never sent anywhere.') }, h('span', { class: 'pulse-dot' }), value, ' ', tl('network requests since you opened your file'));
  let count = 0;
  try {
    const po = new PerformanceObserver((list) => {
      // Only requests that could carry data count: a same-origin image, stylesheet or script download can't.
      for (const e of list.getEntries()) if (e.startTime >= startTime && !isPassiveAsset(e)) count++;
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
  free: { tier: 'plus', title: tl('Unlock everything'), text: tl('Full lists, who unfollowed you, search & CSV, every Wrapped theme.') },
  plus: { tier: 'pro', title: tl('Open the Pro Lab'), text: tl('Ghost Detector, Engagement Audit, Growth Time Machine and Friendship Radar.') },
  pro: { tier: 'creator', title: tl('Grow like a pro'), text: tl('Bot detector, Best Time to Post and white-label client reports.') },
};

// The 7-day Pro pass offered next to "Unlock" on locked lists (free users only).
function weekPass(config, { pro, demo }) {
  const week = (config.plans || []).find((p) => p.id === 'pro-week');
  if (pro || demo || !week) return null;
  return {
    price: `$${week.priceUsd}`,
    onClick: async () => {
      const { openCheckout } = await import('../lib/checkout.js');
      openCheckout({ plan: 'pro-week' });
    },
  };
}

function mount(result, { tier, demo, config, netStart, onNewFiles }) {
  const pro = atLeast(tier, 'plus');
  const datasets = result.datasets;
  const cross = crossPlatform(datasets);
  const tabs = datasets.map((ds, i) => ({ key: `ds${i}`, label: ds.label, icon: ds.platform, ds }));
  if (cross) tabs.push({ key: 'cross', label: tl('Cross-platform'), icon: 'orbit', cross });
  const keeps = keepStore();
  let tabIndex = 0;
  let viewId = 'overview';
  const viewCache = new Map();

  const root = h('div', { class: 'app', role: 'dialog', 'aria-modal': 'true', 'aria-label': tl('Your results') });
  const nav = h('nav', { class: 'app-nav', 'aria-label': tl('Sections') });
  const mobileTabs = h('nav', { class: 'app-tabs', 'aria-label': tl('Sections') });
  const main = h('main', { class: 'app-main', id: 'app-main', tabindex: '-1' });
  const dsSwitch = h('div', { class: 'ds-switch', role: 'group', 'aria-label': tl('Platform') });

  const upgradeBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('bolt'), tl('Upgrade'));
  upgradeBtn.addEventListener('click', () => ctx.upgrade(NEXT_UP[tier] ? NEXT_UP[tier].tier : 'header'));
  const newBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: tl('Analyze another export') }, icon('upload'), h('span', { class: 'hide-sm' }, tl('New file')));
  const fileInput = h('input', { type: 'file', multiple: true, accept: '.zip,.json,.html,.htm,.js,.txt,.csv', class: 'drop-file', tabindex: '-1', 'aria-hidden': 'true' });
  newBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => fileInput.files.length && onNewFiles([...fileInput.files]));
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': tl('Close results') }, icon('close'));

  const bar = h(
    'header',
    { class: 'app-bar' },
    h('a', { class: 'logo', href: '/', 'aria-label': tl('Unwrapped home') }, icon('logo'), h('span', { class: 'hide-sm' }, tl('Unwrapped'))),
    dsSwitch,
    h('span', { class: 'spacer' }),
    networkMonitor(netStart),
    demo ? h('span', { class: 'badge badge--uv' }, tl('Live demo')) : pro ? h('span', { class: 'badge' }, icon('check'), TIER_NAME[tier]) : null,
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
    trial: weekPass(config, { pro, demo }),
    site: location.host,
    snapshots: [],
    upgrade: async (reason) => {
      if (demo) {
        toast(tl('This is the demo — everything is unlocked. Upgrade to unlock your own data.'), { iconName: 'sparkles', timeout: 4200 });
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
      main.scrollTo({ top: 0 });
    },
    hasView: (id) => viewsFor(tabs[tabIndex]).some((v) => v.id === id),
    // Jump from anywhere (e.g. Look up anyone) straight to one conversation.
    openChat: (thread) => {
      ctx.pendingChat = thread;
      ctx.go('messages');
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
      if (tab.cross) viewCache.set(tab.key, [{ id: 'overview', label: tl('Cross-platform map'), icon: 'orbit', render: () => crossView(tab.cross, ctx) }]);
      else {
        // Platform views first, then the Pro Lab, then Wrapped cards last.
        const ds = tab.ds;
        const base = VIEW_BUILDERS[ds.platform](ds, ctx);
        const lab = [...base.filter((v) => v.group === 'lab'), ...labViews(ds, ctx, { keepKey: `${ds.platform}:${ds.account?.username || 'me'}` })];
        const rest = base.filter((v) => v.group !== 'lab');
        const wrapped = rest.filter((v) => v.id === 'wrapped');
        const primary = rest.filter((v) => v.id !== 'wrapped');
        // Account health (free) sits right after the overview.
        if (ds.hasRelationships && ['instagram', 'threads', 'tiktok', 'x'].includes(ds.platform)) {
          primary.splice(1, 0, { id: 'health', label: tl('Account health'), icon: 'pulse', render: () => healthView(ds, ctx) });
        }
        // One timeline across every dropped export, shown in each tab.
        // One closeness ranking across every dropped export that has chats.
        if (hasClosest(datasets)) primary.splice(1, 0, { id: 'closest', label: tl('Your closest people'), icon: 'heart', render: () => closestView(datasets, ctx) });
        primary.push({ id: 'year', label: tl('Your {v0}', { v0: pickYear() }), icon: 'sparkles', render: () => yearView(datasets, ctx) });
        if (!CHAT_PLATFORMS.has(ds.platform)) primary.push({ id: 'timeline', label: tl('Your digital life'), icon: 'calendar', render: () => timelineView(datasets, ctx) });
        // The menu is grouped so people find things by what they want to do.
        const all = [...primary, ...lab.map((v) => ({ ...v, section: 'lab' })), ...wrapped.map((v) => ({ ...v, section: 'share' }))];
        for (const v of all) v.section = v.section || SECTION_OF[v.id] || 'content';
        viewCache.set(tab.key, SECTIONS.flatMap((s) => all.filter((v) => v.section === s)));
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
    btn.addEventListener('click', () => openView(v.id));
    return btn;
  }

  function openView(id) {
    // Anonymous "+1 for this tool today", once per tool per visit; never in the demo.
    if (!demo && !trackedTools.has(id)) {
      trackedTools.add(id);
      track('tool', { t: id });
    }
    viewId = id;
    render();
    main.scrollTo({ top: 0 });
    main.focus({ preventScroll: true });
  }

  // The phone menu: every tool of this platform as big tiles, grouped like the sidebar.
  function openToolSheet(views, tab) {
    const previous = document.activeElement;
    const search = h('input', { class: 'input tool-sheet-search', type: 'search', placeholder: tl('Search tools…'), 'aria-label': tl('Search tools…'), autocomplete: 'off', enterkeyhint: 'search' });
    const list = h('div', { class: 'tool-sheet-list' });
    const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': tl('Close') }, icon('close'));
    const helpBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('message'), tl('Help & contact'));
    const panel = h(
      'div',
      { class: 'tool-sheet-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': tl('All tools') },
      h('div', { class: 'tool-sheet-grip', 'aria-hidden': 'true' }),
      h('div', { class: 'tool-sheet-head' }, h('div', null, h('b', null, tl('All tools')), h('span', null, `${tab.label} · ${views.length}`)), closeBtn),
      h('div', { class: 'tool-sheet-find' }, icon('search'), search),
      list,
      h('div', { class: 'tool-sheet-foot' }, helpBtn),
    );
    const sheet = h('div', { class: 'tool-sheet' }, h('div', { class: 'tool-sheet-bg' }), panel);
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const shown = views.filter((v) => !q || v.label.toLowerCase().includes(q));
      clear(list);
      if (!shown.length) list.append(h('p', { class: 'tool-sheet-empty' }, tl('Nothing found')));
      SECTIONS.concat([undefined]).forEach((s) => {
        const group = shown.filter((v) => v.section === s);
        if (!group.length) return;
        if (s) list.append(h('div', { class: `tool-sheet-group${s === 'lab' ? ' group--lab' : ''}` }, s === 'lab' ? icon('sparkles') : null, s === 'lab' ? tl('Pro Lab') : SECTION_TITLE[s]()));
        list.append(
          h(
            'div',
            { class: 'tool-sheet-grid' },
            group.map((v) => {
              const b = h(
                'button',
                { class: 'tool-tile', type: 'button', 'aria-current': String(v.id === viewId) },
                h('span', { class: 'tool-tile-ico' }, icon(v.icon || 'dot')),
                h('span', { class: 'tool-tile-label' }, v.label),
                v.count !== undefined ? h('span', { class: 'tool-tile-count' }, compact(v.count)) : null,
                v.pro && !ctx.pro ? icon('lock', 'tool-tile-lock') : null,
                v.feature && !ctx.can(v.feature) ? tierPill(tierFor(v.feature)) : null,
              );
              b.addEventListener('click', () => {
                close();
                openView(v.id);
              });
              return b;
            }),
          ),
        );
      });
    };
    const onKey = (e) => e.key === 'Escape' && close();
    function close() {
      sheet.remove();
      document.removeEventListener('keydown', onKey);
      previous?.focus?.({ preventScroll: true });
    }
    search.addEventListener('input', draw);
    closeBtn.addEventListener('click', close);
    sheet.firstChild.addEventListener('click', close);
    helpBtn.addEventListener('click', () => {
      close();
      document.querySelector('.sw-fab')?.click();
    });
    document.addEventListener('keydown', onKey);
    draw();
    root.append(sheet);
    list.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
    closeBtn.focus({ preventScroll: true });
  }

  function render() {
    const tab = tabs[tabIndex];
    ctx.snapshots = tab.ds?._snapshots || [];
    const views = viewsFor(tab);
    if (!views.some((v) => v.id === viewId)) viewId = views[0].id;
    clear(dsSwitch);
    if (tabs.length > 1) {
      tabs.forEach((t, i) => {
        const b = h('button', { class: 'ds-btn', type: 'button', 'aria-pressed': String(i === tabIndex) }, ICONS_3D.has(t.icon) ? h('img', { class: 'ico3d', src: `/assets/img/icons/${t.icon}.webp`, width: 64, height: 64, alt: '' }) : icon(t.icon), t.label);
        b.addEventListener('click', () => {
          tabIndex = i;
          viewId = 'overview';
          render();
        });
        dsSwitch.append(b);
      });
    }
    append(clear(nav), [
      views.map((v, i) => [
        // A heading wherever the section changes (the first one names the platform).
        i === 0 || views[i - 1].section !== v.section
          ? v.section === 'lab'
            ? h('div', { class: 'group group--lab' }, icon('sparkles'), tl('Pro Lab'))
            : h('div', { class: 'group' }, i === 0 && !v.section ? tab.label : v.section === 'start' ? `${tab.label} · ${SECTION_TITLE.start()}` : (SECTION_TITLE[v.section] || (() => tab.label))())
          : null,
        navButton(v, false),
      ]),
    ]);
    const next = NEXT_UP[tier];
    if (next && !demo) {
      nav.append(
        h(
          'div',
          { class: 'panel nav-upsell', style: { marginTop: '18px', padding: '18px', display: 'grid', gap: '10px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, tierPill(next.tier), h('b', null, next.title)),
          h('span', { class: 'small text-2' }, next.text),
          h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => ctx.upgrade(next.tier) }, icon('bolt'), tl('Get {v0}', { v0: TIER_NAME[next.tier] })),
        ),
      );
    }
    // Phones and tablets: one button that opens every tool as a grouped, searchable sheet.
    const view = views.find((v) => v.id === viewId);
    const at = views.indexOf(view);
    const pickBtn = h(
      'button',
      { class: 'tool-pick', type: 'button', 'aria-haspopup': 'dialog' },
      h('span', { class: 'tool-pick-ico' }, icon(view.icon || 'dot')),
      h('span', { class: 'tool-pick-text' }, h('small', null, `${tl('All tools')} · ${at + 1}/${views.length}`), h('b', null, view.label)),
      h('span', { class: 'tool-pick-all' }, icon('list')),
    );
    pickBtn.addEventListener('click', () => openToolSheet(views, tab));
    const step = (d) => {
      const b = h('button', { class: 'icon-btn tool-step', type: 'button', 'aria-label': d < 0 ? tl('Previous') : tl('Next'), disabled: !views[at + d] }, icon(d < 0 ? 'arrow-left' : 'arrow'));
      b.addEventListener('click', () => views[at + d] && openView(views[at + d].id));
      return b;
    };
    append(clear(mobileTabs), [step(-1), pickBtn, step(1)]);
    mobileTabs.style.display = views.length < 2 ? 'none' : '';
    let content;
    try {
      content = view.render();
    } catch (err) {
      console.error(err);
      content = h(
        'div',
        { class: 'app-content' },
        h('div', { class: 'err-box' }, tl('This section couldn’t be displayed ({v0}). The rest of your results still work.', { v0: err.message })),
      );
    }
    clear(main);
    if (demo) {
      content.prepend(
        h(
          'div',
          { class: 'demo-banner' },
          h('span', null, tl('You’re exploring a demo with made-up data and every tool unlocked. Free with your own export: every overview and chart, plus the first 20 rows of every list.')),
          h('a', { class: 'btn btn--primary btn--sm', href: '/#how' }, tl('Get my export')),
        ),
      );
    }
    // Phones: the next tool is one tap away at the end of every view.
    const nextView = views[at + 1];
    if (nextView) {
      const nextBtn = h('button', { class: 'view-next', type: 'button' }, h('span', null, h('small', null, tl('Next')), h('b', null, nextView.label)), icon('arrow'));
      nextBtn.addEventListener('click', () => openView(nextView.id));
      content.append(nextBtn);
    }
    main.append(content);
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
      vfs = await buildVfs(files, { onProgress: (f) => load.set(tl('Opening your files…'), f * 0.2) });
    }
    const result = await analyze(vfs, (label, f) => load.set(label, 0.2 + f * 0.75));
    if (!result.datasets.length) {
      load.close();
      const { diagnose } = await import('../core/diagnose.js');
      const hints = diagnose(vfs, files);
      noDataHelp(result, hints);
      track('nodata', { r: hints[0]?.id || 'unknown' });
      return;
    }
    load.set(tl('Saving a private snapshot on this device…'), 0.97);
    const compared = [];
    for (const ds of result.datasets) {
      const previous = ds.previous || [];
      delete ds.previous;
      if (!ds.hasRelationships || ds.platform === 'linkedin') continue;
      const snap = snapshotFromDataset(ds);
      ds._acct = snap.acct;
      if (demo) ds._snapshots = [demoPreviousSnapshot(snap, rand), snap];
      else {
        // Older exports dropped together with this one become earlier snapshots.
        for (const old of previous.filter((d) => d.hasRelationships)) await saveSnapshot({ ...snapshotFromDataset(old), acct: snap.acct, account: snap.account });
        if (previous.length) compared.push({ ds, from: previous[previous.length - 1].exportedAt });
        await saveSnapshot(snap);
        ds._snapshots = await listSnapshots(snap.acct);
      }
    }
    load.close();
    track(demo ? 'demo' : 'analyze');
    if (!openApp.skipStory && result.datasets.some((d) => !CHAT_PLATFORMS.has(d.platform))) {
      playStory(result.datasets, { onDone: () => active?.root?.querySelector('.app-main')?.focus() });
    }
    active = mount(result, { tier: activeTier, demo, config, netStart, onNewFiles: (f) => openApp({ files: f }) });
    // Ask for a rating once people have had time to look around (never in the demo).
    if (!demo) setTimeout(() => import('../lib/feedback.js').then((m) => m.maybeAskFeedback({ platform: result.datasets[0]?.platform })).catch(() => {}), 45_000);
    for (const { ds, from } of compared) {
      toast(tl('Older {v0} export found — comparing {v1} with {v2}', { v0: ds.label, v1: dateShort(from), v2: dateShort(ds.exportedAt) }), { iconName: 'ghost', timeout: 6000 });
    }
  } catch (err) {
    console.error(err);
    load.close();
    const m = modal({ title: tl('Something went wrong') });
    const split = files.some((f) => /\.(z\d\d|\d{3})$/i.test(f.name || '') || /\.zip\.\d+$/i.test(f.name || ''));
    m.body.append(split ? h('div', { class: 'err-box', role: 'alert' }, HINTS.parts()) : null, h('div', { class: 'err-box' }, err.message || String(err)), h('p', { class: 'small text-2', style: { marginTop: '12px' } }, tl('If your export is split into several ZIP files, select all of them at once. Damaged downloads can also cause this — try downloading the export again.')));
  }
}
