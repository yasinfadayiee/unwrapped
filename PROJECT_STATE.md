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

1. Yasin: deploy #20 and #21 from C:\unwrapped: `git pull` then `npm.cmd run deploy` (no CI; deploy is manual).
2. Yasin: turn on Cloudflare Email Routing so support@myunwrapped.com forwards to a real inbox.
3. Optional: run `npm run check-export` on a real export when one is at hand (synthetic exports for all platforms already pass; 50k followers / 120k DMs parse in ~1.2s).
4. Open decisions for Yasin (outward-facing, ask first): Google Search Console submission, Product Hunt launch.
5. Keep this file current: add each merged PR and the next step.

## Decisions

- Card payments (Paddle, Lemon Squeezy, Stripe) are not possible: Yasin is in Iran. Crypto (USDT) only, with the P2P/friend route from #21 for buyers without crypto.
- No team photo; a made-up one was declined.

## Rules for working here

- Low token use; don't read `node_modules/`, `public/` build output, lock files, or logs.
- Build and test once, at the end of a task.
- One thread at a time; ask before starting a new one or doing anything outward-facing.
