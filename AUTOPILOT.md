# AUTOPILOT — daily improvement roadmap (myunwrapped.com)

Read by `.github/workflows/improve.yml` (once a day at night in Iran, Claude Sonnet, owner's second Claude
account). Each run does the **first unchecked item only**, ticks it (`- [x] (YYYY-MM-DD) ...`) and stops.
The owner does not review changes, so every change must be correct and safe on its own.

Goal: the first paid licenses (Telegram Stars, crypto). Visitors come from search in 6 languages
(en de es fr pt tr). Portfolio rule (2026-10-26): 0 paid orders by 2026-11-15 → this workflow is switched off
and the site stays online with health checks only.

## Rules for every run
- One small, complete item per run. Never half-finish.
- Read `PROJECT_STATE.md` first (facts), then only the files the item names. Never read `node_modules/`,
  `public/` in bulk, `*.lock`, `*.min.js`, `*.log`. Run `npm test && npm run build` once at the end.
- Pages are built from `site/` (layout, partials, `site/i18n/<lang>/pages`) into `public/` by `npm run build`;
  client JS/CSS live in `public/assets/`. Commit `public/` with the change (repo convention).
- Never touch: `.github/`, `src/`, `server/`, `scripts/`, `test/`, `wrangler.jsonc`, `package.json`,
  `package-lock.json`, any checkout/payment/license/account/admin code in `public/assets/js/`.
  Payments, licenses, accounts, prices and plans are Claude-Opus-only work done on the owner's PC. The workflow
  rejects such changes.
- Privacy is the product: export files are parsed on the device. Never add code that uploads export data,
  tracking pixels or third-party scripts.
- Every user-facing page and string ships in all 6 languages (`test/i18n.test.mjs` checks parity).
- Never invent stats, user counts, reviews, press or platform features. Keep URLs.
- After the change add one line to `PROJECT_STATE.md` "Recently merged" (`- autopilot: <what>`).
- When fewer than 3 items are unchecked, add 3 new specific items at the end of the Backlog that bring a
  first paid order closer (free→paid clarity, trust at the lock card, pages for searches people type), then do
  the first one.
- Finally write a one-line summary in simple Persian for the owner to the summary file the prompt names.

## Backlog
- [x] (2026-10-26) Lock-card privacy note — follow `autopilot/specs/lock-card-privacy-note.md` exactly (skip its screenshot
  step: there is no browser here).
- [ ] Blog post "Instagram accounts you like most" — follow `autopilot/specs/blog-instagram-most-liked.md`
  exactly (skip any screenshot step).
- [ ] (only between 2026-11-10 and 2026-11-30; otherwise skip to the next item) Spotify Wrapped season
  refresh: update /blog/spotify-wrapped-2026/ and /spotify-stats/ copy for the December Wrapped date, verified
  facts only, all 6 languages, with an "updated" date.
