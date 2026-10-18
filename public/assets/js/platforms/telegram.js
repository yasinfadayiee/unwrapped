// Telegram Desktop export (Settings → Advanced → Export Telegram data, or
// "Export chat history" on one chat) in machine-readable JSON: result.json.
// Shares the chat statistics with the WhatsApp analyzer.

import { chatStats } from './whatsapp.js';

const RESULT = (e) => /(^|\/)result\.json$/.test(e.lower);

export function detectTelegram(vfs) {
  return vfs.entries.some(RESULT);
}

const textOf = (t) => (Array.isArray(t) ? t.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('') : String(t || ''));

export function telegramMessages(list) {
  const out = [];
  for (const m of list || []) {
    if (m?.type !== 'message' || !m.from) continue;
    const ts = m.date_unixtime ? Number(m.date_unixtime) * 1000 : Date.parse(m.date);
    if (!Number.isFinite(ts)) continue;
    const media = m.photo || m.file || m.media_type || m.sticker_emoji;
    out.push({ ts, from: String(m.from), text: textOf(m.text), kind: media && !textOf(m.text).trim() ? 'media' : 'text' });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

// One chat export has { name, messages }, the full export has { chats: { list } }.
export function telegramChats(json) {
  const raw = Array.isArray(json?.chats?.list) ? json.chats.list : json?.messages ? [json] : [];
  return raw
    .map((c) => ({ c, messages: telegramMessages(c.messages) }))
    .filter((x) => x.messages.length)
    .map(({ c, messages }) => chatStats(messages, c.name || ''))
    .sort((a, b) => b.total - a.total);
}

export async function parseTelegram(vfs, progress) {
  const chats = [];
  let me = '';
  for (const e of vfs.entries.filter(RESULT)) {
    progress?.('Reading your Telegram chats…', 0.5);
    const json = await e.json();
    if (json?.personal_information) me = [json.personal_information.first_name, json.personal_information.last_name].filter(Boolean).join(' ');
    chats.push(...telegramChats(json));
  }
  if (!chats.length) throw new Error('No Telegram messages found in this file');
  chats.sort((a, b) => b.total - a.total);
  return { platform: 'telegram', label: 'Telegram', account: { name: me || chats[0].title }, chats, hasRelationships: false };
}
