// Turns SUPPORT_CONTACT ("Telegram: @name · WhatsApp: +44… · Discord: name")
// into clickable links: Telegram handles → t.me, phone numbers → wa.me.

import { h } from './ui.js';

export function supportLinks(text) {
  return String(text)
    .split(/\s*·\s*/)
    .filter(Boolean)
    .flatMap((part, i) => {
      const [, label = '', value = part] = part.match(/^([^:]+):\s*(.+)$/) || [];
      let href = null;
      if (/telegram/i.test(label) && /^@?\w{4,}$/.test(value)) href = `https://t.me/${value.replace(/^@/, '')}`;
      else if (/whatsapp/i.test(label) && /^\+?[\d\s]{7,}$/.test(value)) href = `https://wa.me/${value.replace(/\D/g, '')}`;
      const node = href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, value) : h('span', null, value);
      return [i ? ' · ' : '', label ? `${label}: ` : '', node];
    });
}
