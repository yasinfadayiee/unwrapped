# Project state

Short handoff note for anyone picking up work. Read this first instead of scanning the repo. Update it when a PR merges.

_Last updated: 2026-10-20, after PR #18 merged and deployed._

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

1. Done 2026-10-20: synthetic exports in each platform's official format (Instagram JSON + HTML + DMs, TikTok, X, Facebook + Messenger, LinkedIn, WhatsApp Android + iOS, Telegram, Spotify basic + extended) all parsed with correct counts. Still worth a run on a real export when one is at hand. Large account (50k followers, 300 chats / 120k DMs) parses in ~1.2s in Node.
2. Done 2026-10-20: deployed main (dc9bf173) to myunwrapped.com, version cd19a6f4. Deploy is manual from C:\unwrapped (no CI). Old local build output is in git stash@{0} there.
4. Open decisions for Yasin (from analysis/pay-readiness-fa.md): support name/photo/email + About page, card payments (Paddle/Lemon Squeezy/Stripe), Search Console and Product Hunt.
3. Keep this file current: add each merged PR and the next step.

## Rules for working here

- Low token use; don't read `node_modules/`, `public/` build output, lock files, or logs.
- Build and test once, at the end of a task.
- One thread at a time; ask before starting a new one or doing anything outward-facing.
