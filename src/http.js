import { sha256Hex, HOUR } from './util.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
}

export function fail(status, error, extra = {}) {
  return json({ ok: false, error, ...extra }, status);
}

export async function readJson(request, maxBytes = 16_384) {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'payload_too_large');
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

// A short, salted hash of the visitor IP. Raw IPs are never stored.
export async function visitorId(request, env) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip =
    request.headers.get('cf-connecting-ip') || (forwarded ? forwarded.split(',')[0].trim() : '') || 'local';
  return (await sha256Hex(`${env.IP_SALT || 'unwrapped'}|${ip}`)).slice(0, 24);
}

// Fixed-window rate limit stored in D1. Throws 429 when exceeded.
export async function rateLimit(env, bucket, visitor, limit, windowMs = HOUR) {
  const now = Date.now();
  const resetAt = now + windowMs;
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (k, n, reset_at) VALUES (?, 1, ?)
     ON CONFLICT(k) DO UPDATE SET
       n = CASE WHEN reset_at < ? THEN 1 ELSE n + 1 END,
       reset_at = CASE WHEN reset_at < ? THEN ? ELSE reset_at END
     RETURNING n`,
  )
    .bind(`${bucket}:${visitor}`, resetAt, now, now, resetAt)
    .first();
  if (row && row.n > limit) throw new HttpError(429, 'too_many_requests');
}
