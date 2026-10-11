// Builds realistic, entirely fictional export files in memory, so the live
// demo runs through exactly the same parsers as a real upload.

import { Vfs } from './vfs.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const A = ['luna', 'milo', 'nova', 'kai', 'zara', 'leo', 'ivy', 'remy', 'sage', 'aria', 'theo', 'mira', 'juno', 'ezra', 'lila', 'omar', 'nia', 'felix', 'rosa', 'dara', 'yuki', 'sami', 'noor', 'ines', 'arlo', 'cleo', 'ravi', 'elio', 'maya', 'tara'];
const B = ['studio', 'travels', 'daily', 'eats', 'film', 'design', 'fit', 'art', 'codes', 'snaps', 'vibes', 'lab', 'club', 'diaries', 'shots', 'beats', 'reads', 'makes', 'kitchen', 'outdoors'];
const BRANDS = ['Northwind Coffee', 'Lumen Fitness', 'Atlas Travel Co.', 'Pixelcraft Studio', 'Verde Market', 'Orbit Mobile', 'Kinfolk Home', 'Bluebird Books', 'Summit Gear', 'Nimbus Cloud', 'Harbor Bank', 'Echo Audio', 'Crown Cosmetics', 'Polar Streaming', 'Saffron Foods', 'Vela Fashion', 'Quanta Electronics', 'Meridian Hotels', 'Juniper Insurance', 'Rally Sports'];
const TOPICS = ['Coffee', 'Street photography', 'Minimalism', 'Indie games', 'Hiking', 'Vintage cars', 'Skincare', 'Interior design', 'Startups', 'Sushi', 'Electronic music', 'Running', 'Typography', 'Cats', 'Travel hacks', 'Film cameras', 'Basketball', 'Plant care', 'Personal finance', 'Anime'];

function usernames(rand, count, salt) {
  const out = new Set();
  while (out.size < count) {
    const a = A[Math.floor(rand() * A.length)];
    const b = B[Math.floor(rand() * B.length)];
    const sep = ['.', '_', ''][Math.floor(rand() * 3)];
    const n = rand() < 0.45 ? String(Math.floor(rand() * 99)) : '';
    out.add(`${a}${sep}${b}${n}${out.size % 7 === salt ? '.x' : ''}`.slice(0, 30));
  }
  return [...out];
}

const sec = (ms) => Math.floor(ms / 1000);
const DAY = 86_400_000;

function entry(path, content, mtime) {
  const bytes = new TextEncoder().encode(content);
  return {
    path,
    lower: path.toLowerCase(),
    name: path.split('/').pop(),
    size: bytes.length,
    source: 'demo.zip',
    mtime,
    bytes: async () => bytes,
    text: async () => content,
    json: async () => JSON.parse(content),
  };
}

function rel(u, ts, style = 'old') {
  if (style === 'new') {
    return { title: u, media_list_data: [], string_list_data: [{ href: `https://www.instagram.com/_u/${u}`, timestamp: sec(ts) }] };
  }
  return { title: '', media_list_data: [], string_list_data: [{ href: `https://www.instagram.com/${u}`, value: u, timestamp: sec(ts) }] };
}

