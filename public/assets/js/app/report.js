// White-label client report (Creator): a one-page audit with the user's own
// brand. "Download PDF" uses the browser's print-to-PDF, so nothing is uploaded.

import { h, icon, clear, toast } from '../lib/ui.js';
import { fmtInt, pct, dateShort, hourLabel } from '../lib/format.js';
import { relationships } from '../core/insights.js';
import { growthTimeline, audienceQuality, engagementAudit, bestTimesFor } from '../core/lab.js';
import { viewHead, panel, lockCard } from './components.js';
import { t as tl } from '../lib/i18n.js';

const STORE = 'unw.report.v1';
const DAYS = [tl('Mon'), tl('Tue'), tl('Wed'), tl('Thu'), tl('Fri'), tl('Sat'), tl('Sun')];

export const windowLabel = (w) => `${DAYS[w.day]} ${hourLabel(w.hour)}–${hourLabel((w.hour + 2) % 24)}`;

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}');
  } catch {
    return {};
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORE, JSON.stringify(prefs));
  } catch {
    /* private mode */
  }
}

export function buildReport(ds, ctx, { brand, client, note }) {
  const rel = relationships(ds);
  const g = growthTimeline(ds, ctx.snapshots || []);
  const q = ds.platform === 'x' ? null : audienceQuality(ds.lists.followers);
  const b = bestTimesFor(ds);
  const a = ds.platform === 'instagram' && ds.activity ? engagementAudit(ds) : null;
  const kpi = (label, value, sub) => h('div', { class: 'rs-kpi' }, h('span', null, label), h('b', null, value), sub ? h('small', null, sub) : null);
  const section = (title, ...children) => h('section', null, h('h2', null, title), children);

  const recs = [];
  if (q?.likely.length) recs.push(tl('Remove {v0} likely bot or spam followers ({v1} of the audience) to protect reach and engagement rate.', { v0: fmtInt(q.likely.length), v1: pct(q.likely.length / q.total, 1) }));
  if (b?.top[0]) recs.push(b.top[1] ? tl('Publish around {v0} and {v1} (local time).', { v0: windowLabel(b.top[0]), v1: windowLabel(b.top[1]) }) : tl('Publish around {v0} (local time).', { v0: windowLabel(b.top[0]) }));
  if (a?.dead.length > 20) recs.push(tl('Unfollow part of the {v0} accounts the profile never interacts with, to keep the feed and suggestions relevant.', { v0: fmtInt(a.dead.length) }));
  if (rel.following > 100 && rel.followBackRate < 0.5) recs.push(tl('Only {v0} of followed accounts follow back — review the “not following back” list.', { v0: pct(rel.followBackRate) }));
  if (g.churn30 != null && g.churn30 > 0.03) recs.push(tl('Monthly follower churn is {v0} — a steadier posting rhythm helps keep new followers.', { v0: pct(g.churn30, 1) }));
  if (!recs.length) recs.push(tl('The account is healthy. Keep the current rhythm and repeat this audit every month.'));

  return h(
    'article',
    { class: 'report-sheet' },
    h(
      'header',
      { class: 'rs-head' },
      h('div', null, h('div', { class: 'rs-brand' }, brand || tl('Unwrapped')), h('h1', null, tl('Social media audit')), h('p', null, `${client} · ${ds.label} · ${dateShort(Date.now())}`)),
      q ? h('div', { class: 'rs-grade' }, h('span', null, tl('Audience')), h('b', null, q.grade), h('small', null, `${q.score}/100`)) : null,
    ),
    section(
      tl('Audience at a glance'),
      h(
        'div',
        { class: 'rs-grid' },
        kpi(tl('Followers'), fmtInt(rel.followers)),
        kpi(tl('Following'), fmtInt(rel.following)),
        kpi(tl('Mutuals'), fmtInt(rel.mutuals.length)),
        kpi(tl('Follow-back rate'), pct(rel.followBackRate)),
        kpi(tl('Not following back'), fmtInt(rel.notFollowingBack.length)),
        kpi(tl('Fans'), fmtInt(rel.fans.length), tl('follow, not followed back')),
      ),
    ),
    section(
      tl('Growth'),
      h(
        'div',
        { class: 'rs-grid' },
        kpi(tl('New followers · 30 days'), g.hasDates ? fmtInt(g.last30) : '—'),
        kpi(tl('New followers · 90 days'), g.hasDates ? fmtInt(g.last90) : '—'),
        kpi(tl('Monthly churn'), g.churn30 == null ? '—' : pct(g.churn30, 1)),
        kpi(tl('Organic discovery'), fmtInt(g.theyFirst), tl('followed before being followed')),
      ),
    ),
    q
      ? section(
          tl('Audience quality'),
          h(
            'div',
            { class: 'rs-grid' },
            kpi(tl('Quality score'), `${q.score}/100`, tl('grade {v0}', { v0: q.grade })),
            kpi(tl('Likely bots or spam'), fmtInt(q.likely.length), pct(q.likely.length / q.total, 1)),
            kpi(tl('Suspicious'), fmtInt(q.suspicious.length), pct(q.suspicious.length / q.total, 1)),
            kpi(tl('Follow spikes'), fmtInt(q.bursts.length), tl('unusual waves of followers')),
          ),
        )
      : null,
    b
      ? section(
          tl('Best time to post'),
          h('ol', { class: 'rs-list' }, b.top.map((w) => h('li', null, windowLabel(w)))),
          h('p', { class: 'rs-note' }, b.mode === 'engagement' ? tl('From the engagement of {v0} original posts.', { v0: fmtInt(b.samples) }) : tl('From when the audience follows and messages the account.')),
        )
      : null,
    a
      ? section(
          tl('Engagement'),
          h(
            'div',
            { class: 'rs-grid' },
            kpi(tl('Accounts engaged with'), fmtInt(a.engaged)),
            kpi(tl('One-way engagement'), pct(a.oneWayShare), tl('to accounts that don’t follow back')),
            kpi(tl('Dead follows'), fmtInt(a.dead.length), pct(a.deadShare)),
            kpi(tl('Real circle'), fmtInt(a.circle.length), tl('engaged mutuals')),
          ),
        )
      : null,
    section(tl('Recommendations'), h('ol', { class: 'rs-list' }, recs.map((r) => h('li', null, r)))),
    note ? section(tl('Notes'), h('p', { class: 'rs-text' }, note)) : null,
    h('footer', { class: 'rs-foot' }, h('span', null, brand ? tl('Prepared by {v0}', { v0: brand }) : tl('Prepared with Unwrapped')), h('span', null, tl('Official {v0} data export of {v1} · processed on-device', { v0: ds.label, v1: dateShort(ds.exportedAt) }))),
  );
}

