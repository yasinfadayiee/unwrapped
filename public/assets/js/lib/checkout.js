// Checkout: plan → payment method → pay → automatic activation.

import { h, icon, modal, clear, copyText, toast, downloadBlob } from './ui.js';
import { api, getConfig, ApiError } from './api.js';
import { proState, storeLicense, storedKey } from './license.js';
import { qrcode } from '../vendor/qrcode.js';
import { storedRef, forgetRef } from './referral.js';
import { TIER_NAME, TIER_RANK, tierFor } from './tiers.js';
import { t, locale, lang } from './i18n.js';
import { supportLinks } from './support.js';
import { payAddress } from './address.js';

const tr = t; // for loops where `t` is a tier

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
  already_lifetime: 'You already own this tier for life — pick a higher tier to upgrade.',
  busy_try_again: 'Lots of checkouts right now — try again in a minute.',
};
const errText = (err) => t(ERRORS[err?.code] || 'Something went wrong. Please try again.');

function money(n) {
  return `$${Number(n).toFixed(Number.isInteger(n) ? 0 : 2)}`;
}

const DAY = 86_400_000;

// What one day of a tier is worth, from its yearly plan (same rule as the server).
function dailyValue(plans, tier) {
  const yearly = plans.find((p) => p.tier === tier && p.cycle === 'year');
  return yearly ? yearly.priceUsd / yearly.days : 0;
}

// Explains what happens to the time the buyer already has.
function creditText(state, tierId, plans) {
  if (!state.pro) return null;
  const left = state.expiresAt ? state.expiresAt - Date.now() : 0;
  const days = Math.round(left / DAY);
  if (left > 0 && state.tier === tierId) return t('New time is added on top of the {days} days you have left. Your key stays the same.', { days });
  if (state.lifetimeTier) return t('Your lifetime {base} stays. {tier} runs on top for the time you buy, then you’re back on lifetime {base}.', { base: TIER_NAME[state.lifetimeTier], tier: TIER_NAME[tierId] });
  if (left <= 0) return null;
  const from = dailyValue(plans, state.tier);
  const to = dailyValue(plans, tierId);
  if (!from || !to) return null;
  const converted = Math.round((left * from) / to / DAY);
  return t('Upgrade credit: your {days} days of {from} become {converted} days of {to}, added on top. Nothing you paid is lost.', { days, from: TIER_NAME[state.tier], converted, to: TIER_NAME[tierId] });
}

