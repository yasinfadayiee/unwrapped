// Privacy-friendly site statistics: daily counters only. No cookies, no IPs,
// no user ids — a page view is just "+1 for this path today".

import { HttpError, json, readJson } from './http.js';
import { DAY } from './util.js';

const EVENTS = new Set(['view', 'analyze', 'demo', 'checkout', 'nodata', 'tool', 'pay', 'wallet', 'cont']);
const PLAN = /^[a-z]+-(month|year|life)$/;
// Dashboard section ids ("notBack", "timeline"…): which tools people open.
const TOOL = /^[a-z][a-zA-Z]{1,30}$/;
const PATH = /^\/[a-z0-9\-/]{0,100}$/;
const HOST = /^[a-z0-9.-]{3,60}$/;
const LANG = /^[a-z]{2}$/;
const REASON = /^[a-z][a-z-]{1,40}$/;

export async function recordHit(request, env) {
  const body = await readJson(request, 1024);
  const kind = String(body.k || '');
  if (!EVENTS.has(kind)) throw new HttpError(400, 'bad_event');
  const day = Math.floor(Date.now() / DAY);
  const rows = [['event', kind]];
  if (kind === 'view') {
    const path = String(body.p || '').toLowerCase();
    if (!PATH.test(path)) throw new HttpError(400, 'bad_path');
    rows.push(['page', path]);
    const ref = String(body.r || '').toLowerCase().replace(/^www\./, '');
    const own = new URL(request.url).hostname.replace(/^www\./, '');
    rows.push(['ref', HOST.test(ref) && ref !== own ? ref : '(direct)']);
    const lang = String(body.l || '');
    if (LANG.test(lang)) rows.push(['lang', lang]);
  }
  if (kind === 'tool') {
    const tool = String(body.t || '');
    if (!TOOL.test(tool)) throw new HttpError(400, 'bad_tool');
    rows.push(['tool', tool]);
  }
  // Which plan people continue with from the checkout's first screen.
  if (kind === 'cont' && PLAN.test(String(body.p || ''))) rows.push(['plan', String(body.p)]);
  // Why a dropped file had no usable data ("media", "parts", "meta-partial"…).
  if (kind === 'nodata') {
    const reason = String(body.r || 'unknown');
    rows.push(['nodata', REASON.test(reason) ? reason : 'unknown']);
  }
  const stmt = env.DB.prepare('INSERT INTO stats (day, kind, key, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, kind, key) DO UPDATE SET n = n + 1');
  await env.DB.batch(rows.map(([k, v]) => stmt.bind(day, k, v)));
  return new Response(null, { status: 204 });
}

// Last 30 days for the owner dashboard.
export async function statsSummary(env) {
  const from = Math.floor(Date.now() / DAY) - 29;
  const db = env.DB;
  const [daily, pages, refs, langs, events, tools, nodata, plans] = await db.batch([
    db.prepare("SELECT day, n FROM stats WHERE kind = 'event' AND key = 'view' AND day >= ? ORDER BY day").bind(from),
    db.prepare("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'page' AND day >= ? GROUP BY key ORDER BY n DESC LIMIT 20").bind(from),
    db.prepare("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'ref' AND day >= ? GROUP BY key ORDER BY n DESC LIMIT 15").bind(from),
    db.prepare("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'lang' AND day >= ? GROUP BY key ORDER BY n DESC").bind(from),
    db.prepare("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'event' AND day >= ? GROUP BY key").bind(from),
    db.prepare("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'tool' AND day >= ? GROUP BY key ORDER BY n DESC LIMIT 30").bind(from),
    db.prepare("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'nodata' AND day >= ? GROUP BY key ORDER BY n DESC LIMIT 20").bind(from),
    db.prepare("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'plan' AND day >= ? GROUP BY key ORDER BY n DESC LIMIT 20").bind(from),
  ]);
  return json({
    ok: true,
    daily: daily.results.map((r) => ({ day: r.day * DAY, n: r.n })),
    pages: pages.results,
    refs: refs.results,
    langs: langs.results,
    events: Object.fromEntries(events.results.map((r) => [r.key, r.n])),
    tools: tools.results,
    nodata: nodata.results,
    plans: plans.results,
  });
}
