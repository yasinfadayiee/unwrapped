// Which tier unlocks which tool. Mirrors TIERS in src/config.js — a higher
// tier includes everything below it.

export const TIER_RANK = { free: 0, plus: 1, pro: 2, creator: 3 };
export const TIER_NAME = { free: 'Free', plus: 'Plus', pro: 'Pro', creator: 'Creator' };

// Keys are the `reason` strings passed to ctx.upgrade() and ctx.can().
const FEATURE_TIER = {
  queue: 'pro',
  friends: 'pro',
  ghost: 'pro',
  audit: 'pro',
  growth: 'pro',
  audience: 'creator',
  besttime: 'creator',
  report: 'creator',
};

export const tierFor = (feature) => FEATURE_TIER[feature] || 'plus';
export const atLeast = (tier, needed) => (TIER_RANK[tier] || 0) >= (TIER_RANK[needed] || 0);
