// Service worker: caches the app shell so the analyzer keeps working offline
// (yes — you can turn on airplane mode and still unwrap your export).
const VERSION = 'mv4yw84n';
const CACHE = `unwrapped-${VERSION}`;
const CORE = [
  '/',
  `/assets/css/main.css?v=${VERSION}`,
  `/assets/js/site.js?v=${VERSION}`,
  '/assets/js/lib/ui.js',
  '/assets/js/lib/api.js',
  '/assets/js/lib/license.js',
  '/assets/js/lib/format.js',
  '/assets/js/lib/checkout.js',
  '/assets/js/lib/referral.js',
  '/assets/js/vendor/qrcode.js',
  '/assets/js/core/zip.js',
  '/assets/js/core/vfs.js',
  '/assets/js/core/text.js',
  '/assets/js/core/analyze.js',
  '/assets/js/core/insights.js',
  '/assets/js/core/demo.js',
  '/assets/js/platforms/meta-common.js',
  '/assets/js/platforms/instagram.js',
  '/assets/js/platforms/tiktok.js',
  '/assets/js/platforms/x.js',
  '/assets/js/platforms/facebook.js',
  '/assets/js/platforms/linkedin.js',
  '/assets/js/app/app.js',
  '/assets/js/app/charts.js',
  '/assets/js/app/components.js',
  '/assets/js/app/orbit.js',
  '/assets/js/app/queue.js',
  '/assets/js/app/snapshots.js',
  '/assets/js/app/story.js',
  '/assets/js/app/story-video.js',
  '/assets/js/app/views-common.js',
  '/assets/js/app/views-cross.js',
  '/assets/js/app/views-facebook.js',
  '/assets/js/app/views-friends.js',
  '/assets/js/app/views-instagram.js',
  '/assets/js/app/views-linkedin.js',
  '/assets/js/app/views-tiktok.js',
  '/assets/js/app/views-wrapped.js',
  '/assets/js/app/views-x.js',
  '/assets/js/app/wrapped.js',
  '/assets/fonts/bricolage-wght.woff2',
  '/assets/fonts/inter-wght.woff2',
  '/assets/fonts/instrument-serif-italic.woff2',
  '/assets/fonts/jetbrains-mono-wght.woff2',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('unwrapped-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
