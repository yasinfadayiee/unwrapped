import { h, icon, toast, downloadBlob } from '../lib/ui.js';
import { viewHead, panel, emptyState } from './components.js';
import { THEMES, cardsFor, drawCard, fontsReady, canvasBlob } from './wrapped.js';

export function wrappedView(ds, ctx) {
  const root = h('div', { class: 'app-content' });
  const cards = cardsFor(ds);
  root.append(viewHead('Wrapped cards', 'Story-sized cards (1080×1920) of your stats — ready for Instagram, TikTok or WhatsApp. They show numbers only, never other people’s names.'));
  if (!cards.length) {
    root.append(panel(null, emptyState('Not enough data in this export for a card yet.', 'sparkles')));
    return root;
  }
  let theme = 'aurora';
  const themeRow = h('div', { class: 'theme-row', role: 'group', 'aria-label': 'Card theme' });
  const grid = h('div', { class: 'wrapped-grid' });
  const canvases = [];

  for (const [id, t] of Object.entries(THEMES)) {
    const locked = !t.free && !ctx.pro;
    const dot = h('button', { class: 'theme-dot', type: 'button', style: { background: t.swatch }, 'aria-pressed': String(id === theme), 'aria-label': `${t.label} theme${locked ? ' (Pro)' : ''}` }, locked ? h('span', { class: 'lk' }, icon('lock')) : null);
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
    const save = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('download'), 'Save');
    const share = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('share'), 'Share');
    save.addEventListener('click', async () => {
      downloadBlob(await canvasBlob(canvas), `unwrapped-${ds.platform}-${card.id}.png`);
      toast('Image saved');
    });
    share.addEventListener('click', async () => {
      const blob = await canvasBlob(canvas);
      const file = new File([blob], `unwrapped-${ds.platform}-${card.id}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'My socials, unwrapped' });
        } catch {
          /* cancelled */
        }
      } else {
        downloadBlob(blob, file.name);
        toast('Saved — share it from your gallery');
      }
    });
    grid.append(h('div', { class: 'wrapped-item' }, canvas, h('div', { style: { display: 'flex', gap: '8px' } }, share, save)));
  }

  async function draw() {
    await fontsReady();
    for (const { canvas, card } of canvases) drawCard(canvas, card, theme, { watermark: !ctx.pro, site: ctx.site });
  }

  root.append(
    panel(
      { title: 'Theme', text: ctx.pro ? 'All themes unlocked · no watermark' : 'Free cards include a small watermark. Plus unlocks every theme without it.' },
      themeRow,
    ),
    grid,
  );
  draw();
  return root;
}
