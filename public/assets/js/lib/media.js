// Turns a file inside the export into a URL the page can show — only when it
// scrolls into view, because exports can hold thousands of photos.

const MIME = { svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', mp4: 'video/mp4', mov: 'video/quicktime', m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac', ogg: 'audio/ogg' };
const urls = new WeakMap();

export const mimeOf = (name) => MIME[String(name).split('.').pop().toLowerCase()] || 'application/octet-stream';

export async function mediaBlob(entry) {
  return new Blob([await entry.bytes()], { type: mimeOf(entry.name) });
}

export async function mediaUrl(entry) {
  if (!urls.has(entry)) urls.set(entry, mediaBlob(entry).then((b) => URL.createObjectURL(b)));
  return urls.get(entry);
}

// Sets `el.src` once the element is visible.
export function lazySrc(el, entry) {
  const io = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    try {
      el.src = await mediaUrl(entry);
    } catch {
      /* unreadable entry */
    }
  });
  io.observe(el);
  return el;
}