function printSheet(sheet) {
  document.querySelector('.report-print')?.remove();
  const holder = h('div', { class: 'report-print' }, sheet);
  document.body.append(holder);
  document.body.classList.add('printing');
  window.addEventListener(
    'afterprint',
    () => {
      holder.remove();
      document.body.classList.remove('printing');
    },
    { once: true },
  );
  window.print();
}

export function reportView(ds, ctx) {
  const can = ctx.can('report');
  const handle = ds.account?.username ? `@${ds.account.username}` : ds.label;
  const brand = h('input', { class: 'input', type: 'text', id: 'rp-brand', maxlength: '60', placeholder: tl('Your brand or agency'), value: loadPrefs().brand || '' });
  const client = h('input', { class: 'input', type: 'text', id: 'rp-client', maxlength: '80', value: handle });
  const note = h('textarea', { class: 'input', id: 'rp-note', rows: '4', maxlength: '600', placeholder: tl('Optional notes for your client…') });
  const preview = h('div', { class: `report-preview${can ? '' : ' is-sample'}` });
  const opts = () => ({ brand: brand.value.trim(), client: client.value.trim() || handle, note: note.value.trim() });
  const draw = () => clear(preview).append(buildReport(ds, ctx, opts()));
  for (const el of [brand, client, note]) {
    el.addEventListener('input', () => {
      savePrefs({ brand: brand.value.trim() });
      draw();
    });
  }
  const pdf = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('download'), tl('Download PDF'));
  pdf.addEventListener('click', () => {
    if (!can) return ctx.upgrade('report');
    toast(tl('Choose “Save as PDF” in the print dialog'), { iconName: 'report', timeout: 4000 });
    printSheet(buildReport(ds, ctx, opts()));
  });
  draw();
  return h(
    'div',
    { class: 'app-content' },
    viewHead(tl('Client report'), tl('A clean one-page audit with your own brand on it — for clients, sponsors or your own records. Saved as a PDF by your browser, never uploaded.'), pdf),
    h(
      'div',
      { class: 'panels panels--3-2' },
      panel({ title: tl('Preview') }, preview),
      panel(
        { title: tl('Branding'), text: tl('Your brand replaces ours everywhere on the report.') },
        h(
          'div',
          { class: 'stack', style: { '--stack': '14px' } },
          h('div', { class: 'field' }, h('label', { for: 'rp-brand' }, tl('Brand on the report')), brand),
          h('div', { class: 'field' }, h('label', { for: 'rp-client' }, tl('Prepared for')), client),
          h('div', { class: 'field' }, h('label', { for: 'rp-note' }, tl('Notes')), note),
          can
            ? null
            : lockCard({ tier: 'creator', title: tl('White-label reports are part of Creator'), text: tl('Put your own brand on a professional audit and send it to clients or sponsors as a PDF.'), onUpgrade: () => ctx.upgrade('report') }),
        ),
      ),
    ),
  );
}
