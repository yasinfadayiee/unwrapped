// WhatsApp chat export ("Export chat" → .txt, or the iPhone ZIP with _chat.txt).
// Handles iPhone and Android layouts, 12/24-hour clocks, day- or month-first
// dates (worked out from the chat itself), multi-line messages and media
// placeholders in several languages. Everything stays in the browser.

const CHAT_FILE = (e) => /(^|\/)_chat\.txt$/.test(e.lower) || (/\.txt$/.test(e.lower) && /whats\s?app/i.test(`${e.path} ${e.source || ''}`));

export function detectWhatsApp(vfs) {
  return vfs.entries.some(CHAT_FILE);
}

// [31.12.23, 21:41:05] Name: text   ·   31/12/2023, 21:41 - Name: text   ·   12/31/23, 9:41 PM - Name: text
const LINE = /^\[?(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:[-–]\s*)?([^:]{1,60}?):\s(.*)$/;
const HEAD = /^\[?\d{1,4}[./-]\d{1,2}[./-]\d{1,4},?\s+\d{1,2}[:.]\d{2}/;
const MEDIA = /<media omitted>|<multimedia omitido>|<m[ií]dia oculta>|<m[ée]dias omis>|<medien ausgeschlossen>|<medya dahil edilmedi>|\b(image|video|audio|sticker|gif|document|photo) omitted\b|<attached: [^>]+>|(bild|video|audio|sticker) weggelassen|imagen omitida|imagem ocultada|image absente|görüntü dahil edilmedi/i;
const DELETED = /^(this message was deleted|you deleted this message|se eliminó este mensaje|eliminaste este mensaje|mensagem apagada|você apagou esta mensagem|ce message a été supprimé|vous avez supprimé ce message|diese nachricht wurde gelöscht|du hast diese nachricht gelöscht|bu mesaj silindi|bu mesajı sildiniz)\.?$/i;
const SYSTEM = /end-to-end encrypted|cifrado de extremo a extremo|criptografia de ponta a ponta|chiffrés de bout en bout|ende-zu-ende-verschlüsselt|uçtan uca şifreli/i;
const EMOJI = /\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic})*/gu;
const URLS = /https?:\/\/\S+/g;
const STOP = new Set('the and you that this with for are was have not but just what all your its can will get like out about there they from when then what how who did dont im its ok okay yes yeah haha lol que los las del por con una para pero como mas muy este esta eso eres soy está não uma com por para que mais isso pra tá ele ela você les des une pour pas que est qui dans sur avec mais vous der die das und ist nicht ich du sie mit auf ein eine aber auch bir ve bu çok için ama ne mi da de ben sen'.split(' '));

const clean = (s) => s.replace(/[‎‏‪-‮]/g, '').replace(/[  ]/g, ' ');

// Decide day/month order and year position from all date stamps in the chat.
function dateOrder(stamps, hasAmPm) {
  let yearFirst = false, dayFirst = false, monthFirst = false;
  for (const [a, b] of stamps) {
    if (a > 31) yearFirst = true;
    else if (a > 12) dayFirst = true;
    else if (b > 12) monthFirst = true;
  }
  if (yearFirst) return 'ymd';
  if (dayFirst && !monthFirst) return 'dmy';
  if (monthFirst && !dayFirst) return 'mdy';
  return hasAmPm ? 'mdy' : 'dmy';
}

function toTs([a, b, c, hh, mm, ss, ampm], order) {
  let y, mo, d;
  if (order === 'ymd') [y, mo, d] = [a, b, c];
  else if (order === 'mdy') [mo, d, y] = [a, b, c];
  else [d, mo, y] = [a, b, c];
  if (y < 100) y += 2000;
  let h = hh;
  if (ampm) {
    const pm = /p/i.test(ampm);
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return new Date(y, mo - 1, d, h, mm, ss || 0).getTime();
}

export function parseChatText(text) {
  const raw = [];
  for (const line of text.split(/\r?\n/)) {
    const c = clean(line);
    const m = c.match(LINE);
    if (m && !m[8].includes('http')) {
      raw.push({ parts: [+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0, m[7] || ''], name: m[8].trim(), text: m[9], system: /^‎/.test(line.replace(/^\[[^\]]*\]\s*[^:]*:\s/, '')) });
    } else if (raw.length && !HEAD.test(c)) {
      raw[raw.length - 1].text += `\n${c}`; // continuation of a multi-line message
    }
  }
  const order = dateOrder(raw.map((r) => r.parts), raw.some((r) => r.parts[6]));
  return raw
    .map((r) => ({ ts: toTs(r.parts, order), from: r.name, text: r.text, kind: MEDIA.test(r.text) ? 'media' : DELETED.test(r.text.trim()) ? 'deleted' : SYSTEM.test(r.text) ? 'system' : 'text' }))
    .filter((m) => m.kind !== 'system' && Number.isFinite(m.ts));
}

