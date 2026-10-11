import { h } from '../lib/ui.js';
import { fmtInt, dateShort } from '../lib/format.js';
import { byMonth } from '../core/insights.js';
import { viewHead, stat, panel, insights, userList, dataNote } from './components.js';
import { barChart, rankList } from './charts.js';

function overview(ds, ctx) {
  const years = new Map();
  for (const m of byMonth(ds.connections.map((c) => c.ts))) years.set(m.month.slice(0, 4), (years.get(m.month.slice(0, 4)) || 0) + m.count);
  const bars = [...years.entries()].map(([y, v]) => ({ label: y, value: v }));
  const recent = ds.connections.filter((c) => c.ts > (ds.exportedAt || Date.now()) - 90 * 864e5).length;
  const recruiters = ds.roles.find((r) => r.key === 'Recruiters & HR')?.count || 0;
  const founders = ds.roles.find((r) => r.key === 'Founders & CEOs')?.count || 0;
  const limit = ctx.pro || ctx.demo ? 15 : 5;
  return h(
    'div',
    { class: 'app-content' },
    viewHead(ds.account.name || 'LinkedIn', ds.account.headline || `LinkedIn export from ${dateShort(ds.exportedAt)}`),
    h(
      'div',
      { class: 'stats' },
      stat({ label: 'Connections', value: fmtInt(ds.connections.length), onClick: () => ctx.go('connections') }),
      stat({ label: 'New in the last 90 days', value: fmtInt(recent) }),
      stat({ label: 'Companies', value: fmtInt(ds.companies.length >= 30 ? 30 : ds.companies.length), sub: ds.companies.length >= 30 ? 'top 30 shown' : '' }),
      stat({ label: 'Share their e-mail', value: fmtInt(ds.emailsShared) }),
    ),
    bars.length > 1 ? panel({ title: 'Network growth', text: 'Connections added per year' }, barChart(bars, { title: 'Connections', ariaLabel: 'Connections per year' })) : null,
    h(
      'div',
      { class: 'panels panels--2' },
      panel({ title: 'Where your network works' }, rankList(ds.companies, { limit })),
      panel({ title: 'What your network does' }, rankList(ds.roles, { limit: 10, color: 'var(--c3)' })),
    ),
    panel(
      null,
      insights([
        recruiters && { icon: 'briefcase', title: `${fmtInt(recruiters)} recruiters & HR people`, text: 'Your shortcut when you’re job hunting.' },
        founders && { icon: 'rocket', title: `${fmtInt(founders)} founders & CEOs`, text: 'Decision makers one message away.' },
        ds.invitations.sent && { icon: 'send', title: `${fmtInt(ds.invitations.sent)} invitations sent`, text: `${fmtInt(ds.invitations.received)} received.` },
      ]),
    ),
    dataNote(ds),
  );
}

export function linkedinViews(ds, ctx) {
  return [
    { id: 'overview', label: 'Network map', icon: 'home', render: () => overview(ds, ctx) },
    {
      id: 'connections',
      label: 'Connections',
      icon: 'users',
      count: ds.connections.length,
      render: () =>
        h(
          'div',
          { class: 'app-content' },
          viewHead('Connections', `${fmtInt(ds.connections.length)} people, newest first.`),
          panel(null, userList({ platform: 'linkedin', items: ds.connections, ctx, subFor: (c) => [c.position, c.company].filter(Boolean).join(' at ') || (c.ts ? `Connected ${dateShort(c.ts)}` : ''), exportName: 'linkedin-connections' })),
        ),
    },
  ];
}
