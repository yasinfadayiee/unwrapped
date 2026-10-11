// Copies self-hosted fonts and the QR library from node_modules into /public,
// so the site never loads anything from a third-party server.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const nm = (p) => path.join(root, 'node_modules', p);
const out = (p) => path.join(root, 'public', 'assets', p);

mkdirSync(out('fonts'), { recursive: true });
mkdirSync(out('js/vendor'), { recursive: true });

const fonts = [
  ['@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2', 'bricolage-wght.woff2'],
  ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter-wght.woff2'],
  ['@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2', 'jetbrains-mono-wght.woff2'],
  ['@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2', 'instrument-serif-italic.woff2'],
];
for (const [from, to] of fonts) copyFileSync(nm(from), out(`fonts/${to}`));

const qr = readFileSync(nm('qrcode-generator/dist/qrcode.mjs'), 'utf8');
writeFileSync(out('js/vendor/qrcode.js'), `// qrcode-generator 2.0.4 — MIT License, (c) Kazuhiko Arase\n${qr}`);
console.log('Vendored fonts and QR library into public/assets');
