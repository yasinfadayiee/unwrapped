// Checkout: plan → payment method → pay → automatic activation.

import { h, icon, modal, clear, copyText, toast, downloadBlob } from './ui.js';
import { api, getConfig, ApiError } from './api.js';
import { proState, storeLicense, storedKey } from './license.js';
import { qrcode } from '../vendor/qrcode.js';
import { storedRef, forgetRef } from './referral.js';

const ORDERS = 'unw.orders.v1';

export function savedOrders() {
  try {
    return JSON.parse(localStorage.getItem(ORDERS) || '[]');
  } catch {
    return [];
  }
}
function rememberOrder(order, token) {
  try {
    const list = savedOrders().filter((o) => o.id !== order.id);
    list.unshift({ id: order.id, t: token, plan: order.plan, method: order.method, createdAt: order.createdAt });
    localStorage.setItem(ORDERS, JSON.stringify(list.slice(0, 10)));
  } catch {
    /* ignore */
  }
}
export function forgetOrder(id) {
  try {
    localStorage.setItem(ORDERS, JSON.stringify(savedOrders().filter((o) => o.id !== id)));
  } catch {
    /* ignore */
  }
}

const ERRORS = {
  too_many_requests: 'Too many attempts — please wait a few minutes.',
  method_unavailable: 'This payment method is not available right now.',
  payment_provider_unavailable: 'The payment provider did not respond. Please try again or pick another method.',
  invalid_email: 'That e-mail address doesn’t look right.',
  already_lifetime: 'Your license is already lifetime — nothing to renew!',
  busy_try_again: 'Lots of checkouts right now — try again in a minute.',
};
const errText = (err) => ERRORS[err?.code] || 'Something went wrong. Please try again.';

function money(n) {
  return `$${Number(n).toFixed(Number.isInteger(n) ? 0 : 2)}`;
}

export async function openCheckout({ plan: preselect } = {}) {
  const [config, state] = await Promise.all([getConfig(), proState()]);
  const m = modal({ title: state.pro ? 'Extend your Pro' : 'Unlock Unwrapped Pro' });
  const plans = config.plans || [];
  let planId = preselect && plans.some((p) => p.id === preselect) ? preselect : (plans.find((p) => p.badge === 'Most popular') || plans[0])?.id;
  let methodId = config.methods?.[0]?.id;
  const renewKey = state.pro && !state.lifetime ? state.key : storedKey();

  if (!config.methods || !config.methods.length) {
    m.body.append(
      h(
        'div',
        { class: 'stack' },
        h('p', { class: 'text-2' }, config.offline ? 'You seem to be offline. Connect to the internet to buy Pro — your analysis keeps working offline.' : 'Payments are being set up. Please check back soon.'),
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: m.close }, 'Close'),
      ),
    );
    return m;
  }

  const ref = storedRef();
  const discount = ref ? config.referral?.discount || 0.1 : 0;
  const priceTag = (p) =>
    discount
      ? h('span', { class: 'p' }, h('s', { class: 'muted', style: { fontWeight: '500', fontSize: '14px', marginRight: '6px' } }, money(p.priceUsd)), money(Math.round(p.priceUsd * (1 - discount) * 100) / 100))
      : h('span', { class: 'p' }, money(p.priceUsd));
  const planBox = h('div', { class: 'choice-grid', role: 'radiogroup', 'aria-label': 'Plan' });
  for (const p of plans) {
    const input = h('input', { type: 'radio', name: 'plan', value: p.id, checked: p.id === planId });
    input.addEventListener('change', () => (planId = p.id));
    planBox.append(
      h(
        'label',
        { class: 'choice' },
        input,
        h('span', { class: 'radio' }),
        h('span', { class: 'grow' }, h('span', { class: 't' }, p.short, p.badge ? h('span', { class: 'badge', style: { marginLeft: '8px' } }, p.badge) : null), h('span', { class: 's', style: { display: 'block' } }, p.blurb || p.name)),
        priceTag(p),
      ),
    );
  }
  const methodBox = h('div', { class: 'choice-grid', role: 'radiogroup', 'aria-label': 'Payment method' });
  for (const meth of config.methods) {
    const input = h('input', { type: 'radio', name: 'method', value: meth.id, checked: meth.id === methodId });
    input.addEventListener('change', () => (methodId = meth.id));
    methodBox.append(
      h(
        'label',
        { class: 'choice' },
        input,
        h('span', { class: 'radio' }),
        h('span', { class: 'grow' }, h('span', { class: 't' }, meth.label), h('span', { class: 's', style: { display: 'block' } }, meth.detail)),
        icon(meth.id === 'tron' ? 'coin' : 'globe'),
      ),
    );
  }
  const email = h('input', { class: 'input', type: 'email', placeholder: 'you@example.com (optional)', autocomplete: 'email', id: 'co-email' });
  const errorBox = h('div', { class: 'err-box', hidden: true, role: 'alert' });
  const go = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button' }, 'Continue to payment');

  m.body.append(
    h(
      'div',
      { class: 'stack', style: { '--stack': '18px' } },
      h('p', { class: 'small text-2' }, 'Full lists, unfollower history, unfollow queue, deep insights for every platform and premium Wrapped cards. Activation is instant and automatic.'),
      planBox,
      h('div', { class: 'eyebrow' }, 'Pay with'),
      methodBox,
      config.email
        ? h('div', { class: 'field' }, h('label', { for: 'co-email' }, 'E-mail for your license & renewal reminder'), email)
        : null,
      renewKey ? h('div', { class: 'note' }, icon('info'), h('span', null, `Time will be added to your existing license ${renewKey.slice(0, 8)}…`)) : null,
      discount ? h('div', { class: 'note' }, icon('sparkles'), h('span', null, `Friend invite applied — ${Math.round(discount * 100)}% off.`)) : null,
      errorBox,
      go,
      h('p', { class: 'tiny muted', style: { textAlign: 'center' } }, 'No account needed · your social data is never uploaded · prices in USD'),
    ),
  );

  go.addEventListener('click', async () => {
    go.disabled = true;
    errorBox.hidden = true;
    go.textContent = 'Creating your order…';
    try {
      const res = await api('/api/checkout', {
        method: 'POST',
        body: { plan: planId, method: methodId, email: email.value.trim() || undefined, renewKey: renewKey || undefined, ref: ref || undefined },
      });
      rememberOrder(res.order, res.token);
      if (res.order.method === 'nowpayments' && res.order.redirectUrl) {
        go.textContent = 'Opening the payment page…';
        location.href = res.order.redirectUrl;
        return;
      }
      tronScreen(m, res.order, res.token, config);
    } catch (err) {
      errorBox.textContent = err instanceof ApiError ? errText(err) : 'Could not reach the server. Check your connection.';
      errorBox.hidden = false;
      go.disabled = false;
      go.textContent = 'Continue to payment';
    }
  });
  return m;
}

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

