import { h, icon, clear, copyText } from '../lib/ui.js';
import { pollOrder, savedOrders, forgetOrder } from '../lib/checkout.js';
import { storeLicense } from '../lib/license.js';

const box = document.getElementById('success-box');
const params = new URLSearchParams(location.search);
const id = params.get('order');
const token = params.get('t') || savedOrders().find((o) => o.id === id)?.t;

function waiting(order) {
  clear(box).append(
    h(
      'div',
      { class: 'stack', style: { '--stack': '14px' } },
      h('div', { class: 'h3' }, 'Waiting for the blockchain'),
      h('p', { class: 'text-2' }, 'Your payment is being confirmed. This page updates by itself — you can keep it open or come back later.'),
      h('div', { class: 'status-line' }, h('span', { class: 'spinner' }), h('span', null, `Order ${order.id} · ${order.status}`)),
    ),
  );
}

function done(order) {
  if (order.license && order.token) storeLicense(order.license.key, order.token);
  forgetOrder(order.id);
  const key = order.license?.key || '';
  const copy = h('button', { class: 'btn btn--ghost', type: 'button' }, icon('copy'), 'Copy key');
  copy.addEventListener('click', () => copyText(key, copy));
  clear(box).append(
    h(
      'div',
      { class: 'stack', style: { '--stack': '16px', textAlign: 'center' } },
      h('div', { class: 'success-burst' }, icon('check')),
      h('h1', { class: 'h3' }, 'You’re Pro!'),
      h('p', { class: 'text-2' }, order.license?.lifetime ? 'Lifetime access is active on this device.' : `Active until ${new Date(order.license.expiresAt).toLocaleDateString('en-US', { dateStyle: 'long' })}.`),
      h('div', { class: 'license-key' }, key),
      h('p', { class: 'small text-2' }, 'Save this key — it unlocks Pro on any device (My license → Activate).'),
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } }, copy, h('a', { class: 'btn btn--primary', href: '/#start' }, 'Analyze my export')),
    ),
  );
}

if (!id || !token) {
  clear(box).append(
    h(
      'div',
      { class: 'stack' },
      h('div', { class: 'h3' }, 'Order not found on this device'),
      h('p', { class: 'text-2' }, 'Open this page in the browser you paid from, or use the license key from your e-mail on the My license page.'),
      h('a', { class: 'btn btn--ghost', href: '/account/' }, 'Go to My license'),
    ),
  );
} else {
  pollOrder(id, token, (order) => (order.status === 'paid' ? done(order) : waiting(order)), 4000);
}
