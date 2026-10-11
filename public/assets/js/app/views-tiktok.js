import { h, icon } from '../lib/ui.js';
import { fmtInt, dateShort, compact, hourLabel, monthLabel, duration } from '../lib/format.js';
import { watchStats, byMonth } from '../core/insights.js';
import { countBy as countMap, topN } from '../core/text.js';
import { viewHead, stat, panel, insights, emptyState, dataNote } from './components.js';
import { relationshipViews, relationshipStats, networkPanel, exposurePanel, tagCloud } from './views-common.js';
import { barChart, heatmapChart, rankList } from './charts.js';
import { wrappedView } from './views-wrapped.js';
import { privacyParts } from './wrapped.js';

function overview(ds, ctx) {
  const w = watchStats(ds.watch);
  const root = h('div', { class: 'app-content' });
  const a = ds.account;
  root.append(viewHead(a.username ? `@${a.username}` : 'TikTok', `TikTok export from ${dateShort(ds.exportedAt)}`));
  if (!w) {
    root.append(panel(null, emptyState('No watch history in this export. Request “All data” in JSON to get it.', 'clock')));
  } else {
    const days = w.hours / 24;
    root.append(
      h(
        'div',
        { class: 'stats' },
        stat({ hero: true, label: `Time on TikTok · ${dateShort(w.first)} – ${dateShort(w.last)}`, value: `${fmtInt(w.hours)} hours`, sub: `≈ ${Math.round(w.perDayMinutes)} minutes a day · ${days >= 1 ? `${days.toFixed(1)} full days nonstop` : 'less than a day nonstop'}` }),
        stat({ label: 'Videos watched', value: compact(w.videos), sub: `${Math.round(w.perDayVideos)} per day` }),
        stat({ label: 'Sessions', value: fmtInt(w.sessions), sub: `avg ${Math.round(w.avgSessionMinutes)} min` }),
        stat({ label: 'Longest binge', value: duration(w.longest.ms), sub: `${fmtInt(w.longest.count)} videos · ${dateShort(w.longest.start)}` }),
        stat({ label: 'Peak hour', value: hourLabel(w.peakHour), sub: `${Math.round(w.nightShare * 100)}% after midnight` }),
      ),
      panel(
        { title: 'When you scroll', text: 'Videos watched by weekday and hour (your local time)' },
        heatmapChart(w.heat, { unit: 'videos' }),
      ),
      panel(
        { title: `You’re a ${w.persona.title}` },
        insights([
          { icon: 'moon', title: w.persona.title, text: w.persona.line },
          { icon: 'flame', title: `Biggest day: ${fmtInt(w.topDay.count)} videos`, text: `On ${dateShort(new Date(`${w.topDay.day}T12:00:00`).getTime())}.` },
          { icon: 'calendar', title: `${fmtInt(w.streak)}-day streak`, text: `You opened TikTok on ${fmtInt(w.activeDays)} of ${fmtInt(w.spanDays)} days.` },
          { icon: 'film', title: `That’s about ${fmtInt(w.hours / 2)} movies`, text: 'If every two hours of scrolling were a feature film.' },
        ]),
      ),
    );
  }
  if (ds.hasRelationships) {
    const { tiles, rel } = relationshipStats(ds, ctx);
    root.append(tiles, networkPanel(ds, rel));
  }
  root.append(dataNote(ds));
  return root;
}

