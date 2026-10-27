// Customer support: a contact form whose messages land in the owner's inbox
// (e-mail, plus Telegram when linked) and an AI help bot (Cloudflare Workers
// AI, binding "AI") that answers common questions and hands the rest to a human.
// Only what people type is stored — never anything from their export.
// Table `support` (schema in db.js): kind 'contact' = form message, 'bot' = bot question.

import { PLANS, brand, siteUrl } from './config.js';
import { HttpError, json, rateLimit, readJson, visitorId } from './http.js';
import { emailEnabled, layout, send } from './email.js';
import { notifyOwner } from './payments/stars.js';
import { escapeHtml, isEmail } from './util.js';

const LANG = /^[a-z]{2}$/;
const LANG_NAME = { en: 'English', de: 'German', es: 'Spanish', fr: 'French', pt: 'Portuguese', tr: 'Turkish' };
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const clean = (v, max) => String(v || '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max);
const ownerEmail = (env) => env.SUPPORT_EMAIL || 'support@myunwrapped.com';
const pagePath = (v) => (/^\/[\w\-./@]{0,120}$/.test(String(v || '')) ? String(v) : null);

// ---------- contact form ----------

export async function submitSupport(request, env, ctx) {
  await rateLimit(env, 'support', await visitorId(request, env), 5);
  const body = await readJson(request, 8192);
  const email = clean(body.email, 120).toLowerCase();
  const message = clean(body.message, 3000);
  if (!isEmail(email)) throw new HttpError(400, 'bad_email');
  if (message.length < 5) throw new HttpError(400, 'message_too_short');
  const name = clean(body.name, 60) || null;
  const lang = LANG.test(String(body.lang || '')) ? String(body.lang) : 'en';
  const page = pagePath(body.page);
  const row = await env.DB.prepare('INSERT INTO support (ts, kind, email, name, message, page, lang) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(Date.now(), 'contact', email, name, message, page, lang)
    .first();
  const ticket = { id: row.id, email, name, message, page, lang };
  // Notifications must not slow down or break the visitor's request.
  ctx.waitUntil(notifyNewTicket(env, ticket).catch((err) => console.error('support notify', err)));
  return json({ ok: true, id: row.id, emailed: emailEnabled(env) });
}

async function notifyNewTicket(env, t) {
  const site = siteUrl(env);
  const from = t.name ? `${t.name} <${t.email}>` : t.email;
  const tasks = [
    notifyOwner(env, `New support message #T${t.id}\nFrom: ${from}\nLanguage: ${t.lang}${t.page ? `\nPage: ${t.page}` : ''}\n\n${t.message}\n\nReply to this message here and it is e-mailed to them.`),
  ];
  if (emailEnabled(env)) {
    tasks.push(
      send(env, {
        to: ownerEmail(env),
        replyTo: t.email,
        subject: `Support #${t.id}: ${t.message.slice(0, 60).replace(/\s+/g, ' ')}`,
        text: `From: ${from}\nLanguage: ${t.lang}${t.page ? `\nPage: ${site}${t.page}` : ''}\n\n${t.message}\n\nHit Reply to answer them directly, or answer in the admin panel: ${site}/admin/`,
        html: layout(env, `Support message #${t.id}`, `<p style="color:#b9b9c6;margin:0 0 12px">From <b>${escapeHtml(from)}</b> · ${escapeHtml(t.lang)}${t.page ? ` · ${escapeHtml(t.page)}` : ''}</p><div style="white-space:pre-wrap;line-height:1.6;background:#0b0b10;border-radius:12px;padding:14px 16px">${escapeHtml(t.message)}</div><p style="color:#7d7d8c;font-size:13px;margin-top:16px">Hit Reply to answer them directly.</p>`, 'Sent by the support form on your site.'),
      }),
      send(env, {
        to: t.email,
        replyTo: ownerEmail(env),
        subject: `We got your message — ${brand(env)} support`,
        text: `Hi${t.name ? ` ${t.name}` : ''},\n\nThanks for writing to ${brand(env)}. We read every message and usually reply within 24 hours. You can simply reply to this e-mail to add anything.\n\nYour message:\n${t.message}\n\n— ${brand(env)} support`,
        html: layout(env, 'We got your message', `<p style="color:#b9b9c6;line-height:1.6;margin:0 0 14px">Thanks for writing to us. We read every message and usually reply within 24 hours. You can simply reply to this e-mail to add anything.</p><div style="white-space:pre-wrap;line-height:1.6;background:#0b0b10;border-radius:12px;padding:14px 16px;color:#b9b9c6">${escapeHtml(t.message)}</div>`, `You received this e-mail because you contacted ${escapeHtml(brand(env))} support.`),
      }),
    );
  }
  await Promise.allSettled(tasks);
}

// Owner's answer, from the admin panel or a Telegram reply: e-mailed to the visitor.
export async function replyToTicket(env, id, text) {
  const answer = clean(text, 5000);
  if (!answer) throw new HttpError(400, 'empty_reply');
  const t = await env.DB.prepare("SELECT * FROM support WHERE id = ? AND kind = 'contact'").bind(Number(id)).first();
  if (!t) throw new HttpError(404, 'ticket_not_found');
  if (!emailEnabled(env)) throw new HttpError(503, 'email_disabled');
  await send(env, {
    to: t.email,
    replyTo: ownerEmail(env),
    subject: `Re: your message to ${brand(env)} support`,
    text: `Hi${t.name ? ` ${t.name}` : ''},\n\n${answer}\n\n— ${brand(env)} support\n\nYour message:\n> ${t.message.replace(/\n/g, '\n> ')}`,
    html: layout(env, 'Reply from support', `<div style="white-space:pre-wrap;line-height:1.6;color:#ececf1">${escapeHtml(answer)}</div><p style="color:#7d7d8c;font-size:13px;margin:20px 0 6px">Your message:</p><div style="white-space:pre-wrap;line-height:1.6;color:#7d7d8c;border-left:3px solid #26262f;padding-left:12px">${escapeHtml(t.message)}</div>`, `Reply to this e-mail if you need anything else.`),
  });
  await env.DB.prepare("UPDATE support SET answer = ?, status = 'answered', replied_at = ? WHERE id = ?").bind(answer, Date.now(), t.id).run();
  return t;
}

// ---------- AI help bot ----------

function knowledge(env) {
  const plans = PLANS.map((p) => `${p.name}: $${p.priceUsd}`).join('; ');
  return `${brand(env)} (${siteUrl(env)}) analyzes the data export files people download from Instagram, TikTok, X, Facebook, LinkedIn, Threads, Telegram, WhatsApp and Spotify. The file is read inside the browser and never uploaded; it even works in airplane mode after the page loads. We never need passwords or the export file, and we never log in to anyone's account.

FREE: every analysis, the first 20 rows of each list, Wrapped cards. The demo is at /#demo.
PLUS: full lists with no 20-row limit, names of everyone who unfollowed you, full WhatsApp/Telegram chat stats, Spotify top 50, search and CSV export of lists, search every chat and save conversations, deep insights for TikTok/X/Facebook/LinkedIn, all Wrapped themes without watermark.
PRO: Ghost Detector (who leaves you on read, reply times), Engagement Audit, Growth Time Machine, Friendship Radar, unfollow queue with safe pacing.
CREATOR: bot/fake follower detector, best time to post, white-label PDF report, priority support.
PRICES: ${plans}. All plans are one-time payments that never renew automatically; a reminder e-mail comes before a time-limited plan ends. Pricing page: /pricing/.
PAYING: Telegram Stars (pay by card, Apple Pay or Google Pay inside Telegram, no Stars needed beforehand), USDT on TRON (TRC20) sent directly, or other crypto through NOWPayments. Guide for people without crypto: /guides/pay-with-usdt/. After paying, the license key appears on screen and is e-mailed if an e-mail was entered; /account/ shows it and lets you activate it on another device. Refunds: see /terms/.

HOW TO USE: request your data from the platform in JSON format (not HTML or PDF), choose "All time", wait for the e-mail, download the ZIP and drop it on the home page without unzipping. Several ZIP parts: select them all at once. Download guides: Instagram /guides/download-instagram-data/, TikTok /guides/download-tiktok-data/, X /guides/download-twitter-archive/, Facebook /guides/download-facebook-data/, LinkedIn /guides/download-linkedin-data/, Threads /guides/download-threads-data/. All guides: /guides/. Help center: /help/.
COMMON FIXES:
- Upload button does nothing on a phone: you are inside the Instagram/TikTok/Facebook in-app browser. Tap the ⋯ menu, choose "Open in browser" (Safari or Chrome) and try again.
- iPhone: the ZIP is in the Files app → Downloads.
- "We couldn't find social media data": the download was requested as HTML/PDF, has only media, or single files were picked. Request again in JSON and drop the whole ZIP.
- Instagram download not arrived: small ones take minutes, large ones hours or a few days. Check e-mail and Accounts Center → Download your information. The link expires after a few days.
- "Who unfollowed you" is empty: it needs two exports from different dates. The first is saved as a snapshot; drop a newer export later, or drop an old and a new one together.
- Numbers differ slightly from the app: exports lag a few hours and skip deactivated accounts.
- History disappeared: snapshots live in the browser; clearing site data or a private window starts fresh. Use Download backup / Restore backup.
- USDT amount slightly off: small fees are tolerated; if too little arrived, send the missing amount to the same address.
- USDT sent on the wrong network (not TRON): cannot be detected automatically — the person must contact a human with the transaction hash.
- Lost license key: check the e-mail from checkout, or /account/ on the device used to buy.
Other tools: link-in-bio pages at /bio/, list of all tools at /tools/.`;
}

function systemPrompt(env, lang) {
  return `You are the friendly support assistant on the ${brand(env)} website. Answer only questions about ${brand(env)}, social media data exports and how to use or pay for the product, using the facts below. Never invent features, prices, discounts or policies. Keep answers short: 1 to 5 sentences or a few short steps, plain text, no markdown headings or tables. Link pages as site paths like /pricing/. Reply in ${LANG_NAME[lang] || 'English'} unless the user clearly writes in another language; then use theirs.
Never ask for passwords, license keys in full, or the export file. When the facts answer the question, just answer it — do not mention humans or the team. Only if the question needs a human —a payment that did not arrive or was sent wrongly, a missing license, a refund, a bug you cannot solve, a business request, or anything the facts do not cover — tell them to tap "Message a human" below so the team can reply by e-mail (for payments, with their order ID or transaction hash), and end your reply with the exact token [HUMAN].
Tone: warm and direct, informal "you" (du, tú, tu, você, sen — never Sie or usted).

FACTS:
${knowledge(env)}`;
}

export function botEnabled(env) {
  return Boolean(env.AI && typeof env.AI.run === 'function');
}

export async function askBot(request, env, ctx) {
  await rateLimit(env, 'support-bot', await visitorId(request, env), 40);
  const body = await readJson(request, 16_384);
  const lang = LANG.test(String(body.lang || '')) ? String(body.lang) : 'en';
  const history = (Array.isArray(body.messages) ? body.messages : [])
    .slice(-8)
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: clean(m.content, 1200) }))
    .filter((m) => m.content);
  const question = history.at(-1);
  if (!question || question.role !== 'user') throw new HttpError(400, 'no_question');
  if (!botEnabled(env)) return json({ ok: true, answer: null, handoff: true });
  let answer;
  try {
    const res = await env.AI.run(MODEL, { messages: [{ role: 'system', content: systemPrompt(env, lang) }, ...history], max_tokens: 450, temperature: 0.2 });
    answer = clean(res?.response, 2500);
  } catch (err) {
    console.error('support bot', err);
    return json({ ok: true, answer: null, handoff: true });
  }
  const handoff = /\[HUMAN\]/i.test(answer);
  answer = answer.replace(/\s*\[HUMAN\]\s*/gi, ' ').trim();
  if (!answer) return json({ ok: true, answer: null, handoff: true });
  // Keep the questions so the owner sees what people struggle with.
  ctx.waitUntil(
    env.DB.prepare('INSERT INTO support (ts, kind, message, answer, page, lang, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(Date.now(), 'bot', question.content, answer, pagePath(body.page), lang, handoff ? 'handoff' : 'answered')
      .run()
      .catch(() => {}),
  );
  return json({ ok: true, answer, handoff });
}

// ---------- admin ----------

export async function adminSupport(env) {
  const { results: tickets } = await env.DB.prepare("SELECT * FROM support WHERE kind = 'contact' ORDER BY (status = 'open') DESC, ts DESC LIMIT 200").all();
  const { results: bot } = await env.DB.prepare("SELECT ts, message, answer, page, lang, status FROM support WHERE kind = 'bot' ORDER BY ts DESC LIMIT 100").all();
  const tg = await env.DB.prepare("SELECT v FROM meta WHERE k = 'support_tg_chat'").first();
  return json({ ok: true, tickets, bot, telegram: Boolean(tg?.v), email: emailEnabled(env), botEnabled: botEnabled(env), inbox: ownerEmail(env) });
}

export async function adminSupportReply(env, body) {
  await replyToTicket(env, body.id, body.text);
  return json({ ok: true });
}

export async function adminSupportStatus(env, body) {
  const status = body.status === 'closed' ? 'closed' : 'open';
  await env.DB.prepare("UPDATE support SET status = ? WHERE id = ? AND kind = 'contact'").bind(status, Number(body.id)).run();
  return json({ ok: true });
}
