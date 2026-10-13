import { h, icon, clear, copyText, toast } from '../lib/ui.js';
import { api, ApiError } from '../lib/api.js';
import { fmtInt, dateShort } from '../lib/format.js';
import { barChart } from '../app/charts.js';

const root = document.getElementById('admin-root');
const KEY = 'unw.admin';
const token = () => sessionStorage.getItem(KEY) || '';
const auth = () => ({ authorization: `Bearer ${token()}` });
const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

function login(message) {
  const input = h('input', { class: 'input', type: 'password', placeholder: 'ADMIN_TOKEN', autocomplete: 'current-password', 'aria-label': 'Admin token' });
  const btn = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Open dashboard');
  const form = h('form', { class: 'panel', style: { maxWidth: '520px' } }, h('h3', { class: 'h4', style: { marginBottom: '6px' } }, 'Sign in'), h('p', { class: 'small text-2', style: { marginBottom: '14px' } }, 'Enter the ADMIN_TOKEN secret you set when deploying.'), message ? h('div', { class: 'err-box', style: { marginBottom: '12px' } }, message) : null, h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, h('div', { style: { flex: '1', minWidth: '220px' } }, input), btn));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sessionStorage.setItem(KEY, input.value.trim());
    load();
  });
  clear(root).append(form);
  input.focus();
}

function healthRow(label, ok, detail, warnOnly = false) {
  const color = ok ? 'var(--good)' : warnOnly ? 'var(--warning)' : 'var(--critical)';
  return h('div', { class: 'row' }, h('span', { style: { color, display: 'inline-flex' } }, icon(ok ? 'check' : 'warning')), h('div', { class: 'who' }, h('b', null, label), h('span', null, detail)), h('span', { class: 'badge badge--muted' }, ok ? 'OK' : warnOnly ? 'Optional' : 'Fix'));
}

