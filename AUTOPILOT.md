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
- Skip items starting "OWNER PC:" (payment/checkout work done on the owner's PC); leave them unchecked.
- When fewer than 3 items are unchecked, add 3 new specific items at the end of the Backlog that bring a
  first paid order closer (free→paid clarity, trust at the lock card, pages for searches people type), then do
  the first one.
- Finally write a one-line summary in simple Persian for the owner to the summary file the prompt names.

## Backlog
<!-- Planner 2026-10-26: 60+ blog posts, ~200 clicks, 0 orders. Next 3 weeks: make "free vs paid" obvious on the
pages that get unfollower traffic, and make paying easy for people without crypto (Telegram Stars). No new
informational blog posts unless listed here. -->
- [x] (2026-10-26) Lock-card privacy note — follow `autopilot/specs/lock-card-privacy-note.md` exactly (skip its screenshot
  step: there is no browser here).
- [ ] OWNER PC: Real end-to-end test purchase on the live site, once with Telegram Stars and once with USDT
  (cheapest plan, e.g. the $3 Pro week): pay → license active → locked rows open → key shown under My account.
  PROJECT_STATE.md still says the Stars live test "waits for owner T14". Fix what breaks, then update
  PROJECT_STATE.md ("Last updated", "Paid features use crypto payments" → Stars + crypto, the Stars line).
- [x] (2026-10-26, Claude Opus on owner PC) OWNER PC: Pricing page names only crypto ("pay with crypto" in title, "Pay with USDT or 150+ coins" in
  description, lead "paid in crypto"). Add Telegram Stars as the first, no-crypto option in title/description/lead,
  plus a FAQ "Can I pay without crypto?" (Stars, in Telegram, how it is delivered), 6 languages. Optionally a short
  /guides/pay-with-telegram-stars/ page linked next to the existing USDT guide link.
- [x] (2026-10-26, Claude Opus on owner PC) OWNER PC: First-purchase friction. Pricing has 4 tiers × up to 4 durations. On the Instagram unfollower lock
  cards ("{n} more accounts"), offer the $3 7-day Pro pass as a secondary option ("or see everything for 7 days — $3")
  next to "Unlock with Plus". Checkout/plan code, so Opus only.
- [x] (2026-10-27) Fix (review): the shared CTA partial never mentions what is free and what is paid, and almost no blog post
  links /pricing/ (only blog-tiktok-liked-videos does). In `site/partials/guide-cta.html` and
  `site/i18n/{de,es,fr,pt,tr}/partials/guide-cta.html`, add one line under "No password, no upload…":
  "Free: every chart, the first 20 rows of each list and how many unfollowed you. Plus shows every name —
  <a href="/pricing/">see plans</a>." (facts from pricing.html rows "Not following back" and "Who unfollowed you";
  no prices). Natural translations using the words pricing.html already uses in each language. Done: 6 partials,
  build passes, links test passes.
- [ ] Fix (review): `site/pages/guide-unfollowers.html` says "for screenshots-free, step-by-step help" (unnatural, and
  sounds like a missing feature). Change to "for step-by-step help". Check the same sentence in the 5 translations and
  fix any equally awkward wording. Copy only.
- [ ] Free-vs-paid box on the 2 highest-intent landing pages: `site/pages/instagram-follower-tracker.html` and
  `site/pages/unfollower-app-alternative.html` (+5 translations each). Above the FAQ, add a small 3-row list
  (Not following back: first 20 free / all with Plus; Who unfollowed you: count free / names with Plus; Search & CSV
  export: Plus) copied from pricing.html rows, then a "See plans" link to /pricing/. Reuse existing classes
  (`checklist` or the pricing table classes); no new CSS, no prices. Skip a page if it already states this.
- [ ] Unfollower blog posts, part 1: in `site/pages/blog-threads-unfollowers.html`, `blog-tiktok-unfollowers.html`,
  `blog-x-not-following-back.html`, `blog-facebook-unfriended.html` (+5 translations each), where the post says the
  tool is free or mentions the result list, add one honest sentence: free shows how many people left (and the first
  20 rows of each list); Plus shows every name — link /pricing/. Before writing, confirm in
  `public/assets/js/app/views-*.js` (read only) that the platform has the unfollower/not-following-back lock; if not,
  skip that post. One sentence per post, no layout change.
- [ ] Unfollower blog posts, part 2: same as part 1 for `blog-losing-followers.html`,
  `blog-unfollow-notification.html`, `blog-instagram-recently-unfollowed.html`, `blog-compare-follower-lists.html`
  (+5 translations each). Skip a post that already links /pricing/.
- [ ] New page /blog/free-instagram-unfollower-checker/ (6 languages) for "free unfollower checker no login":
  honest answer — what Unwrapped shows for free with your own export (pricing.html "What do I get for free?" FAQ and
  the Free column only), what Plus adds, why password apps are risky (link /guides/are-unfollower-apps-safe/), steps
  link /guides/download-instagram-data/, CTA /instagram/ and /pricing/. Copy the structure of
  site/pages/blog-instagram-recently-unfollowed.html; reuse existing art; tile in blog.html (x6); one inbound link
  from guide-unfollowers.html (x6). No competitor names, no stats.
- [ ] Review `site/pages/blog-best-unfollower-apps.html` (+5 translations) like an editor: remove or soften any
  claim about another app that the page cannot back up (prices, features, bans); make sure Unwrapped's own free vs
  paid line matches pricing.html exactly and links /pricing/. If nothing is wrong, tick it with "no change needed".
- [ ] Help page trust FAQ: in `site/pages/help.html` (+5 translations), check that it answers, in plain words and
  matching pricing.html/terms: "What happens after I pay?" (activation automatic), "Do I need an account?" and
  "Can I get a refund?" (link /pricing/ FAQ / /terms/). Add only the missing ones, using facts already on
  pricing.html, terms.html or PROJECT_STATE.md. Never describe checkout steps that you have not read in those files.
- [ ] Blog post "Instagram accounts you like most" — follow `autopilot/specs/blog-instagram-most-liked.md`
  exactly (skip any screenshot step). Where the spec conflicts with "Rules for every run" (PROJECT_STATE line format
  "- autopilot: …", committing), the rules win. Its "free vs Plus" sentence must link /pricing/.
- [ ] (only between 2026-11-10 and 2026-11-30; otherwise skip to the next item) Spotify Wrapped season
  refresh: update /blog/spotify-wrapped-2026/ and /spotify-stats/ copy for the December Wrapped date, verified
  facts only, all 6 languages, with an "updated" date.

## Rules learned
- Specs in `autopilot/specs/` were written for an older workflow: where a spec conflicts with "Rules for every run"
  (PROJECT_STATE line format, commit/PR steps, screenshots), the rules win.
- Every page or post that mentions a paid feature states free vs paid in one honest sentence and links /pricing/.
  Copy the facts from pricing.html; never quote prices outside pricing (prices change only on the owner's PC).
- Traffic already lands on 60+ informational posts with 0 orders: do not add new informational blog posts unless
  the Backlog lists them; improve conversion on existing pages first.
- Read awkward machine-made phrases twice ("screenshots-free"); every language must sound native.
