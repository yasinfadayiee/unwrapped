// Lightweight, dependency-free charts: thin rounded bars on a hairline grid,
// per-mark tooltips (hover + keyboard), and a table view for every chart.

import { h, s, clear } from '../lib/ui.js';
import { fmtInt } from '../lib/format.js';

// Sequential ramp (one hue, dark → bright) for magnitude on the dark surface.
export const RAMP = ['#1b1b27', '#262143', '#332a63', '#433685', '#5644a8', '#6d5acb', '#8f7dff', '#b4a8ff'];

export function rampColor(value, max) {
  if (!value || !max) return RAMP[0];
  const idx = 1 + Math.min(RAMP.length - 2, Math.floor((value / max) * (RAMP.length - 1)));
  return RAMP[idx];
}

function niceScale(max, ticks = 4) {
  if (max <= 0) return { max: 1, step: 1 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { max: Math.ceil(max / step) * step, step };
}

function barPath(x, y, w, hgt, r) {
  const rr = Math.min(r, w / 2, hgt);
  if (hgt <= 0) return '';
  return `M${x},${y + hgt}V${y + rr}A${rr},${rr} 0 0 1 ${x + rr},${y}H${x + w - rr}A${rr},${rr} 0 0 1 ${x + w},${y + rr}V${y + hgt}Z`;
}

function tooltipLayer(container) {
  const tip = h('div', { class: 'tooltip', role: 'presentation' });
  container.append(tip);
  return {
    show(x, y, value, label) {
      clear(tip).append(h('b', null, value), h('span', null, label));
      tip.style.left = `${Math.max(60, Math.min(container.clientWidth - 60, x))}px`;
      tip.style.top = `${y}px`;
      tip.classList.add('is-on');
    },
    hide() {
      tip.classList.remove('is-on');
    },
  };
}

function tableView(columns, rows) {
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'data-table' },
      h('thead', null, h('tr', null, columns.map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c))))),
    ),
  );
}

function withTable(wrapper, columns, rows, legend) {
  const table = tableView(columns, rows);
  table.hidden = true;
  const toggle = h('button', { class: 'table-toggle', type: 'button', 'aria-expanded': 'false' }, 'Show as table');
  toggle.addEventListener('click', () => {
    table.hidden = !table.hidden;
    toggle.setAttribute('aria-expanded', String(!table.hidden));
    toggle.textContent = table.hidden ? 'Show as table' : 'Hide table';
  });
  wrapper.append(h('div', { class: 'chart-foot' }, legend || h('span'), toggle), table);
  return wrapper;
}

/**
 * Column chart for one series.
 * data: [{ label, short?, value }]
 */
export function barChart(data, { height = 220, color = 'var(--c1)', valueLabel = (v) => fmtInt(v), title = 'Value', ariaLabel = 'Bar chart' } = {}) {
  const wrapper = h('div', { class: 'chart' });
  const plot = h('div', { style: { position: 'relative' } });
  const holder = h('div');
  plot.append(holder);
  wrapper.append(plot);
  const tip = tooltipLayer(plot);
  let lastWidth = 0;

  function render() {
    const width = Math.max(260, plot.clientWidth || 600);
    if (width === lastWidth) return;
    lastWidth = width;
    const pad = { top: 14, right: 6, bottom: 26, left: 40 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const max = Math.max(...data.map((d) => d.value), 0);
    const scale = niceScale(max);
    const band = innerW / Math.max(1, data.length);
    const barW = Math.max(2, Math.min(24, band * 0.68));
    const gap = band - barW;
    const svg = s('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': ariaLabel });

    for (let v = 0; v <= scale.max + 1e-9; v += scale.step) {
      const y = pad.top + innerH - (v / scale.max) * innerH;
      svg.append(s('line', { class: v === 0 ? 'baseline' : 'gridline', x1: pad.left, x2: width - pad.right, y1: y, y2: y }));
      svg.append(s('text', { class: 'axis', x: pad.left - 8, y: y + 4, 'text-anchor': 'end' }, valueLabel(v)));
    }
    const labelEvery = Math.max(1, Math.ceil(40 / band));
    data.forEach((d, i) => {
      const x = pad.left + i * band + gap / 2;
      const hgt = scale.max ? (d.value / scale.max) * innerH : 0;
      const y = pad.top + innerH - hgt;
      const g = s('g', null);
      const hit = s('rect', {
        class: 'hit',
        x: pad.left + i * band,
        y: pad.top,
        width: band,
        height: innerH,
        tabindex: '0',
        'aria-label': `${d.label}: ${valueLabel(d.value)}`,
      });
      const show = () => tip.show(x + barW / 2, y - 4, valueLabel(d.value), d.label);
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', tip.hide);
      hit.addEventListener('blur', tip.hide);
      g.append(hit, s('path', { class: 'bar', d: barPath(x, y, barW, hgt, 4), fill: color }));
      svg.append(g);
      const tick = d.short !== undefined ? d.short : d.label;
      if (i % labelEvery === 0 && tick) {
        svg.append(s('text', { class: 'axis', x: x + barW / 2, y: height - 8, 'text-anchor': 'middle' }, tick));
      }
    });
    clear(holder).append(svg);
  }

  // Re-render at the real pixel width so text never shrinks on phones.
  new ResizeObserver(render).observe(plot);
  requestAnimationFrame(render);
  return withTable(wrapper, ['Period', title], data.map((d) => [d.label, valueLabel(d.value)]));
}

