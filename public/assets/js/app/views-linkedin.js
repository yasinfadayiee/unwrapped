import { h } from '../lib/ui.js';
import { fmtInt, dateShort } from '../lib/format.js';
import { byMonth } from '../core/insights.js';
import { viewHead, stat, panel, insights, userList, dataNote } from './components.js';
import { barChart, rankList } from './charts.js';
import { t as tl } from '../lib/i18n.js';
import { actionPlan } from './action-plan.js';

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
    viewHead(ds.account.name || tl('LinkedIn'), ds.account.headline || tl('LinkedIn export from {v0}', { v0: dateShort(ds.exportedAt) })),
    h(
      'div',
      { class: 'stats' },
      stat({ label: tl('Connections'), value: fmtInt(ds.connections.length), onClick: () => ctx.go('connections') }),
      stat({ label: tl('New in the last 90 days'), value: fmtInt(recent) }),
      stat({ label: tl('Companies'), value: fmtInt(ds.companies.length >= 30 ? 30 : ds.companies.length), sub: ds.companies.length >= 30 ? 'top 30 shown' : '' }),
      stat({ label: tl('Share their e-mail'), value: fmtInt(ds.emailsShared) }),
    ),
    actionPlan(ds, ctx),
    bars.length > 1 ? panel({ title: tl('Network growth'), text: tl('Connections added per year') }, barChart(bars, { title: tl('Connections'), ariaLabel: tl('Connections per year') })) : null,
    h(
      'div',
      { class: 'panels panels--2' },
      panel({ title: tl('Where your network works') }, rankList(ds.companies, { limit })),
      panel({ title: tl('What your network does') }, rankList(ds.roles, { limit: 10, color: 'var(--c3)' })),
    ),
    panel(
      null,
      insights([
        recruiters && { icon: 'briefcase', title: tl('{v0} recruiters & HR people', { v0: fmtInt(recruiters) }), text: tl('Your shortcut when you’re job hunting.') },
        founders && { icon: 'rocket', title: tl('{v0} founders & CEOs', { v0: fmtInt(founders) }), text: tl('Decision makers one message away.') },
        ds.invitations.sent && { icon: 'send', title: tl('{v0} invitations sent', { v0: fmtInt(ds.invitations.sent) }), text: tl('{v0} received.', { v0: fmtInt(ds.invitations.received) }) },
      ]),
    ),
    dataNote(ds),
  );
}

export function linkedinViews(ds, ctx) {
  return [
    { id: 'overview', label: tl('Network map'), icon: 'home', render: () => overview(ds, ctx) },
    {
      id: 'connections',
      label: tl('Connections'),
      icon: 'users',
      count: ds.connections.length,
      render: () =>
        h(
          'div',
          { class: 'app-content' },
          viewHead(tl('Connections'), tl('{v0} people, newest first.', { v0: fmtInt(ds.connections.length) })),
          panel(null, userList({ platform: 'linkedin', items: ds.connections, ctx, subFor: (c) => [c.position, c.company].filter(Boolean).join(' at ') || (c.ts ? tl('Connected {v0}', { v0: dateShort(c.ts) }) : ''), exportName: 'linkedin-connections' })),
        ),
    },
  ];
}
