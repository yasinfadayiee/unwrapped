// Run the whole site on any machine with Node 22+ (a VPS, a home server…):
//   node server/node-server.js
// Settings are read from environment variables or a `.env` file in the
// project root (same names as in wrangler.jsonc / the deployment guide).

import http from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import worker from '../src/worker.js';
import { D1Shim } from './d1-shim.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

function loadDotEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const fileVars = { ...loadDotEnv(path.join(ROOT, '.env')), ...loadDotEnv(path.join(ROOT, '.dev.vars')) };
const vars = { ...fileVars, ...process.env };
const dbFile = vars.DB_PATH || path.join(ROOT, 'data', 'unwrapped.sqlite');
if (dbFile !== ':memory:') mkdirSync(path.dirname(dbFile), { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

// Minimal support for the Cloudflare `_headers` file format.
function loadHeaderRules() {
  const file = path.join(PUBLIC, '_headers');
  if (!existsSync(file)) return [];
  const rules = [];
  let current = null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = line.trim();
      const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
      current = { re, headers: {} };
      rules.push(current);
    } else if (current) {
      const idx = line.indexOf(':');
      if (idx > 0) current.headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    }
  }
  return rules;
}
const headerRules = loadHeaderRules();

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function serveStatic(request) {
  const url = new URL(request.url);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.includes('\0') || pathname.split('/').includes('..')) return new Response('Bad request', { status: 400 });
  if (pathname.startsWith('/_')) pathname = '/__not_found__'; // never serve _headers etc.

  let file = null;
  let status = 200;
  const target = path.join(PUBLIC, pathname);
  if (pathname.endsWith('/')) {
    if (await isFile(path.join(target, 'index.html'))) file = path.join(target, 'index.html');
  } else if (pathname.endsWith('/index.html')) {
    return Response.redirect(new URL(pathname.slice(0, -10), url), 307);
  } else if (await isFile(target)) {
    file = target;
  } else if (await isFile(path.join(target, 'index.html'))) {
    return Response.redirect(new URL(`${pathname}/${url.search}`, url), 307);
  } else if (await isFile(`${target}.html`)) {
    file = `${target}.html`;
  }
  if (!file) {
    file = path.join(PUBLIC, '404.html');
    status = 404;
  }
  const headers = new Headers({ 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  for (const rule of headerRules) {
    if (rule.re.test(pathname)) for (const [k, v] of Object.entries(rule.headers)) headers.set(k, v);
  }
  return new Response(await readFile(file), { status, headers });
}

const env = { ...vars, DB: new D1Shim(dbFile), ASSETS: { fetch: serveStatic } };
const ctx = { waitUntil: (p) => Promise.resolve(p).catch((err) => console.error(err)), passThroughOnException() {} };

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    // Only trust X-Forwarded-For when explicitly running behind a proxy.
    if (vars.TRUST_PROXY !== '1') headers.set('x-forwarded-for', req.socket.remoteAddress || 'local');
    const request = new Request(`http://${req.headers.host || 'localhost'}${req.url}`, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    const response = await worker.fetch(request, env, ctx);
    const outHeaders = {};
    response.headers.forEach((v, k) => (outHeaders[k] = v));
    res.writeHead(response.status, outHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Internal error');
  }
});

const port = Number(vars.PORT) || 8787;
server.listen(port, () => console.log(`Unwrapped running on http://localhost:${port}`));

// Cron equivalents: every minute, plus renewal reminders at 09:00 UTC.
setInterval(() => {
  const now = new Date();
  const cron = now.getUTCHours() === 9 && now.getUTCMinutes() === 0 ? '0 9 * * *' : '* * * * *';
  worker.scheduled({ cron, scheduledTime: now.getTime() }, env, ctx).catch((err) => console.error('cron', err));
  if (cron !== '* * * * *') worker.scheduled({ cron: '* * * * *' }, env, ctx).catch(() => {});
}, 60_000);
