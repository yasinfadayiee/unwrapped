# lock-card-privacy-note — one reassurance line under every "Unlock with Plus" button
Why: GROWTH lever 3 (free→paid clarity). The lock card is the moment a free user with real data decides to pay; the audit (item 8) found no reassurance there, and the biggest hesitation for buyers of a data tool is "does paying mean uploading my file?". The answer is no (parsing is on-device), so say it at the button. Copy-only, no checkout/pricing/license code.
Scope: public/assets/js/app/components.js (function lockCard only), public/assets/css/main.css (ONE new rule right after `.lock-inner p { ... }`, line ~909), public/assets/js/i18n/{de,es,fr,pt,tr}.js (one new key each, placed right after the existing key "Plus shows exactly who it was — and keeps your full unfollower history."). Then `npm run build`.
Do:
1. components.js lockCard(): after the `h('button', ...)` child add `h('p', { class: 'lock-note' }, tl('Your export stays on this device — unlocking never uploads it.'))`. Nothing else in the function changes (props, onUpgrade, title/text logic untouched).
2. main.css: add after the `.lock-inner p { ... }` line: `.lock-inner .lock-note { font-size: 12.5px; color: var(--muted); }`. Single rule, no other CSS change (sitewide CSS is a BIG change, keep it to this one line).
3. Add the key "Your export stays on this device — unlocking never uploads it." with natural translations to de, es, fr, pt (pt-BR), tr. test/i18n.test.mjs scans tl('…') literals, so each language file must contain the exact English key.
4. PROJECT_STATE.md "Recently merged": add "- #N Lock cards say the export stays on the device (copy line, 6 langs)".
5. Run `npm test` and `npm run build`.
Don't: touch src/, lib/checkout.js, lib/license.js, pricing partials, or any price/plan/tier text; don't add claims like "no subscription" or "instant"; don't change lockCard's title/text defaults or any caller (views-*.js); no new images or icons; don't touch layout.html.
Acceptance (Claude will check each):
- [ ] `grep -c "lock-note"` gives 1 in components.js and 1 in main.css; the new key exists in all 5 i18n files; source diff outside public/ build output is only the Scope files + PROJECT_STATE.md.
- [ ] `npm test` (incl. i18n parity) and `npm run build` pass.
- [ ] SCREENSHOT STEP (visual change): serve `python -m http.server <port> --directory <repo>/public`, reach a lock card with a synthetic export (playwright 390x844 + synthetic IG zip via input[type=file], route-block **/api/checkout* and **/api/order*; see autopilot STATE.md audit trick), save en + tr shots to autopilot/outputs/uw-lock-note/. The note sits below the button, one or two short lines, calm, no overlap, smaller than the paragraph above. If the lock card cannot be reached in the sandbox, say so in the final output (Claude screenshots at review); never fake a shot.
Notes: CODEX_LESSONS apply. No payment code is in scope.