function line(k, v, { big = false, copy } = {}) {
  const btn = copy ? h('button', { class: 'copy-btn', type: 'button' }, 'Copy') : null;
  btn?.addEventListener('click', () => copyText(copy, btn));
  return h('div', { class: 'pay-line' }, h('span', { class: 'k' }, k), h('span', { class: `v${big ? ' big' : ''}` }, v), btn);
}

export function tronScreen(m, order, token, config) {
  m.setTitle('Pay with USDT (TRC20)');
  clear(m.body);
  const qr = h('div', { class: 'pay-qr', 'aria-label': 'QR code of the wallet address' });
  qr.innerHTML = qrSvg(order.address);
  const timer = h('span', { class: 'mono' });
  const status = h('div', { class: 'status-line' }, h('span', { class: 'spinner' }), h('span', null, 'Waiting for your payment — the blockchain is checked automatically.'));
  const claimInput = h('input', { class: 'input mono', placeholder: 'Transaction hash (TxID)', 'aria-label': 'Transaction hash', spellcheck: false });
  const claimBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, 'Verify');
  const claimMsg = h('div', { class: 'small text-2', role: 'status' });

  m.body.append(
    h(
      'div',
      { class: 'pay' },
      h('div', { class: 'warn-box' }, icon('warning'), h('span', null, h('b', null, 'TRON (TRC20) network only. '), 'Sending on Ethereum, BNB Chain or any other network will lose the funds.')),
      qr,
      line('Amount', `${order.amount} USDT`, { big: true, copy: order.amount }),
      line('Address', order.address, { copy: order.address }),
      h('p', { class: 'small text-2' }, 'This exact amount is unique to your order — that’s how we match your payment instantly. Paying from an exchange? Make sure the amount that ', h('b', null, 'arrives'), ` is ${order.amount} USDT (add the withdrawal fee on top).`),
      status,
      h('div', { class: 'small muted' }, 'Order expires in ', timer, ' · ', h('span', { class: 'mono' }, order.id)),
      h(
        'details',
        { class: 'faq', style: { display: 'block' } },
        h('summary', { style: { padding: '12px 0', fontSize: '14px' } }, 'Already paid? Paste your transaction hash'),
        h('div', { style: { display: 'flex', gap: '8px' } }, claimInput, claimBtn),
        claimMsg,
      ),
      config.dev ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => api('/api/dev/pay', { method: 'POST', body: { id: order.id } }) }, 'Simulate payment (dev mode)') : null,
    ),
  );

  const tick = () => {
    const left = Math.max(0, order.expiresAt - Date.now());
    timer.textContent = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  };
  tick();
  const tickTimer = setInterval(tick, 1000);
  const stop = pollOrder(order.id, token, (o) => {
    if (o.status === 'paid') {
      clearInterval(tickTimer);
      stop();
      successScreen(m, o);
    } else if (o.status === 'expired') {
      status.replaceChildren(icon('clock'), h('span', null, 'This order expired, but a payment arriving in the next hours is still accepted. You can also start a new order.'));
    }
  });
  const observer = new MutationObserver(() => {
    if (!m.root.isConnected) {
      stop();
      clearInterval(tickTimer);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });

  claimBtn.addEventListener('click', async () => {
    const txid = claimInput.value.trim();
    if (!txid) return;
    claimBtn.disabled = true;
    claimMsg.textContent = 'Checking the blockchain…';
    try {
      const res = await api('/api/order/claim', { method: 'POST', body: { id: order.id, t: token, txid } });
      if (res.ok && res.order?.status === 'paid') {
        stop();
        clearInterval(tickTimer);
        successScreen(m, res.order);
        return;
      }
      claimMsg.textContent =
        res.reason === 'underpaid'
          ? `We received ${res.received} of ${res.required} USDT. Send the remaining ${res.remaining} USDT to the same address, then paste that new hash here.`
          : res.reason === 'not_found'
            ? 'Not visible yet — TRON needs about a minute to confirm. Try again shortly.'
            : res.reason === 'already_used'
              ? 'That transaction was already used for another order.'
              : res.reason === 'not_usdt'
                ? 'That transaction is not a USDT transfer to our address.'
                : 'That doesn’t look like a valid TRON transaction hash.';
    } catch (err) {
      claimMsg.textContent = errText(err);
    } finally {
      claimBtn.disabled = false;
    }
  });
}

