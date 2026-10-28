# SEO recovery plan — myunwrapped.com (started 2026-10-28)

## خلاصه برای صاحب سایت
از ۲۵ اکتبر گوگل سایت را تقریباً از نتایج کنار گذاشته است. نمایش روزانه از حدود ۲٬۲۵۰ به حدود ۳۰ رسیده، ولی سایت هنوز ایندکس است و مشکل فنی ندارد.
محتمل‌ترین علت این است که در دو هفته حدود ۳۴۰ صفحه‌ی بلاگ ماشینی به ۶ زبان منتشر شد و گوگل آن را «محتوای انبوه» حساب کرده. این فقط یک فرضیه است و قطعی نیست.
ساخت صفحه‌ی جدید از امروز متوقف شد. قدم بعدی کم کردن و قوی کردن صفحه‌هاست، نه اضافه کردن صفحه.
بازگشت معمولاً چند هفته تا چند ماه طول می‌کشد. خیلی وقت‌ها هم بعد از یک «core update» گوگل اتفاق می‌افتد.

## What happened (Search Console, property https://myunwrapped.com/)

| Day | Impressions | Clicks | Avg. position |
|---|---|---|---|
| Oct 22 | 2,265 | 14 | 14.8 |
| Oct 23 | 2,374 | 25 | 13.8 |
| Oct 24 | 2,251 | 20 | 13.2 |
| Oct 25 | 40 | 1 | 29.0 |
| Oct 26 | 23 | 0 | 16.6 |

- The drop hit all 482 pages that had impressions, ~1,000 queries and 166 countries on the same day.
- Ruled out on 2026-10-28:
  - Manual actions and Security issues both show "No issues detected".
  - Page indexing: 550 indexed, 5 not indexed.
  - Crawl stats: 100% OK (200), host had no problems in 90 days.
  - Live pages return 200 to Googlebot with `index, follow` and self-canonicals, and robots/sitemap are fine.
- Pages are still in `site:myunwrapped.com`, but rank nowhere, even for their own titles. Example: "instagram dm viewer" was at about position 7 and is now outside the top 30.
- Google announced no update for October 2026; the September spam update ended Oct 8. Unconfirmed forum reports of
  volatility exist.
- Site shape at the drop:
  - 584 indexable URLs on a domain about 2 weeks old.
  - 342 of them are blog URLs (57 posts × 6 languages), 72 are guides.
  - Posts were added daily by automation (Codex, then the GitHub autopilot).

Most likely explanation: a site-wide quality or scaled-content classification of a brand-new domain, possibly
combined with the end of the new-site test period. The fix is the same either way: fewer, better, clearly
human-reviewed pages, and real signals that people use and trust the site.

## Phase 0 — stop the bleeding (done 2026-10-28)
- [x] AUTOPILOT.md "SEO recovery mode": no new pages, posts, guides or translations; new-content items paused.
- [x] `improve.yml` rejects any new file under `site/pages/` or `site/i18n/*/pages/`.
- [x] `plan.yml` (weekly planner) told not to plan new pages.
- [ ] OWNER: if any Codex (ChatGPT) scheduled task still writes blog posts for this repo, turn it off.
- [ ] OWNER: consider running `improve.yml` once a day instead of twice. Daily edits across 6 languages keep
  changing hundreds of pages while Google re-evaluates the site.

## Phase 1 — prune and consolidate (week 1, by 2026-11-04) — OWNER PC (Claude Opus)
Goal: about 584 → 250 indexable URLs, keeping every page that earned clicks.
1. Export the Search Console "Pages" report (last 3 months) and list each URL's clicks and impressions before Oct 25.
2. Keep these:
   - every page with clicks;
   - the tool/landing pages (/, /instagram/, /tiktok/, /x/, /facebook/, /linkedin/, /pricing/, /tools/, the tool pages);
   - the data-download guides.
3. Merge near-duplicate posts into one strong page each, with 301 redirects. Examples:
   - the "who unfollowed me on Instagram/TikTok/Threads/X/LinkedIn" posts;
   - the Instagram history posts (search history, liked posts, comments, first follower, first follow,
     account age);
   - the Spotify posts.
