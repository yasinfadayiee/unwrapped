// "Wrapped" story cards (1080×1920) drawn on canvas — ready for Instagram or
// TikTok stories. Free cards carry a small watermark; Pro unlocks all themes.

import { relationships, watchStats, tweetStats, exposureScore } from '../core/insights.js';
import { fmtInt, compact, pct, hourLabel, duration, dateShort, yearsSince } from '../lib/format.js';
import { t as tl } from '../lib/i18n.js';

export const THEMES = {
  aurora: { label: tl('Aurora'), bg: '#0a0a12', ink: '#f4f4f6', sub: 'rgba(244,244,246,0.62)', accent: '#d7ff3a', line: 'rgba(255,255,255,0.14)', free: true, swatch: 'linear-gradient(135deg,#2a1f6b,#0a0a12)' },
  signal: { label: tl('Signal'), bg: '#d7ff3a', ink: '#0a0a0e', sub: 'rgba(10,10,14,0.62)', accent: '#0a0a0e', line: 'rgba(10,10,14,0.18)', swatch: '#d7ff3a' },
  ember: { label: tl('Ember'), bg: '#2a0b0a', ink: '#fff1e8', sub: 'rgba(255,241,232,0.66)', accent: '#ff9b6b', line: 'rgba(255,241,232,0.16)', swatch: 'linear-gradient(135deg,#e0574a,#2a0b0a)' },
  paper: { label: tl('Paper'), bg: '#f2efe8', ink: '#121212', sub: 'rgba(18,18,18,0.6)', accent: '#5b48d6', line: 'rgba(18,18,18,0.14)', swatch: '#f2efe8' },
};

const W = 1080;
const H = 1920;

export async function fontsReady() {
  if (!document.fonts) return;
  await Promise.all(
    ['700 120px Bricolage', '600 40px Inter', '700 40px Inter', 'italic 400 120px "Instrument Serif"', '500 28px "JetBrains Mono"'].map((f) =>
      document.fonts.load(f).catch(() => null),
    ),
  );
}

