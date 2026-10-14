// Sends every URL in public/sitemap.xml to IndexNow (Bing, Yandex, Seznam, Naver…).
// Run after a deploy: `node scripts/indexnow.js`. The key file lives in public/<key>.txt.
import { readFileSync, readdirSync } from 'node:fs';

const pub = new URL('../public/', import.meta.url);
const keyFile = readdirSync(pub).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error('IndexNow key file missing in public/');
const key = keyFile.slice(0, -4);
const urls = [...readFileSync(new URL('sitemap.xml', pub), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const host = new URL(urls[0]).host;

const body = JSON.stringify({ host, key, keyLocation: `https://${host}/${keyFile}`, urlList: urls });
for (const endpoint of ['https://www.bing.com/indexnow', 'https://yandex.com/indexnow']) {
  const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body });
  console.log(`IndexNow ${new URL(endpoint).host}: ${urls.length} URLs → HTTP ${res.status}`);
}