export async function openCheckout({ plan: preselect, tier: wantTier, reason } = {}) {
  import('./stats.js').then(({ track }) => track('checkout')).catch(() => {});
  const [config, state] = await Promise.all([getConfig(), proState()]);
  const plans = config.plans || [];
  const tiers = config.tiers || [];
  const keeps = state.lifetimeTier || null;
  const buyable = (t) => !keeps || TIER_RANK[t.id] > TIER_RANK[keeps];
  // Start on the tier that unlocks what the user clicked, never below what they own.
  let tierId = plans.find((p) => p.id === preselect)?.tier || wantTier || (reason ? tierFor(reason) : 'pro');
  if (state.pro && TIER_RANK[state.tier] > TIER_RANK[tierId]) tierId = state.tier;
  if (!tiers.some((t) => t.id === tierId && buyable(t))) tierId = tiers.find(buyable)?.id;
  const m = modal({ title: state.pro ? t('Upgrade or extend') : t('Choose your plan') });
  let planId = null;
  let methodId = config.methods?.[0]?.id;
  const renewKey = state.key || storedKey();

  if (!config.methods || !config.methods.length) {
    m.body.append(
      h(
        'div',
        { class: 'stack' },
        h('p', { class: 'text-2' }, t(config.offline ? 'You seem to be offline. Connect to the internet to buy Pro — your analysis keeps working offline.' : 'Payments are being set up. Please check back soon.')),
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: m.close }, t('Close')),
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
  const tierBox = h('div', { class: 'tier-switch', role: 'radiogroup', 'aria-label': t('Tier') });
  const featureBox = h('div');
  const planBox = h('div', { class: 'choice-grid', role: 'radiogroup', 'aria-label': t('Billing') });
  const creditBox = h('div');

  const monthly = (t) => plans.find((p) => p.tier === t && p.cycle === 'month');
  const planSub = (p) => {
    if (p.cycle === 'life') return t('Pay once, keep {tier} forever', { tier: TIER_NAME[p.tier] });
    if (p.cycle === 'year') {
      const m1 = monthly(p.tier);
      const save = m1 ? Math.round((1 - p.priceUsd / (m1.priceUsd * 12)) * 100) : 0;
      return `${t('{price}/month', { price: money(Math.round((p.priceUsd / 12) * 100) / 100) })}${save > 0 ? ` · ${t('save {n}%', { n: save })}` : ''}`;
    }
    return t('{n} days · no auto-renewal', { n: p.days });
  };

  function drawTier() {
    const tier = tiers.find((t) => t.id === tierId);
    const options = plans.filter((p) => p.tier === tierId && (!keeps || p.days));
    if (!options.some((p) => p.id === planId)) {
      planId = (options.find((p) => p.id === preselect) || options.find((p) => p.badge === 'Most popular') || options.find((p) => p.cycle === 'year') || options[0])?.id;
    }
    clear(tierBox);
    for (const t of tiers) {
      // Cheapest monthly equivalent, computed like the pricing cards (yearly ÷ 12).
      const from = plans.filter((p) => p.tier === t.id && p.days && p.cycle !== 'week').map((p) => (p.cycle === 'year' ? p.priceUsd / 12 : p.priceUsd)).sort((a, b) => a - b)[0];
      const b = h(
        'button',
        { class: 'tier-opt', type: 'button', role: 'radio', 'aria-checked': String(t.id === tierId), disabled: !buyable(t) },
        h('span', { class: 'n' }, t.name),
        h('span', { class: 's' }, buyable(t) ? tr('from {price}/mo', { price: money(Math.round(from * 100) / 100) }) : tr('Owned for life')),
      );
      b.addEventListener('click', () => {
        tierId = t.id;
        drawTier();
      });
      tierBox.append(b);
    }
    const rank = TIER_RANK[tierId];
    clear(featureBox).append(
      h(
        'div',
        { class: 'tier-detail' },
        h('div', { class: 'small' }, h('b', null, t(tier?.tagline || '')), rank > 1 ? h('span', { class: 'muted' }, ` · ${t('everything in {tier}, plus:', { tier: TIER_NAME[tiers.find((x) => x.rank === rank - 1)?.id] })}`) : null),
        featureList(tier?.features || []),
      ),
    );
    clear(planBox);
    for (const p of options) {
      const input = h('input', { type: 'radio', name: 'plan', value: p.id, checked: p.id === planId });
      input.addEventListener('change', () => {
        planId = p.id;
        goLabel();
      });
      planBox.append(
        h(
          'label',
          { class: 'choice' },
          input,
          h('span', { class: 'radio' }),
          h('span', { class: 'grow' }, h('span', { class: 't' }, t(p.short), p.badge ? h('span', { class: 'badge', style: { marginLeft: '8px' } }, t(p.badge)) : null), h('span', { class: 's', style: { display: 'block' } }, planSub(p))),
          priceTag(p),
        ),
      );
    }
    const credit = creditText(state, tierId, plans);
    clear(creditBox).append(credit ? h('div', { class: 'note' }, icon('info'), h('span', null, credit)) : '');
    goLabel();
  }
  // Four features up front; the rest one tap away, so the plan stays readable.
  function featureList(items) {
    const ul = h('ul', { class: 'checklist small text-2' }, items.slice(0, 4).map((f) => h('li', null, icon('check'), t(f))));
    if (items.length <= 4) return ul;
    const more = h('button', { class: 'link-btn small', type: 'button', style: { background: 'none', border: 0, padding: 0, color: 'var(--signal)', cursor: 'pointer' } }, t('+ {n} more', { n: items.length - 4 }));
    more.addEventListener('click', () => {
      ul.append(...items.slice(4).map((f) => h('li', null, icon('check'), t(f))));
      more.remove();
    });
    return h('div', null, ul, more);
  }
  function goLabel() {
    const p = plans.find((x) => x.id === planId);
    if (!p || go.disabled) return;
    const price = discount ? Math.round(p.priceUsd * (1 - discount) * 100) / 100 : p.priceUsd;
    go.textContent = t('Continue · {price}', { price: money(price) });
  }
  const methodBox = h('div', { class: 'choice-grid', role: 'radiogroup', 'aria-label': t('Payment method') });
  for (const meth of config.methods) {
    const input = h('input', { type: 'radio', name: 'method', value: meth.id, checked: meth.id === methodId });
    input.addEventListener('change', () => {
      methodId = meth.id;
      cryptoHelp.hidden = !['tron', 'nowpayments'].includes(methodId);
    });
    methodBox.append(
      h(
        'label',
        { class: 'choice' },
        input,
        h('span', { class: 'radio' }),
        h('span', { class: 'grow' }, h('span', { class: 't' }, t(meth.label)), h('span', { class: 's', style: { display: 'block' } }, t(meth.detail))),
        icon(meth.id === 'tron' ? 'coin' : 'globe'),
      ),
    );
  }
  const email = h('input', { class: 'input', type: 'email', placeholder: t('you@example.com (optional)'), autocomplete: 'email', id: 'co-email' });
  const errorBox = h('div', { class: 'err-box', hidden: true, role: 'alert' });
  const go = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button' }, t('Continue to payment'));

  // What worries first-time buyers, answered before they have to ask.
  const trust = h(
    'div',
    { class: 'co-trust small text-2' },
    h('span', null, '🔒 ', t('No account, no card details')),
    h('span', null, '⚡ ', t('Key unlocks right after payment')),
    h('span', null, '💬 ', t('Human support on Telegram')),
    h('span', null, '↩ ', t('14-day refund if we can’t read your export')),
  );
  const cryptoHelp = h(
    'details',
    { class: 'crypto-help', open: !state.pro && !renewKey, hidden: !['tron', 'nowpayments'].includes(methodId) },
    h('summary', null, t('New to crypto? How to pay in a few minutes')),
    h(
      'ol',
      null,
      h('li', null, t('Use an exchange or wallet app that sells USDT with a card or bank transfer (for example Binance, OKX or Trust Wallet — availability depends on your country).')),
      h('li', null, t('No card? Most exchanges have a P2P section where you buy USDT from another person by bank transfer. A friend who has USDT can also send it for you.')),
      h('li', null, t('Buy a little more USDT than the price, to cover the network fee.')),
      h('li', null, t('Send it to the address on the next screen and choose the TRON (TRC20) network.')),
      h('li', null, t('Your plan unlocks automatically about a minute after the payment arrives.')),
    ),
    h('p', { class: 'small' }, h('a', { href: `${lang === 'en' ? '' : `/${lang}`}/guides/pay-with-usdt/`, target: '_blank', rel: 'noopener' }, t('Full step-by-step guide →'))),
    h('p', { class: 'tiny muted' }, t('Not sure? The free version stays free — try everything first.')),
  );
  m.body.append(
    h(
      'div',
      { class: 'stack co-stack', style: { '--stack': '18px' } },
      trust,
      tierBox,
      featureBox,
      planBox,
      creditBox,
      h('div', { class: 'eyebrow' }, t('Pay with')),
      methodBox,
      cryptoHelp,
      config.email
        ? h('details', { class: 'small', open: true }, h('summary', null, t('Also send my key by e-mail (optional)')), h('div', { class: 'field', style: { marginTop: '8px' } }, h('label', { for: 'co-email', class: 'sr-only' }, t('E-mail for your license & renewal reminder')), email))
        : null,
      discount ? h('div', { class: 'note' }, icon('sparkles'), h('span', null, t('Friend invite applied — {n}% off.', { n: Math.round(discount * 100) }))) : null,
      errorBox,
      h('div', { style: { position: 'sticky', bottom: '0', paddingTop: '8px', background: 'linear-gradient(transparent, var(--surface, #101017) 30%)' } }, go),
      h('p', { class: 'tiny muted', style: { textAlign: 'center' } }, t('Activates automatically once the payment confirms · no account · no auto-renewal · your social data is never uploaded')),
    ),
  );
  drawTier();

  go.addEventListener('click', async () => {
    import('./stats.js').then(({ track }) => track('cont', { p: planId })).catch(() => {});
    go.disabled = true;
    errorBox.hidden = true;
    go.textContent = t('Creating your order…');
    try {
      const res = await api('/api/checkout', {
        method: 'POST',
        body: { plan: planId, method: methodId, email: email.value.trim() || undefined, renewKey: renewKey || undefined, ref: ref || undefined },
      });
      rememberOrder(res.order, res.token);
      if (res.order.method === 'stars') {
        starsScreen(m, res.order, res.token, config);
        return;
      }
      if (res.order.method === 'nowpayments' && res.order.redirectUrl) {
        go.textContent = t('Opening the payment page…');
        location.href = res.order.redirectUrl;
        return;
      }
      tronScreen(m, res.order, res.token, config);
    } catch (err) {
      errorBox.textContent = err instanceof ApiError ? errText(err) : t('Could not reach the server. Check your connection.');
      errorBox.hidden = false;
      go.disabled = false;
      goLabel();
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
  const btn = copy ? h('button', { class: 'copy-btn', type: 'button' }, t('Copy')) : null;
  btn?.addEventListener('click', () => copyText(copy, btn));
  return h('div', { class: 'pay-line' }, h('span', { class: 'k' }, k), h('span', { class: `v${big ? ' big' : ''}` }, v), btn);
}

// "Plus · 1 year · $29": what this order buys, from order.plan + the plans in /api/config.
const LEGACY_PLAN_IDS = { month: 'pro-month', year: 'pro-year', life: 'pro-life' };
function planText(order, config) {
  const id = LEGACY_PLAN_IDS[order.plan] || order.plan;
  const p = [...(config.plans || []), ...(config.growthPlans || [])].find((x) => x.id === id);
  if (!p) return null;
  const length = p.cycle === 'life' ? t('Lifetime') : p.days === 365 ? t('1 year') : p.days === 30 ? t('30 days') : p.days === 7 ? t('7 days') : t(p.short);
  const price = order.priceUsd ?? p.priceUsd;
  return [p.name.split(' · ')[0], length, price != null ? `$${price}` : null].filter(Boolean).join(' · ');
}

export function starsScreen(m, order, token, config, onPaid = (o) => successScreen(m, o), onBack = () => { m.close(); openCheckout({ plan: order.plan }); }) {
  m.setTitle(t('Pay with Telegram Stars'));
  clear(m.body);
  import('./stats.js').then(({ track }) => track('pay')).catch(() => {});
  m.body.append(
    h('div', { class: 'stack', style: { '--stack': '16px' } },
      planText(order, config) ? line(t('Plan'), planText(order, config)) : null,
      h('a', { class: 'btn btn--primary btn--lg btn--block', href: order.redirectUrl, target: '_blank', rel: 'noopener' }, t('Pay ⭐ {stars} Stars in Telegram', { stars: order.stars })),
      h('p', { class: 'small text-2' }, t('Opens Telegram. Buy Stars there with card, Apple Pay or Google Pay, then confirm. Your plan unlocks here automatically and the bot also sends you your license key.')),
      h('p', { class: 'small text-2' }, t('No Telegram? Install it free, or pick another method.')),
      h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' } },
        h('a', { class: 'link-btn small', href: 'https://telegram.org/apps', target: '_blank', rel: 'noopener' }, t('Install Telegram')),
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: onBack }, t('Choose another payment method')),
      ),
      h('div', { class: 'status-line', role: 'status' }, h('span', { class: 'spinner' }), h('span', null, t('Waiting for your payment in Telegram…'))),
      h('p', { class: 'tiny muted mono' }, order.id),
      config.support ? h('p', { class: 'small muted' }, t('Problem with a payment? Send us your order ID:'), ' ', ...supportLinks(config.support)) : null,
    ),
  );
  // No expiry cutoff: keep checking while the modal is open, including late payments.
  const stop = pollOrder(order.id, token, (o) => {
    if (o.status === 'paid') {
      stop();
      observer.disconnect();
      onPaid(o);
    }
  }, 4000, 4000);
  const observer = new MutationObserver(() => {
    if (!m.root.isConnected) {
      stop();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });
}

export function tronScreen(m, order, token, config, onPaid = (o) => successScreen(m, o)) {
  m.setTitle(t('Pay with USDT (TRC20)'));
  clear(m.body);
  import('./stats.js').then(({ track }) => track('pay')).catch(() => {});
  const addr = payAddress(order.address);
  const qr = h('div', { class: 'pay-qr', 'aria-label': t('QR code of the wallet address') });
  qr.innerHTML = qrSvg(addr.qr);
  // Groups are separate spans spaced by margin, so even a manual text selection copies no spaces.
  const addrView = h('span', { class: 'pay-addr', translate: 'no' }, addr.groups.map((g) => h('span', { style: { display: 'inline-block', marginRight: '0.45em' } }, g)));
  const timer = h('span', { class: 'mono' });
  const status = h('div', { class: 'status-line' }, h('span', { class: 'spinner' }), h('span', null, t('Waiting for your payment — the blockchain is checked automatically. You can close this page and resume the order later under “My account”.')));
  const claimInput = h('input', { class: 'input mono', placeholder: t('Transaction hash (TxID)'), 'aria-label': t('Transaction hash'), spellcheck: false });
  const claimBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, t('Verify'));
  const claimMsg = h('div', { class: 'small text-2', role: 'status' });

  m.body.append(
    h(
      'div',
      { class: 'pay' },
      h('div', { class: 'warn-box' }, icon('warning'), h('span', null, h('b', null, t('TRON (TRC20) network only.') + ' '), t('Sending on Ethereum, BNB Chain or any other network will lose the funds.'))),
      qr,
      // Status + countdown sit right under the QR so they stay on a phone's first screen.
      h('div', { class: 'pay-status' }, status, h('div', { class: 'small muted' }, t('Order expires in') + ' ', timer, ' · ', h('span', { class: 'mono' }, order.id))),
      planText(order, config) ? line(t('Plan'), planText(order, config)) : null,
      line(t('Amount'), `${order.amount} USDT`, { big: true, copy: order.amount }),
      line(t('Address'), addrView, { copy: addr.copy }),
      h(
        'a',
        {
          class: 'btn btn--ghost btn--block',
          href: `https://link.trustwallet.com/send?asset=c195_tTR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t&address=${encodeURIComponent(order.address)}&amount=${encodeURIComponent(order.amount)}`,
          target: '_blank',
          rel: 'noopener',
          onClick: () => import('./stats.js').then(({ track }) => track('wallet')).catch(() => {}),
        },
        icon('external'),
        t('Open in Trust Wallet'),
      ),
      h('p', { class: 'small text-2' }, t('This exact amount (a few cents under the price) is unique to your order — that’s how we match your payment instantly. Paying from an exchange? Make sure the amount that arrives is {amount} USDT (add the withdrawal fee on top).', { amount: order.amount })),
      h(
        'details',
        { class: 'faq', style: { display: 'block' } },
        h('summary', { style: { padding: '12px 0', fontSize: '14px' } }, t('Already paid? Paste your transaction hash')),
        h('div', { style: { display: 'flex', gap: '8px' } }, claimInput, claimBtn),
        claimMsg,
      ),
      config.dev ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => api('/api/dev/pay', { method: 'POST', body: { id: order.id } }) }, t('Simulate payment (dev mode)')) : null,
      config.support ? h('p', { class: 'small muted' }, t('Problem with a payment? Send us your order ID:'), ' ', ...supportLinks(config.support)) : null,
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
      onPaid(o);
    } else if (o.status === 'expired') {
      status.replaceChildren(icon('clock'), h('span', null, t('This order expired, but a payment arriving in the next hours is still accepted. You can also start a new order.')));
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
    claimMsg.textContent = t('Checking the blockchain…');
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
          ? t('We received {received} of {required} USDT. Send the remaining {remaining} USDT to the same address, then paste that new hash here.', res)
          : res.reason === 'not_found'
            ? t('Not visible yet — TRON needs about a minute to confirm. Try again shortly.')
            : res.reason === 'already_used'
              ? t('That transaction was already used for another order.')
              : res.reason === 'not_usdt'
                ? t('That transaction is not a USDT transfer to our address.')
                : t('That doesn’t look like a valid TRON transaction hash.');
    } catch (err) {
      claimMsg.textContent = errText(err);
    } finally {
      claimBtn.disabled = false;
    }
  });
}

