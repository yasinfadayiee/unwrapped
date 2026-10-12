# Unwrapped

**Your socials, unwrapped.** A privacy-first web app that decodes the official data exports of
Instagram, Threads, TikTok, X (Twitter), Facebook and LinkedIn — entirely in the visitor's browser —
and sells three paid tiers — **Plus**, **Pro** and **Creator** — with fully automatic crypto payments.

- **Relationships** — who doesn't follow you back, fans, mutuals, pending requests, close friends, blocked…
- **Who unfollowed you** — every analyzed export becomes a private snapshot (IndexedDB); a newer export is diffed automatically.
- **Habits** — TikTok screen time rebuilt from watch history (sessions, binges, heatmap, persona), X posting stats, Instagram DM/likes stats.
- **Privacy X-ray** — advertisers holding your data, inferred interests, logins/devices, connected apps → exposure score A–F.
- **Cross-platform map** — who follows you on Instagram but not on TikTok, and vice versa.
- **Wrapped cards** — 1080×1920 story cards in four themes (free = watermark).
- **Unfollow queue** — opens profiles one by one with safe daily pacing (the user unfollows manually).
- **Verifiable privacy** — strict CSP (`connect-src 'self'`), live "0 network requests" monitor, works offline (service worker).
- **Payments** — direct USDT-TRC20 to your own wallet (unique amounts + blockchain watcher + "paste your tx hash") and optional NOWPayments (150+ coins). Licenses are ECDSA-signed tokens verified in the browser.
- **Owner dashboard** — revenue, conversion, health checks, orders, manual licenses, event log at `/admin/`.
- **Referral program** — every Pro license gets an invite link (`/?ref=CODE`): friends get 10% off, the inviter gets 30 free days per paid order (`referralDiscount` / `referralRewardDays` in `src/config.js`).
- **SEO guides** — article pages under `/guides/` with Article + FAQ structured data.
- **Pro Lab** (Pro) — Ghost Detector (reply times, left on read, who texts first), Engagement Audit (one-way support, dead follows), Growth Time Machine (audience curve, churn, follow-back speed), Friendship Radar.
- **Creator tools** — Audience Quality (bot/spam follower detector with a grade), Best Time to Post (real X engagement, or audience activity), white-label PDF client report.
- **Account health** (free) — one 0–100 score from the factors an export can measure, weakest first, each linking to the tool that fixes it; shareable card.
- **Friendship Wrapped** (Pro) — a story card for you and one friend (streak, reply speed, friendship type), showing only a nickname you type.
- **Re-export reminders** — a calendar file (.ics) built on the device, so users come back with a fresh export.
- **SEO landing pages** — `/tools/`, `/fake-follower-checker/`, `/instagram-dm-analyzer/`, `/best-time-to-post/`, `/instagram-audit/` (FAQ structured data, shared `related-tools` partial).
- **Tiers & upgrades** — prices in `src/config.js` (`TIERS`, `PLANS`), tool → tier mapping in `public/assets/js/lib/tiers.js`. Upgrading converts the remaining time at fair value (yearly prices); a lifetime Pro license can add Creator time and falls back to lifetime Pro afterwards. Old plan ids (`month`/`year`/`life`) keep working as Pro.

## Project layout

```
public/            Static site served as-is (built pages + assets)
  assets/css/      Design system (main.css)
  assets/js/core/  ZIP reader, virtual FS, analysis, demo data   (pure, unit-tested)
  assets/js/platforms/  Parsers: instagram, tiktok, x, facebook, linkedin
  assets/js/app/   Dashboard UI: views, charts, orbit, wrapped cards, snapshots, queue
  assets/js/lib/   UI toolkit, API client, license verification, checkout
site/              Page sources → `npm run build` writes them into public/
  layout.html, icons.svg, partials/, pages/, sw.template.js
src/               Cloudflare Worker (API): orders, licenses, payments, admin, e-mail
server/            Run the same Worker on any VPS with Node 22+ (D1 shim over node:sqlite)
scripts/           build.js, vendor.js (fonts/QR), make-images.ps1 (icons/OG image)
test/              node:test suites (backend + parsers, incl. ZIP64)
```

## Local development

```bash
npm install
npm run dev
```

Opens on <http://localhost:8787>. `.dev.vars` enables `DEV_MODE=1`, which shows a
"Simulate payment" button in checkout. **Never set DEV_MODE in production.**
Admin locally: <http://localhost:8787/admin/> with token `dev-admin-token-123`.

