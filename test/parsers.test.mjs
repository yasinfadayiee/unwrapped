import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeZip } from './helpers/zip-writer.mjs';
import { buildVfs } from '../public/assets/js/core/vfs.js';
import { analyze } from '../public/assets/js/core/analyze.js';
import { buildDemoVfs } from '../public/assets/js/core/demo.js';
import { fixMeta, parseDate, csvObjects, parseKeyValueBlocks } from '../public/assets/js/core/text.js';
import { relationships, watchStats, diffSnapshots, crossPlatform, tweetStats, exposureScore, friendshipRadar } from '../public/assets/js/core/insights.js';
import { relationshipsFromHtml, usernameFromHref } from '../public/assets/js/platforms/meta-common.js';

const asFile = (buffer, name) => new File([buffer], name, { lastModified: Date.UTC(2026, 8, 15) });
const ds = (result, platform) => result.datasets.find((d) => d.platform === platform);

test('Meta mojibake is repaired', () => {
  assert.equal(fixMeta('JosÃ©'), 'José');
  assert.equal(fixMeta('ð\u009f\u0098\u0080'), '😀');
  assert.equal(fixMeta('plain ascii'), 'plain ascii');
  assert.equal(fixMeta('already ✓ fine'), 'already ✓ fine');
});

test('dates from every platform format', () => {
  assert.equal(parseDate('2024-01-31 23:59:59'), Date.UTC(2024, 0, 31, 23, 59, 59));
  assert.equal(parseDate('Wed Oct 10 20:19:24 +0000 2018'), Date.UTC(2018, 9, 10, 20, 19, 24));
  assert.equal(parseDate('Jan 05, 2024 3:07 pm'), new Date(2024, 0, 5, 15, 7).getTime());
  assert.equal(parseDate(1700000000), 1700000000000);
  assert.equal(parseDate(''), 0);
});

test('Instagram usernames come from value, title or href', () => {
  assert.equal(usernameFromHref('https://www.instagram.com/_u/milo.design'), 'milo.design');
  assert.equal(usernameFromHref('https://www.instagram.com/milo_design/'), 'milo_design');
  assert.equal(usernameFromHref('https://www.instagram.com/p/Cxyz/'), '');
  assert.equal(usernameFromHref('https://www.threads.net/@ivy.codes'), 'ivy.codes');
});

test('the demo export runs through every parser', async () => {
  const { vfs } = buildDemoVfs(Date.UTC(2026, 9, 1));
  const result = await analyze(vfs);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.datasets.map((d) => d.platform).sort(), ['instagram', 'tiktok', 'x']);

  const ig = ds(result, 'instagram');
  assert.equal(ig.account.username, 'nova.studio');
  assert.equal(ig.lists.followers.length, 1284);
  assert.equal(ig.lists.following.length, 1032);
  assert.equal(ig.lists.pendingSent.length, 9);
  assert.equal(ig.lists.closeFriends.length, 23);
  const rel = relationships(ig);
  assert.equal(rel.mutuals.length, 764);
  assert.equal(rel.notFollowingBack.length, 268);
  assert.equal(rel.fans.length, 520);
  assert.equal(ig.activity.likes.total, 3400);
  assert.equal(ig.activity.messages.me, 'Nova Studio');
  assert.equal(ig.activity.messages.threadCount, 40);
  assert.equal(ig.privacy.advertisers.length, 214);
  assert.equal(ig.privacy.logins.count, 64);
  assert.ok(ig.privacy.logins.devices.length >= 4);

  const tt = ds(result, 'tiktok');
  assert.equal(tt.account.username, 'nova.studio');
  assert.ok(tt.watch.length > 10_000);
  assert.equal(tt.lists.followers.length, 410);
  const stats = watchStats(tt.watch);
  assert.ok(stats.hours > 50 && stats.hours < 2000, `hours ${stats.hours}`);
  assert.ok(stats.sessions > 180);
  assert.ok(stats.persona.title);

  const x = ds(result, 'x');
  assert.equal(x.account.username, 'novastudio');
  assert.equal(x.tweets.length, 1900);
  assert.equal(relationships(x).mutuals.length, 470);
  assert.equal(x.apps.length, 6);
  const ts = tweetStats(x.tweets);
  assert.ok(ts.retweets > 0 && ts.best.length === 10);

  const cross = crossPlatform(result.datasets);
  assert.equal(cross.pairs.length, 1);
  assert.ok(cross.pairs[0].both.length >= 260);

  const radar = friendshipRadar(ig.activity.messages);
  assert.equal(radar.innerCircle.length, 5);
  assert.ok(radar.fading.length + radar.quiet.length > 0, 'fading friendships detected');
  assert.ok(radar.rising.length > 0, 'rising friendships detected');
  assert.ok(radar.youChase.length > 0 && radar.theyChase.length > 0, 'one-sided detected');
  assert.ok(radar.youChase.every((p) => p.share >= 0.68));

  const exposure = exposureScore({ advertisers: 214, interests: 36, ips: 20 });
  assert.ok(exposure.score > 40 && ['C', 'D', 'F'].includes(exposure.grade));
});

