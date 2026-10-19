// "E-mail me when my export is ready." Data exports take hours to days, and
// most people never come back to the tab. A visitor can leave an address for
// one reminder; it is sent once, then the address is deleted.

import { siteUrl } from './config.js';
import { layout, send, emailEnabled } from './email.js';
import { HttpError, json, rateLimit, readJson, visitorId } from './http.js';
import { DAY, HOUR, escapeHtml, isEmail } from './util.js';

export const REMINDER_SCHEMA = `CREATE TABLE IF NOT EXISTS export_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  platform TEXT NOT NULL,
  lang TEXT NOT NULL,
  send_at INTEGER NOT NULL,
  created INTEGER NOT NULL
)`;

// Typical wait until the download e-mail arrives.
const DELAY_HOURS = { instagram: 24, threads: 24, tiktok: 48, x: 24, facebook: 12, linkedin: 12 };
const NAMES = { instagram: 'Instagram', threads: 'Threads', tiktok: 'TikTok', x: 'X', facebook: 'Facebook', linkedin: 'LinkedIn' };
const LANGS = ['en', 'de', 'es', 'fr', 'pt', 'tr'];

const COPY = {
  en: {
    subject: 'Your {p} data should be ready',
    title: 'Your {p} export should be ready',
    body: '{p} usually sends the download link by e-mail around now. Download the ZIP, then drop it into Unwrapped — it is analyzed on your device and nothing is uploaded.',
    cta: 'Open Unwrapped',
    tip: 'No e-mail from {p} yet? Check your spam folder, or open the download page in the {p} app — the file is listed there once it is ready.',
    footer: 'You asked for this one-time reminder. Your address has now been deleted — we will not e-mail you again.',
  },
  de: {
    subject: 'Deine {p}-Daten sollten fertig sein',
    title: 'Dein {p}-Export sollte fertig sein',
    body: '{p} schickt den Download-Link meist ungefähr jetzt per E-Mail. Lade die ZIP-Datei herunter und zieh sie in Unwrapped — die Analyse läuft auf deinem Gerät, nichts wird hochgeladen.',
    cta: 'Unwrapped öffnen',
    tip: 'Noch keine E-Mail von {p}? Schau im Spam-Ordner nach oder öffne die Download-Seite in der {p}-App — dort steht die Datei, sobald sie fertig ist.',
    footer: 'Du hast diese einmalige Erinnerung angefordert. Deine Adresse wurde jetzt gelöscht — wir schreiben dir nicht noch einmal.',
  },
  es: {
    subject: 'Tus datos de {p} ya deberían estar listos',
    title: 'Tu exportación de {p} ya debería estar lista',
    body: '{p} suele enviar el enlace de descarga por correo más o menos ahora. Descarga el ZIP y suéltalo en Unwrapped: se analiza en tu dispositivo y no se sube nada.',
    cta: 'Abrir Unwrapped',
    tip: '¿Aún no hay correo de {p}? Revisa la carpeta de spam o abre la página de descargas en la app de {p}: el archivo aparece allí cuando está listo.',
    footer: 'Pediste este recordatorio único. Tu dirección ya se ha borrado: no volveremos a escribirte.',
  },
  fr: {
    subject: 'Vos données {p} devraient être prêtes',
    title: 'Votre export {p} devrait être prêt',
    body: '{p} envoie généralement le lien de téléchargement par e-mail à peu près maintenant. Téléchargez le ZIP puis déposez-le dans Unwrapped : l’analyse se fait sur votre appareil, rien n’est envoyé.',
    cta: 'Ouvrir Unwrapped',
    tip: 'Pas encore d’e-mail de {p} ? Vérifiez vos spams ou ouvrez la page de téléchargement dans l’app {p} : le fichier y apparaît dès qu’il est prêt.',
    footer: 'Vous avez demandé ce rappel unique. Votre adresse vient d’être supprimée : nous ne vous écrirons plus.',
  },
  pt: {
    subject: 'Seus dados do {p} já devem estar prontos',
    title: 'Sua exportação do {p} já deve estar pronta',
    body: 'O {p} costuma enviar o link de download por e-mail mais ou menos agora. Baixe o ZIP e solte-o no Unwrapped — a análise acontece no seu dispositivo e nada é enviado.',
    cta: 'Abrir o Unwrapped',
    tip: 'Ainda sem e-mail do {p}? Confira a pasta de spam ou abra a página de download no app do {p} — o arquivo aparece lá quando estiver pronto.',
    footer: 'Você pediu este lembrete único. Seu endereço já foi apagado — não vamos escrever de novo.',
  },
  tr: {
    subject: '{p} verilerin hazır olmalı',
    title: '{p} dışa aktarımın hazır olmalı',
    body: '{p} indirme bağlantısını genellikle tam bu sıralarda e-postayla gönderir. ZIP dosyasını indir ve Unwrapped’e bırak — analiz cihazında yapılır, hiçbir şey yüklenmez.',
    cta: 'Unwrapped’i aç',
    tip: '{p} e-postası henüz gelmedi mi? Spam klasörüne bak ya da {p} uygulamasında indirme sayfasını aç — dosya hazır olunca orada görünür.',
    footer: 'Bu tek seferlik hatırlatmayı sen istedin. Adresin artık silindi — sana tekrar yazmayacağız.',
  },
};

