// "Clean-up check": posts a recruiter, client or new employer might stumble on.
// Word lists cover every language the site speaks, so a mixed-language
// timeline is checked too. Matching is whole-word and case-insensitive.

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const wordRe = (words) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${words.map(escRe).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');

export const SCAN_RES = {
  swearing: wordRe([
    'fuck', 'fucking', 'fucked', 'fck', 'shit', 'shitty', 'bitch', 'asshole', 'bastard', 'dick', 'crap', 'wtf', 'stfu', 'piss', 'pissed', 'cunt', 'motherfucker',
    'mierda', 'puta', 'puto', 'joder', 'coño', 'cabrón', 'cabron', 'pendejo', 'gilipollas', 'verga', 'chingar', 'chingada', 'carajo', 'culero',
    'porra', 'caralho', 'merda', 'foda', 'foder', 'fdp', 'desgraçado', 'arrombado', 'puta que pariu',
    'amk', 'aq', 'siktir', 'sikerim', 'orospu', 'piç', 'yarrak', 'göt', 'ananı', 'amına',
    'putain', 'merde', 'connard', 'connasse', 'salope', 'enculé', 'encule', 'fdp', 'ntm', 'nique', 'niquer', 'bordel', 'pute', 'batard', 'bâtard', 'ta gueule', 'tg',
    'scheiße', 'scheisse', 'scheiß', 'fick', 'ficken', 'fotze', 'arschloch', 'wichser', 'hurensohn', 'hure', 'verdammt', 'kacke', 'missgeburt', 'halt die fresse',
  ]),
  party: wordRe([
    'drunk', 'wasted', 'hungover', 'hangover', 'weed', 'stoned', 'cocaine', 'mdma', 'shrooms', 'vodka', 'tequila',
    'borracho', 'borracha', 'resaca', 'porro', 'marihuana', 'fumado',
    'bêbado', 'bêbada', 'bebado', 'ressaca', 'maconha', 'baseado', 'chapado', 'cachaça',
    'sarhoş', 'sarhos', 'akşamdan kalma', 'esrar', 'kafam güzel', 'rakı',
    'bourré', 'bourrée', 'bourre', 'gueule de bois', 'cuite', 'défoncé', 'défoncée', 'beuh',
    'besoffen', 'betrunken', 'kater', 'gekifft', 'kiffen', 'bekifft', 'saufen', 'koks', 'vollgedröhnt',
  ]),
  // E-mail addresses and phone-number-like digit runs (9–15 digits).
  personal: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+|(?<![\w+])\+?\d(?:[\s().-]?\d){8,14}(?!\w)/gu,
};

export function matches(re, text) {
  re.lastIndex = 0;
  return re.test(text);
}

// How many texts each check finds.
export function countMatches(texts) {
  const out = {};
  for (const [id, re] of Object.entries(SCAN_RES)) out[id] = texts.filter((text) => text && matches(re, text)).length;
  return out;
}

// How many of your own posts (not reposts) each check finds.
export const scanCounts = (tweets) => countMatches(tweets.filter((tw) => !tw.isRT).map((tw) => tw.text));

// How many texts at least one check finds.
export const flaggedCount = (texts) => texts.filter((text) => text && Object.values(SCAN_RES).some((re) => matches(re, text))).length;
