// Tiny DOM toolkit. Untrusted text (usernames, file contents) only ever
// enters the page through text nodes — never through innerHTML.

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  setProps(el, props);
  append(el, children);
  return el;
}

export function s(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function setProps(el, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    } else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') el.textContent = v;
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

// <svg><use href="#i-name"></svg> from the sprite in every page.
export function icon(name, cls = '') {
  const svg = s('svg', { class: cls, 'aria-hidden': 'true', focusable: 'false' });
  svg.append(s('use', { href: `#i-${name}` }));
  return svg;
}

let toastBox;
export function toast(message, { iconName = 'check', timeout = 3200 } = {}) {
  if (!toastBox) {
    toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastBox);
  }
  const t = h('div', { class: 'toast' }, icon(iconName), h('span', null, message));
  toastBox.append(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 320);
  }, timeout);
}

// Accessible modal with focus trap and Escape to close.
export function modal({ title, wide = false, onClose } = {}) {
  const previous = document.activeElement;
  const titleId = `m-${Math.random().toString(36).slice(2)}`;
  const body = h('div', { class: 'modal-body' });
  const closeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Close', type: 'button' }, icon('close'));
  const titleEl = h('h2', { id: titleId, class: 'h4', style: { fontSize: '19px' } }, title || '');
  const panel = h(
    'div',
    { class: `modal-panel${wide ? ' modal-panel--wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'modal-head' }, titleEl, closeBtn),
    body,
  );
  const backdrop = h('div', { class: 'modal-backdrop' });
  const root = h('div', { class: 'modal' }, backdrop, panel);

  function close() {
    root.remove();
    document.removeEventListener('keydown', onKey, true);
    if (previous && previous.focus) previous.focus();
    onClose?.();
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
    if (e.key === 'Tab') {
      const focusables = [...panel.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(
        (n) => n.offsetParent !== null,
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  document.body.append(root);
  requestAnimationFrame(() => closeBtn.focus());
  return { root, body, panel, close, setTitle: (t) => (titleEl.textContent = t) };
}

export async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  if (button) {
    const prev = button.textContent;
    button.textContent = 'Copied';
    button.classList.add('is-done');
    setTimeout(() => {
      button.textContent = prev;
      button.classList.remove('is-done');
    }, 1600);
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function csvFile(rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Deterministic, pleasant avatar gradient from a string.
export function avatarStyle(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 40 + (Math.abs(hash >> 8) % 60)) % 360;
  return { background: `linear-gradient(135deg, hsl(${h1} 55% 42%), hsl(${h2} 60% 30%))` };
}
