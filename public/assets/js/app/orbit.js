// Canvas "orbit" of your network: mutuals close in, fans further out, and the
// accounts that don't follow you back drifting on the outer ring.

import { h } from '../lib/ui.js';
import { t as tl } from '../lib/i18n.js';

const COLORS = { mutual: '#8f7dff', notBack: '#e0574a', fan: '#1a9e8e' };
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function fitCanvas(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function rand(seed) {
  let x = seed || 1;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

function loop(canvas, draw) {
  let raf = 0;
  let visible = true;
  let size = fitCanvas(canvas);
  const start = performance.now();
  const stop = () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
  };
  const frame = (now) => {
    if (!canvas.isConnected) return stop();
    draw(size, (now - start) / 1000);
    if (!reduced() && visible) raf = requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver(([entry]) => {
    if (!canvas.isConnected) return stop();
    visible = entry.isIntersecting;
    cancelAnimationFrame(raf);
    if (visible) raf = requestAnimationFrame(frame);
  });
  io.observe(canvas);
  const ro = new ResizeObserver(() => {
    size = fitCanvas(canvas);
    if (reduced()) draw(size, 0);
  });
  ro.observe(canvas);
  raf = requestAnimationFrame(frame);
  return stop;
}

// Decorative hero background.
export function heroOrbit(canvas) {
  const r = rand(7);
  const particles = [];
  const rings = [
    { radius: 0.2, count: 140, color: [143, 125, 255], speed: 0.09 },
    { radius: 0.32, count: 230, color: [26, 158, 142], speed: -0.05 },
    { radius: 0.45, count: 320, color: [244, 244, 246], speed: 0.03 },
  ];
  // Phones get half the particles: same look on a small canvas, half the work.
  const density = window.innerWidth < 760 ? 0.5 : 1;
  for (const ring of rings) {
    for (let i = 0; i < Math.round(ring.count * density); i++) {
      particles.push({
        ring,
        a: r() * Math.PI * 2,
        jitter: (r() - 0.5) * 0.06,
        size: 0.6 + r() * 1.6,
        alpha: 0.25 + r() * 0.6,
        ghost: ring.radius > 0.4 && r() < 0.07,
        drift: r(),
      });
    }
  }
  let px = 0;
  let py = 0;
  let tx = 0;
  let ty = 0;
  const onMove = (e) => {
    tx = (e.clientX / window.innerWidth - 0.5) * 2;
    ty = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  return loop(canvas, ({ ctx, width, height }, t) => {
    px += (tx - px) * 0.04;
    py += (ty - py) * 0.04;
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2 + px * 18;
    const cy = height * 0.66 + py * 12;
    const base = Math.min(width * 0.72, 1200);
    const tilt = 0.36 + py * 0.03;

    for (const ring of rings) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, ring.radius * base, ring.radius * base * tilt, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 0.16);
    glow.addColorStop(0, 'rgba(215,255,58,0.35)');
    glow.addColorStop(0.4, 'rgba(143,125,255,0.12)');
    glow.addColorStop(1, 'rgba(143,125,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, base * 0.16, 0, Math.PI * 2);
    ctx.fill();

    for (const p of particles) {
      const angle = p.a + t * p.ring.speed;
      let radius = p.ring.radius + p.jitter;
      let alpha = p.alpha;
      let color = p.ring.color;
      if (p.ghost) {
        const phase = (t * 0.06 + p.drift) % 1;
        radius += phase * 0.22;
        alpha *= 1 - phase;
        color = [224, 87, 74];
      }
      const x = cx + Math.cos(angle) * radius * base;
      const y = cy + Math.sin(angle) * radius * base * tilt;
      const depth = (Math.sin(angle) + 1.4) / 2.4;
      ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha * depth})`;
      ctx.beginPath();
      ctx.arc(x, y, p.size * (0.6 + depth * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * Interactive orbit for the dashboard.
 * groups: { mutual: [names], fan: [names], notBack: [names] }
 */
export function relationshipOrbit(groups, { labels = { mutual: tl('Mutual'), fan: tl('Follows you · you don’t follow back'), notBack: tl('Doesn’t follow you back') } } = {}) {
  const wrap = h('div', { class: 'orbit-wrap' });
  const canvas = h('canvas', { role: 'img', 'aria-label': `Network orbit: ${groups.mutual.length} mutuals, ${groups.fan.length} fans, ${groups.notBack.length} not following back` });
  const tip = h('div', { class: 'orbit-tip' });
  wrap.append(canvas, tip);

  const r = rand(42);
  const MAX = 420;
  const rings = [
    { key: 'mutual', radius: 0.2, speed: 0.06 },
    { key: 'fan', radius: 0.31, speed: -0.04 },
    { key: 'notBack', radius: 0.43, speed: 0.025 },
  ];
  const dots = [];
  for (const ring of rings) {
    const names = groups[ring.key] || [];
    const n = Math.min(MAX, names.length);
    const per = names.length / Math.max(1, n);
    for (let i = 0; i < n; i++) {
      dots.push({
        ring,
        name: names[Math.floor(i * per)],
        rep: per,
        a: (i / n) * Math.PI * 2 + r() * 0.2,
        jitter: (r() - 0.5) * 0.07,
        size: 1.6 + r() * 1.6,
      });
    }
  }
  let pointer = null;
  const aim = (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  canvas.addEventListener('pointermove', aim);
  // Touch has no hover: a tap shows the dot under the finger and keeps it shown.
  canvas.addEventListener('pointerdown', aim);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'touch') return;
    pointer = null;
    tip.classList.remove('is-on');
  });

  requestAnimationFrame(() =>
    loop(canvas, ({ ctx, width, height }, t) => {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const base = Math.min(width, height * 1.6);
      const tilt = 0.55;
      for (const ring of rings) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, ring.radius * base, ring.radius * base * tilt, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.stroke();
      }
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 0.1);
      glow.addColorStop(0, 'rgba(215,255,58,0.9)');
      glow.addColorStop(0.25, 'rgba(215,255,58,0.25)');
      glow.addColorStop(1, 'rgba(215,255,58,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, base * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0a0e';
      ctx.font = '700 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(tl('YOU'), cx, cy + 4);

      let nearest = null;
      let best = 14 * 14;
      for (const d of dots) {
        const angle = d.a + t * d.ring.speed;
        const radius = d.ring.radius + d.jitter;
        const x = cx + Math.cos(angle) * radius * base;
        const y = cy + Math.sin(angle) * radius * base * tilt;
        const depth = (Math.sin(angle) + 1.5) / 2.5;
        ctx.globalAlpha = 0.45 + depth * 0.55;
        ctx.fillStyle = COLORS[d.ring.key];
        ctx.beginPath();
        ctx.arc(x, y, d.size * (0.7 + depth * 0.5), 0, Math.PI * 2);
        ctx.fill();
        if (pointer) {
          const dist = (x - pointer.x) ** 2 + (y - pointer.y) ** 2;
          if (dist < best) {
            best = dist;
            nearest = { d, x, y };
          }
        }
      }
      ctx.globalAlpha = 1;
      if (nearest) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(nearest.x, nearest.y, 6, 0, Math.PI * 2);
        ctx.stroke();
        tip.textContent = `${nearest.d.name}${nearest.d.rep > 1.5 ? ` +${Math.round(nearest.d.rep - 1)}` : ''} · ${labels[nearest.d.ring.key]}`;
        tip.style.left = `${nearest.x}px`;
        tip.style.top = `${nearest.y}px`;
        tip.classList.add('is-on');
      } else tip.classList.remove('is-on');
    }),
  );
  return wrap;
}