export function pollOrder(id, token, onUpdate, every = 5000, backgroundEvery = every * 3) {
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
    if (!stopped) timer = setTimeout(run, document.hidden ? backgroundEvery : every);
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
  m.setTitle(t('Payment received'));
  clear(m.body);
  const key = order.license?.key || '';
  const copy = h('button', { class: 'btn btn--ghost', type: 'button' }, icon('copy'), t('Copy key'));
  copy.addEventListener('click', () => copyText(key, copy));
  const save = h('button', { class: 'btn btn--ghost', type: 'button' }, icon('download'), t('Save as file'));
  const tierName = TIER_NAME[order.license?.tier] || 'Pro';
  save.addEventListener('click', () => downloadBlob(new Blob([`Unwrapped ${tierName} license\n\n${key}\n\nActivate on any device: ${location.origin}/account/\n`], { type: 'text/plain' }), 'unwrapped-license.txt'));
  m.body.append(
    h(
      'div',
      { class: 'stack', style: { '--stack': '16px', textAlign: 'center' } },
      h('div', { class: 'success-burst' }, icon('check')),
      h('div', { class: 'h3' }, t('You’re {tier}. Enjoy!', { tier: tierName })),
      h('p', { class: 'text-2' }, order.license?.lifetime ? t('Lifetime access is active on this device.') : t('Active until {date}.', { date: new Date(order.license?.expiresAt).toLocaleDateString(locale, { dateStyle: 'long' }) })),
      h('div', { class: 'license-key' }, key),
      h('p', { class: 'small text-2' }, t('Save this key — it unlocks {tier} on any browser or phone.', { tier: tierName })),
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } }, copy, save),
      // On the Bio editor, reload so the new license unlocks Pro on the page at once.
      h('button', { class: 'btn btn--primary btn--lg', type: 'button', onClick: () => (/\/bio\/$/.test(location.pathname) ? location.reload() : m.close()) }, t('Continue')),
      h('p', { class: 'small text-2' }, t('Invite friends and earn 30 free days for every friend who buys — ') , h('a', { href: `${lang === 'en' ? '' : `/${lang}`}/account/#invite` }, t('get your invite link')), '.'),
    ),
  );
  toast(t('{tier} unlocked', { tier: tierName }));
}
