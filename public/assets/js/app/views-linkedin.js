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
        ds.inbox?.unanswered.length && { icon: 'message', title: tl('{v0} messages you never answered', { v0: fmtInt(ds.inbox.unanswered.length) }), text: tl('Opportunities often hide in old messages.') },
        ds.quiet != null && ds.connections.length && { icon: 'users', title: tl('{v0}% of your network you’ve never messaged', { v0: Math.round((ds.quiet / ds.connections.length) * 100) }), text: tl('{v0} quiet connections worth a hello.', { v0: fmtInt(ds.quiet) }) },
        ds.invitations.sent && { icon: 'send', title: tl('{v0} invitations sent', { v0: fmtInt(ds.invitations.sent) }), text: tl('{v0} received.', { v0: fmtInt(ds.invitations.received) }) },
      ]),
    ),
    dataNote(ds),
  );
}

function inboxView(ds, ctx) {
  const ib = ds.inbox;
  const full = ctx.pro || ctx.demo;
  return h(
    'div',
    { class: 'app-content' },
    viewHead(tl('Inbox insights'), tl('Who you talk to on LinkedIn, and who is still waiting for an answer.')),
    h(
      'div',
      { class: 'stats' },
      stat({ label: tl('Conversations'), value: fmtInt(ib.conversations) }),
      stat({ label: tl('Messages sent'), value: fmtInt(ib.sent) }),
      stat({ label: tl('Messages received'), value: fmtInt(ib.received) }),
      stat({ label: tl('Never answered'), value: fmtInt(ib.unanswered.length) }),
    ),
    panel({ title: tl('Who you talk to most') }, rankList(ib.people.map((p) => ({ key: p.name, count: p.sent + p.received })), { limit: full ? 20 : 5 })),
    panel({ title: tl('Never answered'), text: tl('People who wrote to you and never got a reply, newest first.') }, userList({ platform: 'linkedin', items: ib.unanswered, ctx, subFor: (c) => (c.ts ? tl('Wrote {v0}', { v0: dateShort(c.ts) }) : ''), exportName: 'linkedin-unanswered', emptyText: tl('You answered everyone. Impressive.') })),
  );
}

function recruitersView(ds, ctx) {
  const companies = new Map();
  for (const r of ds.recruiters) if (r.company) companies.set(r.company, (companies.get(r.company) || 0) + 1);
  return h(
    'div',
    { class: 'app-content' },
    viewHead(tl('Recruiters in your network'), tl('{v0} recruiters and HR people you can message directly.', { v0: fmtInt(ds.recruiters.length) })),
    companies.size ? panel({ title: tl('Companies with a recruiter in your network') }, rankList([...companies.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count })), { limit: 10, color: 'var(--c3)' })) : null,
    panel(null, userList({ platform: 'linkedin', items: ds.recruiters, ctx, subFor: (c) => [c.position, c.company].filter(Boolean).join(' at '), exportName: 'linkedin-recruiters' })),
  );
}

function profileView(ds) {
  const years = Object.entries(ds.posting.byYear).sort().map(([label, value]) => ({ label, value }));
  const yr = (ts) => (ts ? new Date(ts).getFullYear() : tl('now'));
  return h(
    'div',
    { class: 'app-content' },
    viewHead(tl('Your profile & activity'), tl('Your career, skills and what you post — from your export.')),
    h(
      'div',
      { class: 'stats' },
      stat({ label: tl('Posts'), value: fmtInt(ds.posting.posts) }),
      stat({ label: tl('Reactions given'), value: fmtInt(ds.posting.reactions) }),
      stat({ label: tl('Comments'), value: fmtInt(ds.posting.comments) }),
      stat({ label: tl('Skills'), value: fmtInt(ds.skills.length) }),
    ),
    years.length > 1 ? panel({ title: tl('Posts per year') }, barChart(years, { title: tl('Posts'), ariaLabel: tl('Posts per year') })) : null,
    h(
      'div',
      { class: 'panels panels--2' },
      ds.career.length ? panel({ title: tl('Career') }, h('div', { class: 'rows' }, ds.career.map((p) => h('div', { class: 'rank-row' }, h('div', { class: 'lbl' }, h('b', null, p.title || p.company), h('span', { class: 'text-2' }, `${p.company} · ${p.from ? new Date(p.from).getFullYear() : ''}–${yr(p.to)}`)))))) : null,
      ds.skills.length ? panel({ title: tl('Most endorsed skills') }, rankList(ds.skills, { limit: 10, color: 'var(--c2)' })) : null,
    ),
  );
}

export function linkedinViews(ds, ctx) {
  const extra = [];
  if (ds.inbox) extra.push({ id: 'inbox', label: tl('Inbox insights'), icon: 'message', count: ds.inbox.unanswered.length || undefined, render: () => inboxView(ds, ctx) });
  if (ds.recruiters?.length) extra.push({ id: 'recruiters', label: tl('Recruiters'), icon: 'briefcase', count: ds.recruiters.length, render: () => recruitersView(ds, ctx) });
  if (ds.career?.length || ds.skills?.length || ds.posting?.posts) extra.push({ id: 'profile', label: tl('Profile & activity'), icon: 'star', render: () => profileView(ds) });
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
    ...extra,
  ];
}
