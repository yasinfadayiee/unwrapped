import { h, icon, toast, downloadBlob } from '../lib/ui.js';
import { viewHead, panel, emptyState } from './components.js';
import { THEMES, cardsFor, drawCard, fontsReady, canvasBlob } from './wrapped.js';
import { t as tl } from '../lib/i18n.js';

// "Share" (native share sheet with the PNG, or a download) and "Save" buttons for a card.
export function cardButtons(canvas, filename, title = tl('My socials, unwrapped')) {
  const save = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('download'), tl('Save'));
  const share = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('share'), tl('Share'));
  save.addEventListener('click', async () => {
    downloadBlob(await canvasBlob(canvas), filename);
    toast(tl('Image saved'));
  });
  share.addEventListener('click', async () => {
    const blob = await canvasBlob(canvas);
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
      } catch {
        /* cancelled */
      }
    } else {
      downloadBlob(blob, file.name);
      toast(tl('Saved — share it from your gallery'));
    }
  });
  return h('div', { style: { display: 'flex', gap: '8px' } }, share, save);
}

export function wrappedView(ds, ctx) {
  const root = h('div', { class: 'app-content' });
  const cards = cardsFor(ds);
  root.append(viewHead(tl('Wrapped cards'), tl('Story-sized cards (1080×1920) of your stats — ready for Instagram, TikTok or WhatsApp. They show numbers only, never other people’s names.')));
  if (!cards.length) {
    root.append(panel(null, emptyState(tl('Not enough data in this export for a card yet.'), 'sparkles')));
    return root;
  }
  let theme = 'aurora';
  const themeRow = h('div', { class: 'theme-row', role: 'group', 'aria-label': tl('Card theme') });
  const grid = h('div', { class: 'wrapped-grid' });
  const canvases = [];

  for (const [id, t] of Object.entries(THEMES)) {
    const locked = !t.free && !ctx.pro;
    const dot = h('button', { class: 'theme-dot', type: 'button', style: { background: t.swatch }, 'aria-pressed': String(id === theme), 'aria-label': tl('{v0} theme{v1}', { v0: t.label, v1: locked ? ' (Pro)' : '' }) }, locked ? h('span', { class: 'lk' }, icon('lock')) : null);
    dot.addEventListener('click', () => {
      if (locked) return ctx.upgrade('themes');
      theme = id;
      themeRow.querySelectorAll('.theme-dot').forEach((d) => d.setAttribute('aria-pressed', 'false'));
      dot.setAttribute('aria-pressed', 'true');
      draw();
    });
    themeRow.append(dot);
  }

  for (const card of cards) {
    const canvas = h('canvas', { width: 1080, height: 1920, role: 'img', 'aria-label': `${card.titleA} ${card.titleB} ${card.hero} ${card.heroLabel}` });
    canvases.push({ canvas, card });
    grid.append(h('div', { class: 'wrapped-item' }, canvas, cardButtons(canvas, `unwrapped-${ds.platform}-${card.id}.png`)));
  }

  async function draw() {
    await fontsReady();
    for (const { canvas, card } of canvases) drawCard(canvas, card, theme, { watermark: !ctx.pro, site: ctx.site });
  }

  root.append(
    panel(
      { title: tl('Theme'), text: ctx.pro ? tl('All themes unlocked · no watermark') : tl('Free cards include a small watermark. Plus unlocks every theme without it.') },
      themeRow,
    ),
    grid,
  );
  draw();
  return root;
}
