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

// One-decimal stats arrive as "6.3" (toFixed(1)); show them with the page's
// decimal mark. Two-decimal values (payment amounts) are left exactly as they are.
const decimalMark = (() => {
  try {
    return (1.5).toLocaleString(locale).charAt(1);
  } catch {
    return '.';
  }
})();
const localDecimal = (v) => (decimalMark !== '.' && typeof v === 'string' && /^-?\d+\.\d$/.test(v) ? v.replace('.', decimalMark) : v);

// Placeholders like {name} are filled from `vars` after translating.
export function t(text, vars) {
  let s = dict[text] ?? text;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => localDecimal(vars[k] ?? ''));
  return s;
}