/** 7×24 heatmap (Monday first) with a sequential ramp. */
export function heatmapChart(grid, { unit = 'videos', ariaLabel = 'Activity by weekday and hour', valueLabel = (v) => `${fmtInt(v)} ${unit}` } = {}) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const max = Math.max(...grid.flat(), 0);
  const wrapper = h('div', { class: 'chart' });
  const plot = h('div', { style: { position: 'relative' }, role: 'img', 'aria-label': ariaLabel });
  const tip = tooltipLayer(plot);
  const heat = h('div', { class: 'heat' });
  grid.forEach((row, d) => {
    heat.append(h('span', { class: 'hl' }, days[d]));
    row.forEach((v, hour) => {
      const cell = h('span', { class: 'cell', style: { background: rampColor(v, max) } });
      cell.addEventListener('pointerenter', () => {
        const r = cell.getBoundingClientRect();
        const p = plot.getBoundingClientRect();
        tip.show(r.left - p.left + r.width / 2, r.top - p.top, valueLabel(v), `${days[d]} · ${String(hour).padStart(2, '0')}:00`);
      });
      cell.addEventListener('pointerleave', tip.hide);
      heat.append(cell);
    });
  });
  const hours = h('div', { class: 'heat-hours', 'aria-hidden': 'true' }, h('span'));
  for (let i = 0; i < 24; i++) hours.append(h('span', null, i % 6 === 0 ? `${i}h` : ''));
  plot.append(heat, hours);
  wrapper.append(plot);
  const legend = h(
    'div',
    { class: 'heat-scale' },
    h('span', null, 'Less'),
    RAMP.slice(1).map((c) => h('i', { style: { background: c } })),
    h('span', null, 'More'),
  );
  const rows = [];
  grid.forEach((row, d) => row.forEach((v, hour) => v && rows.push([`${days[d]} ${String(hour).padStart(2, '0')}:00`, valueLabel(v)])));
  return withTable(wrapper, ['Weekday & hour', unit[0].toUpperCase() + unit.slice(1)], rows, legend);
}

/** Horizontal ranking list: [{ key, count }] */
export function rankList(items, { max, valueLabel = (v) => fmtInt(v), color = 'var(--c1)', limit = 10 } = {}) {
  const top = items.slice(0, limit);
  const m = max || Math.max(...top.map((i) => i.count), 1);
  return h(
    'div',
    { class: 'rank' },
    top.map((item, i) =>
      h(
        'div',
        { class: 'rank-row' },
        h('span', { class: 'n' }, String(i + 1).padStart(2, '0')),
        h(
          'div',
          { class: 'lbl' },
          h('b', null, item.key),
          h('div', { class: 'track' }, h('i', { style: { width: `${Math.max(2, (item.count / m) * 100)}%`, background: color } })),
        ),
        h('span', { class: 'v' }, valueLabel(item.count)),
      ),
    ),
  );
}

/** Part-to-whole bar with a 2px surface gap between segments + legend. */
export function splitBar(parts) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return h(
    'div',
    null,
    h(
      'div',
      { class: 'split-bar', role: 'img', 'aria-label': parts.map((p) => `${p.label} ${fmtInt(p.value)}`).join(', ') },
      parts.filter((p) => p.value > 0).map((p) => h('i', { style: { width: `${(p.value / total) * 100}%`, background: p.color }, title: `${p.label}: ${fmtInt(p.value)}` })),
    ),
    h(
      'div',
      { class: 'legend', style: { marginTop: '12px' } },
      parts.map((p) => h('span', null, h('i', { style: { background: p.color } }), `${p.label} · ${fmtInt(p.value)} (${Math.round((p.value / total) * 100)}%)`)),
    ),
  );
}
