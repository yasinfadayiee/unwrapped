// LinkedIn data export — Connections.csv plus a few optional CSVs.

import { csvObjects, parseDate } from '../core/text.js';

export function detectLinkedIn(vfs) {
  return Boolean(vfs.find(/(^|\/)connections\.csv$/));
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// "02 Oct 2024" or "10/2/24, 3:04 PM"
function linkedinDate(value) {
  const m = String(value || '').match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);
  if (m) return new Date(+m[3], MONTHS[m[2].toLowerCase()] ?? 0, +m[1]).getTime();
  return parseDate(value);
}

const ROLE_GROUPS = [
  ['Founders & CEOs', /\b(founder|co-founder|ceo|owner|president|managing director)\b/i],
  ['Recruiters & HR', /\b(recruit\w*|talent|hr|human resources|people partner|sourcer)\b/i],
  ['Engineers & developers', /\b(engineer\w*|developer|programmer|swe|devops|architect|cto)\b/i],
  ['Design', /\b(design\w*|ux|ui|creative)\b/i],
  ['Marketing & growth', /\b(market\w*|growth|seo|brand|content|social media|cmo)\b/i],
  ['Sales & BD', /\b(sales|account executive|business development|bdr|sdr|partnership\w*)\b/i],
  ['Product', /\b(product (manager|owner|lead)|pm|cpo)\b/i],
  ['Data & AI', /\b(data|machine learning|ml|ai|analyst|scientist)\b/i],
  ['Investors', /\b(investor|venture|vc|angel|partner at)\b/i],
  ['Students', /\b(student|intern|graduate)\b/i],
];

const personKey = (name, url) => String(url || name || '').toLowerCase().replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/, '');

