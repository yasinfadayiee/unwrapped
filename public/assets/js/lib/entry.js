// Landing-page intent only; no user data, storage or network requests.
const ENTRIES = {
  '/instagram-message-viewer/': { platform: 'instagram', view: 'messages' },
  '/instagram-follower-tracker/': { platform: 'instagram', view: 'unfollowers' },
  '/instagram/': { platform: 'instagram', view: 'notBack' },
  '/blog/who-unfollowed-me-on-tiktok/': { platform: 'tiktok', view: 'unfollowers' },
  '/blog/instagram-search-history/': { platform: 'instagram', view: 'privacy' },
};

export function entryForPath(pathname) {
  const route = pathname.replace(/^\/(?:es|pt|tr|fr|de)(?=\/|$)/, '').replace(/\/?$/, '/');
  return ENTRIES[route] || null;
}

export function entrySelection(datasets, entry) {
  const index = entry ? datasets.findIndex((ds) => ds.platform === entry.platform) : -1;
  return { index: index < 0 ? 0 : index, view: index < 0 ? 'overview' : entry.view };
}
