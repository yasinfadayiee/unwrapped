// Spotify "Download your data": Account data (StreamingHistory_music_*.json,
// last year) or Extended streaming history (Streaming_History_Audio_*.json,
// the whole account lifetime). Times in both files are UTC.

const BASIC = /(^|\/)streaminghistory(_music)?_?\d*\.json$/;
const PODCAST = /(^|\/)streaminghistory_podcast_?\d*\.json$/;
const EXTENDED = /(^|\/)streaming_history_(audio|video)_[^/]*\.json$|(^|\/)endsong_?\d*\.json$/;

export function detectSpotify(vfs) {
  return vfs.entries.some((e) => BASIC.test(e.lower) || PODCAST.test(e.lower) || EXTENDED.test(e.lower));
}

// Normalised play: { ts, ms, track, artist, album, show, skipped }
export function spotifyPlays(rows, kind) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (kind === 'extended') {
      const ts = Date.parse(r.ts);
      const ms = Number(r.ms_played) || 0;
      if (!Number.isFinite(ts) || !ms) continue;
      out.push({ ts, ms, track: r.master_metadata_track_name || r.episode_name || '', artist: r.master_metadata_album_artist_name || '', album: r.master_metadata_album_album_name || '', show: r.episode_show_name || '', skipped: r.skipped === true || r.reason_end === 'fwdbtn' || (!r.episode_name && ms < 30000) });
    } else {
      const ts = Date.parse(String(r.endTime || '').replace(' ', 'T') + 'Z');
      const ms = Number(r.msPlayed) || 0;
      if (!Number.isFinite(ts) || !ms) continue;
      if (kind === 'podcast' || r.podcastName) out.push({ ts, ms, track: r.episodeName || '', artist: '', album: '', show: r.podcastName || '', skipped: ms < 30000 });
      else out.push({ ts, ms, track: r.trackName || '', artist: r.artistName || '', album: '', show: '', skipped: ms < 30000 });
    }
  }
  return out;
}

const top = (map, n) => [...map.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, n).map(([key, v]) => ({ key, count: Math.round(v.ms / 60000), plays: v.plays, sub: v.sub || '' }));

export function spotifyStats(plays) {
  plays.sort((a, b) => a.ts - b.ts);
  const artists = new Map(), tracks = new Map(), shows = new Map(), years = new Map(), firstHeard = new Map();
  const byHour = Array(24).fill(0), byWeekday = Array(7).fill(0), byMonth = {};
  let music = 0, podcast = 0, skips = 0, count = 0;
  const bump = (map, key, ms, sub) => {
    const v = map.get(key) || { ms: 0, plays: 0, sub };
    v.ms += ms;
    v.plays++;
    map.set(key, v);
  };
  const days = new Map();
  for (const p of plays) {
    count++;
    const d = new Date(p.ts);
    byHour[d.getHours()] += p.ms / 60000;
    byWeekday[d.getDay()] += p.ms / 60000;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth[month] = (byMonth[month] || 0) + p.ms / 60000;
    const day = `${month}-${String(d.getDate()).padStart(2, '0')}`;
    days.set(day, (days.get(day) || 0) + p.ms);
    if (p.skipped) skips++;
    if (p.show) {
      podcast += p.ms;
      bump(shows, p.show, p.ms);
      continue;
    }
    music += p.ms;
    if (p.artist) {
      bump(artists, p.artist, p.ms);
      if (!firstHeard.has(p.artist)) firstHeard.set(p.artist, p.ts);
      const y = String(d.getFullYear());
      if (!years.has(y)) years.set(y, new Map());
      bump(years.get(y), p.artist, p.ms);
    }
    if (p.track) bump(tracks, `${p.track}\u0000${p.artist}`, p.ms, p.artist);
  }
  const busiest = [...days.entries()].sort((a, b) => b[1] - a[1])[0];
  const topArtists = top(artists, 50);
  return {
    first: plays[0]?.ts || 0,
    last: plays[plays.length - 1]?.ts || 0,
    plays: count,
    minutes: Math.round((music + podcast) / 60000),
    musicMinutes: Math.round(music / 60000),
    podcastMinutes: Math.round(podcast / 60000),
    skipRate: count ? skips / count : 0,
    uniqueArtists: artists.size,
    uniqueTracks: tracks.size,
    activeDays: days.size,
    busiestDay: busiest ? { day: busiest[0], minutes: Math.round(busiest[1] / 60000) } : null,
    byHour: byHour.map(Math.round),
    byWeekday: byWeekday.map(Math.round),
    byMonth: Object.fromEntries(Object.entries(byMonth).map(([k, v]) => [k, Math.round(v)])),
    topArtists,
    topTracks: top(tracks, 50).map((t) => ({ ...t, key: t.key.split('\u0000')[0] })),
    topShows: top(shows, 20),
    // Each year's number-one artist: a quick "Wrapped" for every year on file.
    yearTop: [...years.entries()].sort().map(([year, m]) => ({ year, ...top(m, 1)[0] })),
    // Artists you found in the last 90 days of the history.
    discoveries: topArtists.filter((a) => firstHeard.get(a.key) > (plays[plays.length - 1]?.ts || 0) - 90 * 864e5).slice(0, 10),
  };
}

export async function parseSpotify(vfs, progress) {
  const plays = [];
  const files = vfs.entries.filter((e) => BASIC.test(e.lower) || PODCAST.test(e.lower) || EXTENDED.test(e.lower));
  const extended = files.some((e) => EXTENDED.test(e.lower));
  for (let i = 0; i < files.length; i++) {
    const e = files[i];
    // With the extended history present, the shorter yearly files would only double count.
    if (extended && !EXTENDED.test(e.lower)) continue;
    progress?.('Reading your Spotify history…', (i + 0.5) / files.length);
    plays.push(...spotifyPlays(await e.json(), EXTENDED.test(e.lower) ? 'extended' : PODCAST.test(e.lower) ? 'podcast' : 'basic'));
  }
  if (!plays.length) throw new Error('No Spotify listening history found in this file');
  let name = '';
  const ident = vfs.entries.find((e) => /(^|\/)(userdata|identity)\.json$/.test(e.lower));
  if (ident) {
    try {
      const j = await ident.json();
      name = j.displayName || j.username || '';
    } catch {}
  }
  return { platform: 'spotify', label: 'Spotify', account: { name }, extended, stats: spotifyStats(plays), hasRelationships: false };
}
