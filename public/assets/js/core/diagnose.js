// When nothing could be analyzed, explain why in plain words: the most common
// mistakes are the wrong export, a media-only download or a missing ZIP part.

const OTHER_EXPORTS = [
  { name: 'Snapchat', test: (e) => /(^|\/)(memories_history|snap_history|chat_history)\.(json|html)$|snapchat/i.test(e.path) },
  { name: 'Google Takeout', test: (e) => /(^|\/)takeout\//i.test(e.path) },
  { name: 'Telegram', test: (e) => /(^|\/)result\.json$|chatexport_/i.test(e.path) },
  { name: 'Discord', test: (e) => /(^|\/)messages\/c\d+\/|(^|\/)package\/account\//i.test(e.path) },
  { name: 'Pinterest', test: (e) => /pinterest/i.test(e.path) },
];

const META = /(^|\/)(personal_information|ads_information|logged_information|security_and_login_information|preferences|apps_and_websites_off_of_instagram|your_instagram_activity|your_facebook_activity|connections)\//i;
const MEDIA = /\.(jpe?g|png|webp|heic|gif|mp4|mov|m4a|mp3|webm)$/i;
const DATA = /\.(json|html?|js|txt|csv)$/i;

// Returns [{ id, vars }] — ids are turned into translated text by the app.
export function diagnose(vfs, files = []) {
  const entries = vfs.entries;
  const hints = [];
  const names = files.map((f) => f.name || '');
  if (names.some((n) => /\.(z\d\d|\d{3})$/i.test(n) || /\.zip\.\d+$/i.test(n))) hints.push({ id: 'parts' });
  if (!entries.length) {
    hints.push({ id: 'empty' });
    return hints;
  }
  const other = OTHER_EXPORTS.find((o) => entries.some(o.test));
  if (other) hints.push({ id: 'other', vars: { v0: other.name } });
  const media = entries.filter((e) => MEDIA.test(e.name)).length;
  const data = entries.filter((e) => DATA.test(e.name)).length;
  if (media > 0 && data === 0) hints.push({ id: 'media' });
  if (entries.some((e) => /\.pdf$/i.test(e.name)) && !data) hints.push({ id: 'pdf' });
  // A real Meta export, just without the parts we read (followers, activity…).
  if (!other && data && entries.some((e) => META.test(e.path))) hints.push({ id: 'meta-partial' });
  if (!hints.length && entries.length < 4) hints.push({ id: 'few', vars: { v0: entries.map((e) => e.name).slice(0, 3).join(', ') } });
  return hints;
}