4. [x] (2026-10-28) For translated posts that got no impressions in that language, add `noindex` and drop them from the sitemap.
   Keep the English version. Do this through the build (a per-page/per-language flag), not by deleting files.
   Done: `site/seo-prune.json` lists 236 translated posts and guides with 0 clicks and fewer than 20 impressions
   from Sep 1 to Oct 24. The build gives them `noindex, follow` and leaves them out of the sitemap and hreflang;
   `test/seo-prune.test.mjs` checks this. The sitemap went from 584 to 348 URLs. Tool pages and all English pages stay.
   Source data: Search Console Pages report, 482 URLs with impressions.
5. [x] (2026-10-28) Fix the small indexing items: 1 "Blocked by robots.txt", 3 "Discovered – not indexed", 1 "Crawled – not indexed".
6. Submit the sitemap again. Do not mass-request indexing of single URLs.

## Phase 2 — make the remaining pages clearly better (weeks 1–3)
Start with the pages that had the most impressions:
- /instagram-message-viewer/
- /es/blog/who-unfollowed-me-on-tiktok/
- /es/blog/spotify-wrapped-2026/
- /blog/instagram-search-history/
- /instagram-follower-tracker/
- /blog/see-sent-follow-requests-instagram/
- /

For each page:
- Real screenshots of Instagram's own menus and of the Unwrapped result, made from the demo export.
- Exact, verified steps.
- An "updated" date.
- Remove generic filler and repeated boilerplate paragraphs, and anything a reader can't act on.
- One clear answer near the top of the page, then the details.
- Native wording in each language that stays indexed. Machine-sounding translations get `noindex` instead.

## Phase 3 — trust signals (weeks 2–6)
- About page: who runs the site, how to reach them, why the tool exists (real facts only), and a clear privacy
  promise with an explanation of how parsing on the device works.
- A handful of genuine mentions:
  - Product Hunt and AlternativeTo listings;
  - honest answers in relevant Reddit/Quora threads where the tool really solves the question;
  - a GitHub README explaining the privacy model.
- Never buy links, use link farms or join "guest post" packages. That would turn a demotion into a penalty.

## Checkpoints
- Weekly (every Monday): Search Console impressions for the last 7 days vs. the week before; note them below.
- Signs of recovery: impressions on the kept top pages return first, at positions under 20.
- Recoveries from this kind of drop usually show at a Google core update. Watch the Search Status Dashboard;
  analysts expect one in late Oct – mid Nov 2026.
- 2026-11-15 is the existing portfolio deadline (0 paid orders → autopilot off). The SEO state on that day is one
  input to that decision.

## Do not
- Do not publish new pages "to get traffic back" while in recovery mode.
- Do not change many URLs at once without 301s.
- Do not delete pages that have clicks.
- Do not add AI-rewritten copies of the same article.

## Log
- 2026-10-28: drop confirmed in Search Console; recovery mode on; Phase 0 done.
- 2026-10-28: Phase 1 step 4 done (236 thin translations get noindex; the sitemap has 348 URLs). Deployed and
  sitemap resubmitted in Search Console (step 6).
- 2026-10-28: Phase 1 step 3 (first round): 9 duplicate-intent posts 301 to the stronger page in all 6 languages
  (`src/redirects.js`). Five posts went to the tool page with the same title and FAQ: account age, liked posts,
  Threads unfollowers, TikTok watch history and Telegram stats. "Who do I message most" went to the DM analyzer.
  Three blog posts were merged into stronger posts, which kept a section from each:
  - Spotify most-played → Spotify hours;
  - first follow → first follower;
  - first tweet → search old tweets.
  The sitemap has 331 URLs. The per-platform "who unfollowed me" posts stay separate: each has its own search
  intent, and the TikTok post is the top earner.
