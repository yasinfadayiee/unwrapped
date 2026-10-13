// Anonymous site counters: "+1 view of this page today", nothing else — no
// cookies, no ids, and nothing about the files you analyze. Respects Do Not Track.

const off = navigator.doNotTrack === '1' || window.doNotTrack === '1' || location.hostname === 'localhost';

export function track(kind, extra = {}) {
  if (off) return;
  try {
    const body = JSON.stringify({ k: kind, ...extra });
    if (!navigator.sendBeacon?.('/api/hit', new Blob([body], { type: 'application/json' }))) {
      fetch('/api/hit', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
    }
  } catch {
    /* never break the page for statistics */
  }
}

export function trackView() {
  let ref = '';
  try {
    ref = document.referrer ? new URL(document.referrer).hostname : '';
  } catch {
    /* ignore */
  }
  track('view', { p: location.pathname, r: ref, l: (document.documentElement.lang || 'en').slice(0, 2) });
}