export function demoInstagramFiles(now, rand, { followerCount = 1284, followingCount = 1032, mutual = 0.74 } = {}) {
  const pool = usernames(rand, followerCount + followingCount, 3);
  const following = pool.slice(0, followingCount);
  const mutualCount = Math.round(followingCount * mutual);
  const followers = [...following.slice(0, mutualCount), ...pool.slice(followingCount, followingCount + followerCount - mutualCount)];
  const t = (maxDays) => now - Math.floor(rand() * maxDays * DAY);
  const base = 'connections/followers_and_following';
  const files = [
    [`${base}/followers_1.json`, JSON.stringify(followers.map((u) => rel(u, t(1400))))],
    [`${base}/following.json`, JSON.stringify({ relationships_following: following.map((u) => rel(u, t(1500), 'new')) })],
    [`${base}/close_friends.json`, JSON.stringify({ relationships_close_friends: following.slice(0, 23).map((u) => rel(u, t(900))) })],
    [`${base}/pending_follow_requests.json`, JSON.stringify({ relationships_follow_requests_sent: usernames(rand, 9, 1).map((u) => rel(u, t(400))) })],
    [`${base}/recently_unfollowed_profiles.json`, JSON.stringify({ relationships_unfollowed_users: usernames(rand, 12, 2).map((u) => rel(u, t(60))) })],
    [`${base}/blocked_profiles.json`, JSON.stringify({ relationships_blocked_users: usernames(rand, 4, 4).map((u) => rel(u, t(700), 'new')) })],
    [`${base}/restricted_profiles.json`, JSON.stringify({ relationships_restricted_users: usernames(rand, 3, 5).map((u) => rel(u, t(300))) })],
    [`${base}/follow_requests_you've_received.json`, JSON.stringify({ relationships_follow_requests_received: usernames(rand, 6, 6).map((u) => rel(u, t(30))) })],
    [
      'personal_information/personal_information/personal_information.json',
      JSON.stringify({ profile_user: [{ string_map_data: { Username: { value: 'nova.studio' }, Name: { value: 'Nova Studio' }, 'Private Account': { value: 'False' } } }] }),
    ],
    [
      'security_and_login_information/login_and_profile_creation/signup_details.json',
      JSON.stringify({ account_history_registration_info: [{ string_map_data: { Username: { value: 'nova.studio' }, Time: { timestamp: sec(now - 2300 * DAY) } } }] }),
    ],
  ];

  const likes = [];
  for (let i = 0; i < 3400; i++) {
    const author = following[Math.floor(Math.pow(rand(), 2.2) * following.length)];
    likes.push({ title: author, string_list_data: [{ href: 'https://www.instagram.com/p/demo/', value: 'ð\u009f\u0091\u008d', timestamp: sec(t(720)) }] });
  }
  files.push(['your_instagram_activity/likes/liked_posts.json', JSON.stringify({ likes_media_likes: likes })]);

  const comments = [];
  for (let i = 0; i < 420; i++) {
    const author = following[Math.floor(Math.pow(rand(), 2.6) * following.length)];
    comments.push({ string_map_data: { Comment: { value: 'love this' }, 'Media Owner': { value: author }, Time: { timestamp: sec(t(700)) } } });
  }
  files.push(['your_instagram_activity/comments/post_comments_1.json', JSON.stringify(comments)]);

  const friends = following.slice(0, 40);
  friends.forEach((u, i) => {
    const count = Math.max(4, Math.floor(1800 / (i + 1.4)));
    // A mix of friendship patterns for the Friendship Radar.
    const pattern = ['steady', 'steady', 'fading', 'rising', 'you', 'they', 'quiet', 'steady'][i % 8];
    const mine = pattern === 'you' ? 0.82 : pattern === 'they' ? 0.22 : 0.5;
    const messages = [];
    for (let k = 0; k < count; k++) {
      const hour = Math.floor(rand() < 0.6 ? 18 + rand() * 6 : rand() * 24) % 24;
      let ago = Math.floor(rand() * 500);
      if (pattern === 'fading') ago = 95 + Math.floor(rand() * 300) - (rand() < 0.08 ? 90 : 0);
      if (pattern === 'rising') ago = Math.floor(Math.pow(rand(), 3) * 300);
      if (pattern === 'quiet') ago = 200 + Math.floor(rand() * 300);
      const ts = new Date(now - ago * DAY).setHours(hour, Math.floor(rand() * 60));
      messages.push({ sender_name: rand() < mine ? 'Nova Studio' : u, timestamp_ms: ts, content: 'hey' });
    }
    files.push([
      `your_instagram_activity/messages/inbox/${u.replace(/\./g, '')}_${1000 + i}/message_1.json`,
      JSON.stringify({ participants: [{ name: u }, { name: 'Nova Studio' }], messages, title: u }),
    ]);
  });

  const logins = [];
  const agents = [
    'Instagram 312.0.0 (iPhone15,2; iOS 18_1; en_US)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Instagram 305.0.0 Android (33/13; 420dpi; Pixel 7)',
    'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0',
  ];
  for (let i = 0; i < 64; i++) {
    logins.push({
      title: new Date(t(365)).toISOString(),
      string_map_data: {
        'IP Address': { value: `203.0.${Math.floor(rand() * 20)}.${Math.floor(rand() * 250)}` },
        'User Agent': { value: agents[Math.floor(Math.pow(rand(), 1.8) * agents.length)] },
        Time: { timestamp: sec(t(365)) },
      },
    });
  }
  files.push(['security_and_login_information/login_and_profile_creation/login_activity.json', JSON.stringify({ account_history_login_history: logins })]);

  const advertisers = [];
  for (let i = 0; i < 214; i++) {
    advertisers.push({
      advertiser_name: `${BRANDS[i % BRANDS.length]}${i >= BRANDS.length ? ` ${Math.floor(i / BRANDS.length) + 1}` : ''}`,
      has_data_file_custom_audience: rand() < 0.55,
      has_remarketing_custom_audience: rand() < 0.7,
      has_in_person_store_visit: rand() < 0.05,
    });
  }
  files.push(['ads_information/instagram_ads_and_businesses/advertisers_using_your_activity_or_information.json', JSON.stringify({ ig_custom_audiences_all_types: advertisers })]);
  files.push([
    'preferences/your_topics/recommended_topics.json',
    JSON.stringify({ topics_your_topics: [...TOPICS, ...TOPICS.map((x) => `${x} tips`)].slice(0, 36).map((name) => ({ string_map_data: { Name: { value: name } } })) }),
  ]);
  files.push(['ads_information/ads_and_topics/ads_viewed.json', JSON.stringify({ impressions_history_ads_seen: new Array(5120).fill({}) })]);
  files.push(['ads_information/ads_and_topics/posts_viewed.json', JSON.stringify({ impressions_history_posts_seen: new Array(9810).fill({}) })]);

  return { files, followers, following };
}