function background(ctx, theme) {
  const t = THEMES[theme];
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);
  const blob = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  if (theme === 'aurora') {
    blob(180, 260, 900, 'rgba(143,125,255,0.55)');
    blob(980, 1500, 800, 'rgba(215,255,58,0.18)');
    blob(900, 300, 500, 'rgba(224,87,74,0.18)');
  } else if (theme === 'ember') {
    blob(900, 200, 1000, 'rgba(224,87,74,0.7)');
    blob(100, 1700, 800, 'rgba(255,155,107,0.25)');
  } else if (theme === 'signal') {
    blob(900, 1700, 900, 'rgba(143,125,255,0.35)');
  } else {
    blob(950, 250, 700, 'rgba(91,72,214,0.12)');
  }
  // Fine grain.
  ctx.globalAlpha = theme === 'paper' || theme === 'signal' ? 0.05 : 0.07;
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = i % 2 ? '#fff' : '#000';
    ctx.fillRect((i * 7919) % W, (i * 104729) % H, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function logoMark(ctx, x, y, size, ink, accent) {
  const k = size / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  // The "U" mark: an opened wrapper with a data dot (same as the site logo).
  ctx.fillStyle = 'rgba(15,15,22,0.85)';
  ctx.fill(new Path2D('M10 1.5h12a8.5 8.5 0 0 1 8.5 8.5v12a8.5 8.5 0 0 1-8.5 8.5H10A8.5 8.5 0 0 1 1.5 22V10A8.5 8.5 0 0 1 10 1.5z'));
  const g = ctx.createLinearGradient(10, 23, 22, 8);
  g.addColorStop(0, '#8f7dff');
  g.addColorStop(1, accent);
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  ctx.strokeStyle = g;
  ctx.stroke(new Path2D('M10 8.5v8.5a6 6 0 0 0 12 0V8.5'));
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(16, 8.4, 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function fitText(ctx, text, maxWidth, size, weight, family) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && s > 24) {
    s -= 4;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

/**
 * card: { platform, kicker, titleA, titleB, hero, heroLabel, rows: [[label, value]], persona, personaLine, period }
 */
export function drawCard(canvas, card, theme = 'aurora', { watermark = true, site = '' } = {}) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const t = THEMES[theme] || THEMES.aurora;
  background(ctx, theme);
  const pad = 96;

  logoMark(ctx, pad, 110, 64, t.ink, t.accent);
  ctx.fillStyle = t.ink;
  ctx.font = '700 40px Bricolage, Inter, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(tl('Unwrapped'), pad + 84, 143);
  ctx.font = '500 26px "JetBrains Mono", monospace';
  ctx.fillStyle = t.sub;
  ctx.textAlign = 'right';
  ctx.fillText(card.kicker.toUpperCase(), W - pad, 143);
  ctx.textAlign = 'left';

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = t.ink;
  fitText(ctx, card.titleA, W - pad * 2, 120, 'italic 400', '"Instrument Serif", Georgia, serif');
  ctx.fillText(card.titleA, pad, 420);
  fitText(ctx, card.titleB, W - pad * 2, 132, '700', 'Bricolage, Inter, sans-serif');
  ctx.fillText(card.titleB, pad, 552);

  ctx.fillStyle = t.accent;
  const heroSize = fitText(ctx, card.hero, W - pad * 2, 300, '700', 'Inter, sans-serif');
  ctx.fillText(card.hero, pad - heroSize * 0.03, 900);
  ctx.fillStyle = t.ink;
  ctx.font = '600 46px Inter, sans-serif';
  ctx.fillText(card.heroLabel, pad, 990);

  let y = 1120;
  for (const [label, value] of card.rows.slice(0, 4)) {
    ctx.strokeStyle = t.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, y - 62);
    ctx.lineTo(W - pad, y - 62);
    ctx.stroke();
    ctx.fillStyle = t.sub;
    ctx.font = '500 38px Inter, sans-serif';
    ctx.fillText(label, pad, y);
    ctx.fillStyle = t.ink;
    ctx.font = '700 46px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(value, W - pad, y);
    ctx.textAlign = 'left';
    y += 112;
  }

  y += 30;
  ctx.fillStyle = t.sub;
  ctx.font = '500 26px "JetBrains Mono", monospace';
  ctx.fillText(tl('YOUR TYPE'), pad, y);
  ctx.fillStyle = t.ink;
  const persona = tl(card.persona);
  fitText(ctx, persona, W - pad * 2, 82, '700', 'Bricolage, Inter, sans-serif');
  ctx.fillText(persona, pad, y + 92);
  ctx.fillStyle = t.sub;
  ctx.font = '500 36px Inter, sans-serif';
  ctx.fillText(tl(card.personaLine), pad, y + 150);

  ctx.font = '500 26px "JetBrains Mono", monospace';
  ctx.fillStyle = t.sub;
  ctx.fillText(card.period || '', pad, H - 110);
  if (watermark) {
    ctx.textAlign = 'right';
    ctx.fillStyle = t.ink;
    ctx.font = '600 30px Inter, sans-serif';
    ctx.fillText(tl('made with {v0}', { v0: site || 'Unwrapped' }), W - pad, H - 110);
    ctx.textAlign = 'left';
  }
  return canvas;
}

function periodOf(ds) {
  return tl('EXPORT · {v0}', { v0: dateShort(ds.exportedAt).toUpperCase() });
}

export function cardsFor(ds) {
  const cards = [];
  if (['instagram', 'threads', 'tiktok'].includes(ds.platform) && ds.hasRelationships) {
    const rel = relationships(ds);
    const persona =
      rel.ratio >= 1.5
        ? [tl('The Magnet'), tl('More people follow you than you follow.')]
        : rel.ratio <= 0.7
          ? [tl('The Explorer'), tl('You follow the world — loudly.')]
          : rel.followBackRate >= 0.8
            ? [tl('The Loyalist'), tl('Your follows come back to you.')]
            : [tl('The Balanced One'), tl('Give and take, mostly even.')];
    cards.push({
      id: 'network',
      platform: ds.platform,
      kicker: tl('{v0} · network', { v0: ds.label }),
      titleA: `My ${ds.label},`,
      titleB: tl('unwrapped.'),
      hero: pct(rel.followBackRate),
      heroLabel: tl('of the accounts I follow follow me back'),
      rows: [
        [tl('Followers'), fmtInt(rel.followers)],
        [tl('Following'), fmtInt(rel.following)],
        [tl('Mutuals'), fmtInt(rel.mutuals.length)],
        [tl('Don’t follow back'), fmtInt(rel.notFollowingBack.length)],
      ],
      persona: persona[0],
      personaLine: persona[1],
      period: periodOf(ds),
    });
  }
  if (ds.platform === 'tiktok' && ds.watch.length) {
    const w = watchStats(ds.watch);
    cards.push({
      id: 'screen',
      platform: 'tiktok',
      kicker: tl('TikTok · screen time'),
      titleA: tl('My TikTok,'),
      titleB: tl('unwrapped.'),
      hero: `${fmtInt(w.hours)}h`,
      heroLabel: tl('watched in {v0} days', { v0: fmtInt(w.spanDays) }),
      rows: [
        [tl('Videos watched'), compact(w.videos)],
        [tl('Per day'), tl('{v0} min', { v0: Math.round(w.perDayMinutes) })],
        [tl('Longest binge'), duration(w.longest.ms)],
        [tl('Peak hour'), hourLabel(w.peakHour)],
      ],
      persona: w.persona.title,
      personaLine: w.persona.line,
      period: `${dateShort(w.first)} – ${dateShort(w.last)}`.toUpperCase(),
    });
  }
  if (ds.platform === 'x' && ds.tweets.length) {
    const st = tweetStats(ds.tweets);
    const persona =
      st.replies > st.originals
        ? [tl('The Reply Guy'), tl('You live in the comments.')]
        : st.retweets > st.originals
          ? [tl('The Amplifier'), tl('You make other voices louder.')]
          : [tl('The Original'), tl('You post your own takes.')];
    cards.push({
      id: 'posts',
      platform: 'x',
      kicker: tl('X · posts'),
      titleA: tl('My X,'),
      titleB: tl('unwrapped.'),
      hero: compact(st.total),
      heroLabel: tl('posts, replies & reposts'),
      rows: [
        [tl('Likes earned'), compact(st.likesEarned)],
        [tl('Best post'), tl('{v0} likes', { v0: compact(st.best[0]?.likes || 0) })],
        [tl('Most active'), hourLabel(st.peakHour)],
        [tl('On X for'), tl('{v0} years', { v0: yearsSince(ds.account.createdAt).toFixed(1) })],
      ],
      persona: persona[0],
      personaLine: persona[1],
      period: periodOf(ds),
    });
  }
  const privacy = privacyParts(ds);
  if (privacy) {
    const ex = exposureScore(privacy);
    const persona = ex.score > 60 ? [tl('Open Book'), tl('Advertisers know you well.')] : ex.score > 30 ? [tl('Half Visible'), tl('They know some. Not all.')] : [tl('Low Profile'), tl('Hard to profile. Nice.')];
    cards.push({
      id: 'privacy',
      platform: ds.platform,
      kicker: tl('{v0} · privacy', { v0: ds.label }),
      titleA: tl('What they know,'),
      titleB: tl('unwrapped.'),
      hero: ex.grade,
      heroLabel: tl('exposure score {v0}/100', { v0: ex.score }),
      rows: [
        [tl('Advertisers with my data'), fmtInt(privacy.advertisers || 0)],
        [tl('Interests profiled'), fmtInt(privacy.interests || 0)],
        [tl('Login IP addresses'), fmtInt(privacy.ips || 0)],
        [tl('Connected apps'), fmtInt(privacy.apps || 0)],
      ],
      persona: persona[0],
      personaLine: persona[1],
      period: periodOf(ds),
    });
  }
  return cards;
}

export function privacyParts(ds) {
  if (ds.platform === 'instagram' && ds.privacy) {
    const p = ds.privacy;
    return { advertisers: p.advertisers?.length || 0, interests: (p.topics?.length || 0) + (p.interests?.length || 0), ips: p.logins?.ips || 0, apps: 0 };
  }
  if (ds.platform === 'x') {
    return { advertisers: ds.advertisers.length, interests: ds.interests.length, ips: new Set(ds.logins.map((l) => l.ip)).size, apps: ds.apps.length };
  }
  if (ds.platform === 'tiktok' && (ds.logins.length || ds.adInterests.length || ds.offTiktok)) {
    return { advertisers: 0, interests: ds.adInterests.length, ips: new Set(ds.logins.map((l) => l.ip)).size, apps: 0, offPlatform: ds.offTiktok };
  }
  if (ds.platform === 'facebook' && (ds.advertisers.length || ds.offFacebook.companies)) {
    return { advertisers: ds.advertisers.length, interests: 0, ips: 0, apps: 0, offPlatform: ds.offFacebook.companies };
  }
  return null;
}

export function canvasBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
