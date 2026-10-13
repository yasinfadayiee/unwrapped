// Runtime translations for text built in JavaScript. The page language comes
// from <html lang>; English strings are the keys, so a missing translation
// simply falls back to English. Dictionaries live in /assets/js/i18n/<lang>.js.

const doc = globalThis.document;
export const lang = ((doc && doc.documentElement.lang) || 'en').slice(0, 2).toLowerCase();
export const locale = (doc && doc.documentElement.lang) || 'en-US';

let dict = {};
if (lang !== 'en') {
  try {
    dict = (await import(`../i18n/${lang}.js`)).default;
  } catch {
    dict = {};
  }
}

// Placeholders like {name} are filled from `vars` after translating.
export function t(text, vars) {
  let s = dict[text] ?? text;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}
