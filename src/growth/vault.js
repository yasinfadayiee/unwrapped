// Encrypts platform access tokens at rest (AES-GCM, key from the GROWTH_KEY
// secret: 32 random bytes, base64). A leaked database alone reveals no token.

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const keys = new Map();
async function key(env) {
  const raw = String(env.GROWTH_KEY || '');
  if (!keys.has(raw)) {
    const bytes = unb64(raw);
    if (bytes.length !== 32) throw new Error('GROWTH_KEY must be 32 bytes, base64');
    keys.set(raw, await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']));
  }
  return keys.get(raw);
}

export async function seal(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), enc.encode(text));
  return `${b64(iv)}.${b64(data)}`;
}

export async function open(env, sealed) {
  const [iv, data] = String(sealed).split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(env), unb64(data));
  return dec.decode(plain);
}

// Random URL-safe id for sessions and OAuth state.
export function randomId(bytes = 24) {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