test('Instagram ZIP (JSON, 2025 layout) with followers split across files', async () => {
  const rel = (u, ts) => ({ title: '', media_list_data: [], string_list_data: [{ href: `https://www.instagram.com/${u}`, value: u, timestamp: ts }] });
  const relNew = (u, ts) => ({ title: u, media_list_data: [], string_list_data: [{ href: `https://www.instagram.com/_u/${u}`, timestamp: ts }] });
  const zip = makeZip([
    { path: 'connections/followers_and_following/followers_1.json', content: JSON.stringify([rel('alpha', 1700000000), rel('beta', 1700000100)]) },
    { path: 'connections/followers_and_following/followers_2.json', content: JSON.stringify([rel('gamma', 1700000200), rel('Alpha', 1600000000)]) },
    { path: 'connections/followers_and_following/following.json', content: JSON.stringify({ relationships_following: [relNew('alpha', 1), relNew('delta', 2)] }), store: true },
    { path: 'connections/followers_and_following/pending_follow_requests.json', content: JSON.stringify({ relationships_follow_requests_sent: [relNew('zeta', 3)] }) },
  ]);
  const vfs = await buildVfs([asFile(zip, 'instagram-alpha-2026-09-15.zip')]);
  assert.equal(vfs.entries.length, 4);
  const ig = ds(await analyze(vfs), 'instagram');
  assert.deepEqual(ig.lists.followers.map((f) => f.u).sort(), ['Alpha', 'beta', 'gamma']);
  assert.equal(ig.lists.followers.find((f) => f.u === 'Alpha').ts, 1600000000000);
  const r = relationships(ig);
  assert.deepEqual(r.notFollowingBack.map((f) => f.u), ['delta']);
  assert.deepEqual(r.mutuals.map((f) => f.u), ['alpha']);
  assert.equal(ig.lists.pendingSent[0].u, 'zeta');
  assert.equal(new Date(ig.exportedAt).getFullYear(), 2026);
});

test('ZIP64 archives are read correctly', async () => {
  const zip = makeZip(
    [
      { path: 'data/account.js', content: 'window.YTD.account.part0 = [{"account":{"username":"zipper","accountId":"1"}}]' },
      { path: 'data/follower.js', content: 'window.YTD.follower.part0 = [{"follower":{"accountId":"2"}},{"follower":{"accountId":"3"}}]', store: true },
      { path: 'data/following.js', content: 'window.YTD.following.part0 = [{"following":{"accountId":"3"}},{"following":{"accountId":"4"}}]' },
    ],
    { zip64: true },
  );
  const x = ds(await analyze(await buildVfs([asFile(zip, 'twitter-archive.zip')])), 'x');
  assert.equal(x.account.username, 'zipper');
  const r = relationships(x);
  assert.deepEqual(r.mutuals.map((m) => m.id), ['3']);
  assert.deepEqual(r.notFollowingBack.map((m) => m.id), ['4']);
  assert.deepEqual(r.fans.map((m) => m.id), ['2']);
});

test('Instagram HTML export', async () => {
  const html = `<html><body><main>
    <div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><div class="_a6-p"><div><div><a target="_blank" href="https://www.instagram.com/sun.rise">sun.rise</a></div><div>Jan 05, 2024 3:07 pm</div></div></div></div>
    <div class="pam"><div><div><a target="_blank" href="https://www.instagram.com/_u/moon_light">https://www.instagram.com/_u/moon_light</a></div></div></div>
    <div class="pam"><div><a href="https://help.instagram.com/123">Help</a></div></div>
  </main></body></html>`;
  const items = relationshipsFromHtml(html);
  assert.deepEqual(items.map((i) => i.u), ['sun.rise', 'moon_light']);
  assert.equal(items[0].ts, new Date(2024, 0, 5, 15, 7).getTime());
  assert.equal(items[1].ts, 0);

  const zip = makeZip([
    { path: 'connections/followers_and_following/followers_1.html', content: html },
    { path: 'connections/followers_and_following/following.html', content: html.replace('moon_light', 'star.dust') },
  ]);
  const ig = ds(await analyze(await buildVfs([asFile(zip, 'instagram.zip')])), 'instagram');
  assert.equal(relationships(ig).mutuals.length, 1);
});