export async function createReminder(request, env) {
  if (!emailEnabled(env)) throw new HttpError(503, 'email_disabled');
  await rateLimit(env, 'remind', await visitorId(request, env), 5);
  const body = await readJson(request, 2048);
  const email = String(body.email || '').trim().toLowerCase();
  if (!isEmail(email)) throw new HttpError(400, 'bad_email');
  const platform = String(body.platform || '') in DELAY_HOURS ? String(body.platform) : 'instagram';
  const lang = LANGS.includes(String(body.lang)) ? String(body.lang) : 'en';
  const now = Date.now();
  // One pending reminder per address and platform.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM export_reminders WHERE email = ? AND platform = ?').bind(email, platform),
    env.DB.prepare('INSERT INTO export_reminders (email, platform, lang, send_at, created) VALUES (?, ?, ?, ?, ?)').bind(email, platform, lang, now + DELAY_HOURS[platform] * HOUR, now),
  ]);
  return json({ ok: true, hours: DELAY_HOURS[platform] });
}

export function reminderEmail(env, { platform, lang }) {
  const c = COPY[lang] || COPY.en;
  const p = NAMES[platform] || 'Instagram';
  const fill = (s) => s.replaceAll('{p}', p);
  const link = `${siteUrl(env)}${lang === 'en' ? '' : `/${lang}`}/#start`;
  const html = layout(
    env,
    escapeHtml(fill(c.title)),
    `<p style="color:#b9b9c6;line-height:1.6;margin:0 0 18px">${escapeHtml(fill(c.body))}</p>
     <a href="${escapeHtml(link)}" style="display:inline-block;background:#d7ff3a;color:#0b0b10;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">${escapeHtml(c.cta)}</a>
     <p style="color:#7d7d8c;font-size:13px;line-height:1.6;margin-top:18px">${escapeHtml(fill(c.tip))}</p>`,
    escapeHtml(c.footer),
  );
  const text = `${fill(c.title)}\n\n${fill(c.body)}\n\n${c.cta}: ${link}\n\n${fill(c.tip)}\n\n${c.footer}`;
  return { subject: fill(c.subject), html, text };
}

// Runs with the per-minute cron. Every reminder is tried once and then
// deleted, sent or not, so no address is kept longer than needed.
export async function sendDueReminders(env) {
  if (!emailEnabled(env)) return;
  const now = Date.now();
  const { results } = await env.DB.prepare('SELECT * FROM export_reminders WHERE send_at <= ? ORDER BY send_at LIMIT 20').bind(now).all();
  for (const r of results || []) {
    await env.DB.prepare('DELETE FROM export_reminders WHERE id = ?').bind(r.id).run();
    try {
      await send(env, { to: r.email, ...reminderEmail(env, r) });
    } catch (err) {
      console.error('export reminder failed', r.id, err);
    }
  }
  // Safety net: nothing older than a week stays, even if e-mail was switched off.
  await env.DB.prepare('DELETE FROM export_reminders WHERE created < ?').bind(now - 7 * DAY).run();
}
