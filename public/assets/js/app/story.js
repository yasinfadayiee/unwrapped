// Cinematic "unwrapping" story shown right after analysis: full-screen slides
// with animated numbers, tap/arrow navigation and auto-advance.

import { h, icon } from '../lib/ui.js';
import { fmtInt, compact, hourLabel, duration, pct } from '../lib/format.js';
import { relationships, watchStats, tweetStats, exposureScore, friendshipRadar, diffSnapshots } from '../core/insights.js';
import { privacyParts } from './wrapped.js';

const BG = [
  'radial-gradient(80% 70% at 20% 20%, #5a43d6 0%, transparent 60%), radial-gradient(70% 60% at 90% 90%, #1a9e8e 0%, transparent 60%), #07070b',
  'radial-gradient(80% 70% at 80% 10%, #e0574a 0%, transparent 55%), radial-gradient(60% 60% at 10% 90%, #8f7dff 0%, transparent 60%), #0b0710',
  'radial-gradient(90% 80% at 50% 0%, #b9f227 0%, transparent 50%), radial-gradient(60% 60% at 90% 100%, #1a9e8e 0%, transparent 60%), #060a06',
  'radial-gradient(80% 80% at 0% 100%, #b8820f 0%, transparent 55%), radial-gradient(70% 60% at 100% 0%, #8f7dff 0%, transparent 60%), #0a0806',
  'radial-gradient(90% 70% at 50% 100%, #8f7dff 0%, transparent 55%), radial-gradient(50% 50% at 80% 10%, #e0574a 0%, transparent 60%), #07070b',
];

function slidesFor(datasets) {
  const slides = [{ kicker: 'Ready?', title: 'Your socials,', serif: 'unwrapped.', text: `We decoded ${datasets.map((d) => d.label).join(', ')} — right here on your device.` }];
  let relDone = false;
  let worstPrivacy = null;
  for (const ds of datasets) {
    if (['instagram', 'tiktok', 'threads', 'x'].includes(ds.platform) && ds.hasRelationships && relDone) {
      const rel = relationships(ds);
      slides.push({ kicker: `${ds.label} · your people`, number: rel.notFollowingBack.length, title: `don’t follow you back on ${ds.label}`, text: `${fmtInt(rel.followers)} followers, ${pct(rel.followBackRate)} follow-back rate.`, accent: 'var(--c2)' });
    } else if (['instagram', 'tiktok', 'threads', 'x'].includes(ds.platform) && ds.hasRelationships) {
      relDone = true;
      const rel = relationships(ds);
      slides.push({ kicker: `${ds.label} · your people`, number: rel.followers, title: 'people follow you', text: `And you follow ${fmtInt(rel.following)}. ${pct(rel.followBackRate)} of them follow you back.` });
      if (rel.notFollowingBack.length) slides.push({ kicker: `${ds.label} · the truth`, number: rel.notFollowingBack.length, title: 'don’t follow you back', text: 'Don’t worry — we made you a list. And a safe way to clean it up.', accent: 'var(--c2)' });
      const snaps = ds._snapshots || [];
      if (snaps.length >= 2) {
        const d = diffSnapshots(snaps[snaps.length - 2], snaps[snaps.length - 1]);
        slides.push({ kicker: `${ds.label} · since last time`, number: d.unfollowedYou.length, title: d.unfollowedYou.length === 1 ? 'person unfollowed you' : 'people unfollowed you', text: `But ${fmtInt(d.newFollowers.length)} new ones followed. Want to see who?`, accent: 'var(--c2)' });
      }
    }
    if (ds.platform === 'instagram') {
      const radar = friendshipRadar(ds.activity?.messages);
      if (radar) {
        slides.push({ kicker: 'Instagram · your DMs', number: ds.activity.messages.total, title: 'messages, sent and received', text: `Your inner circle has ${radar.innerCircle.length} people. ${fmtInt(radar.fading.length + radar.quiet.length)} friendships are quietly fading…` });
      }
    }
    if (ds.platform === 'tiktok' && ds.watch.length) {
      const w = watchStats(ds.watch);
      slides.push({ kicker: 'TikTok · screen time', number: Math.round(w.hours), suffix: 'h', title: 'of scrolling', text: `${fmtInt(w.videos)} videos. That’s ${Math.round(w.perDayMinutes)} minutes every single day.`, accent: 'var(--signal)' });
      slides.push({ kicker: 'TikTok · your longest binge', big: duration(w.longest.ms), title: 'in one sitting', text: `${fmtInt(w.longest.count)} videos without stopping. You’re a ${w.persona.title} — peak hour ${hourLabel(w.peakHour)}.` });
    }
    if (ds.platform === 'x' && ds.tweets.length) {
      const st = tweetStats(ds.tweets);
      slides.push({ kicker: 'X · everything you posted', number: st.total, title: 'posts, replies & reposts', text: `They earned you ${compact(st.likesEarned)} likes. Your best one got ${fmtInt(st.best[0]?.likes || 0)}.` });
    }
    const parts = privacyParts(ds);
    if (parts && (parts.advertisers || parts.interests)) {
      const ex = exposureScore(parts);
      if (!worstPrivacy || ex.score > worstPrivacy.ex.score) worstPrivacy = { ds, parts, ex };
    }
  }
  if (worstPrivacy) {
    const { ds, parts, ex } = worstPrivacy;
    slides.push({ kicker: `${ds.label} · privacy`, big: ex.grade, title: 'your privacy grade', text: `${fmtInt(parts.advertisers)} advertisers have your data. ${fmtInt(parts.interests)} interests were profiled about you.`, accent: ex.score > 60 ? 'var(--c2)' : 'var(--signal)' });
  }
  slides.push({ kicker: 'That’s the trailer', title: 'Now explore', serif: 'everything.', text: 'Every list, every chart, every card — waiting in your dashboard.', final: true });
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
  const skip = h('button', { class: 'story-skip', type: 'button' }, 'Skip', icon('arrow'));
  const root = h('div', { class: 'story', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your results story' }, h('div', { class: 'story-bg' }), bars, skip, stage, h('div', { class: 'story-hint' }, 'Tap to continue'));
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
      sl.final ? h('button', { class: 'btn btn--primary btn--lg', type: 'button', onClick: (e) => { e.stopPropagation(); finish(); } }, 'Open my dashboard', icon('arrow')) : null,
    );
    stage.replaceChildren(slide);
    if (numberEl) countUp(numberEl, sl.number, sl.suffix || '');
    clearTimeout(timer);
    if (!sl.final && !paused) timer = setTimeout(() => show(index + 1), DURATION);
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
