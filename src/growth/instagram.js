// Instagram via the official "Instagram API with Instagram Login" (professional
// accounts). OAuth only — we never see a password. Comment-to-DM uses Meta's
// Private Replies; everything an account receives arrives by signed webhook.

import { b64urlDecode, hmacHex, timingSafeEqual } from '../util.js';

const GRAPH = 'https://graph.instagram.com/v21.0';
export const IG_SCOPES = ['instagram_business_basic', 'instagram_business_manage_comments', 'instagram_business_manage_messages'];

export function instagramEnabled(env) {
  return Boolean(env.IG_APP_ID && env.IG_APP_SECRET && env.IG_VERIFY_TOKEN && env.GROWTH_KEY);
}

export function authorizeUrl(env, redirectUri, state) {
  const q = new URLSearchParams({ enable_fb_login: '0', force_authentication: '1', client_id: env.IG_APP_ID, redirect_uri: redirectUri, response_type: 'code', scope: IG_SCOPES.join(','), state });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

async function asJson(res, what) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`${what}: ${res.status} ${JSON.stringify(data.error || data).slice(0, 300)}`);
  return data;
}

// code → short-lived token → long-lived (60 days) token + profile.
export async function exchangeCode(env, code, redirectUri) {
  const form = new URLSearchParams({ client_id: env.IG_APP_ID, client_secret: env.IG_APP_SECRET, grant_type: 'authorization_code', redirect_uri: redirectUri, code });
  const short = await asJson(await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form }), 'token');
  const long = await asJson(
    await fetch(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: env.IG_APP_SECRET, access_token: short.access_token })}`),
    'long-lived token',
  );
  const me = await asJson(await fetch(`${GRAPH}/me?${new URLSearchParams({ fields: 'user_id,username', access_token: long.access_token })}`), 'profile');
  return { token: long.access_token, expiresAt: Date.now() + (long.expires_in || 5_184_000) * 1000, userId: String(me.user_id || short.user_id), username: me.username || '' };
}

// Long-lived tokens can be refreshed once they are 24 h old; we do it weekly.
export async function refreshToken(token) {
  const data = await asJson(await fetch(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })}`), 'refresh');
  return { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 5_184_000) * 1000 };
}

// Ask Meta to send this account's comments and messages to our webhook.
export async function subscribe(token) {
  return asJson(await fetch(`${GRAPH}/me/subscribed_apps?${new URLSearchParams({ subscribed_fields: 'comments,messages', access_token: token })}`, { method: 'POST' }), 'subscribe');
}

export async function privateReply(token, igUserId, commentId, text) {
  return asJson(
    await fetch(`${GRAPH}/${igUserId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
    }),
    'private reply',
  );
}

export async function publicReply(token, commentId, text) {
  return asJson(await fetch(`${GRAPH}/${commentId}/replies?${new URLSearchParams({ message: text, access_token: token })}`, { method: 'POST' }), 'public reply');
}

// Meta signs webhook bodies with the app secret: X-Hub-Signature-256: sha256=<hex>.
export async function verifySignature(env, raw, header) {
  const sig = String(header || '').replace(/^sha256=/, '').toLowerCase();
  if (!sig) return false;
  return timingSafeEqual(await hmacHex('SHA-256', env.IG_APP_SECRET, raw), sig);
}

// Normalized comment events from a webhook body.
export function commentEvents(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'comments' || !change.value?.id) continue;
      const v = change.value;
      out.push({ accountExtId: String(entry.id), commentId: String(v.id), text: String(v.text || ''), fromId: String(v.from?.id || ''), fromName: String(v.from?.username || ''), mediaId: String(v.media?.id || '') });
    }
  }
  return out;
}

// Meta's deauthorize / data-deletion callbacks send `signed_request=<sig>.<payload>`
// (both base64url); sig is HMAC-SHA256(payload) keyed with the app secret.
// Returns the Instagram user id it names, or null when the signature is wrong.
export async function parseSignedRequest(env, signedRequest) {
  const [sig, payload] = String(signedRequest || '').split('.');
  if (!sig || !payload) return null;
  const expected = await hmacHex('SHA-256', env.IG_APP_SECRET, payload);
  const given = [...b64urlDecode(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (!timingSafeEqual(expected, given)) return null;
  try {
    const userId = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))).user_id;
    return userId ? String(userId) : null;
  } catch {
    return null;
  }
}
