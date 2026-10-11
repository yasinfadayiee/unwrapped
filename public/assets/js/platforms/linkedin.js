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

  let messages = 0;
  const msgEntry = vfs.find(/(^|\/)messages\.csv$/);
  if (msgEntry) messages = csvObjects(await msgEntry.text(), /^CONVERSATION ID$/i).length;

  return {
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
