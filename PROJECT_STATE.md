# Project state

Short handoff note for anyone picking up work. Read this first instead of scanning the repo. Update it when a PR merges.

_Last updated: 2026-10-20, after PR #21 merged (not yet deployed)._

## What this is

Unwrapped: a privacy-first analyzer for social media data exports (Instagram, TikTok, X, Facebook, LinkedIn, Telegram, WhatsApp, Spotify, Threads). Files are parsed in the browser. Paid features use crypto payments. Hosted on Cloudflare (`wrangler.jsonc`, D1 database).

## Layout

- `src/` app and parsers, `site/` page sources and i18n (`site/i18n/<lang>/pages`), `public/` built output
- `scripts/` build, OG images, IndexNow, `check-export.mjs`, `server/` Node server, `test/` tests
- Languages: en, de, es, fr, pt, tr

## Commands

- `npm run build`: build pages into `public/`
- `npm test`: run all tests (89 passed at PR #16)
- `npm run check-export -- <zip or folder>`: run a real export through the parsers locally
- `npm run deploy`: build, `wrangler deploy`, then IndexNow ping

## Recently merged

- #21 Pay with USDT page: P2P exchange and friend route for buyers without a card, in all six languages
- #20 support e-mail and "Unwrapped team" line on About
- #19 this file: deploy and large-export timing
- #18 check-export prints account name and DM totals
- #17 this file
- #16 check-export script, mobile hero shows the drop zone on the first screen, privacy monitor wording, new blog articles (TikTok watch history, LinkedIn removals, Instagram comments, first tweet, WhatsApp who texts first, Spotify all-time hours) in all six languages
- #15 email reminder when an export is ready, IndexNow ping after deploy
- #14 three Instagram blog articles
- #13 llms.txt and site-verification tags
- #12 pay-readiness fixes: refund policy, Terms and Privacy, lost-key help

## Open PRs

None.

## Next steps

1. Done 2026-10-20: deployed main (1ab1e1dd, PR #22), Cloudflare version c5a8b66e. Deploy is manual from C:\unwrapped.
2. Done 2026-10-20: support@myunwrapped.com forwards to Yasin's Gmail via Cloudflare Email Routing.
3. Optional: run `npm run check-export` on a real export when one is at hand (synthetic exports for all platforms already pass; 50k followers / 120k DMs parse in ~1.2s).
4. Done: Search Console property https://myunwrapped.com/ verified (file public/google5d8b9e7695a99b54.html), sitemap read OK. Product Hunt launched 2026-10-20: https://www.producthunt.com/products/unwrapped-2 (don't relaunch soon). Extra gallery images in C:\unwrapped\launch\ (not committed).
5. Keep this file current: add each merged PR and the next step.

## Decisions

- Yasin lives in Malaysia (an earlier note saying Iran was wrong) and has a verified Wise account. Card payments were considered (Lemon Squeezy paying out to Wise, code in closed PR #24) but Yasin dropped them on 2026-10-20: crypto only for now. If revived, take the code from closed PR #24; don't take card payments directly into Wise.
- No team photo; a made-up one was declined.

## Rules for working here

- Low token use; don't read `node_modules/`, `public/` build output, lock files, or logs.
- Build and test once, at the end of a task.
- One thread at a time; ask before starting a new one or doing anything outward-facing.
