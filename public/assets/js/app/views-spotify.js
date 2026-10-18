import { h } from '../lib/ui.js';
import { fmtInt, dateShort } from '../lib/format.js';
import { viewHead, stat, panel, insights, upsell } from './components.js';
import { barChart, rankList } from './charts.js';
import { t as tl } from '../lib/i18n.js';

const DAYS = () => [tl('Sun'), tl('Mon'), tl('Tue'), tl('Wed'), tl('Thu'), tl('Fri'), tl('Sat')];
const minutes = (v) => tl('{v0} min', { v0: fmtInt(v) });

function overview(ds, ctx) {
  const s = ds.stats;
  const full = ctx.pro || ctx.demo;
  const peak = s.byHour.indexOf(Math.max(...s.byHour));
  const topDay = s.byWeekday.indexOf(Math.max(...s.byWeekday));
  const months = Object.entries(s.byMonth).sort().map(([k, v]) => ({ label: k, value: v }));
  const top1 = s.topArtists[0];
  return h(
    'div',
    { class: 'app-content' },
    viewHead(ds.account.name || tl('Your Spotify'), tl('Listening history {v0} – {v1}', { v0: dateShort(s.first), v1: dateShort(s.last) })),
    h(
      'div',
      { class: 'stats' },
      stat({ label: tl('Minutes listened'), value: fmtInt(s.minutes), sub: tl('{v0} hours', { v0: fmtInt(Math.round(s.minutes / 60)) }) }),
      stat({ label: tl('Artists'), value: fmtInt(s.uniqueArtists) }),
      stat({ label: tl('Songs'), value: fmtInt(s.uniqueTracks) }),
      stat({ label: tl('Skipped'), value: `${Math.round(s.skipRate * 100)}%` }),
    ),
    panel(
      null,
      insights([
        top1 && { icon: 'star', title: tl('Your number one: {v0}', { v0: top1.key }), text: tl('{v0} minutes over {v1} plays.', { v0: fmtInt(top1.count), v1: fmtInt(top1.plays) }) },
        s.busiestDay && { icon: 'calendar', title: tl('Biggest listening day: {v0}', { v0: dateShort(new Date(`${s.busiestDay.day}T12:00:00`).getTime()) }), text: tl('{v0} minutes in one day.', { v0: fmtInt(s.busiestDay.minutes) }) },
        { icon: 'clock', title: tl('You listen most around {v0}:00', { v0: peak }), text: tl('{v0} is your biggest listening day of the week.', { v0: DAYS()[topDay] }) },
        s.podcastMinutes > 0 && { icon: 'message', title: tl('{v0} minutes of podcasts', { v0: fmtInt(s.podcastMinutes) }), text: s.topShows[0] ? tl('Most played: {v0}.', { v0: s.topShows[0].key }) : '' },
        !ds.extended && { icon: 'info', title: tl('This is your last year only'), text: tl('Request “Extended streaming history” from Spotify to see every year since you joined.') },
      ]),
    ),
    h(
      'div',
      { class: 'panels panels--2' },
      panel({ title: tl('Top artists') }, rankList(s.topArtists, { limit: full ? 50 : 5, valueLabel: minutes })),
      panel({ title: tl('Top songs') }, rankList(s.topTracks, { limit: full ? 50 : 5, valueLabel: minutes, color: 'var(--c3)' })),
    ),
    full ? null : upsell({ title: tl('Unlock your full Spotify story'), text: tl('Your top 50 artists and songs, a Wrapped for every year and your new discoveries.'), onUpgrade: () => ctx.upgrade('spotify') }),
    months.length > 1 ? panel({ title: tl('Minutes per month') }, barChart(months, { title: tl('Minutes'), ariaLabel: tl('Minutes per month') })) : null,
    h(
      'div',
      { class: 'panels panels--2' },
      panel({ title: tl('By hour of day') }, barChart(s.byHour.map((v, i) => ({ label: String(i), value: v })), { title: tl('Minutes'), height: 180 })),
      panel({ title: tl('By weekday') }, barChart(s.byWeekday.map((v, i) => ({ label: DAYS()[i], value: v })), { title: tl('Minutes'), height: 180, color: 'var(--c3)' })),
    ),
  );
}

function yearsView(ds, ctx) {
  const s = ds.stats;
  const full = ctx.pro || ctx.demo;
  return h(
    'div',
    { class: 'app-content' },
    viewHead(tl('Wrapped, every year'), tl('Your most played artist in each year on file.')),
    // Free: the latest year as a taste; every earlier year is locked.
    panel(null, rankList((full ? s.yearTop : s.yearTop.slice(-1)).map((y) => ({ key: `${y.year} · ${y.key}`, count: y.count })), { limit: 30, valueLabel: minutes })),
    !full && s.yearTop.length > 1 ? upsell({ title: tl('{v0} more years of Wrapped', { v0: fmtInt(s.yearTop.length - 1) }), text: tl('Your top 50 artists and songs, a Wrapped for every year and your new discoveries.'), onUpgrade: () => ctx.upgrade('spotify') }) : null,
    s.discoveries.length
      ? panel({ title: tl('New discoveries'), text: tl('Artists you first played in the last 90 days.') }, full ? rankList(s.discoveries, { valueLabel: minutes, color: 'var(--c2)' }) : upsell({ title: tl('{v0} new artists you discovered', { v0: fmtInt(s.discoveries.length) }), text: tl('Your top 50 artists and songs, a Wrapped for every year and your new discoveries.'), onUpgrade: () => ctx.upgrade('spotify') }))
      : null,
    s.topShows.length ? panel({ title: tl('Top podcasts') }, rankList(s.topShows, { limit: full ? 20 : 3, valueLabel: minutes, color: 'var(--c4)' })) : null,
  );
}

export function spotifyViews(ds, ctx) {
  return [
    { id: 'overview', label: tl('Listening overview'), icon: 'home', render: () => overview(ds, ctx) },
    { id: 'years', label: tl('Wrapped, every year'), icon: 'calendar', render: () => yearsView(ds, ctx) },
  ];
}
