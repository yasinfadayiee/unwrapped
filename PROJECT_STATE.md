# Project state

Short handoff note for anyone picking up work. Read this first instead of scanning the repo. Update it when a PR merges.

_Last updated: 2026-10-20, after the #33 deploy._

## What this is

Unwrapped: a privacy-first analyzer for social media data exports (Instagram, TikTok, X, Facebook, LinkedIn, Telegram, WhatsApp, Spotify, Threads). Files are parsed in the browser. Paid features use crypto payments. Hosted on Cloudflare (`wrangler.jsonc`, D1 database).

## Layout

- `src/` app and parsers, `site/` page sources and i18n (`site/i18n/<lang>/pages`), `public/` built output
- `scripts/` build, OG images, IndexNow, `check-export.mjs`, `server/` Node server, `test/` tests
- Languages: en, de, es, fr, pt, tr

## Commands

- `npm run build`: build pages into `public/`
- `npm test`: run all tests (90 passed at PR #29)
- `npm run check-export -- <zip or folder>`: run a real export through the parsers locally
- `npm run deploy`: build, `wrangler deploy`, then IndexNow ping

## Recently merged

- #33 header: account button next to the language switch
- #32 password-free accounts: sign up / sign in with an e-mailed 6-digit code or one-tap link (`src/users.js`, tables users, login_codes, sessions; HttpOnly cookie `uw_session`). /account/ shows the user's licenses (matched by e-mail), orders, invite rewards and tool links; keys can be added to an account. Admin has a Users section (`GET /api/admin/users`: totals, sign-ups per day, search). Codes go out through Resend (RESEND_API_KEY + EMAIL_FROM, already set).
- #30 /guides/ hub links the Spotify, WhatsApp and Telegram export guides
- #29 LinkedIn data download guide in all six languages, `test/links.test.mjs` (no broken internal links), public/ rebuilt (it was behind the sources)
- #27 Product Hunt link strip above the header, in all six languages
- #25, #26 this file: card payments dropped, Search Console and Product Hunt done
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
5. Done 2026-10-20: deployed main (8eba5092, PR #30), Cloudflare version 49569254. IndexNow 200 from Bing and Yandex. `npm run deploy` is allowed in C:\unwrapped\.claude\settings.local.json, so Claude can deploy from Yasin's PC via Remote Control. A stash in C:\unwrapped holds old local public/ build output; it can be dropped.
6. Done 2026-10-20: deployed main (03639d57, PR #34, accounts #32/#33), Cloudflare version eaabab06. IndexNow 200 from Bing and Yandex (536 URLs). The deploy rule in settings.local.json now covers PowerShell too. RESEND_API_KEY and EMAIL_FROM were already set (Resend shows license and bio e-mails delivered), so sign-in codes should send.
7. Keep this file current: add each merged PR and the next step.

## Decisions

- Yasin lives in Malaysia (an earlier note saying Iran was wrong) and has a verified Wise account. Card payments were considered (Lemon Squeezy paying out to Wise, code in closed PR #24) but Yasin dropped them on 2026-10-20: crypto only for now. If revived, take the code from closed PR #24; don't take card payments directly into Wise.
- No team photo; a made-up one was declined.

## Rules for working here

- Low token use; don't read `node_modules/`, `public/` build output, lock files, or logs.
- Build and test once, at the end of a task.
- Login is e-mail code / magic link only, no passwords (Yasin chose this 2026-10-20 to keep the no-password promise).
- ADMIN_TOKEN is a Cloudflare secret (at least 12 characters, admin.js rejects shorter); Yasin keeps it in C:\unwrapped\admin-token.local.txt. Claude can't write Cloudflare secrets from Yasin's PC (blocked by the local safety check); Yasin runs `Get-Content file | npx.cmd wrangler secret put NAME` in PowerShell.
- Yasin said on 2026-10-20: keep improving the site without asking, and merge the PRs yourself.
- One thread at a time; ask before starting a new one or doing anything outward-facing.
