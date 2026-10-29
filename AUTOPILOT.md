# AUTOPILOT — daily improvement roadmap (myunwrapped.com)

Read by `.github/workflows/improve.yml` (once a day at night in Iran, Claude Sonnet, owner's second Claude
account). Each run does the **first unchecked item only**, ticks it (`- [x] (YYYY-MM-DD) ...`) and stops.
The owner does not review changes, so every change must be correct and safe on its own.

Goal: the first paid licenses (Telegram Stars, crypto). Visitors come from search in 6 languages
(en de es fr pt tr). Portfolio rule (2026-10-26): 0 paid orders by 2026-11-15 → this workflow is switched off
and the site stays online with health checks only.

## SEO recovery mode (since 2026-10-28) — read first
On 2026-10-25 Google search impressions fell from ~2,250/day to ~30/day across all pages, languages and
countries (no manual action, no security issue, 550 pages still indexed, crawling 100% OK). Most likely cause:
~340 blog URLs (57 posts × 6 languages) published within two weeks on a brand-new domain, which Google treats as
scaled content. Plan and checkpoints: `SEO-RECOVERY.md`. Until the owner ends recovery mode:
- **No new pages, posts, guides or translations.** The workflow rejects any new file under `site/pages/` or
  `site/i18n/*/pages/`. Skip items starting "PAUSED".
- Only improve, merge or trim existing pages. Prefer fewer, better pages over more pages.
- When the Backlog runs low, add only items of this kind (editing existing pages for accuracy, depth and
  natural wording, or conversion fixes) — never "pages for searches people type".
- Never edit `site/seo-prune.json` (owner/Claude Opus only). Its translated pages are `noindex`. Spend runs on
  English pages and on translations that are still indexed, not on pruned ones.

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
  first paid order closer (free→paid clarity, trust at the lock card; in SEO recovery mode no new pages), then do
  the first one.
- Finally write a one-line summary in simple Persian for the owner to the summary file the prompt names.

## Backlog
<!-- Planner 2026-10-29: 0 paid orders, deadline 2026-11-15 (~17 days). Search impressions collapsed on 2026-10-25
(recovery mode: no new pages). Competitors that read the same export (SafeUnfollow, Follower Analyzer, Unfollow
Checker) are free, so a buyer must see at a glance what Plus gives that a free checker does not, and must trust
the payment. Order: copy fix, then free-vs-paid and trust copy on the pages that still get unfollower traffic.
Posts merged on 2026-10-28 (e.g. blog-threads-unfollowers, blog-facebook-unfriended) no longer exist: skip any
file that is missing. -->
- [x] (2026-10-29) Fix (review): the shared CTA line (added 2026-10-27) says free shows "how many people unfollowed you", but
  that needs two exports (pricing.html row "Who unfollowed you (from your second export)"). In
  `site/partials/guide-cta.html` and `site/i18n/{de,es,fr,pt,tr}/partials/guide-cta.html` change that part to
  "how many unfollowed you (from your second export)", natural wording in each language, using the words each
  language's pricing.html already uses. Done: 6 partials, build passes.
- [x] (2026-10-26) Lock-card privacy note — follow `autopilot/specs/lock-card-privacy-note.md` exactly (skip its screenshot
  step: there is no browser here).
- [ ] OWNER PC: Real end-to-end test purchase on the live site, once with Telegram Stars and once with USDT
  (cheapest plan, e.g. the $3 Pro week): pay → license active → locked rows open → key shown under My account.
  If the Lemon Squeezy card/PayPal checkout (commit 55a31b55, off until its 4 secrets are set) is wanted, set the
  secrets and test it too: for most buyers, a card is the easiest way to pay. Then update PROJECT_STATE.md (payment
  methods, "Last updated", the Stars line that still "waits for owner T14").
- [ ] OWNER PC: Decide the free tier vs free competitors. SafeUnfollow, Follower Analyzer and Unfollow Checker show
  the full not-following-back list from the same export for free; Unwrapped shows the first 20. Options: keep the
  cap but say on the lock card what Plus adds that free checkers lack (names of who unfollowed across exports, every
  platform, Pro Lab), or raise the cap and lock only unfollower names/history. Lock-card/plan code, Opus only.
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
- [x] (2026-10-27) Fix (review): `site/pages/guide-unfollowers.html` says "for screenshots-free, step-by-step help" (unnatural, and
  sounds like a missing feature). Change to "for step-by-step help". Check the same sentence in the 5 translations and
  fix any equally awkward wording. Copy only.
- [x] (2026-10-29) Pricing FAQ "Why pay if some unfollower checkers are free?" in `site/pages/pricing.html` (+5 translations),
  placed right after "What do I get for free?". Copy only: never change the table, prices, plans or checkout
  markup. Honest answer using only facts already on pricing.html: free already gives every chart, counts and the
  first 20 rows; Plus adds every name, who unfollowed you between exports, on every platform; the file never leaves
  the device; every payment is one-time with no automatic charges; refund if the export can't be read. No competitor
  names, no prices. Done: 6 languages, i18n test passes.
