// Optional e-mail via Resend (https://resend.com). When RESEND_API_KEY and
// EMAIL_FROM are not set, every function here quietly does nothing.

import { brand, siteUrl, getPlan } from './config.js';
import { DAY, escapeHtml } from './util.js';

export function emailEnabled(env) {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

async function send(env, { to, subject, html }) {
  if (!emailEnabled(env)) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  return true;
}

function layout(env, title, body) {
  const name = escapeHtml(brand(env));
  return `<!doctype html><html><body style="margin:0;background:#0b0b10;font-family:Inter,Segoe UI,Arial,sans-serif;color:#ececf1">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin-bottom:28px">${name}</div>
    <div style="background:#15151d;border:1px solid #26262f;border-radius:18px;padding:28px">
      <h1 style="font-size:22px;margin:0 0 12px;letter-spacing:-0.02em">${title}</h1>
      ${body}
    </div>
    <p style="color:#7d7d8c;font-size:12px;margin-top:24px">You received this e-mail because you bought ${name} Pro. Your social data never leaves your device.</p>
  </div></body></html>`;
}

function expiryText(license) {
  if (!license.expires_at) return 'never — lifetime access';
  return new Date(license.expires_at).toUTCString().replace(/ \d\d:\d\d:\d\d GMT$/, '');
}

export async function sendLicenseEmail(env, { to, license, plan }) {
  const site = siteUrl(env);
  const link = `${site}/account/#key=${encodeURIComponent(license.key)}`;
  const html = layout(
    env,
    'Your Pro access is ready',
    `<p style="color:#b9b9c6;line-height:1.6;margin:0 0 18px">Thanks for your payment${plan ? ` for <b>${escapeHtml(plan.name)}</b>` : ''}. Your license key:</p>
     <div style="font-family:JetBrains Mono,Consolas,monospace;font-size:18px;background:#0b0b10;border:1px dashed #3a3a46;border-radius:12px;padding:14px 16px;text-align:center;color:#d7ff3a">${escapeHtml(license.key)}</div>
     <p style="color:#b9b9c6;line-height:1.6">Valid until: <b>${escapeHtml(expiryText(license))}</b></p>
     <a href="${escapeHtml(link)}" style="display:inline-block;background:#d7ff3a;color:#0b0b10;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">Activate on this device</a>
     <p style="color:#7d7d8c;font-size:13px;line-height:1.6;margin-top:18px">Keep this key safe — it unlocks Pro on any browser.</p>`,
  );
  return send(env, { to, subject: `Your ${brand(env)} Pro license`, html });
}

// Runs once a day from the cron trigger.
export async function sendRenewalReminders(env) {
  if (!emailEnabled(env)) return { skipped: 'email_disabled' };
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT * FROM licenses
     WHERE status = 'active' AND email IS NOT NULL AND expires_at IS NOT NULL
       AND expires_at BETWEEN ? AND ? AND (reminded_at IS NULL OR reminded_at < expires_at - ?)
     LIMIT 50`,
  )
    .bind(now, now + 3 * DAY, 5 * DAY)
    .all();
  let sent = 0;
  for (const license of results) {
    const days = Math.max(1, Math.ceil((license.expires_at - now) / DAY));
    const plan = getPlan(license.plan);
    const html = layout(
      env,
      `Your Pro access ends in ${days} day${days === 1 ? '' : 's'}`,
      `<p style="color:#b9b9c6;line-height:1.6">Renew now to keep your unfollower history, full lists and premium Wrapped cards. Your key stays the same and the new time is added on top.</p>
       <a href="${escapeHtml(siteUrl(env))}/account/#renew" style="display:inline-block;background:#d7ff3a;color:#0b0b10;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">Renew ${escapeHtml(plan ? plan.short : 'Pro')}</a>`,
    );
    try {
      await send(env, { to: license.email, subject: `${brand(env)} Pro ends in ${days} day${days === 1 ? '' : 's'}`, html });
      await env.DB.prepare('UPDATE licenses SET reminded_at = ? WHERE key = ?').bind(now, license.key).run();
      sent++;
    } catch (err) {
      console.error('reminder failed', license.key, err);
    }
  }
  return { sent };
}
