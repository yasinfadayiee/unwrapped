// Cinematic "unwrapping" story shown right after analysis: full-screen slides
// with animated numbers, tap/arrow navigation and auto-advance.

import { h, icon, downloadBlob } from '../lib/ui.js';
import { recordStory, videoSupported } from './story-video.js';
import { fmtInt, compact, hourLabel, duration, pct } from '../lib/format.js';
import { relationships, watchStats, tweetStats, exposureScore, friendshipRadar, diffSnapshots } from '../core/insights.js';
import { privacyParts } from './wrapped.js';
import { t as tl } from '../lib/i18n.js';

const BG = [
  'radial-gradient(80% 70% at 20% 20%, #5a43d6 0%, transparent 60%), radial-gradient(70% 60% at 90% 90%, #1a9e8e 0%, transparent 60%), #07070b',
  'radial-gradient(80% 70% at 80% 10%, #e0574a 0%, transparent 55%), radial-gradient(60% 60% at 10% 90%, #8f7dff 0%, transparent 60%), #0b0710',
  'radial-gradient(90% 80% at 50% 0%, #b9f227 0%, transparent 50%), radial-gradient(60% 60% at 90% 100%, #1a9e8e 0%, transparent 60%), #060a06',
  'radial-gradient(80% 80% at 0% 100%, #b8820f 0%, transparent 55%), radial-gradient(70% 60% at 100% 0%, #8f7dff 0%, transparent 60%), #0a0806',
  'radial-gradient(90% 70% at 50% 100%, #8f7dff 0%, transparent 55%), radial-gradient(50% 50% at 80% 10%, #e0574a 0%, transparent 60%), #07070b',
];

function slidesFor(datasets) {
  const slides = [{ kicker: tl('Ready?'), title: tl('Your socials,'), serif: tl('unwrapped.'), text: tl('We decoded {v0} — right here on your device.', { v0: datasets.map((d) => d.label).join(', ') }) }];
  let relDone = false;
  let worstPrivacy = null;
  for (const ds of datasets) {
    if (['instagram', 'tiktok', 'threads', 'x'].includes(ds.platform) && ds.hasRelationships && relDone) {
      const rel = relationships(ds);
      slides.push({ kicker: tl('{v0} · your people', { v0: ds.label }), number: rel.notFollowingBack.length, title: tl('don’t follow you back on {v0}', { v0: ds.label }), text: tl('{v0} followers, {v1} follow-back rate.', { v0: fmtInt(rel.followers), v1: pct(rel.followBackRate) }), accent: 'var(--c2)' });
    } else if (['instagram', 'tiktok', 'threads', 'x'].includes(ds.platform) && ds.hasRelationships) {
      relDone = true;
      const rel = relationships(ds);
      slides.push({ kicker: tl('{v0} · your people', { v0: ds.label }), number: rel.followers, title: tl('people follow you'), text: tl('And you follow {v0}. {v1} of them follow you back.', { v0: fmtInt(rel.following), v1: pct(rel.followBackRate) }) });
      if (rel.notFollowingBack.length) slides.push({ kicker: tl('{v0} · the truth', { v0: ds.label }), number: rel.notFollowingBack.length, title: tl('don’t follow you back'), text: tl('Don’t worry — we made you a list. And a safe way to clean it up.'), accent: 'var(--c2)' });
      const snaps = ds._snapshots || [];
      if (snaps.length >= 2) {
        const d = diffSnapshots(snaps[snaps.length - 2], snaps[snaps.length - 1]);
        slides.push({ kicker: tl('{v0} · since last time', { v0: ds.label }), number: d.unfollowedYou.length, title: d.unfollowedYou.length === 1 ? tl('person unfollowed you') : tl('people unfollowed you'), text: tl('But {v0} new ones followed. Want to see who?', { v0: fmtInt(d.newFollowers.length) }), accent: 'var(--c2)' });
      }
    }
    if (ds.platform === 'instagram') {
      const radar = friendshipRadar(ds.activity?.messages);
      if (radar) {
        slides.push({ kicker: tl('Instagram · your DMs'), number: ds.activity.messages.total, title: tl('messages, sent and received'), text: tl('Your inner circle has {v0} people. {v1} friendships are quietly fading…', { v0: radar.innerCircle.length, v1: fmtInt(radar.fading.length + radar.quiet.length) }) });
      }
    }
    if (ds.platform === 'tiktok' && ds.watch.length) {
      const w = watchStats(ds.watch);
      slides.push({ kicker: tl('TikTok · screen time'), number: Math.round(w.hours), suffix: 'h', title: tl('of scrolling'), text: tl('{v0} videos. That’s {v1} minutes every single day.', { v0: fmtInt(w.videos), v1: Math.round(w.perDayMinutes) }), accent: 'var(--signal)' });
      slides.push({ kicker: tl('TikTok · your longest binge'), big: duration(w.longest.ms), title: tl('in one sitting'), text: tl('{v0} videos without stopping. You’re a {v1} — peak hour {v2}.', { v0: fmtInt(w.longest.count), v1: tl(w.persona.title), v2: hourLabel(w.peakHour) }) });
    }
    if (ds.platform === 'x' && ds.tweets.length) {
      const st = tweetStats(ds.tweets);
      slides.push({ kicker: tl('X · everything you posted'), number: st.total, title: tl('posts, replies & reposts'), text: tl('They earned you {v0} likes. Your best one got {v1}.', { v0: compact(st.likesEarned), v1: fmtInt(st.best[0]?.likes || 0) }) });
    }
    const parts = privacyParts(ds);
    if (parts && (parts.advertisers || parts.interests)) {
      const ex = exposureScore(parts);
      if (!worstPrivacy || ex.score > worstPrivacy.ex.score) worstPrivacy = { ds, parts, ex };
    }
  }
  if (worstPrivacy) {
    const { ds, parts, ex } = worstPrivacy;
    slides.push({ kicker: tl('{v0} · privacy', { v0: ds.label }), big: ex.grade, title: tl('your privacy grade'), text: tl('{v0} advertisers have your data. {v1} interests were profiled about you.', { v0: fmtInt(parts.advertisers), v1: fmtInt(parts.interests) }), accent: ex.score > 60 ? 'var(--c2)' : 'var(--signal)' });
  }
  slides.push({ kicker: tl('That’s the trailer'), title: tl('Now explore'), serif: 'everything.', text: tl('Every list, every chart, every card — waiting in your dashboard.'), final: true });
  return slides;
}

