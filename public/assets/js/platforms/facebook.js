// Facebook "Download your information" (JSON).

import { fixMeta, toMs } from '../core/text.js';
import { firstArray, metaRecords } from './meta-common.js';

const FILES = [
  ['friends', /(^|\/)(your_)?friends\.json$/],
  ['removed', /(^|\/)removed_friends\.json$/],
  ['sentRequests', /(^|\/)sent_friend_requests\.json$/],
  ['receivedRequests', /(^|\/)received_friend_requests\.json$/],
  ['rejected', /(^|\/)rejected_friend_requests\.json$/],
  ['following', /(^|\/)(who_you('|’)?ve_followed|who_you_follow|following)\.json$/],
];

const isFacebook = (lower) => /(^|\/)(connections\/friends|friends_and_followers|friends)\//.test(lower) || /your_facebook_activity/.test(lower);

export function detectFacebook(vfs) {
  return Boolean(vfs.find((e) => isFacebook(e.lower) && /friends\.json$/.test(e.lower)) || vfs.find(/your_facebook_activity\//));
}

function people(json) {
  return metaRecords(json)
    .map((r) => ({ name: fixMeta(r.title || r.values.Name || r.value || ''), ts: r.ts }))
    .filter((p) => p.name);
}

async function readJson(vfs, re) {
  const entry = vfs.find((e) => re.test(e.lower) && (isFacebook(e.lower) || /facebook/.test(e.source.toLowerCase())));
  if (!entry) return null;
  try {
    return await entry.json();
  } catch {
    return null;
  }
}

export async function parseFacebook(vfs, progress) {
  progress?.('Reading your Facebook friends…', 0.3);
  const lists = {};
  for (const [key, re] of FILES) {
    const json = await readJson(vfs, re);
    lists[key] = json ? people(json) : [];
  }

  const profile = await readJson(vfs, /profile_information\.json$/);
  const name = fixMeta(profile?.profile_v2?.name?.full_name || profile?.profile?.name?.full_name || '');
  const createdAt = toMs(profile?.profile_v2?.registration_timestamp || profile?.profile?.registration_timestamp);

  progress?.('Looking at advertisers…', 0.7);
  const advertisersJson = await readJson(vfs, /advertisers_using_your_activity_or_information\.json$/);
  const advertisers = advertisersJson
    ? firstArray(advertisersJson)
        .map((a) => fixMeta(a.advertiser_name || metaRecords([a])[0]?.values['Advertiser name'] || a.title || ''))
        .filter(Boolean)
    : [];

  const offJson = await readJson(vfs, /off[-_]facebook_activity\.json$|activity_off_meta_technologies\.json$/);
  let offCompanies = 0;
  let offEvents = 0;
  for (const item of offJson ? firstArray(offJson) : []) {
    offCompanies++;
    offEvents += Array.isArray(item.events) ? item.events.length : 1;
  }

  return {
    platform: 'facebook',
    label: 'Facebook',
    account: { name, createdAt },
    lists,
    advertisers,
    offFacebook: { companies: offCompanies, events: offEvents },
    hasRelationships: lists.friends.length > 0,
  };
}