const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// All the numbers the dashboard shows, from a parsed message list.
export function chatStats(messages, title = '') {
  const people = new Map();
  const person = (n) => {
    if (!people.has(n)) people.set(n, { name: n, messages: 0, words: 0, media: 0, deleted: 0, links: 0, emojis: new Map(), starts: 0, replies: [], night: 0, longest: 0 });
    return people.get(n);
  };
  const byHour = Array(24).fill(0);
  const byWeekday = Array(7).fill(0);
  const byDay = new Map();
  const words = new Map();
  const emojis = new Map();
  let prev = null;
  for (const m of messages) {
    const p = person(m.from);
    p.messages++;
    const d = new Date(m.ts);
    byHour[d.getHours()]++;
    byWeekday[d.getDay()]++;
    if (d.getHours() < 5) p.night++;
    const k = dayKey(m.ts);
    byDay.set(k, (byDay.get(k) || 0) + 1);
    if (m.kind === 'media') p.media++;
    else if (m.kind === 'deleted') p.deleted++;
    else {
      const body = m.text.replace(URLS, () => { p.links++; return ' '; });
      const ws = body.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
      p.words += ws.length;
      p.longest = Math.max(p.longest, ws.length);
      for (const w of ws) if (w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)) words.set(w, (words.get(w) || 0) + 1);
      for (const e of body.match(EMOJI) || []) {
        emojis.set(e, (emojis.get(e) || 0) + 1);
        p.emojis.set(e, (p.emojis.get(e) || 0) + 1);
      }
    }
    // A gap of 6 h starts a new conversation; otherwise a change of sender is a reply.
    if (!prev || m.ts - prev.ts > 6 * 3600e3) p.starts++;
    else if (prev.from !== m.from) p.replies.push(m.ts - prev.ts);
    prev = m;
  }
  const days = [...byDay.keys()].sort();
  let streak = 0, best = 0, last = null;
  for (const k of days) {
    const t = new Date(`${k}T12:00:00`).getTime();
    streak = last && t - last < 1.5 * 864e5 ? streak + 1 : 1;
    best = Math.max(best, streak);
    last = t;
  }
  const busiest = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const median = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));
  const list = [...people.values()]
    .map((p) => ({ name: p.name, messages: p.messages, words: p.words, media: p.media, deleted: p.deleted, links: p.links, starts: p.starts, replyMs: median(p.replies.filter((x) => x < 12 * 3600e3)), nightShare: p.messages ? p.night / p.messages : 0, longest: p.longest, topEmojis: top(p.emojis, 5) }))
    .sort((a, b) => b.messages - a.messages);
  const first = messages[0]?.ts || 0;
  const lastTs = messages[messages.length - 1]?.ts || 0;
  return {
    title: title || list.map((p) => p.name).slice(0, 3).join(', '),
    group: list.length > 2,
    total: messages.length,
    first,
    last: lastTs,
    activeDays: days.length,
    spanDays: first ? Math.max(1, Math.round((lastTs - first) / 864e5) + 1) : 0,
    longestStreak: best,
    busiestDay: busiest ? { day: busiest[0], count: busiest[1] } : null,
    byHour,
    byWeekday,
    byMonth: [...byDay.entries()].reduce((acc, [k, n]) => ((acc[k.slice(0, 7)] = (acc[k.slice(0, 7)] || 0) + n), acc), {}),
    people: list,
    topWords: top(words, 30),
    topEmojis: top(emojis, 12),
  };
}

// "WhatsApp Chat with Sara.txt" / "WhatsApp Chat - Sara.zip" → "Sara"
function titleOf(entry) {
  const src = `${entry.source || ''}/${entry.path}`;
  const m = src.match(/whats\s?app[^/]*?(?:with|mit|con|com|avec|ile|-|–)\s+([^/]+?)(?:\.txt|\.zip|\/|$)/i);
  return m ? m[1].replace(/\s*\(\d+\)$/, '').trim() : '';
}

export async function parseWhatsApp(vfs, progress) {
  const files = vfs.entries.filter(CHAT_FILE);
  const chats = [];
  for (let i = 0; i < files.length; i++) {
    progress?.('Reading your WhatsApp chat…', (i + 0.5) / files.length);
    const messages = parseChatText(await files[i].text());
    if (messages.length) chats.push(chatStats(messages, titleOf(files[i])));
  }
  if (!chats.length) throw new Error('No WhatsApp messages found in this file');
  chats.sort((a, b) => b.total - a.total);
  return { platform: 'whatsapp', label: 'WhatsApp', account: { name: chats[0].title }, chats, hasRelationships: false };
}
