// White-label client report (Creator): a one-page audit with the user's own
// brand. "Download PDF" uses the browser's print-to-PDF, so nothing is uploaded.

import { h, icon, clear, toast } from '../lib/ui.js';
import { fmtInt, pct, dateShort, hourLabel } from '../lib/format.js';
import { relationships } from '../core/insights.js';
import { growthTimeline, audienceQuality, engagementAudit, bestTimesFor } from '../core/lab.js';
import { viewHead, panel, lockCard } from './components.js';

const STORE = 'unw.report.v1';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
  if (q?.likely.length) recs.push(`Remove ${fmtInt(q.likely.length)} likely bot or spam followers (${pct(q.likely.length / q.total, 1)} of the audience) to protect reach and engagement rate.`);
  if (b?.top[0]) recs.push(`Publish around ${windowLabel(b.top[0])}${b.top[1] ? ` and ${windowLabel(b.top[1])}` : ''} (local time).`);
  if (a?.dead.length > 20) recs.push(`Unfollow part of the ${fmtInt(a.dead.length)} accounts the profile never interacts with, to keep the feed and suggestions relevant.`);
  if (rel.following > 100 && rel.followBackRate < 0.5) recs.push(`Only ${pct(rel.followBackRate)} of followed accounts follow back — review the “not following back” list.`);
  if (g.churn30 != null && g.churn30 > 0.03) recs.push(`Monthly follower churn is ${pct(g.churn30, 1)} — a steadier posting rhythm helps keep new followers.`);
  if (!recs.length) recs.push('The account is healthy. Keep the current rhythm and repeat this audit every month.');

  return h(
    'article',
    { class: 'report-sheet' },
    h(
      'header',
      { class: 'rs-head' },
      h('div', null, h('div', { class: 'rs-brand' }, brand || 'Unwrapped'), h('h1', null, 'Social media audit'), h('p', null, `${client} · ${ds.label} · ${dateShort(Date.now())}`)),
      q ? h('div', { class: 'rs-grade' }, h('span', null, 'Audience'), h('b', null, q.grade), h('small', null, `${q.score}/100`)) : null,
    ),
    section(
      'Audience at a glance',
      h(
        'div',
        { class: 'rs-grid' },
        kpi('Followers', fmtInt(rel.followers)),
        kpi('Following', fmtInt(rel.following)),
        kpi('Mutuals', fmtInt(rel.mutuals.length)),
        kpi('Follow-back rate', pct(rel.followBackRate)),
        kpi('Not following back', fmtInt(rel.notFollowingBack.length)),
        kpi('Fans', fmtInt(rel.fans.length), 'follow, not followed back'),
      ),
    ),
    section(
      'Growth',
      h(
        'div',
        { class: 'rs-grid' },
        kpi('New followers · 30 days', g.hasDates ? fmtInt(g.last30) : '—'),
        kpi('New followers · 90 days', g.hasDates ? fmtInt(g.last90) : '—'),
        kpi('Monthly churn', g.churn30 == null ? '—' : pct(g.churn30, 1)),
        kpi('Organic discovery', fmtInt(g.theyFirst), 'followed before being followed'),
      ),
    ),
    q
      ? section(
          'Audience quality',
          h(
            'div',
            { class: 'rs-grid' },
            kpi('Quality score', `${q.score}/100`, `grade ${q.grade}`),
            kpi('Likely bots or spam', fmtInt(q.likely.length), pct(q.likely.length / q.total, 1)),
            kpi('Suspicious', fmtInt(q.suspicious.length), pct(q.suspicious.length / q.total, 1)),
            kpi('Follow spikes', fmtInt(q.bursts.length), 'unusual waves of followers'),
          ),
        )
      : null,
    b
      ? section(
          'Best time to post',
          h('ol', { class: 'rs-list' }, b.top.map((w) => h('li', null, windowLabel(w)))),
          h('p', { class: 'rs-note' }, b.mode === 'engagement' ? `From the engagement of ${fmtInt(b.samples)} original posts.` : 'From when the audience follows and messages the account.'),
        )
      : null,
    a
      ? section(
          'Engagement',
          h(
            'div',
            { class: 'rs-grid' },
            kpi('Accounts engaged with', fmtInt(a.engaged)),
            kpi('One-way engagement', pct(a.oneWayShare), 'to accounts that don’t follow back'),
            kpi('Dead follows', fmtInt(a.dead.length), pct(a.deadShare)),
            kpi('Real circle', fmtInt(a.circle.length), 'engaged mutuals'),
          ),
        )
      : null,
    section('Recommendations', h('ol', { class: 'rs-list' }, recs.map((r) => h('li', null, r)))),
    note ? section('Notes', h('p', { class: 'rs-text' }, note)) : null,
    h('footer', { class: 'rs-foot' }, h('span', null, brand ? `Prepared by ${brand}` : 'Prepared with Unwrapped'), h('span', null, `Official ${ds.label} data export of ${dateShort(ds.exportedAt)} · processed on-device`)),
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
  const brand = h('input', { class: 'input', type: 'text', id: 'rp-brand', maxlength: '60', placeholder: 'Your brand or agency', value: loadPrefs().brand || '' });
  const client = h('input', { class: 'input', type: 'text', id: 'rp-client', maxlength: '80', value: handle });
  const note = h('textarea', { class: 'input', id: 'rp-note', rows: '4', maxlength: '600', placeholder: 'Optional notes for your client…' });
  const preview = h('div', { class: `report-preview${can ? '' : ' is-sample'}` });
  const opts = () => ({ brand: brand.value.trim(), client: client.value.trim() || handle, note: note.value.trim() });
  const draw = () => clear(preview).append(buildReport(ds, ctx, opts()));
  for (const el of [brand, client, note]) {
    el.addEventListener('input', () => {
      savePrefs({ brand: brand.value.trim() });
      draw();
    });
  }
  const pdf = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('download'), 'Download PDF');
  pdf.addEventListener('click', () => {
    if (!can) return ctx.upgrade('report');
    toast('Choose “Save as PDF” in the print dialog', { iconName: 'report', timeout: 4000 });
    printSheet(buildReport(ds, ctx, opts()));
  });
  draw();
  return h(
    'div',
    { class: 'app-content' },
    viewHead('Client report', 'A clean one-page audit with your own brand on it — for clients, sponsors or your own records. Saved as a PDF by your browser, never uploaded.', pdf),
    h(
      'div',
      { class: 'panels panels--3-2' },
      panel({ title: 'Preview' }, preview),
      panel(
        { title: 'Branding', text: 'Your brand replaces ours everywhere on the report.' },
        h(
          'div',
          { class: 'stack', style: { '--stack': '14px' } },
          h('div', { class: 'field' }, h('label', { for: 'rp-brand' }, 'Brand on the report'), brand),
          h('div', { class: 'field' }, h('label', { for: 'rp-client' }, 'Prepared for'), client),
          h('div', { class: 'field' }, h('label', { for: 'rp-note' }, 'Notes'), note),
          can
            ? null
            : lockCard({ tier: 'creator', title: 'White-label reports are part of Creator', text: 'Put your own brand on a professional audit and send it to clients or sponsors as a PDF.', onUpgrade: () => ctx.upgrade('report') }),
        ),
      ),
    ),
  );
}
