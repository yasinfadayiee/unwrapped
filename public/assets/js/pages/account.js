import { h, icon, clear, append, copyText, toast, modal } from '../lib/ui.js';
import { proState, activateKey, clearLicense, storedKey } from '../lib/license.js';
import { getConfig, api } from '../lib/api.js';
import { savedOrders, forgetOrder, tronScreen, successScreen } from '../lib/checkout.js';
import { countAllSnapshots, deleteAllSnapshots } from '../app/snapshots.js';
import { inviteLink } from '../lib/referral.js';
import { TIER_NAME, TIER_RANK } from '../lib/tiers.js';

const root = document.getElementById('account-root');

const REASONS = {
  not_found: 'We couldn’t find that key. Check for typos — it looks like UNW-XXXX-XXXX-XXXX-XXXX.',
  expired: 'This license has expired. Renew it below — your key stays the same.',
  revoked: 'This license is no longer active.',
  missing_key: 'Please paste your license key.',
};

let renderSeq = 0;

async function render() {
  const seq = ++renderSeq;
  const [state, config, snapshots] = await Promise.all([proState(), getConfig(), countAllSnapshots()]);
  if (seq !== renderSeq) return; // a newer render started meanwhile
  clear(root);

  // Status
  const keyText = state.key || storedKey();
  const status = h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel-head' }, h('div', null, h('h3', null, 'Status'), h('p', null, state.pro ? `${TIER_NAME[state.tier]} is active in this browser.` : 'You are on the free plan in this browser.')), state.pro ? h('span', { class: 'badge' }, icon('check'), TIER_NAME[state.tier]) : h('span', { class: 'badge badge--muted' }, 'Free')),
    state.pro
      ? h(
          'div',
          { class: 'stack', style: { '--stack': '12px' } },
          h(
            'div',
            { class: 'stats' },
            h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Plan'), h('span', { class: 'value', style: { fontSize: '24px' } }, config.plans.find((p) => p.id === state.plan)?.name || `${TIER_NAME[state.tier]}${state.lifetime ? ' · Lifetime' : ''}`)),
            h(
              'div',
              { class: 'stat' },
              h('span', { class: 'label' }, 'Valid until'),
              h('span', { class: 'value', style: { fontSize: '24px' } }, state.lifetime ? 'Forever' : new Date(state.expiresAt).toLocaleDateString('en-US', { dateStyle: 'medium' })),
              !state.lifetime && state.lifetimeTier ? h('span', { class: 'sub' }, `then lifetime ${TIER_NAME[state.lifetimeTier]}`) : null,
            ),
          ),
          keyRow(keyText),
        )
      : keyText
        ? h('div', { class: 'stack', style: { '--stack': '10px' } }, h('p', { class: 'small text-2' }, 'A license key is saved here but it isn’t active (expired or revoked).'), keyRow(keyText))
        : null,
  );
  root.append(status);

  // Invite friends (Pro only)
  if (state.pro && state.key) {
    const box = h('div', { class: 'stack', style: { '--stack': '12px' } }, h('div', { class: 'status-line' }, h('span', { class: 'spinner' }), h('span', null, 'Loading your invite link…')));
    root.append(
      h(
        'section',
        { class: 'panel', id: 'invite' },
        h('div', { class: 'panel-head' }, h('div', null, h('h3', null, 'Invite friends, earn free Pro'), h('p', null, `Friends get ${Math.round((config.referral?.discount || 0.1) * 100)}% off. You get ${config.referral?.rewardDays || 30} free days for every friend who buys.`))),
        box,
      ),
    );
    api('/api/referral', { method: 'POST', body: { key: state.key } })
      .then((ref) => {
        if (!ref.ok) throw new Error(ref.reason);
        const link = inviteLink(ref.code);
        const copy = h('button', { class: 'copy-btn', type: 'button' }, 'Copy');
        copy.addEventListener('click', () => copyText(link, copy));
        const share = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('share'), 'Share');
        share.addEventListener('click', async () => {
          const text = 'I found out who doesn’t follow me back — without giving my password. Get 10% off Pro:';
          if (navigator.share) {
            try {
              await navigator.share({ title: 'Unwrapped', text, url: link });
            } catch {
              /* cancelled */
            }
          } else copyText(link, copy);
        });
        append(clear(box), [
          h('div', { class: 'pay-line' }, h('span', { class: 'k' }, 'Link'), h('span', { class: 'v' }, link), copy),
          h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Friends who bought'), h('span', { class: 'value' }, String(ref.uses))), h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Free days earned'), h('span', { class: 'value' }, String(ref.earnedDays)))),
          h('div', null, share),
          state.lifetime ? h('p', { class: 'tiny muted' }, 'You already have lifetime access, so invites earn no extra days — but your friends still save.') : null,
        ]);
        if (location.hash === '#invite') document.getElementById('invite')?.scrollIntoView({ block: 'start' });
      })
      .catch(() => {
        clear(box).append(h('p', { class: 'small muted' }, 'Your invite link is not available right now. Try again later.'));
      });
  }

  // Activate
  const input = h('input', { class: 'input mono', placeholder: 'UNW-XXXX-XXXX-XXXX-XXXX', 'aria-label': 'License key', autocomplete: 'off', spellcheck: false });
  const btn = h('button', { class: 'btn btn--primary', type: 'button' }, 'Activate');
  const msg = h('div', { class: 'small', role: 'status', style: { marginTop: '10px' } });
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('key');
  if (fromHash) input.value = fromHash;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    msg.textContent = 'Checking…';
    try {
      const res = await activateKey(input.value);
      if (res.ok) {
        toast('License activated on this device');
        history.replaceState(null, '', location.pathname);
        return; // the license event re-renders the page
      }
      msg.textContent = REASONS[res.reason] || 'Could not activate this key.';
    } catch {
      msg.textContent = 'Could not reach the server. Check your connection.';
    } finally {
      btn.disabled = false;
    }
  });
  root.append(
    h(
      'section',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h3', null, 'Activate a license key'), h('p', null, 'Bought a plan on another device? Paste your key here.'))),
      h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, h('div', { style: { flex: '1', minWidth: '240px' } }, input), btn),
      msg,
    ),
  );
  if (fromHash && !state.pro) btn.click();

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
          h('h3', null, state.pro ? 'Upgrade, renew or extend' : 'Choose a plan'),
          h('p', null, state.pro ? 'Same tier: new time is added on top. Higher tier: the time you have left is converted at fair value. Your key stays the same.' : 'Pay with crypto, activation is automatic.'),
        ),
      ),
      h(
        'div',
        { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
        (config.tiers || [])
          .filter((t) => !state.lifetimeTier || TIER_RANK[t.id] > TIER_RANK[state.lifetimeTier])
          .map((t) => h('button', { class: `btn ${t.id === 'pro' ? 'btn--primary' : 'btn--ghost'}`, type: 'button', dataset: { checkout: '', tier: t.id } }, state.pro && t.id === state.tier ? `Extend ${t.name}` : t.name)),
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
        h('div', { class: 'panel-head' }, h('div', null, h('h3', null, 'Pending payments'), h('p', null, 'Orders started in this browser.'))),
        h(
          'div',
          { class: 'rows' },
          orders.map((o) => {
            const resume = h('button', { class: 'row-btn', type: 'button' }, 'Resume');
            resume.addEventListener('click', async () => {
              try {
                const res = await api(`/api/order?id=${encodeURIComponent(o.id)}&t=${encodeURIComponent(o.t)}`);
                const m = modal({ title: 'Payment' });
                if (res.order.status === 'paid') successScreen(m, res.order);
                else if (res.order.method === 'tron') tronScreen(m, res.order, o.t, config);
                else location.href = `/success/?order=${encodeURIComponent(o.id)}&t=${encodeURIComponent(o.t)}`;
              } catch {
                toast('This order is no longer available', { iconName: 'info' });
                forgetOrder(o.id);
                render();
              }
            });
            const remove = h('button', { class: 'row-btn', type: 'button', 'aria-label': 'Forget this order' }, icon('trash'));
            remove.addEventListener('click', () => {
              forgetOrder(o.id);
              render();
            });
            return h('div', { class: 'row' }, h('div', { class: 'who' }, h('b', null, `Order ${o.id}`), h('span', null, `${o.plan} · ${o.method} · ${new Date(o.createdAt).toLocaleString('en-US')}`)), h('div', { class: 'acts' }, resume, remove));
          }),
        ),
      ),
    );
  }

  // Local data
  const wipe = h('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, icon('trash'), 'Delete all local data');
  wipe.addEventListener('click', async () => {
    if (!confirm('Delete all snapshots, kept-account lists and queue progress stored in this browser? Your license stays.')) return;
    await deleteAllSnapshots();
    for (const k of Object.keys(localStorage)) if (/^unw\.(keep|queue)\./.test(k)) localStorage.removeItem(k);
    toast('Local data deleted');
    render();
  });
  root.append(
    h(
      'section',
      { class: 'panel', id: 'local-data' },
      h('div', { class: 'panel-head' }, h('div', null, h('h3', null, 'Local data'), h('p', null, `${snapshots} follower snapshot${snapshots === 1 ? '' : 's'} stored only in this browser.`)), wipe),
      h('p', { class: 'small text-2' }, 'Snapshots let us show who unfollowed you next time. They never leave this device and are not part of your license.'),
    ),
  );
  if (config.support) root.append(h('p', { class: 'small muted' }, 'Need help? Contact: ', config.support));
}

function keyRow(key) {
  if (!key) return null;
  const masked = `${key.slice(0, 9)}••••-••••-${key.slice(-4)}`;
  const shown = h('span', { class: 'v' }, masked);
  const reveal = h('button', { class: 'copy-btn', type: 'button' }, 'Show');
  reveal.addEventListener('click', () => {
    const on = shown.textContent === masked;
    shown.textContent = on ? key : masked;
    reveal.textContent = on ? 'Hide' : 'Show';
  });
  const copy = h('button', { class: 'copy-btn', type: 'button' }, 'Copy');
  copy.addEventListener('click', () => copyText(key, copy));
  const remove = h('button', { class: 'copy-btn', type: 'button' }, 'Remove');
  remove.addEventListener('click', () => {
    if (!confirm('Remove the license from this browser? You can re-activate it later with the key.')) return;
    clearLicense();
    render();
  });
  return h('div', { class: 'pay-line' }, h('span', { class: 'k' }, 'Key'), shown, reveal, copy, remove);
}

render();
window.addEventListener('unw:license', render);
