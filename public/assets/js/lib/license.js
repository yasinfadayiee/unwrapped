// Pro status lives in this browser as { key, token }. The token is signed by
// the server (ECDSA P-256) and verified here with the public key, so editing
// storage cannot fake it. Works offline until the token's own expiry.

import { api, getConfig } from './api.js';

const STORE = 'unw.license.v1';
const DAY = 86_400_000;

function b64urlBytes(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || 'null');
  } catch {
    return null;
  }
}

export function storeLicense(key, token) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ key, token }));
  } catch {
    /* private mode */
  }
  stateCache = null;
  window.dispatchEvent(new CustomEvent('unw:license'));
}

export function clearLicense() {
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* ignore */
  }
  stateCache = null;
  window.dispatchEvent(new CustomEvent('unw:license'));
}

export function storedKey() {
  return readStore()?.key || null;
}

async function verify(token, jwk) {
  if (!token || !jwk || !crypto.subtle) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlBytes(sig), new TextEncoder().encode(body));
    return ok ? JSON.parse(new TextDecoder().decode(b64urlBytes(body))) : null;
  } catch {
    return null;
  }
}

let stateCache = null;
let refreshing = null;

export async function proState(allowRefresh = true) {
  if (stateCache) return stateCache;
  const stored = readStore();
  const free = { pro: false, key: stored?.key || null };
  if (!stored?.key) return (stateCache = free);
  const config = await getConfig();
  const payload = stored.token ? await verify(stored.token, config.publicKey) : null;
  const now = Date.now();
  if (!payload || payload.x < now) {
    // Missing/expired token: refresh once if the license may still be valid.
    if (allowRefresh && !config.offline) {
      const refreshed = await refresh(stored.key).catch(() => null);
      if (refreshed) return proState(false);
    }
    return (stateCache = free);
  }
  if (payload.x - now < 3 * DAY && !config.offline) refresh(stored.key).catch(() => {});
  return (stateCache = {
    pro: true,
    key: stored.key,
    plan: payload.p,
    expiresAt: payload.e,
    lifetime: payload.e === null,
  });
}

async function refresh(key) {
  if (!refreshing) {
    refreshing = api('/api/license/activate', { method: 'POST', body: { key, refresh: true } })
      .then((res) => {
        if (res.ok && res.token) {
          storeLicense(res.license.key, res.token);
          return true;
        }
        if (res.reason === 'expired' || res.reason === 'revoked') {
          storeLicense(key, null);
        }
        return false;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export async function activateKey(rawKey) {
  const res = await api('/api/license/activate', { method: 'POST', body: { key: rawKey } });
  if (res.ok && res.token) storeLicense(res.license.key, res.token);
  return res;
}
