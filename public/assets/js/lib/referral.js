// Remembers a friend's invite code from ?ref=CODE for 30 days.

import { api } from './api.js';

const KEY = 'unw.ref.v1';
const TTL = 30 * 86_400_000;

export function storedRef() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && Date.now() - v.ts < TTL ? v.code : null;
  } catch {
    return null;
  }
}

export function forgetRef() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// Reads ?ref= from the URL, validates it and stores it. Returns true when a new valid code was saved.
export async function captureRef() {
  const params = new URLSearchParams(location.search);
  const code = (params.get('ref') || '').trim();
  if (!code) return false;
  params.delete('ref');
  const clean = `${location.pathname}${params.toString() ? `?${params}` : ''}${location.hash}`;
  history.replaceState(history.state, '', clean);
  try {
    const res = await api(`/api/referral/check?code=${encodeURIComponent(code)}`, { timeout: 8000 });
    if (!res.ok) return false;
    localStorage.setItem(KEY, JSON.stringify({ code: code.toUpperCase(), ts: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function inviteLink(code) {
  return `${location.origin}/?ref=${encodeURIComponent(code)}`;
}
