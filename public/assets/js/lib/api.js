// Same-origin API client. The only server this site ever talks to is its own.

export class ApiError extends Error {
  constructor(code, status, data) {
    super(code);
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, headers = {}, timeout = 15000 } = {}) {
  const res = await fetch(path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
    credentials: 'same-origin',
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new ApiError((data && data.error) || `http_${res.status}`, res.status, data);
  return data;
}

const FALLBACK_CONFIG = {
  ok: false,
  brand: 'Unwrapped',
  plans: [
    { id: 'month', name: 'Pro · 30 days', short: 'Monthly', priceUsd: 7, days: 30, blurb: 'Perfect for a quick clean-up.' },
    { id: 'year', name: 'Pro · 12 months', short: 'Yearly', priceUsd: 29, days: 365, badge: 'Most popular', blurb: 'Track who unfollows you all year.' },
    { id: 'life', name: 'Pro · Lifetime', short: 'Lifetime', priceUsd: 59, days: null, badge: 'Pay once', blurb: 'Every tool, every future update.' },
  ],
  features: [
    'Full lists — every account, no limits',
    'Who unfollowed you, snapshot after snapshot',
    'Unfollow queue with safe daily pacing',
    'Deep insights for TikTok, X, Facebook & LinkedIn',
    'Cross-platform overlap map',
    'Wrapped cards without watermark + all themes',
    'CSV export of any list',
  ],
  methods: [],
  freeListLimit: 20,
  publicKey: null,
};

let configPromise = null;
export function getConfig() {
  if (!configPromise) {
    configPromise = api('/api/config', { timeout: 8000 })
      .then((cfg) => {
        try {
          if (cfg.publicKey) localStorage.setItem('unw.pubkey', JSON.stringify(cfg.publicKey));
        } catch {
          /* storage unavailable */
        }
        return cfg;
      })
      .catch(() => {
        let publicKey = null;
        try {
          publicKey = JSON.parse(localStorage.getItem('unw.pubkey') || 'null');
        } catch {
          /* ignore */
        }
        return { ...FALLBACK_CONFIG, publicKey, offline: true };
      });
  }
  return configPromise;
}
