// "Your closest people": one ranking from every chat in every dropped export
// (Instagram & Messenger DMs, WhatsApp, Telegram). People are matched across
// platforms by their normalised name.

const DAY = 864e5;

export const nameKey = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');

// One-to-one conversations from a dataset: { name, platform, messages, sent, last }
export function conversationsOf(ds) {
  const out = [];
  if (ds.activity?.messages?.all) {
    for (const t of ds.activity.messages.all) out.push({ name: t.title, platform: ds.platform, messages: t.count, sent: t.sent, last: t.last || 0 });
  }
  for (const chat of ds.chats || []) {
    if (chat.people.length !== 2) continue;
    // The friend is the chat title when it names one of the two people (WhatsApp
    // file name, Telegram chat name); otherwise the quieter side is a guess we skip.
    const friend = chat.people.find((p) => nameKey(p.name) === nameKey(chat.title));
    if (!friend) continue;
    const me = chat.people.find((p) => p !== friend);
    out.push({ name: friend.name, platform: ds.platform, messages: chat.total, sent: me.messages, last: chat.last });
  }
  return out.filter((c) => c.name && c.messages > 0);
}

// Score: volume (log, so 10k messages doesn't drown everything), balance (both
// sides write) and recency (talking now counts more than years ago).
export function closestPeople(datasets, now = Date.now()) {
  const people = new Map();
  for (const ds of datasets) {
    for (const c of conversationsOf(ds)) {
      const key = nameKey(c.name);
      if (!key) continue;
      const p = people.get(key) || { key, name: c.name, platforms: [], messages: 0, sent: 0, last: 0 };
      if (!p.platforms.includes(c.platform)) p.platforms.push(c.platform);
      p.messages += c.messages;
      p.sent += c.sent;
      p.last = Math.max(p.last, c.last);
      people.set(key, p);
    }
  }
  const list = [...people.values()].map((p) => {
    const balance = p.messages ? 1 - Math.abs(p.sent / p.messages - 0.5) * 2 : 0;
    const ageDays = p.last ? (now - p.last) / DAY : 9999;
    const recency = ageDays < 30 ? 1 : ageDays < 180 ? 0.7 : ageDays < 365 ? 0.45 : 0.25;
    const score = Math.log10(1 + p.messages) * (0.6 + 0.4 * balance) * recency * (1 + 0.15 * (p.platforms.length - 1));
    return { ...p, balance, score };
  });
  list.sort((a, b) => b.score - a.score);
  const top = list[0]?.score || 1;
  return list.map((p) => ({ ...p, closeness: Math.round((p.score / top) * 100) }));
}