function demoTikTokFiles(now, rand, igFollowers, igFollowing) {
  const watch = [];
  for (let d = 179; d >= 0; d--) {
    const sessions = 1 + Math.floor(rand() * 4);
    for (let s = 0; s < sessions; s++) {
      const hour = rand() < 0.55 ? 21 + Math.floor(rand() * 4) : 7 + Math.floor(rand() * 14);
      let ts = new Date(now - d * DAY).setHours(hour % 24, Math.floor(rand() * 60), 0, 0);
      const videos = 8 + Math.floor(rand() * (rand() < 0.1 ? 260 : 70));
      for (let v = 0; v < videos; v++) {
        ts += 9_000 + Math.floor(rand() * 40_000);
        if (ts < now) watch.push(ts);
      }
    }
  }
  const fmt = (ts) => new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
  const fans = [...igFollowers.slice(0, 260), ...usernames(rand, 150, 2)];
  const follows = [...igFollowing.slice(0, 240), ...usernames(rand, 140, 5)];
  const json = {
    'Your Activity': {
      'Watch History': { VideoList: watch.map((ts) => ({ Date: fmt(ts), Link: 'https://www.tiktokv.com/share/video/7000000000000000000/' })) },
      'Like List': { ItemFavoriteList: watch.filter(() => rand() < 0.11).map((ts) => ({ date: fmt(ts), link: 'https://www.tiktokv.com/share/video/1/' })) },
      'Favorite Videos': { FavoriteVideoList: new Array(184).fill({ Date: fmt(now), Link: '' }) },
      Follower: { FansList: fans.map((u) => ({ Date: fmt(now - Math.floor(rand() * 600) * DAY), UserName: u })) },
      Following: { Following: follows.map((u) => ({ Date: fmt(now - Math.floor(rand() * 600) * DAY), UserName: u })) },
      Searches: {
        SearchList: ['pasta recipe', 'study with me', 'nyc vlog', 'gym routine', 'cat videos', 'outfit ideas', 'pasta recipe', 'lofi beats', 'cat videos', 'cat videos'].map((term, i) => ({
          Date: fmt(now - i * 3 * DAY),
          SearchTerm: term,
        })),
      },
      'Login History': {
        LoginHistoryList: new Array(31).fill(0).map((_, i) => ({ Date: fmt(now - i * 6 * DAY), IP: `198.51.100.${i % 9}`, DeviceModel: i % 3 ? 'iPhone15,2' : 'Pixel 7', DeviceSystem: i % 3 ? 'iOS 18.1' : 'Android 14', NetworkType: 'Wi-Fi', Carrier: '' })),
      },
    },
    Profile: { 'Profile Information': { ProfileMap: { userName: 'nova.studio', followerCount: fans.length, followingCount: follows.length, likesReceived: 48210, bioDescription: 'making things ✦' } } },
    Video: { Videos: { VideoList: new Array(57).fill({ Date: fmt(now), Link: '', Likes: '120' }) } },
    'Ads and data': { 'Ad Interests': { AdInterestCategories: 'Food & Drink | Fitness | Travel | Gaming | Fashion' } },
  };
  return [['TikTok_Data/user_data_tiktok.json', JSON.stringify(json)]];
}