> Windows tip: if Wrangler fails with `SQLITE_CANTOPEN`, your project path is too long.
> Move the project to a short path (e.g. `C:\unwrapped`) or run
> `npx wrangler dev --persist-to C:\wrangler-state`.

Run the tests:

```bash
npm test
```

## Deploy to Cloudflare (free tier is enough to start)

1. `npx wrangler login`
2. `npm run db:create` → paste the printed `database_id` into `wrangler.jsonc`.
3. Edit `vars` in `wrangler.jsonc`: `SITE_URL`, `TRON_ADDRESS` (your USDT-TRC20 wallet), `SUPPORT_CONTACT`.
4. Secrets:
   ```bash
   npx wrangler secret put ADMIN_TOKEN
   ```
   Optional: `TRONGRID_API_KEY`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `RESEND_API_KEY` (+ `EMAIL_FROM` var).
5. `npm run deploy` (builds pages with your `SITE_URL`, then deploys).
6. Add your domain: Cloudflare dashboard → Workers & Pages → unwrapped → Settings → Domains & Routes.
7. Open `/admin/`, make sure the health check is green, then do one real test purchase.

The database schema is created automatically on first request; the license signing key is
generated automatically and stored in D1.

### Configuration reference

| Name | Type | Purpose |
|---|---|---|
| `SITE_URL` | var | Public origin, used for canonical URLs, redirects and webhooks |
| `BRAND` | var | Brand name shown in pages and e-mails |
| `TRON_ADDRESS` | var | Your USDT (TRC20) receiving address — validated with its checksum |
| `SUPPORT_CONTACT` | var | Shown to buyers on the license page |
| `EMAIL_FROM` | var | Sender for license/renewal e-mails (needs `RESEND_API_KEY`) |
| `ADMIN_TOKEN` | secret | Owner dashboard password (≥ 12 characters) |
| `TRONGRID_API_KEY` | secret | Recommended: higher TronGrid rate limits |
| `NOWPAYMENTS_API_KEY` / `NOWPAYMENTS_IPN_SECRET` | secrets | Enables "150+ coins" checkout |
| `NOWPAYMENTS_ACCEPT_CONFIRMED` | var | `1` = activate on `confirmed` instead of waiting for `finished` |
| `RESEND_API_KEY` | secret | Enables license + renewal-reminder e-mails |
| `IP_SALT` | secret | Salt for hashed visitor IDs used by rate limiting |
| `TRONGRID_URL`, `TRON_USDT_CONTRACT` | vars | Point at the Nile testnet for testing |

Prices, plan lengths, free-tier limits and tolerances live in `src/config.js`.

## How the TRON payments work

1. Checkout reserves a **unique amount** a few cents below the list price (e.g. 28.81 USDT for $29).
2. A cron trigger (every minute) and the buyer's status polling read incoming USDT transfers
   from TronGrid (`only_confirmed=true`) and match them by exact amount; shortfalls of up to
   `tronToleranceUsdt` (exchange withdrawal fees) are accepted when the match is unambiguous.
3. Buyers can paste their transaction hash: it is verified on-chain, can't be reused, and several
   transfers can top up one order.
4. On payment the order flips to `paid` exactly once (idempotent) and a license is created or
   extended; the browser receives an ECDSA-signed token.

NOWPayments uses signed IPN webhooks (HMAC-SHA512, recursive key sort) that are double-checked
against the NOWPayments API before activation.

## Self-hosting on a VPS

```bash
node server/node-server.js
```

Uses `node:sqlite` (Node ≥ 22.13). Settings come from environment variables or a `.env` file
(same names as above, plus `PORT`, `DB_PATH`, `TRUST_PROXY=1` behind a reverse proxy).
Put Caddy or Nginx in front for HTTPS.

## Editing pages

Edit files in `site/pages` and `site/partials`, then `npm run build`. Each page starts with a
`<!--page {...}-->` header (route, title, description, `faqSchema`, `noindex`). The build writes
`sitemap.xml`, `robots.txt` and a versioned `sw.js`. Re-generate icons/OG image on Windows with
`powershell -File scripts/make-images.ps1`.

## Maintenance notes

Platforms occasionally change their export formats. Parsers are written defensively (old and new
Instagram layouts, JSON/HTML/TXT, label_values) and covered by tests — when a format changes, add
a fixture to `test/parsers.test.mjs`, adjust the parser, and redeploy.

Not affiliated with Instagram, Meta, TikTok, X or LinkedIn.