async function load() {
  if (!token()) return login();
  let summary;
  let orders;
  let events;
  try {
    [summary, orders, events] = await Promise.all([
      api('/api/admin/summary', { headers: auth() }),
      api('/api/admin/orders?limit=60', { headers: auth() }),
      api('/api/admin/events', { headers: auth() }),
    ]);
  } catch (err) {
    sessionStorage.removeItem(KEY);
    if (err instanceof ApiError && err.code === 'admin_disabled') return login('Admin is disabled: set the ADMIN_TOKEN secret (at least 12 characters) and redeploy.');
    return login(err instanceof ApiError && err.status === 401 ? 'Wrong token.' : 'Could not reach the API.');
  }
  const s = summary;
  clear(root);
  const conv = s.funnel30d.created ? Math.round((s.funnel30d.paid / s.funnel30d.created) * 100) : 0;
  root.append(
    h(
      'div',
      { class: 'stats stats--5' },
      h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Today'), h('span', { class: 'value' }, usd(s.revenue.today))),
      h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Last 7 days'), h('span', { class: 'value' }, usd(s.revenue.d7))),
      h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Last 30 days'), h('span', { class: 'value' }, usd(s.revenue.d30))),
      h('div', { class: 'stat' }, h('span', { class: 'label' }, 'All time'), h('span', { class: 'value' }, usd(s.revenue.total)), h('span', { class: 'sub' }, `${fmtInt(s.revenue.paid)} paid orders`)),
      h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Active licenses'), h('span', { class: 'value' }, fmtInt(s.activeLicenses)), h('span', { class: 'sub' }, `30-day checkout conversion ${conv}%`)),
    ),
  );

  const days = [];
  const today = Math.floor(Date.now() / 86400000) * 86400000;
  const byDay = new Map(s.daily.map((d) => [d.day, d.usd]));
  for (let i = 29; i >= 0; i--) {
    const day = today - i * 86400000;
    days.push({ label: dateShort(day), short: new Date(day).getUTCDate() % 5 === 0 ? String(new Date(day).getUTCDate()) : '', value: byDay.get(day) || 0 });
  }
  root.append(h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('div', null, h('h3', null, 'Revenue, last 30 days'), h('p', null, 'USD, by UTC day of payment'))), barChart(days, { title: 'Revenue', valueLabel: (v) => usd(v), ariaLabel: 'Revenue per day' })));

  // Visitors (anonymous daily counters from /api/hit).
  const st = await api('/api/admin/stats', { headers: auth() }).catch(() => null);
  if (st) {
    const viewsByDay = new Map(st.daily.map((d) => [d.day, d.n]));
    const vdays = [];
    for (let i = 29; i >= 0; i--) {
      const day = today - i * 86400000;
      vdays.push({ label: dateShort(day), short: new Date(day).getUTCDate() % 5 === 0 ? String(new Date(day).getUTCDate()) : '', value: viewsByDay.get(day) || 0 });
    }
    const ev = st.events;
    const pctOf = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
    const list = (title, rows) => h('div', null, h('h4', { style: { margin: '0 0 8px' } }, title), rows.length ? h('div', { class: 'rows' }, rows.map((r) => h('div', { class: 'row' }, h('div', { class: 'who' }, h('b', null, r.key)), h('span', { class: 'badge badge--muted' }, fmtInt(r.n))))) : h('p', { class: 'small text-2' }, 'No data yet.'));
    root.append(
      h(
        'section',
        { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', null, h('h3', null, 'Visitors, last 30 days'), h('p', null, 'Anonymous counters — no cookies, no IPs. Visitors with Do Not Track are not counted.'))),
        h(
          'div',
          { class: 'stats stats--5' },
          h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Page views'), h('span', { class: 'value' }, fmtInt(ev.view || 0))),
          h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Demos opened'), h('span', { class: 'value' }, fmtInt(ev.demo || 0)), h('span', { class: 'sub' }, `${pctOf(ev.demo || 0, ev.view || 0)} of views`)),
          h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Exports analyzed'), h('span', { class: 'value' }, fmtInt(ev.analyze || 0)), h('span', { class: 'sub' }, `${pctOf(ev.analyze || 0, ev.view || 0)} of views`)),
          h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Checkouts opened'), h('span', { class: 'value' }, fmtInt(ev.checkout || 0)), h('span', { class: 'sub' }, `${pctOf(ev.checkout || 0, ev.analyze || 0)} of analyses`)),
          h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Orders paid'), h('span', { class: 'value' }, fmtInt(s.funnel30d.paid)), h('span', { class: 'sub' }, `${pctOf(s.funnel30d.paid, ev.checkout || 0)} of checkouts`)),
        ),
        barChart(vdays, { title: 'Page views', ariaLabel: 'Page views per day' }),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginTop: '18px' } }, list('Top pages', st.pages), list('Where visitors come from', st.refs), list('Languages', st.langs)),
      ),
    );
  }

  const hl = s.health;
  const cronAge = hl.cronLastRun ? Math.round((Date.now() - hl.cronLastRun) / 60000) : null;
  root.append(
    h(
      'section',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h3', null, 'Health check'), h('p', null, 'Everything here should be green before you promote the site.'))),
      h(
        'div',
        { class: 'rows' },
        healthRow('Site URL', /^https:\/\//.test(hl.siteUrl) && !/your-domain/.test(hl.siteUrl), hl.siteUrl),
        healthRow('USDT (TRC20) wallet', hl.tron, hl.tronAddress ? `${hl.tronAddress}${hl.tron ? '' : ' — invalid address!'}` : 'TRON_ADDRESS not set', !hl.tronAddress && hl.nowpayments),
        healthRow('TronGrid API key', hl.tronApiKey, hl.tronApiKey ? 'Set' : 'Recommended for reliable payment detection', true),
        healthRow('NOWPayments (150+ coins)', hl.nowpayments, hl.nowpayments ? 'API key + IPN secret set' : 'Not configured', true),
        healthRow('License e-mails', hl.email, hl.email ? 'Resend configured' : 'Not configured — buyers rely on the key shown after payment', true),
        healthRow('Cron (payment watcher)', cronAge !== null && cronAge <= 3, cronAge === null ? 'Has not run yet' : `Last run ${cronAge} min ago`),
        healthRow('Dev mode', !hl.devMode, hl.devMode ? 'DEV_MODE is on — anyone can fake payments! Turn it off in production.' : 'Off'),
      ),
    ),
  );

  // Orders
  const statusSel = h('select', { class: 'select', 'aria-label': 'Filter orders' }, ['all', 'pending', 'paid', 'expired', 'failed'].map((v) => h('option', { value: v }, v)));
  const tableBox = h('div', { class: 'table-wrap', style: { maxHeight: '520px' } });
  const drawOrders = (list) => {
    clear(tableBox).append(
      h(
        'table',
        { class: 'data-table' },
        h('thead', null, h('tr', null, ['Created', 'Order', 'Plan', 'Method', 'Amount', 'Status', 'License', ''].map((t) => h('th', null, t)))),
        h(
          'tbody',
          null,
          list.map((o) => {
            const mark = o.status !== 'paid' ? h('button', { class: 'row-btn', type: 'button' }, 'Mark paid') : null;
            mark?.addEventListener('click', async () => {
              if (!confirm(`Mark order ${o.id} as paid and issue a license?`)) return;
              await api('/api/admin/orders/mark-paid', { method: 'POST', headers: auth(), body: { id: o.id } });
              toast('Order marked as paid');
              load();
            });
            return h('tr', null, h('td', null, new Date(o.createdAt).toLocaleString('en-US')), h('td', { class: 'mono' }, o.id), h('td', null, o.plan), h('td', null, o.method), h('td', null, o.amount ? `${o.amount} USDT` : usd(o.priceUsd)), h('td', null, o.status), h('td', { class: 'mono' }, o.licenseKey || ''), h('td', null, mark));
          }),
        ),
      ),
    );
  };
  drawOrders(orders.orders);
  statusSel.addEventListener('change', async () => {
    const q = statusSel.value === 'all' ? '' : `&status=${statusSel.value}`;
    drawOrders((await api(`/api/admin/orders?limit=200${q}`, { headers: auth() })).orders);
  });
  root.append(h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('div', null, h('h3', null, 'Orders'), h('p', null, Object.entries(s.statuses).map(([k, v]) => `${k}: ${v}`).join(' · '))), statusSel), tableBox));

  // License tools
  const planSel = h('select', { class: 'select', 'aria-label': 'Plan' }, s.plans.map((p) => h('option', { value: p.id }, `${p.name} — $${p.priceUsd}`)));
  const note = h('input', { class: 'input', placeholder: 'Note (e.g. influencer giveaway)', 'aria-label': 'Note' });
  const email = h('input', { class: 'input', type: 'email', placeholder: 'E-mail (optional)', 'aria-label': 'E-mail' });
  const create = h('button', { class: 'btn btn--primary', type: 'button' }, 'Create license');
  const created = h('div');
  create.addEventListener('click', async () => {
    const res = await api('/api/admin/licenses', { method: 'POST', headers: auth(), body: { plan: planSel.value, note: note.value, email: email.value || undefined } });
    const copy = h('button', { class: 'copy-btn', type: 'button' }, 'Copy');
    copy.addEventListener('click', () => copyText(res.license.key, copy));
    clear(created).append(h('div', { class: 'pay-line', style: { marginTop: '12px' } }, h('span', { class: 'k' }, 'New key'), h('span', { class: 'v' }, res.license.key), copy));
  });
  const revokeInput = h('input', { class: 'input mono', placeholder: 'UNW-XXXX-XXXX-XXXX-XXXX', 'aria-label': 'License to revoke' });
  const revoke = h('button', { class: 'btn btn--ghost', type: 'button' }, 'Revoke');
  revoke.addEventListener('click', async () => {
    if (!revokeInput.value.trim() || !confirm('Revoke this license?')) return;
    try {
      await api('/api/admin/licenses/revoke', { method: 'POST', headers: auth(), body: { key: revokeInput.value.trim() } });
      toast('License revoked');
    } catch {
      toast('License not found', { iconName: 'warning' });
    }
  });
  root.append(
    h(
      'div',
      { class: 'panels panels--2' },
      h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('div', null, h('h3', null, 'Give away a license'), h('p', null, 'For influencers, partners and support cases.'))), h('div', { class: 'stack', style: { '--stack': '10px' } }, planSel, note, email, create, created)),
      h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('div', null, h('h3', null, 'Revoke a license'), h('p', null, 'Stops the key from activating or refreshing.'))), h('div', { class: 'stack', style: { '--stack': '10px' } }, revokeInput, revoke)),
    ),
  );

  root.append(
    h(
      'section',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h3', null, 'Event log'), h('p', null, 'Latest 100 events (payments, webhooks, manual actions)'))),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data-table' }, h('tbody', null, events.events.map((e) => h('tr', null, h('td', null, new Date(e.ts).toLocaleString('en-US')), h('td', null, e.kind), h('td', { class: 'mono' }, e.ref || ''), h('td', { class: 'small muted' }, (e.data || '').slice(0, 160))))))),
      h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => { sessionStorage.removeItem(KEY); login(); } }, 'Sign out')),
    ),
  );
}

load();
