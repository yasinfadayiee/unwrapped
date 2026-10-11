// Central business configuration. Prices live here only — the website reads
// them from /api/config, so changing a number here changes it everywhere.

export const PLANS = [
  {
    id: 'month',
    name: 'Pro · 30 days',
    short: 'Monthly',
    priceUsd: 7,
    days: 30,
    blurb: 'Perfect for a quick clean-up.',
  },
  {
    id: 'year',
    name: 'Pro · 12 months',
    short: 'Yearly',
    priceUsd: 29,
    days: 365,
    badge: 'Most popular',
    blurb: 'Track who unfollows you all year.',
  },
  {
    id: 'life',
    name: 'Pro · Lifetime',
    short: 'Lifetime',
    priceUsd: 59,
    days: null,
    badge: 'Pay once',
    blurb: 'Every tool, every future update.',
  },
];

export const SETTINGS = {
  // How long a checkout stays open before it expires.
  orderTtlMinutes: 60,
  // A TRON payment that arrives this long after expiry is still accepted.
  tronGraceMinutes: 180,
  // Exchanges often deduct their withdrawal fee from the amount sent.
  // Transfers that are short by up to this many USDT still count as paid.
  tronToleranceUsdt: 1.5,
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
  return PLANS.find((p) => p.id === id) || null;
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