- 2026-10-28: Phase 1 step 5. The 5 not-indexed URLs and what was done:
  - `/account/` "Blocked by robots.txt" (from Oct 17): robots.txt already allows it, and the page is
    `noindex` on purpose. Fix validation started in Search Console.
  - `/es/blog/linktree-alternatives/`, `/pt/guides/download-linkedin-data/` ("Discovered") and
    `/tr/blog/instagram-mutual-followers/` ("Crawled"): all three are in `seo-prune.json` and now `noindex`,
    so nothing more to do.
  - `/blog/who-removed-me-on-linkedin/` ("Discovered"): it had one contextual link. It is now also linked from
    the LinkedIn tool page and from the LinkedIn connections post's "Read next", in all 6 languages.
- 2026-10-28: Phase 2 started with /instagram-message-viewer/ (6 languages). Its queries before the drop were
  "instagram dm viewer" (26 impressions, 9 clicks), "instagram message viewer" and "insta dm viewer"; CTR was about 35%.
  Changes:
  - An answer-first box with a "steps checked" date.
  - A real screenshot of the Message viewer from the demo export (`/assets/img/shots/`).
  - The steps now follow Instagram's current Help Center flow: Export your information → Create export → Export to device,
    with the 4-day download window.
  - A new "Inside the export" section, checked against the parser: the folder path, split `message_N.json` files and the
    Meta encoding repair.
  - Fixed the FAQ: the viewer reads JSON only, not HTML.
- 2026-10-28: The site now uses Meta's current export labels everywhere, in 6 languages (393 labels):
  - Export your information → Create export → profile → Export to device → Customize information → Start export.
  - In the shared step blocks and guides, "Export to device" now comes before "Customize information".
  - The FAQ questions still use the old name, because people search for it. Their answers say Meta renamed it.
  - Verified: the English Instagram and Facebook Help Center pages, on 2026-10-28.
  - Not verified live: the translated labels and the "Customize information" step.
- 2026-10-28: Phase 2, page 2 is /blog/who-unfollowed-me-on-tiktok/ in 6 languages (/es/ was the top post: 620 impressions,
  22 clicks). Its main query was "como saber quien me dejo de seguir en tiktok". Changes:
  - A direct answer first.
  - Steps checked against TikTok Support: Request data, a few days to prepare, 4-day download window.
  - A screenshot of the comparison view in each language.
  - A "check one person" tip.
  - What `user_data_tiktok.json` contains, checked against the parser.
  - The updated date is shown on the page.
  Also fixed the German app labels "Du bist entfolgt/gefolgt", now "Von dir entfolgt/gefolgt".
- 2026-10-28: Phase 2, page 3 is /blog/spotify-wrapped-2026/ in 6 languages. It had about 2,300 impressions and CTR around 0.3%.
  Its queries were all "when does Wrapped 2026 come out" and "until when does it count". Changes:
  - The answer goes first: most likely Wed 2 December 2026. Every Wrapped from 2021 to 2025 came out on the Wednesday
    after US Thanksgiving (Wikipedia, checked 2026-10-28). Spotify hasn't announced a date.
  - A table of past release dates.
  - The cutoff text is corrected. It wrongly said December listening counts for next year. Spotify said in 2023 it
    counts past Oct 31; the usual estimate is mid-November.
  - Titles and descriptions now include the date (pt uses "Retrospectiva").
  No screenshot, because the demo has no Spotify data.
  TODO: when Spotify announces the real date (likely late November), update this page the same day.
- 2026-10-28: Phase 2, page 4 is /blog/instagram-search-history/ in 6 languages (1,054 impressions). Its queries were
  "instagram search history", how to see or delete it, and seeing cleared searches. Changes:
  - The in-app and Accounts Center → Search history steps, plus the clear steps, now follow Instagram's Help Center
    (articles 466613274883864 and 354860134605952). Instagram itself notes that clearing is temporary.
  - A new FAQ on whether cleared searches can be seen.
  - A screenshot of "Your searches" in each language.
  The demo export now includes Instagram search files, so the demo's Privacy X-ray shows "Your searches".
- 2026-10-28: Phase 2, page 5 is /instagram-follower-tracker/ in 6 languages (45 impressions, 7 clicks, the highest CTR
  on the site). Changes:
  - An answer-first box.
  - The illustrated example card (made-up names) is replaced by a real screenshot of the comparison view in each
    language.
  - The page's claims were checked in the code: chart, 30/90-day counts, backup and restore.
