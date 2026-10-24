import { h, icon, clear, append, copyText, toast, modal } from '../lib/ui.js';
import { proState, activateKey, clearLicense, storedKey } from '../lib/license.js';
import { getConfig, api } from '../lib/api.js';
import { savedOrders, forgetOrder, starsScreen, tronScreen, successScreen } from '../lib/checkout.js';
import { countAllSnapshots, deleteAllSnapshots } from '../app/snapshots.js';
import { inviteLink } from '../lib/referral.js';
import { TIER_NAME, TIER_RANK } from '../lib/tiers.js';
import { t, locale } from '../lib/i18n.js';
import { supportLinks } from '../lib/support.js';
import { accountSection, loadAccount, signInFromHash } from './account-user.js';

const root = document.getElementById('account-root');

const REASONS = {
  not_found: () => t('We couldn’t find that key. Check for typos — it looks like UNW-XXXX-XXXX-XXXX-XXXX.'),
  expired: () => t('This license has expired. Renew it below — your key stays the same.'),
  revoked: () => t('This license is no longer active.'),
  missing_key: () => t('Please paste your license key.'),
};

let renderSeq = 0;

async function render() {
  const seq = ++renderSeq;
  const [state, config, snapshots, account] = await Promise.all([proState(), getConfig(), countAllSnapshots(), loadAccount()]);
  if (seq !== renderSeq) return; // a newer render started meanwhile
  clear(root);
  root.append(...accountSection(account, state.key || storedKey(), render));

  // Status
  const keyText = state.key || storedKey();
  const status = h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel-head' }, h('div', null, h('h3', null, t('Status')), h('p', null, state.pro ? t('{v0} is active in this browser.', { v0: TIER_NAME[state.tier] }) : t('You are on the free plan in this browser.'))), state.pro ? h('span', { class: 'badge' }, icon('check'), TIER_NAME[state.tier]) : h('span', { class: 'badge badge--muted' }, t('Free'))),
    state.pro
      ? h(
          'div',
          { class: 'stack', style: { '--stack': '12px' } },
          h(
            'div',
            { class: 'stats' },
            h('div', { class: 'stat' }, h('span', { class: 'label' }, t('Plan')), h('span', { class: 'value', style: { fontSize: '24px' } }, `${TIER_NAME[state.tier]}${state.lifetime ? ` · ${t('Lifetime')}` : ''}`)),
            h(
              'div',
              { class: 'stat' },
              h('span', { class: 'label' }, t('Valid until')),
              h('span', { class: 'value', style: { fontSize: '24px' } }, state.lifetime ? t('Forever') : new Date(state.expiresAt).toLocaleDateString(locale, { dateStyle: 'medium' })),
              !state.lifetime && state.lifetimeTier ? h('span', { class: 'sub' }, t('then lifetime {v0}', { v0: TIER_NAME[state.lifetimeTier] })) : null,
            ),
          ),
          keyRow(keyText),
        )
      : keyText
        ? h('div', { class: 'stack', style: { '--stack': '10px' } }, h('p', { class: 'small text-2' }, t('A license key is saved here but it isn’t active (expired or revoked).')), keyRow(keyText))
        : null,
  );
  root.append(status);

  // Invite friends (paid plans only)
  if (state.pro && state.key) {
    const box = h('div', { class: 'stack', style: { '--stack': '12px' } }, h('div', { class: 'status-line' }, h('span', { class: 'spinner' }), h('span', null, t('Loading your invite link…'))));
    root.append(
      h(
        'section',
        { class: 'panel', id: 'invite' },
        h('div', { class: 'panel-head' }, h('div', null, h('h3', null, t('Invite friends, earn free days')), h('p', null, t('Friends get {v0}% off. You get {v1} free days for every friend who buys.', { v0: Math.round((config.referral?.discount || 0.1) * 100), v1: config.referral?.rewardDays || 30 })))),
        box,
      ),
    );
    api('/api/referral', { method: 'POST', body: { key: state.key } })
      .then((ref) => {
        if (!ref.ok) throw new Error(ref.reason);
        const link = inviteLink(ref.code);
        const copy = h('button', { class: 'copy-btn', type: 'button' }, t('Copy'));
        copy.addEventListener('click', () => copyText(link, copy));
        const share = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('share'), t('Share'));
        share.addEventListener('click', async () => {
          const text = t('I found out who doesn’t follow me back — without giving my password. Get 10% off:');
          if (navigator.share) {
            try {
              await navigator.share({ title: 'Unwrapped', text, url: link });
            } catch {
              /* cancelled */
            }
          } else copyText(link, copy);
        });
        append(clear(box), [
          h('div', { class: 'pay-line' }, h('span', { class: 'k' }, t('Link')), h('span', { class: 'v' }, link), copy),
          h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('span', { class: 'label' }, t('Friends who bought')), h('span', { class: 'value' }, String(ref.uses))), h('div', { class: 'stat' }, h('span', { class: 'label' }, t('Free days earned')), h('span', { class: 'value' }, String(ref.earnedDays)))),
          h('div', null, share),
          state.lifetime ? h('p', { class: 'tiny muted' }, t('You already have lifetime access, so invites earn no extra days — but your friends still save.')) : null,
        ]);
        if (location.hash === '#invite') document.getElementById('invite')?.scrollIntoView({ block: 'start' });
      })
      .catch(() => {
        clear(box).append(h('p', { class: 'small muted' }, t('Your invite link is not available right now. Try again later.')));
      });
  }

  // Activate
  const input = h('input', { class: 'input mono', placeholder: 'UNW-XXXX-XXXX-XXXX-XXXX', 'aria-label': t('License key'), autocomplete: 'off', spellcheck: false });
  const btn = h('button', { class: 'btn btn--primary', type: 'button' }, t('Activate'));
  const msg = h('div', { class: 'small', role: 'status', style: { marginTop: '10px' } });
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('key');
  if (fromHash) input.value = fromHash;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    msg.textContent = t('Checking…');
    try {
      const res = await activateKey(input.value);
      if (res.ok) {
        toast(t('License activated on this device'));
        history.replaceState(null, '', location.pathname);
        return; // the license event re-renders the page
      }
      msg.textContent = REASONS[res.reason]?.() || t('Could not activate this key.');
    } catch {
      msg.textContent = t('Could not reach the server. Check your connection.');
    } finally {
      btn.disabled = false;
    }
  });
  root.append(
    h(
      'section',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h3', null, t('Activate a license key')), h('p', null, t('Bought a plan on another device? Paste your key here.')))),
      h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, h('div', { style: { flex: '1', minWidth: '240px' } }, input), btn),
      msg,
    ),
  );
  if (fromHash && !state.pro) btn.click();
  if (!state.pro) {
    root.append(
      h(
        'section',
        { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', null, h('h3', null, t('Lost your key?')), h('p', null, t('If you gave an e-mail at checkout, your key was sent there. Otherwise contact us with your order ID or transaction hash and we’ll send it again.')))),
        config.support ? h('p', { class: 'small' }, ...supportLinks(config.support)) : null,
      ),
    );
  }

  // Renew / buy
  root.append(
    h(
      'section',
      { class: 'panel', id: 'renew' },
      h(
        'div',
        { class: 'panel-head' },
        h(
          'div',
          null,
          h('h3', null, state.pro ? t('Upgrade, renew or extend') : t('Choose a plan')),
          h('p', null, state.pro ? t('Same tier: new time is added on top. Higher tier: the time you have left is converted at fair value. Your key stays the same.') : t('Pay with crypto, activation is automatic.')),
        ),
      ),
      h(
        'div',
        { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
        (config.tiers || [])
          .filter((tier) => !state.lifetimeTier || TIER_RANK[tier.id] > TIER_RANK[state.lifetimeTier])
          .map((tier) => h('button', { class: `btn ${tier.id === 'pro' ? 'btn--primary' : 'btn--ghost'}`, type: 'button', dataset: { checkout: '', tier: tier.id } }, state.pro && tier.id === state.tier ? t('Extend {v0}', { v0: tier.name }) : tier.name)),
        // Plans couldn't be loaded (offline): still give a way forward.
        config.tiers?.length ? null : h('a', { class: 'btn btn--ghost', href: '/pricing/' }, t('See plans')),
      ),
    ),
  );

  // Pending orders
  const orders = savedOrders();
  if (orders.length) {
    root.append(
      h(
        'section',
        { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', null, h('h3', null, t('Pending payments')), h('p', null, t('Orders started in this browser.')))),
        h(
          'div',
          { class: 'rows' },
          orders.map((o) => {
            const resume = h('button', { class: 'row-btn', type: 'button' }, t('Resume'));
            resume.addEventListener('click', async () => {
              try {
                const res = await api(`/api/order?id=${encodeURIComponent(o.id)}&t=${encodeURIComponent(o.t)}`);
                const m = modal({ title: t('Payment') });
                if (res.order.status === 'paid') successScreen(m, res.order);
                else if (res.order.method === 'stars') starsScreen(m, res.order, o.t, config);
                else if (res.order.method === 'tron') tronScreen(m, res.order, o.t, config);
                else location.href = `/success/?order=${encodeURIComponent(o.id)}&t=${encodeURIComponent(o.t)}`;
              } catch {
                toast(t('This order is no longer available'), { iconName: 'info' });
                forgetOrder(o.id);
                render();
              }
            });
            const remove = h('button', { class: 'row-btn', type: 'button', 'aria-label': t('Forget this order') }, icon('trash'));
            remove.addEventListener('click', () => {
              forgetOrder(o.id);
              render();
            });
            return h('div', { class: 'row' }, h('div', { class: 'who' }, h('b', null, t('Order {v0}', { v0: o.id })), h('span', null, `${o.plan} · ${o.method} · ${new Date(o.createdAt).toLocaleString(locale)}`)), h('div', { class: 'acts' }, resume, remove));
          }),
        ),
      ),
    );
  }

  // Local data
  const wipe = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('trash'), t('Delete all local data'));
  wipe.addEventListener('click', async () => {
    if (!confirm(t('Delete all snapshots, kept-account lists and queue progress stored in this browser? Your license stays.'))) return;
    await deleteAllSnapshots();
    for (const k of Object.keys(localStorage)) if (/^unw\.(keep|queue)\./.test(k)) localStorage.removeItem(k);
    toast(t('Local data deleted'));
    render();
  });
  root.append(
    h(
      'section',
      { class: 'panel', id: 'local-data' },
      h('div', { class: 'panel-head' }, h('div', null, h('h3', null, t('Local data')), h('p', null, t('{v0} follower snapshots stored only in this browser.', { v0: snapshots }))), wipe),
      h('p', { class: 'small text-2' }, t('Snapshots let us show who unfollowed you next time. They never leave this device and are not part of your license.')),
    ),
  );
  if (config.support) root.append(h('p', { class: 'small muted' }, t('Need help? Contact:'), ' ', ...supportLinks(config.support)));
}

function keyRow(key) {
  if (!key) return null;
  const masked = `${key.slice(0, 9)}••••-••••-${key.slice(-4)}`;
  const shown = h('span', { class: 'v' }, masked);
  const reveal = h('button', { class: 'copy-btn', type: 'button' }, t('Show'));
  reveal.addEventListener('click', () => {
    const on = shown.textContent === masked;
    shown.textContent = on ? key : masked;
    reveal.textContent = on ? t('Hide') : t('Show');
  });
  const copy = h('button', { class: 'copy-btn', type: 'button' }, t('Copy'));
  copy.addEventListener('click', () => copyText(key, copy));
  const remove = h('button', { class: 'copy-btn', type: 'button' }, t('Remove'));
  remove.addEventListener('click', () => {
    if (!confirm(t('Remove the license from this browser? You can re-activate it later with the key.'))) return;
    clearLicense();
    render();
  });
  return h('div', { class: 'pay-line' }, h('span', { class: 'k' }, t('Key')), shown, reveal, copy, remove);
}

signInFromHash().finally(render);
window.addEventListener('unw:license', render);