test('TikTok legacy JSON layout and TXT exports', async () => {
  const legacy = {
    Activity: {
      'Video Browsing History': { VideoList: [{ Date: '2025-01-01 22:00:00', Link: 'a' }, { Date: '2025-01-01 22:00:30', Link: 'b' }] },
      'Following List': { Following: [{ Date: '2024-12-01 10:00:00', UserName: 'kai.makes' }] },
      'Follower List': { FansList: [{ Date: '2024-12-02 10:00:00', UserName: 'kai.makes' }, { Date: '2024-12-03 10:00:00', UserName: 'remy' }] },
      'Search History': { SearchList: [{ Date: '2025-01-01 21:00:00', SearchTerm: 'cats' }] },
    },
    Profile: { 'Profile Information': { ProfileMap: { userName: 'legacy.user', followerCount: '2', followingCount: '1' } } },
  };
  const json = ds(await analyze(await buildVfs([asFile(makeZip([{ path: 'user_data.json', content: JSON.stringify(legacy) }]), 'TikTok_Data.zip')])), 'tiktok');
  assert.equal(json.account.username, 'legacy.user');
  assert.equal(json.watch.length, 2);
  assert.equal(relationships(json).fans.map((f) => f.u)[0], 'remy');
  assert.equal(json.searches[0].term, 'cats');

  const txt = makeZip([
    { path: 'TikTok/Activity/Browsing History.txt', content: 'Date: 2025-02-01 08:00:00\nLink: https://www.tiktokv.com/share/video/1/\n\nDate: 2025-02-01 08:00:20\nLink: https://www.tiktokv.com/share/video/2/\n' },
    { path: 'TikTok/Activity/Following.txt', content: 'Date: 2024-01-01 00:00:00\nUsername: ivy\n\nDate: 2024-01-01 00:00:00\nUsername: theo\n' },
    { path: 'TikTok/Activity/Follower.txt', content: 'Date: 2024-01-01 00:00:00\nUsername: ivy\n' },
  ]);
  const t2 = ds(await analyze(await buildVfs([asFile(txt, 'TikTok_Data_TXT.zip')])), 'tiktok');
  assert.equal(t2.watch.length, 2);
  assert.deepEqual(relationships(t2).notFollowingBack.map((f) => f.u), ['theo']);
});

test('Facebook friends with mojibake names and removed friends', async () => {
  const zip = makeZip([
    { path: 'connections/friends/your_friends.json', content: JSON.stringify({ friends_v2: [{ name: 'JosÃ© Silva', timestamp: 1600000000 }, { name: 'Ana Lima', timestamp: 1600000500 }] }) },
    { path: 'connections/friends/removed_friends.json', content: JSON.stringify({ deleted_friends_v2: [{ name: 'Old Pal', timestamp: 1650000000 }] }) },
    { path: 'connections/friends/sent_friend_requests.json', content: JSON.stringify({ sent_requests_v2: [{ name: 'Maybe Later', timestamp: 1660000000 }] }) },
  ]);
  const fb = ds(await analyze(await buildVfs([asFile(zip, 'facebook-export.zip')])), 'facebook');
  assert.deepEqual(fb.lists.friends.map((f) => f.name), ['José Silva', 'Ana Lima']);
  assert.equal(fb.lists.removed[0].name, 'Old Pal');
  assert.equal(fb.lists.sentRequests.length, 1);
});

test('LinkedIn Connections.csv with notes preamble', async () => {
  const csv = 'Notes:\n"When exporting your connection data, you may notice that some of the email addresses are missing."\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\nAda,Lovelace,https://www.linkedin.com/in/ada,,Analytical Engines,Founder & CEO,02 Oct 2024\nAlan,Turing,https://www.linkedin.com/in/alan,alan@example.com,"Bletchley, Park",Senior Software Engineer,15 Jan 2023\n';
  const zip = makeZip([{ path: 'Connections.csv', content: csv }]);
  const li = ds(await analyze(await buildVfs([asFile(zip, 'Basic_LinkedInDataExport.zip')])), 'linkedin');
  assert.equal(li.connections.length, 2);
  assert.equal(li.connections[0].name, 'Ada Lovelace');
  assert.equal(li.companies.find((c) => c.key === 'Bletchley, Park').count, 1);
  assert.deepEqual(li.roles.map((r) => r.key).sort(), ['Engineers & developers', 'Founders & CEOs']);
  assert.equal(li.emailsShared, 1);
});

test('loose unzipped files work too', async () => {
  const followers = new File([JSON.stringify([{ string_list_data: [{ value: 'one', timestamp: 1 }] }])], 'followers_1.json');
  const following = new File([JSON.stringify({ relationships_following: [{ title: 'two', string_list_data: [{ href: 'https://www.instagram.com/_u/two', timestamp: 2 }] }] })], 'following.json');
  const ig = ds(await analyze(await buildVfs([followers, following])), 'instagram');
  assert.equal(relationships(ig).notFollowingBack[0].u, 'two');
});