function countUp(el, to, suffix = '', ms = 1400) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = `${fmtInt(to)}${suffix}`;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = `${fmtInt(Math.round(to * eased))}${suffix}`;
    if (t < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function playStory(datasets, { onDone }) {
  const slides = slidesFor(datasets);
  let index = 0;
  let timer = 0;
  let paused = false;
  const DURATION = 5200;

  const bars = h('div', { class: 'story-bars' }, slides.map(() => h('span', null, h('i'))));
  const stage = h('div', { class: 'story-stage', 'aria-live': 'polite' });
  const skip = h('button', { class: 'story-skip', type: 'button' }, tl('Skip'), icon('arrow'));
  const root = h('div', { class: 'story', role: 'dialog', 'aria-modal': 'true', 'aria-label': tl('Your results story') }, h('div', { class: 'story-bg' }), bars, skip, stage, h('div', { class: 'story-hint' }, tl('Tap to continue')));
  const bg = root.querySelector('.story-bg');

  function finish() {
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey);
    root.classList.add('is-leaving');
    setTimeout(() => root.remove(), 450);
    onDone?.();
  }

  function show(i) {
    index = Math.max(0, Math.min(slides.length - 1, i));
    const sl = slides[index];
    bg.style.background = BG[index % BG.length];
    [...bars.children].forEach((b, k) => {
      b.classList.toggle('done', k < index);
      b.classList.toggle('active', k === index);
      b.firstChild.style.animationDuration = `${DURATION}ms`;
    });
    const numberEl = sl.number !== undefined ? h('div', { class: 'story-number', style: sl.accent ? { color: sl.accent } : null }, '0') : null;
    const slide = h(
      'div',
      { class: 'story-slide' },
      h('div', { class: 'story-kicker' }, sl.kicker),
      numberEl,
      sl.big ? h('div', { class: 'story-number', style: sl.accent ? { color: sl.accent } : null }, sl.big) : null,
      h('div', { class: 'story-title' }, sl.title, sl.serif ? h('span', { class: 'serif grad' }, ` ${sl.serif}`) : null),
      sl.text ? h('p', { class: 'story-text' }, sl.text) : null,
      sl.final
        ? h(
            'div',
            { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' } },
            h('button', { class: 'btn btn--primary btn--lg', type: 'button', onClick: (e) => { e.stopPropagation(); finish(); } }, tl('Open my dashboard'), icon('arrow')),
            videoSupported() ? videoButton() : null,
          )
        : null,
    );
    stage.replaceChildren(slide);
    if (numberEl) countUp(numberEl, sl.number, sl.suffix || '');
    clearTimeout(timer);
    if (!sl.final && !paused) timer = setTimeout(() => show(index + 1), DURATION);
  }

  function videoButton() {
    const btn = h('button', { class: 'btn btn--ghost btn--lg', type: 'button', style: { background: 'rgba(0,0,0,.35)' } }, icon('film'), tl('Save as story video'));
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      btn.disabled = true;
      try {
        const blob = await recordStory(slides, { site: location.host, onProgress: (p) => (btn.textContent = tl('Rendering… {v0}%', { v0: Math.round(p * 100) })) });
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `my-unwrapped-story.${ext}`, { type: blob.type });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: tl('My socials, unwrapped') });
          } catch {
            /* cancelled */
          }
        } else downloadBlob(blob, file.name);
        btn.textContent = tl('Saved ✓');
      } catch (err) {
        console.error(err);
        btn.textContent = tl('Video not supported here');
      }
    });
    return btn;
  }

  function onKey(e) {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      index === slides.length - 1 ? finish() : show(index + 1);
    } else if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'Escape') finish();
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    const left = e.clientX < window.innerWidth * 0.3;
    if (left) show(index - 1);
    else if (index === slides.length - 1) finish();
    else show(index + 1);
  });
  root.addEventListener('pointerdown', () => {
    paused = true;
    root.classList.add('is-paused');
    clearTimeout(timer);
  });
  root.addEventListener('pointerup', () => {
    paused = false;
    root.classList.remove('is-paused');
    if (!slides[index].final) timer = setTimeout(() => show(index + 1), DURATION / 2);
  });
  skip.addEventListener('click', finish);
  document.addEventListener('keydown', onKey);
  document.body.append(root);
  show(0);
  skip.focus();
}
