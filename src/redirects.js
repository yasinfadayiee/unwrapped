// Pages merged into a stronger page with the same search intent (SEO recovery,
// SEO-RECOVERY.md Phase 1 step 3). Each old route answers 301 → new route,
// in every language: /es/blog/x/ → /es/target/. Never remove an entry.
export const MERGED = {
  '/blog/when-did-i-create-my-instagram-account/': '/instagram-account-age/',
  '/blog/see-all-instagram-posts-you-liked/': '/instagram-liked-posts/',
  '/blog/who-unfollowed-me-on-threads/': '/threads-unfollowers/',
  '/blog/see-tiktok-watch-history/': '/tiktok-watch-history/',
  '/blog/telegram-chat-statistics/': '/telegram-chat-analyzer/',
  '/blog/who-do-i-message-most-instagram/': '/instagram-dm-analyzer/',
  '/blog/spotify-most-played-songs-all-time/': '/blog/how-many-hours-spotify-all-time/',
  '/blog/who-did-i-follow-first-on-instagram/': '/blog/who-was-my-first-instagram-follower/',
  '/blog/find-my-first-tweet/': '/blog/search-your-old-tweets/',
};

const LANG = /^\/(es|pt|tr|fr|de)(\/.*)$/;

// The 301 target for a merged page (with or without the trailing slash), or null.
export function mergedTarget(pathname) {
  const m = pathname.match(LANG);
  const prefix = m ? `/${m[1]}` : '';
  let route = m ? m[2] : pathname;
  if (!route.endsWith('/')) route += '/';
  const to = MERGED[route];
  return to ? `${prefix}${to}` : null;
}