// messages.csv: FROM, SENDER PROFILE URL, TO, RECIPIENT PROFILE URLS, DATE ("2024-01-02 10:11:12 UTC").
export function inboxStats(rows, myName = '') {
  const from = new Map();
  for (const r of rows) from.set(r.FROM, (from.get(r.FROM) || 0) + 1);
  // You are whoever appears in the most conversations, unless the profile names you.
  const convs = new Map();
  for (const r of rows) {
    const id = r['CONVERSATION ID'];
    if (!convs.has(id)) convs.set(id, new Set());
    convs.get(id).add(r.FROM);
  }
  const reach = new Map();
  for (const set of convs.values()) for (const n of set) reach.set(n, (reach.get(n) || 0) + 1);
  const me = myName && reach.has(myName) ? myName : [...reach.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const people = new Map();
  const lastByConv = new Map();
  let sent = 0;
  let received = 0;
  for (const r of rows) {
    const ts = Date.parse(String(r.DATE || '').replace(' UTC', 'Z').replace(' ', 'T')) || 0;
    const mine = r.FROM === me;
    if (mine) sent++;
    else received++;
    const otherName = mine ? String(r.TO || '').split(',')[0].trim() : r.FROM;
    const otherUrl = mine ? String(r['RECIPIENT PROFILE URLS'] || '').split(',')[0].trim() : r['SENDER PROFILE URL'];
    if (!otherName) continue;
    const key = personKey(otherName, otherUrl);
    const p = people.get(key) || { key, name: otherName, url: otherUrl || '', sent: 0, received: 0, ts: 0 };
    if (mine) p.sent++;
    else p.received++;
    p.ts = Math.max(p.ts, ts);
    people.set(key, p);
    const id = r['CONVERSATION ID'];
    const prev = lastByConv.get(id);
    if (!prev || ts >= prev.ts) lastByConv.set(id, { ts, mine, name: otherName, url: otherUrl || '', key });
  }
  // Conversations where the other person wrote last and you never answered.
  const unanswered = [...lastByConv.values()].filter((c) => !c.mine && people.get(c.key)?.sent === 0).map((c) => ({ name: c.name, url: c.url, ts: c.ts }));
  return {
    me,
    sent,
    received,
    conversations: convs.size,
    people: [...people.values()].sort((a, b) => b.sent + b.received - (a.sent + a.received)),
    unanswered: unanswered.sort((a, b) => b.ts - a.ts),
  };
}

// Positions.csv: Company Name, Title, Started On ("Jan 2020"), Finished On.
const monthYear = (v) => {
  const m = String(v || '').match(/([A-Za-z]{3})\w* (\d{4})|^(\d{4})$/);
  if (!m) return 0;
  return m[3] ? new Date(+m[3], 0, 1).getTime() : new Date(+m[2], MONTHS[m[1].toLowerCase()] ?? 0, 1).getTime();
};

async function careerOf(vfs) {
  const e = vfs.find(/(^|\/)positions\.csv$/);
  if (!e) return [];
  return csvObjects(await e.text(), /^Company Name$/i)
    .map((r) => ({ company: r['Company Name'] || '', title: r.Title || '', from: monthYear(r['Started On']), to: monthYear(r['Finished On']) }))
    .filter((p) => p.company || p.title)
    .sort((a, b) => b.from - a.from);
}

async function skillsOf(vfs) {
  const counts = new Map();
  const end = vfs.find(/(^|\/)endorsement_received_info\.csv$/);
  if (end) for (const r of csvObjects(await end.text(), /^Endorsement Date$|^Skill Name$/i)) if (r['Skill Name']) counts.set(r['Skill Name'], (counts.get(r['Skill Name']) || 0) + 1);
  const sk = vfs.find(/(^|\/)skills\.csv$/);
  if (sk) for (const r of csvObjects(await sk.text(), /^Name$/i)) if (r.Name && !counts.has(r.Name)) counts.set(r.Name, 0);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
}

// Shares.csv (your posts), Reactions.csv and Comments.csv: a date per row.
async function postingOf(vfs) {
  const out = { posts: 0, reactions: 0, comments: 0, byYear: {} };
  for (const [kind, re] of [['posts', /(^|\/)shares\.csv$/], ['reactions', /(^|\/)reactions\.csv$/], ['comments', /(^|\/)comments\.csv$/]]) {
    const e = vfs.find(re);
    if (!e) continue;
    for (const r of csvObjects(await e.text(), /^Date$/i)) {
      out[kind]++;
      if (kind === 'posts') {
        const y = String(r.Date || '').slice(0, 4);
        if (/^\d{4}$/.test(y)) out.byYear[y] = (out.byYear[y] || 0) + 1;
      }
    }
  }
  return out;
}

export async function parseLinkedIn(vfs, progress) {
  progress?.('Mapping your LinkedIn network…', 0.3);
  const connEntry = vfs.find(/(^|\/)connections\.csv$/);
  const rows = connEntry ? csvObjects(await connEntry.text(), /^First Name$/i) : [];
  const connections = rows
    .map((r) => ({
      name: `${r['First Name'] || ''} ${r['Last Name'] || ''}`.trim(),
      url: r.URL || '',
      email: r['Email Address'] || '',
      company: r.Company || '',
      position: r.Position || '',
      ts: linkedinDate(r['Connected On']),
    }))
    .filter((c) => c.name);

  const companies = new Map();
  const roles = new Map();
  for (const c of connections) {
    if (c.company) companies.set(c.company, (companies.get(c.company) || 0) + 1);
    const group = ROLE_GROUPS.find(([, re]) => re.test(c.position));
    if (group) roles.set(group[0], (roles.get(group[0]) || 0) + 1);
  }

  let invitations = { sent: 0, received: 0 };
  const invEntry = vfs.find(/(^|\/)invitations\.csv$/);
  if (invEntry) {
    for (const r of csvObjects(await invEntry.text(), /^Direction$/i)) {
      if (/outgoing/i.test(r.Direction)) invitations.sent++;
      else if (/incoming/i.test(r.Direction)) invitations.received++;
    }
  }

  let name = '';
  let headline = '';
  const profileEntry = vfs.find(/(^|\/)profile\.csv$/);
  if (profileEntry) {
    const p = csvObjects(await profileEntry.text(), /^First Name$/i)[0];
    if (p) {
      name = `${p['First Name'] || ''} ${p['Last Name'] || ''}`.trim();
      headline = p.Headline || '';
    }
  }

  progress?.('Reading your LinkedIn inbox…', 0.6);
  let messages = 0;
  let inbox = null;
  const msgEntry = vfs.find(/(^|\/)messages\.csv$/);
  if (msgEntry) {
    const rows = csvObjects(await msgEntry.text(), /^CONVERSATION ID$/i);
    messages = rows.length;
    inbox = inboxStats(rows, name);
  }

  const recruiterRe = ROLE_GROUPS.find(([k]) => k === 'Recruiters & HR')[1];
  const recruiters = connections.filter((c) => recruiterRe.test(c.position));
  // People you are connected with but never wrote to: the quiet part of your network.
  const talked = new Set(inbox ? inbox.people.map((p) => p.key) : []);
  const quiet = inbox ? connections.filter((c) => !talked.has(personKey(c.name, c.url))).length : null;

  return {
    inbox,
    recruiters,
    quiet,
    career: await careerOf(vfs),
    skills: await skillsOf(vfs),
    posting: await postingOf(vfs),
    platform: 'linkedin',
    label: 'LinkedIn',
    account: { name, headline },
    connections: connections.sort((a, b) => b.ts - a.ts),
    companies: [...companies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([key, count]) => ({ key, count })),
    roles: [...roles.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count })),
    emailsShared: connections.filter((c) => c.email).length,
    invitations,
    messages,
    hasRelationships: connections.length > 0,
  };
}