- [ ] Free-vs-paid box on `site/pages/unfollower-app-alternative.html` (+5 translations; the follower tracker page
  already states it, so skip that one). Above the FAQ, a 3-row list copied from pricing.html rows (Not following
  back: first 20 free / all with Plus; Who unfollowed you (second export): count free / names with Plus; Search &
  CSV export: Plus), then a "See plans" link to /pricing/. Reuse existing classes (`checklist`), no new CSS, no prices.
- [ ] `site/pages/guide-unfollowers.html` (+ translations not in `site/seo-prune.json`): make sure it says plainly
  that the first export is the baseline (shows who doesn't follow you back) and that a second export, about two
  weeks later, shows who unfollowed (pricing.html FAQ "When can I see who unfollowed me?"). Add the one free-vs-paid
  sentence linking /pricing/ if it is missing. No other changes.
- [ ] Unfollower posts, part 1: `site/pages/blog-tiktok-unfollowers.html`, `blog-x-not-following-back.html`,
  `blog-losing-followers.html`, `blog-unfollow-notification.html` (+ translations not in seo-prune.json). Where the
  post mentions the result list, add one honest sentence: free shows the first 20 rows of each list and how many
  left (from the second export); Plus shows every name, with a link to /pricing/. First confirm in
  `public/assets/js/app/views-*.js` (read only) that the platform has that lock; if not, skip the post. Skip a post
  that already links /pricing/. One sentence per post, no layout change.
- [ ] Unfollower posts, part 2: same as part 1 for `blog-instagram-recently-unfollowed.html`,
  `blog-compare-follower-lists.html`, `blog-mutual-followers.html`, `blog-unfollow-limit.html`.
- [ ] Help page trust FAQ: in `site/pages/help.html` (+5 translations), check that it answers, in plain words and
  matching pricing.html/terms: "What happens after I pay?" (activation automatic), "Do I need an account?" and
  "Can I get a refund?" (link /pricing/ FAQ / /terms/). Add only the missing ones, using facts already on
  pricing.html, terms.html or PROJECT_STATE.md. Never describe checkout steps that you have not read in those files.
- [ ] Review `site/pages/blog-best-unfollower-apps.html` (+ translations not in seo-prune.json) like an editor:
  remove or soften any claim about another app that the page cannot back up (prices, features, bans); make sure
  Unwrapped's own free vs paid line matches pricing.html exactly (unfollower names need a second export) and links
  /pricing/. If nothing is wrong, tick it with "no change needed".
- [ ] `site/pages/export-instagram-followers.html` and `site/pages/threads-unfollowers.html` (+ indexed
  translations): check that their existing /pricing/ sentence matches pricing.html exactly (first 20 rows; unfollower
  names from the second export). Fix wording only; tick it with "no change needed" if it is already right.
- [ ] Home page `site/pages/index.html` (+5 translations): check that a visitor sees, in or right under the hero,
  one line saying what is free and that paying is one-time (no subscription), by card through Telegram Stars or in
  crypto (facts from the pricing.html lead and "Is it a subscription?"). Add it only if missing; no prices, no new CSS.
- [ ] (only between 2026-11-10 and 2026-11-30; otherwise skip to the next item) Spotify Wrapped season
  refresh: update /blog/spotify-wrapped-2026/ and /spotify-stats/ copy for the December Wrapped date, verified
  facts only, all 6 languages, with an "updated" date. No new pages.
- [ ] PAUSED (SEO recovery, no new pages): New page /blog/free-instagram-unfollower-checker/. Do not start.
- [ ] PAUSED (SEO recovery, no new pages): Blog post "Instagram accounts you like most"
  (`autopilot/specs/blog-instagram-most-liked.md`). Do not start.

## Rules learned
- Specs in `autopilot/specs/` were written for an older workflow: where a spec conflicts with "Rules for every run"
  (PROJECT_STATE line format, commit/PR steps, screenshots), the rules win.
- Every page or post that mentions a paid feature states free vs paid in one honest sentence and links /pricing/.
  Copy the facts from pricing.html; never quote prices outside pricing (prices change only on the owner's PC).
- "Who unfollowed you" always needs two exports: never imply that one export shows unfollowers or their count.
- Traffic already lands on 60+ informational posts with 0 orders: do not add new informational blog posts unless
  the Backlog lists them; improve conversion on existing pages first.
- Read awkward machine-made phrases twice ("screenshots-free"); every language must sound native.
- A file named in an item may have been merged away (301s, 2026-10-28): if it is missing, skip it; never recreate it.