export function pollOrder(id, token, onUpdate, every = 5000) {
  let stopped = false;
  let timer = 0;
  const run = async () => {
    if (stopped) return;
    try {
      const res = await api(`/api/order?id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`, { timeout: 12000 });
      if (res.order) onUpdate(res.order);
      if (res.order?.status === 'paid') return;
    } catch {
      /* keep polling */
    }
    if (!stopped) timer = setTimeout(run, document.hidden ? every * 3 : every);
  };
  run();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

export function successScreen(m, order) {
  if (order.license && order.token) storeLicense(order.license.key, order.token);
  forgetOrder(order.id);
  forgetRef();
  m.setTitle('Payment received');
  clear(m.body);
  const key = order.license?.key || '';
  const copy = h('button', { class: 'btn btn--ghost', type: 'button' }, icon('copy'), 'Copy key');
  copy.addEventListener('click', () => copyText(key, copy));
  const save = h('button', { class: 'btn btn--ghost', type: 'button' }, icon('download'), 'Save as file');
  save.addEventListener('click', () => downloadBlob(new Blob([`Unwrapped Pro license\n\n${key}\n\nActivate on any device: ${location.origin}/account/\n`], { type: 'text/plain' }), 'unwrapped-license.txt'));
  m.body.append(
    h(
      'div',
      { class: 'stack', style: { '--stack': '16px', textAlign: 'center' } },
      h('div', { class: 'success-burst' }, icon('check')),
      h('div', { class: 'h3' }, 'You’re Pro. Enjoy!'),
      h('p', { class: 'text-2' }, order.license?.lifetime ? 'Lifetime access is active on this device.' : `Active until ${new Date(order.license?.expiresAt).toLocaleDateString('en-US', { dateStyle: 'long' })}.`),
      h('div', { class: 'license-key' }, key),
      h('p', { class: 'small text-2' }, 'Save this key — it unlocks Pro on any browser or phone.'),
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } }, copy, save),
      h('button', { class: 'btn btn--primary btn--lg', type: 'button', onClick: m.close }, 'Continue'),
      h('p', { class: 'small text-2' }, 'Invite friends and earn 30 free days for every friend who buys — ', h('a', { href: '/account/#invite' }, 'get your invite link'), '.'),
    ),
  );
  toast('Pro unlocked');
}
