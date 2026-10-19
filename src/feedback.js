// User feedback and testimonials. People rate Unwrapped after an analysis and
// may leave a sentence; only what they type is sent — never anything from
// their export. A testimonial is shown publicly only when its author allowed
// it and the owner approved it in the admin panel.

import { HttpError, json, rateLimit, readJson, visitorId } from './http.js';

export const FEEDBACK_SCHEMA = `CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  text TEXT,
  name TEXT,
  platform TEXT,
  lang TEXT,
  public INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 0
)`;

const PLATFORM = /^[a-z]{1,20}$/;
const LANG = /^[a-z]{2}$/;
const clean = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max) || null;

export async function submitFeedback(request, env) {
  await rateLimit(env, 'feedback', await visitorId(request, env), 5);
  const body = await readJson(request, 4096);
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'bad_rating');
  const platform = PLATFORM.test(String(body.platform || '')) ? String(body.platform) : null;
  const lang = LANG.test(String(body.lang || '')) ? String(body.lang) : null;
  await env.DB.prepare('INSERT INTO feedback (ts, rating, text, name, platform, lang, public) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(Date.now(), rating, clean(body.text, 500), clean(body.name, 40), platform, lang, body.public === true ? 1 : 0)
    .run();
  return json({ ok: true });
}

// Approved testimonials, the visitor's language first.
export async function testimonials(env, url) {
  const lang = LANG.test(url.searchParams.get('lang') || '') ? url.searchParams.get('lang') : 'en';
  const { results } = await env.DB.prepare(
    `SELECT text, name, rating, platform FROM feedback
     WHERE approved = 1 AND public = 1 AND rating >= 4 AND text IS NOT NULL
     ORDER BY (lang = ?) DESC, ts DESC LIMIT 6`,
  )
    .bind(lang)
    .all();
  return json({ ok: true, items: results }, 200, { 'cache-control': 'public, max-age=900' });
}

export async function adminFeedback(env) {
  const { results } = await env.DB.prepare('SELECT * FROM feedback ORDER BY ts DESC LIMIT 200').all();
  const avg = await env.DB.prepare('SELECT COUNT(*) AS n, AVG(rating) AS avg FROM feedback').first();
  return json({ ok: true, items: results, count: avg?.n || 0, average: avg?.avg ? Math.round(avg.avg * 10) / 10 : null });
}

export async function approveFeedback(env, body) {
  const id = Number(body.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'bad_id');
  const res = await env.DB.prepare('UPDATE feedback SET approved = ? WHERE id = ? AND public = 1').bind(body.approved ? 1 : 0, id).run();
  if (!res.meta?.changes) throw new HttpError(404, 'not_found_or_private');
  return json({ ok: true });
}
