import { h, icon } from '../lib/ui.js';
import { fmtInt, dateShort, compact, hourLabel, monthLabel, duration } from '../lib/format.js';
import { watchStats, byMonth } from '../core/insights.js';
import { countBy as countMap, topN } from '../core/text.js';
import { viewHead, stat, panel, insights, emptyState, dataNote } from './components.js';
import { relationshipViews, relationshipStats, networkPanel, exposurePanel, tagCloud } from './views-common.js';
import { barChart, heatmapChart, rankList } from './charts.js';
import { wrappedView } from './views-wrapped.js';
import { privacyParts } from './wrapped.js';
import { t as tl } from '../lib/i18n.js';
import { videosView } from './views-videos.js';

function overview(ds, ctx) {
  const w = watchStats(ds.watch);
  const root = h('div', { class: 'app-content' });
  const a = ds.account;
  root.append(viewHead(a.username ? `@${a.username}` : tl('TikTok'), tl('TikTok export from {v0}', { v0: dateShort(ds.exportedAt) })));
  if (!w) {
    root.append(panel(null, emptyState(tl('No watch history in this export. Request “All data” in JSON to get it.'), 'clock')));
  } else {
    const days = w.hours / 24;
    root.append(
      h(
        'div',
        { class: 'stats' },
        stat({ hero: true, label: tl('Time on TikTok · {v0} – {v1}', { v0: dateShort(w.first), v1: dateShort(w.last) }), value: tl('{v0} hours', { v0: fmtInt(w.hours) }), sub: `${tl('≈ {v0} minutes a day', { v0: Math.round(w.perDayMinutes) })} · ${days >= 1 ? tl('{v0} full days nonstop', { v0: days.toFixed(1) }) : tl('less than a day nonstop')}` }),
        stat({ label: tl('Videos watched'), value: compact(w.videos), sub: tl('{v0} per day', { v0: Math.round(w.perDayVideos) }) }),
        stat({ label: tl('Sessions'), value: fmtInt(w.sessions), sub: tl('avg {v0} min', { v0: Math.round(w.avgSessionMinutes) }) }),
        stat({ label: tl('Longest binge'), value: duration(w.longest.ms), sub: tl('{v0} videos · {v1}', { v0: fmtInt(w.longest.count), v1: dateShort(w.longest.start) }) }),
        stat({ label: tl('Peak hour'), value: hourLabel(w.peakHour), sub: tl('{v0}% after midnight', { v0: Math.round(w.nightShare * 100) }) }),
      ),
      panel(
        { title: tl('When you scroll'), text: tl('Videos watched by weekday and hour (your local time)') },
        heatmapChart(w.heat, { unit: tl('videos') }),
      ),
      panel(
        { title: tl('You’re a {v0}', { v0: tl(w.persona.title) }) },
        insights([
          { icon: 'moon', title: tl(w.persona.title), text: tl(w.persona.line) },
          { icon: 'flame', title: tl('Biggest day: {v0} videos', { v0: fmtInt(w.topDay.count) }), text: `On ${dateShort(new Date(`${w.topDay.day}T12:00:00`).getTime())}.` },
          { icon: 'calendar', title: tl('{v0}-day streak', { v0: fmtInt(w.streak) }), text: tl('You opened TikTok on {v0} of {v1} days.', { v0: fmtInt(w.activeDays), v1: fmtInt(w.spanDays) }) },
          { icon: 'film', title: tl('That’s about {v0} movies', { v0: fmtInt(w.hours / 2) }), text: tl('If every two hours of scrolling were a feature film.') },
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
  const root = h('div', { class: 'app-content' }, viewHead(tl('Your habits'), tl('How your scrolling changed over time — and your biggest binges.')));
  if (!w) return root.appendChild(panel(null, emptyState(tl('No watch history in this export.'), 'clock'))) && root;
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
    h('div', { class: 'panels panels--2' }, panel({ title: tl('Videos by month') }, barChart(months, { title: tl('Videos'), ariaLabel: tl('Videos watched by month') })), panel({ title: tl('Videos by hour of day') }, barChart(hours, { title: tl('Videos'), ariaLabel: tl('Videos by hour') }))),
    panel(
      { title: tl('Your longest binges') },
      h(
        'div',
        { class: 'rows' },
        top.map((s, i) =>
          h(
            'div',
            { class: 'row' },
            h('span', { class: 'count-pill' }, `#${i + 1}`),
            h('div', { class: 'who' }, h('b', null, duration(s.ms)), h('span', null, tl('{v0} videos · {v1}', { v0: fmtInt(s.count), v1: new Date(s.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }))),
          ),
        ),
      ),
      !ctx.pro && !ctx.demo ? h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => ctx.upgrade('habits') }, icon('lock'), tl('See your top 10 with Plus'))) : null,
    ),
  );
  if (ds.likes.length) {
    const likeMonths = byMonth(ds.likes).map((m) => ({ label: monthLabel(m.month), short: monthLabel(m.month, true), value: m.count }));
    root.append(
      panel(
        { title: tl('Likes · {v0}', { v0: fmtInt(ds.likes.length) }), text: tl('You liked {v0}% of the videos you watched', { v0: ((ds.likes.length / Math.max(1, w.videos)) * 100).toFixed(1) }) },
        barChart(likeMonths, { title: tl('Likes'), ariaLabel: tl('Likes by month'), color: 'var(--c3)' }),
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
    viewHead(tl('Your searches'), tl('{v0} searches in this export.', { v0: fmtInt(ds.searches.length) })),
    ds.searches.length
      ? h(
          'div',
          { class: 'panels panels--2' },
          panel({ title: tl('Most searched') }, rankList(top, { limit: ctx.pro || ctx.demo ? 20 : 5 })),
          panel({ title: tl('Recent searches') }, tagCloud(ds.searches.map((s) => s.term), { locked: !ctx.pro && !ctx.demo, ctx, limit: 60 })),
        )
      : panel(null, emptyState(tl('No searches found.'), 'search')),
  );
}

function privacyView(ds, ctx) {
  const parts = privacyParts(ds) || { advertisers: 0, interests: 0, ips: 0, apps: 0 };
  const devices = countMap(ds.logins, (l) => l.device || tl('Unknown device'));
  const root = h('div', { class: 'app-content' }, viewHead(tl('Privacy X-ray'), tl('What TikTok recorded about your logins and ad profile.')));
  root.append(
    exposurePanel(parts, [
      { icon: 'device', title: tl('Review your devices'), text: tl('Settings → Security → Your devices — remove anything you don’t recognise.') },
      ds.offTiktok ? { icon: 'globe', title: tl('{v0} activities from other apps & sites', { v0: fmtInt(ds.offTiktok) }), text: tl('Settings → Privacy → Ads and data — limit off-TikTok activity.') } : null,
    ]),
    h(
      'div',
      { class: 'stats' },
      stat({ label: tl('Logins recorded'), value: fmtInt(ds.logins.length) }),
      stat({ label: tl('IP addresses'), value: fmtInt(parts.ips) }),
      stat({ label: tl('Ad interest categories'), value: fmtInt(ds.adInterests.length) }),
      stat({ label: tl('Off-TikTok activities'), value: fmtInt(ds.offTiktok) }),
    ),
  );
  if (ds.logins.length) root.append(panel({ title: tl('Devices') }, rankList(topN(devices, 10), { color: 'var(--c3)' })));
  if (ds.adInterests.length) root.append(panel({ title: tl('Ad interests TikTok assigned you') }, tagCloud(ds.adInterests)));
  return root;
}

export function tiktokViews(ds, ctx) {
  const keepKey = `tiktok:${ds.account?.username || 'me'}`;
  const views = [{ id: 'overview', label: tl('Screen time'), icon: 'clock', render: () => overview(ds, ctx) }];
  if (ds.watch.length) views.push({ id: 'habits', label: tl('Habits & binges'), icon: 'flame', render: () => habitsView(ds, ctx) });
  if (ds.hasRelationships) views.push(...relationshipViews(ds, ctx, { keepKey }));
  if (ds.history && Object.values(ds.history).some((l) => l.length)) views.push({ id: 'videos', label: tl('Video finder'), icon: 'play', render: () => videosView(ds, ctx) });
  if (ds.searches.length) views.push({ id: 'searches', label: tl('Searches'), icon: 'search', count: ds.searches.length, render: () => searchesView(ds, ctx) });
  if (ds.logins.length || ds.adInterests.length || ds.offTiktok) views.push({ id: 'privacy', label: tl('Privacy X-ray'), icon: 'fingerprint', render: () => privacyView(ds, ctx) });
  views.push({ id: 'wrapped', label: tl('Wrapped cards'), icon: 'sparkles', render: () => wrappedView(ds, ctx) });
  return views;
}
