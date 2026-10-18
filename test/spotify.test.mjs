import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSpotify, parseSpotify, spotifyPlays, spotifyStats } from '../public/assets/js/platforms/spotify.js';

const BASIC = [
  { endTime: '2024-01-01 10:00', artistName: 'Adele', trackName: 'Hello', msPlayed: 240000 },
  { endTime: '2024-01-01 10:05', artistName: 'Adele', trackName: 'Skyfall', msPlayed: 180000 },
  { endTime: '2024-01-02 22:00', artistName: 'Drake', trackName: 'One Dance', msPlayed: 10000 },
  { endTime: '2024-01-02 22:01', artistName: 'Drake', trackName: 'Zero', msPlayed: 0 },
];
const EXT = [
  { ts: '2019-05-01T10:00:00Z', ms_played: 200000, master_metadata_track_name: 'Hello', master_metadata_album_artist_name: 'Adele', reason_end: 'trackdone' },
  { ts: '2023-05-01T10:00:00Z', ms_played: 300000, master_metadata_track_name: 'Song', master_metadata_album_artist_name: 'Rosalía', reason_end: 'fwdbtn' },
  { ts: '2023-05-02T10:00:00Z', ms_played: 600000, episode_name: 'Ep 1', episode_show_name: 'The Daily' },
];

test('basic history: minutes, top artists, skips', () => {
  const s = spotifyStats(spotifyPlays(BASIC, 'basic'));
  assert.equal(s.plays, 3);
  assert.equal(s.musicMinutes, 7);
  assert.equal(s.topArtists[0].key, 'Adele');
  assert.equal(s.topArtists[0].plays, 2);
  assert.equal(s.topTracks[0].key, 'Hello');
  assert.equal(Math.round(s.skipRate * 3), 1);
});

test('extended history: years, podcasts, discoveries', () => {
  const s = spotifyStats(spotifyPlays(EXT, 'extended'));
  assert.deepEqual(s.yearTop.map((y) => `${y.year}:${y.key}`), ['2019:Adele', '2023:Rosalía']);
  assert.equal(s.podcastMinutes, 10);
  assert.equal(s.topShows[0].key, 'The Daily');
  assert.deepEqual(s.discoveries.map((a) => a.key), ['Rosalía']);
});

test('prefers extended files and ignores the yearly duplicate', async () => {
  const vfs = {
    entries: [
      { path: 'Spotify Account Data/StreamingHistory_music_0.json', lower: 'spotify account data/streaminghistory_music_0.json', json: async () => BASIC },
      { path: 'Spotify Extended Streaming History/Streaming_History_Audio_2019-2023_0.json', lower: 'spotify extended streaming history/streaming_history_audio_2019-2023_0.json', json: async () => EXT },
    ],
  };
  assert.ok(detectSpotify(vfs));
  const ds = await parseSpotify(vfs);
  assert.equal(ds.platform, 'spotify');
  assert.ok(ds.extended);
  assert.equal(ds.stats.plays, 3);
});