test('sessions, snapshots and helpers', () => {
  const t0 = Date.UTC(2026, 0, 1, 22);
  const watch = [t0, t0 + 30_000, t0 + 60_000, t0 + 3 * 3600_000, t0 + 3 * 3600_000 + 15_000];
  const s = watchStats(watch);
  assert.equal(s.sessions, 2);
  assert.equal(s.videos, 5);
  assert.equal(Math.round(s.totalMs / 1000), 60 + 20 + 15 + 20);

  const d = diffSnapshots(
    { takenAt: 1, followers: ['a', 'b', 'c'], following: ['x', 'y'] },
    { takenAt: 2, followers: ['b', 'c', 'd'], following: ['y', 'z'] },
  );
  assert.deepEqual(d.unfollowedYou, ['a']);
  assert.deepEqual(d.newFollowers, ['d']);
  assert.deepEqual(d.youUnfollowed, ['x']);
  assert.deepEqual(d.youFollowed, ['z']);

  assert.deepEqual(parseKeyValueBlocks('Date: 1\nLink: https://x\nDate: 2\nLink: y'), [
    { Date: '1', Link: 'https://x' },
    { Date: '2', Link: 'y' },
  ]);
  assert.deepEqual(csvObjects('a,b\n"1,5","say ""hi"""\n'), [{ a: '1,5', b: 'say "hi"' }]);
});

test('Messenger chats from a Facebook download open in the message viewer, with media', async () => {
  const msg = (sender, ts, extra = {}) => ({ sender_name: sender, timestamp_ms: ts, ...extra });
  const zip = makeZip([
    { path: 'your_facebook_activity/connections/friends/your_friends.json', content: JSON.stringify({ friends_v2: [{ name: 'Ana Ruiz', timestamp: 1600000000 }] }) },
    { path: 'personal_information/profile_information/profile_information.json', content: JSON.stringify({ profile_v2: { name: { full_name: 'Sam Lee' } } }) },
    {
      path: 'your_facebook_activity/messages/inbox/anaruiz_123/message_1.json',
      content: JSON.stringify({
        participants: [{ name: 'Ana Ruiz' }, { name: 'Sam Lee' }],
        title: 'Ana Ruiz',
        messages: [
          msg('Ana Ruiz', 1700000300000, { content: 'Caf\u00c3\u00a9 tomorrow?', reactions: [{ reaction: '\u00e2\u009d\u00a4', actor: 'Sam Lee' }] }),
          msg('Sam Lee', 1700000100000, { content: 'Hi!', photos: [{ uri: 'your_facebook_activity/messages/inbox/anaruiz_123/photos/1.jpg' }] }),
        ],
      }),
    },
    { path: 'your_facebook_activity/messages/inbox/anaruiz_123/photos/1.jpg', content: 'JPEGDATA' },
  ]);
  const result = await analyze(await buildVfs([asFile(zip, 'facebook-samlee.zip')]));
  const fb = ds(result, 'facebook');
  assert.equal(fb.activity.messages.threadCount, 1);
  const thread = fb.activity.messages.every[0];
  const messages = await thread.load();
  assert.deepEqual(messages.map((m) => m.text), ['Hi!', 'Café tomorrow?']);
  assert.equal(messages[0].sender, 'Sam Lee');
  assert.equal(messages[0].media[0].kind, 'photo');
  assert.equal(new TextDecoder().decode(await messages[0].media[0].entry.bytes()), 'JPEGDATA');
  assert.equal(messages[1].reactions.length, 1);
  // Instagram must not pick up Facebook chats.
  assert.equal(ds(result, 'instagram'), undefined);
});

test('unrecognized uploads get a specific explanation', async () => {
  const { diagnose } = await import('../public/assets/js/core/diagnose.js');
  const vfsOf = async (entries) => buildVfs([asFile(makeZip(entries), 'export.zip')]);
  const ids = (hints) => hints.map((h) => h.id);
  assert.deepEqual(ids(diagnose(await vfsOf([{ path: 'WhatsApp Chat - Ana/_chat.txt', content: 'hi' }]))), ['other']);
  assert.equal(diagnose(await vfsOf([{ path: 'WhatsApp Chat - Ana/_chat.txt', content: 'hi' }]))[0].vars.v0, 'WhatsApp');
  assert.deepEqual(ids(diagnose(await vfsOf([{ path: 'media/1.jpg', content: 'x' }, { path: 'media/2.mp4', content: 'y' }]))), ['media']);
  assert.deepEqual(ids(diagnose(await vfsOf([{ path: 'notes.json', content: '{}' }]))), ['few']);
  const parts = diagnose({ entries: [] }, [{ name: 'instagram.zip.001' }]);
  assert.deepEqual(ids(parts), ['parts', 'empty']);
});
