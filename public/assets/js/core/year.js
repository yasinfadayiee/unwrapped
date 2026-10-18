// "Your year": one calendar year across every dropped export.

const yearOf = (ts) => (ts ? new Date(ts).getFullYear() : 0);

// The current year, or last year in January and February so it is a full one.
export function pickYear(now = Date.now()) {
  const current = new Date(now).getFullYear();
  return new Date(now).getMonth() < 2 ? current - 1 : current;
}

export function yearInReview(datasets, year) {
  const items = [];
  const add = (platform, key, value, extra = {}) => value && items.push({ platform, key, value, ...extra });
  for (const ds of datasets) {
    const p = ds.platform;
    const followers = p === 'facebook' ? ds.lists?.friends : p === 'linkedin' ? ds.connections : ds.lists?.followers;
    add(p, p === 'facebook' ? 'friends' : p === 'linkedin' ? 'connections' : 'followers', (followers || []).filter((f) => yearOf(f.ts) === year).length);
    if (p === 'x') add(p, 'posts', (ds.tweets || []).filter((t) => !t.isRT && yearOf(t.ts) === year).length);
    if (p === 'facebook') add(p, 'posts', ds.posted?.byYear?.[year]?.posts || 0);
    if (p === 'linkedin') add(p, 'posts', ds.posting?.byYear?.[year] || 0);
    if (p === 'instagram' || p === 'facebook') {
      const threads = ds.activity?.messages?.all || [];
      const active = threads.filter((t) => yearOf(t.last) === year);
      add(p, 'chats', active.length, { top: active.sort((a, b) => b.count - a.count)[0]?.title });
    }
    for (const chat of ds.chats || []) {
      const n = Object.entries(chat.byMonth).filter(([k]) => k.startsWith(`${year}-`)).reduce((s, [, v]) => s + v, 0);
      add(p, 'messages', n, { top: chat.title });
    }
    if (p === 'spotify') {
      const minutes = Object.entries(ds.stats.byMonth).filter(([k]) => k.startsWith(`${year}-`)).reduce((s, [, v]) => s + v, 0);
      add(p, 'minutes', minutes, { top: ds.stats.yearTop.find((y) => y.year === String(year))?.key });
    }
  }
  // Several chats of one platform become one line.
  const merged = new Map();
  for (const it of items) {
    const k = `${it.platform}:${it.key}`;
    const m = merged.get(k);
    if (!m) merged.set(k, { ...it });
    else {
      if (it.value > (m.best || m.value)) m.top = it.top;
      m.best = Math.max(m.best || m.value, it.value);
      m.value += it.value;
    }
  }
  return [...merged.values()].map(({ best, ...it }) => it);
}