function habitsView(ds, ctx) {
  const w = watchStats(ds.watch);
  const root = h('div', { class: 'app-content' }, viewHead('Your habits', 'How your scrolling changed over time — and your biggest binges.'));
  if (!w) return root.appendChild(panel(null, emptyState('No watch history in this export.', 'clock'))) && root;
  const months = w.months.map((m) => ({ label: monthLabel(m.month), short: monthLabel(m.month, true), value: m.count }));
  const hours = w.byHour.map((v, i) => ({ label: hourLabel(i), short: i % 3 === 0 ? `${i}h` : '', value: v }));
  // Rebuild the top sessions for the list.
  const sorted = [...ds.watch].sort((a, b) => a - b);
  const sessions = [];
  let start = sorted[0];
  let prev = sorted[0];
  let count = 1;
  for (let i = 1; i <= sorted.length; i++) {
    const t = sorted[i];
    if (t === undefined || t - prev > 600_000) {
      sessions.push({ start, end: prev, count, ms: prev - start + 20_000 });
      start = t;
      count = 0;
    }
    count++;
    prev = t;
  }
  const top = sessions.sort((a, b) => b.ms - a.ms).slice(0, ctx.pro || ctx.demo ? 10 : 3);
  root.append(
    h('div', { class: 'panels panels--2' }, panel({ title: 'Videos by month' }, barChart(months, { title: 'Videos', ariaLabel: 'Videos watched by month' })), panel({ title: 'Videos by hour of day' }, barChart(hours, { title: 'Videos', ariaLabel: 'Videos by hour' }))),
    panel(
      { title: 'Your longest binges' },
      h(
        'div',
        { class: 'rows' },
        top.map((s, i) =>
          h(
            'div',
            { class: 'row' },
            h('span', { class: 'count-pill' }, `#${i + 1}`),
            h('div', { class: 'who' }, h('b', null, duration(s.ms)), h('span', null, `${fmtInt(s.count)} videos · ${new Date(s.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`)),
          ),
        ),
      ),
      !ctx.pro && !ctx.demo ? h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => ctx.upgrade('habits') }, icon('lock'), 'See your top 10 with Pro')) : null,
    ),
  );
  if (ds.likes.length) {
    const likeMonths = byMonth(ds.likes).map((m) => ({ label: monthLabel(m.month), short: monthLabel(m.month, true), value: m.count }));
    root.append(
      panel(
        { title: `Likes · ${fmtInt(ds.likes.length)}`, text: `You liked ${((ds.likes.length / Math.max(1, w.videos)) * 100).toFixed(1)}% of the videos you watched` },
        barChart(likeMonths, { title: 'Likes', ariaLabel: 'Likes by month', color: 'var(--c3)' }),
      ),
    );
  }
  return root;
}

function searchesView(ds, ctx) {
  const terms = countMap(ds.searches, (s) => s.term.toLowerCase());
  const top = topN(terms, 20);
  return h(
    'div',
    { class: 'app-content' },
    viewHead('Your searches', `${fmtInt(ds.searches.length)} searches in this export.`),
    ds.searches.length
      ? h(
          'div',
          { class: 'panels panels--2' },
          panel({ title: 'Most searched' }, rankList(top, { limit: ctx.pro || ctx.demo ? 20 : 5 })),
          panel({ title: 'Recent searches' }, tagCloud(ds.searches.map((s) => s.term), { locked: !ctx.pro && !ctx.demo, ctx, limit: 60 })),
        )
      : panel(null, emptyState('No searches found.', 'search')),
  );
}

function privacyView(ds, ctx) {
  const parts = privacyParts(ds) || { advertisers: 0, interests: 0, ips: 0, apps: 0 };
  const devices = countMap(ds.logins, (l) => l.device || 'Unknown device');
  const root = h('div', { class: 'app-content' }, viewHead('Privacy X-ray', 'What TikTok recorded about your logins and ad profile.'));
  root.append(
    exposurePanel(parts, [
      { icon: 'device', title: 'Review your devices', text: 'Settings → Security → Your devices — remove anything you don’t recognise.' },
      ds.offTiktok ? { icon: 'globe', title: `${fmtInt(ds.offTiktok)} activities from other apps & sites`, text: 'Settings → Privacy → Ads and data — limit off-TikTok activity.' } : null,
    ]),
    h(
      'div',
      { class: 'stats' },
      stat({ label: 'Logins recorded', value: fmtInt(ds.logins.length) }),
      stat({ label: 'IP addresses', value: fmtInt(parts.ips) }),
      stat({ label: 'Ad interest categories', value: fmtInt(ds.adInterests.length) }),
      stat({ label: 'Off-TikTok activities', value: fmtInt(ds.offTiktok) }),
    ),
  );
  if (ds.logins.length) root.append(panel({ title: 'Devices' }, rankList(topN(devices, 10), { color: 'var(--c3)' })));
  if (ds.adInterests.length) root.append(panel({ title: 'Ad interests TikTok assigned you' }, tagCloud(ds.adInterests)));
  return root;
}

export function tiktokViews(ds, ctx) {
  const keepKey = `tiktok:${ds.account?.username || 'me'}`;
  const views = [{ id: 'overview', label: 'Screen time', icon: 'clock', render: () => overview(ds, ctx) }];
  if (ds.watch.length) views.push({ id: 'habits', label: 'Habits & binges', icon: 'flame', render: () => habitsView(ds, ctx) });
  if (ds.hasRelationships) views.push(...relationshipViews(ds, ctx, { keepKey }));
  if (ds.searches.length) views.push({ id: 'searches', label: 'Searches', icon: 'search', count: ds.searches.length, render: () => searchesView(ds, ctx) });
  if (ds.logins.length || ds.adInterests.length || ds.offTiktok) views.push({ id: 'privacy', label: 'Privacy X-ray', icon: 'fingerprint', render: () => privacyView(ds, ctx) });
  views.push({ id: 'wrapped', label: 'Wrapped cards', icon: 'sparkles', render: () => wrappedView(ds, ctx) });
  return views;
}
