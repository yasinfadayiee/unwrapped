// Central business configuration. Prices live here only — the website reads
// them from /api/config, so changing a number here changes it everywhere.

// Tiers, cheapest first. Each tier includes everything in the tiers below it.
// `features` lists only what the tier adds; the client mirrors the feature →
// tier mapping in public/assets/js/lib/tiers.js.
export const TIERS = [
  {
    id: 'plus',
    rank: 1,
    name: 'Plus',
    tagline: 'See the full picture',
    bestFor: 'A complete clean-up of your own account',
    features: [
      'Full lists on every platform — no 20-row limit',
      'The names of everyone who unfollowed you',
      'Full WhatsApp & Telegram chat stats for every person',
      'Spotify: your top 50 and a Wrapped for every year',
      'Search and CSV export of any list',
      'Search every chat and save conversations',
      'Deep insights for TikTok, X, Facebook & LinkedIn',
      'Every Wrapped theme, no watermark, story video',
    ],
  },
  {
    id: 'pro',
    rank: 2,
    name: 'Pro',
    tagline: 'The tools nobody else has',
    bestFor: 'Understanding your relationships, not just counting them',
    features: [
      'Ghost Detector — who leaves you on read, reply times, who texts first',
      'Engagement Audit — accounts you support that ignore you, dead follows',
      'Growth Time Machine — follower history, churn, follow-back speed',
      'Friendship Radar — fading, rising and one-sided friendships',
      'Unfollow queue with safe daily pacing',
    ],
  },
  {
    id: 'creator',
    rank: 3,
    name: 'Creator',
    tagline: 'Grow like a professional',
    bestFor: 'Creators, brands and social media managers',
    features: [
      'Audience Quality — bot & spam follower detector with a score',
      'Best Time to Post — from real engagement and audience activity',
      'White-label PDF report with your own brand, for clients or sponsors',
      'Priority support',
    ],
  },
];

export const PLANS = [
  { id: 'plus-month', tier: 'plus', cycle: 'month', name: 'Plus · 30 days', short: 'Monthly', priceUsd: 5, days: 30 },
  { id: 'plus-year', tier: 'plus', cycle: 'year', name: 'Plus · 12 months', short: 'Yearly', priceUsd: 29, days: 365 },
  { id: 'pro-month', tier: 'pro', cycle: 'month', name: 'Pro · 30 days', short: 'Monthly', priceUsd: 9, days: 30 },
  { id: 'pro-year', tier: 'pro', cycle: 'year', name: 'Pro · 12 months', short: 'Yearly', priceUsd: 49, days: 365, badge: 'Most popular' },
  { id: 'pro-life', tier: 'pro', cycle: 'life', name: 'Pro · Lifetime', short: 'Lifetime', priceUsd: 99, days: null, badge: 'Pay once' },
  { id: 'creator-month', tier: 'creator', cycle: 'month', name: 'Creator · 30 days', short: 'Monthly', priceUsd: 19, days: 30 },
  { id: 'creator-year', tier: 'creator', cycle: 'year', name: 'Creator · 12 months', short: 'Yearly', priceUsd: 119, days: 365 },
];

// Plan ids from before the tiers existed. Licenses that carry them keep
// working as Pro, and old links buy today's Pro plans.
const LEGACY_PLANS = { month: 'pro-month', year: 'pro-year', life: 'pro-life' };

export const SETTINGS = {
  // How long a checkout stays open before it expires.
  orderTtlMinutes: 60,
  // A TRON payment that arrives this long after expiry is still accepted.
  tronGraceMinutes: 180,
  // Exchanges often deduct their withdrawal fee from the amount sent.
  // Transfers that are short by up to this many USDT still count as paid…
  tronToleranceUsdt: 1.5,
  // …but never by more than this share of the price (protects cheap plans).
  tronToleranceShare: 0.15,
  // Transfers below this are ignored (dust / address-poisoning spam).
  tronDustUsdt: 0.5,
  // NOWPayments "partially_paid" is accepted when at least this share arrived.
  partialAcceptRatio: 0.97,
  // Signed license tokens are refreshed by the browser before this runs out.
  tokenTtlDays: 7,
  // Free users see this many rows of every locked list.
  freeListLimit: 20,
  // Anti-abuse limits per visitor (IP hash) per hour.
  maxCheckoutsPerHour: 8,
  maxClaimsPerHour: 12,
  maxActivationsPerHour: 40,
  licensePrefix: 'UNW',
  // Referral program: the friend gets a discount, the inviter gets free days.
  referralDiscount: 0.1,
  referralRewardDays: 30,
};

export function getPlan(id) {
  const key = LEGACY_PLANS[id] || id;
  return PLANS.find((p) => p.id === key) || null;
}

export function tierOf(planId) {
  return getPlan(planId)?.tier || 'free';
}

export function tierRank(tier) {
  return TIERS.find((t) => t.id === tier)?.rank || 0;
}

// What one day of a tier is worth, taken from its yearly price. Used to turn
// the time left on a license into fair time on another tier when upgrading.
export function dailyValue(tier) {
  const yearly = PLANS.find((p) => p.tier === tier && p.cycle === 'year');
  return yearly ? yearly.priceUsd / yearly.days : 0;
}

export function siteUrl(env, request) {
  const configured = (env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (request) return new URL(request.url).origin;
  return '';
}

export function brand(env) {
  return (env.BRAND || 'Unwrapped').trim();
}