function demoXFiles(now, rand) {
  const ytd = (name, rows) => `window.YTD.${name}.part0 = ${JSON.stringify(rows, null, 1)}`;
  const ids = (n, offset) => new Array(n).fill(0).map((_, i) => String(10_000_000 + offset + i * 7));
  const followers = ids(820, 0);
  const following = [...followers.slice(0, 470), ...ids(170, 900_000)];
  const words = ['shipping', 'design', 'coffee', 'weekend', 'thread', 'launch', 'typography', 'travel', 'build', 'learning'];
  const tweets = [];
  for (let i = 0; i < 1900; i++) {
    const ts = now - Math.floor(Math.pow(rand(), 0.8) * 2190 * DAY);
    const rt = rand() < 0.18;
    const reply = !rt && rand() < 0.3;
    const w = () => words[Math.floor(rand() * words.length)];
    const tags = rand() < 0.2 ? [{ text: ['buildinpublic', 'design', 'ux', 'indiedev'][Math.floor(rand() * 4)] }] : [];
    tweets.push({
      tweet: {
        id_str: String(1_600_000_000_000_000_000n + BigInt(i)),
        full_text: `${rt ? 'RT @someone: ' : ''}Today I'm ${w()} and ${w()}, more ${w()} soon`,
        created_at: new Date(ts).toUTCString().replace(/^(\w{3}), (\d{2}) (\w{3}) (\d{4}) (\S+) GMT$/, '$1 $3 $2 $5 +0000 $4'),
        favorite_count: String(Math.floor(Math.pow(rand(), 3) * 900)),
        retweet_count: String(Math.floor(Math.pow(rand(), 4) * 120)),
        in_reply_to_screen_name: reply ? 'friend' : undefined,
        entities: { hashtags: tags, user_mentions: reply ? [{ screen_name: ['ivy_codes', 'theo.design', 'remy'][Math.floor(rand() * 3)] }] : [] },
      },
    });
  }
  return [
    ['data/account.js', ytd('account', [{ account: { username: 'novastudio', accountId: '4242', createdAt: new Date(now - 2400 * DAY).toISOString(), accountDisplayName: 'Nova Studio' } }])],
    ['data/follower.js', ytd('follower', followers.map((id) => ({ follower: { accountId: id, userLink: `https://twitter.com/intent/user?user_id=${id}` } })))],
    ['data/following.js', ytd('following', following.map((id) => ({ following: { accountId: id, userLink: `https://twitter.com/intent/user?user_id=${id}` } })))],
    ['data/tweets.js', ytd('tweets', tweets)],
    ['data/like.js', ytd('like', new Array(5200).fill(0).map((_, i) => ({ like: { tweetId: String(i), fullText: 'nice' } })))],
    ['data/block.js', ytd('block', ids(6, 5_000_000).map((id) => ({ blocking: { accountId: id } })))],
    [
      'data/personalization.js',
      ytd('personalization', [
        {
          p13nData: {
            demographics: { languages: [{ language: 'English', isDisabled: false }], genderInfo: { gender: 'female' } },
            interests: {
              interests: [...TOPICS, 'Technology', 'Design', 'Entrepreneurship', 'Photography', 'Music festivals'].map((name) => ({ name, isDisabled: false })),
              audienceAndAdvertisers: { advertisers: BRANDS.slice(0, 12), lookalikeAdvertisers: BRANDS.slice(8, 18) },
            },
            inferredAgeInfo: { age: ['25-34'] },
          },
        },
      ]),
    ],
    [
      'data/ad-impressions.js',
      ytd('ad_impressions', [
        {
          ad: {
            adsUserData: {
              adImpressions: {
                impressions: new Array(640).fill(0).map((_, i) => ({
                  advertiserInfo: { advertiserName: BRANDS[(i * 7) % BRANDS.length] },
                  matchedTargetingCriteria: [{ targetingType: ['Interests', 'Keywords', 'Follower look-alikes', 'Locations'][i % 4], targetingValue: TOPICS[i % TOPICS.length] }],
                })),
              },
            },
          },
        },
      ]),
    ],
    ['data/ip-audit.js', ytd('ip_audit', new Array(48).fill(0).map((_, i) => ({ ipAudit: { createdAt: new Date(now - i * 7 * DAY).toISOString(), loginIp: `192.0.2.${i % 11}` } })))],
    [
      'data/connected-application.js',
      ytd('connected_application', ['Buffer', 'Typefully', 'Old Quiz App', 'Medium', 'Zapier', 'Sketchy Followers Tool'].map((name, i) => ({ connectedApplication: { name, organization: { name }, permissions: i === 5 ? ['read', 'write', 'directmessages'] : ['read'], approvedAt: new Date(now - (i + 1) * 200 * DAY).toISOString() } }))),
    ],
  ];
}

export function buildDemoVfs(now = Date.now()) {
  const rand = rng(20261011);
  const ig = demoInstagramFiles(now, rand);
  const vfs = new Vfs();
  const mtime = now - 2 * 3600_000;
  for (const [path, content] of [...ig.files, ...demoTikTokFiles(now, rand, ig.followers, ig.following), ...demoXFiles(now, rand)]) {
    vfs.add(entry(path, content, mtime));
  }
  return { vfs, igFollowers: ig.followers, rand };
}

// A fictional older snapshot so the demo can show "who unfollowed you".
export function demoPreviousSnapshot(current, rand) {
  const followers = [...current.followers];
  const gone = usernames(rand, 17, 6);
  const newcomers = new Set(followers.slice(-23));
  return {
    platform: current.platform,
    account: current.account,
    takenAt: current.takenAt - 34 * DAY,
    followers: [...followers.filter((k) => !newcomers.has(k)), ...gone],
    following: [...current.following.slice(9), 'old.crush', 'brand.deals', 'giveaway.page'],
  };
}
