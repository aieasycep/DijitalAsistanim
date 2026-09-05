/**
 * Typed limit policies per user action. Abuse protection only — plan quotas
 * (free: 10 assistant queries/day) are enforced separately by the entitlement resolver.
 */
import type { RateLimitRule } from './algorithms';

export const RATE_LIMIT_ACTIONS = [
  'assistant_query',
  'capture_upload',
  'oauth_start',
  'referral_redeem',
  'ai_call',
  'sync_trigger',
  'search',
] as const;
export type RateLimitAction = (typeof RATE_LIMIT_ACTIONS)[number];

export type RateLimitPolicies = Record<RateLimitAction, RateLimitRule[]>;

const MINUTE = 60;
const DAY = 24 * 60 * 60;

export const DEFAULT_RATE_LIMIT_POLICIES: RateLimitPolicies = {
  assistant_query: [
    { limit: 20, windowSec: MINUTE, algorithm: 'token_bucket' },
    { limit: 500, windowSec: DAY, algorithm: 'token_bucket' },
  ],
  capture_upload: [
    { limit: 10, windowSec: MINUTE, algorithm: 'token_bucket' },
    { limit: 200, windowSec: DAY, algorithm: 'token_bucket' },
  ],
  oauth_start: [
    { limit: 5, windowSec: MINUTE, algorithm: 'sliding_window' },
    { limit: 30, windowSec: DAY, algorithm: 'sliding_window' },
  ],
  referral_redeem: [
    { limit: 3, windowSec: MINUTE, algorithm: 'sliding_window' },
    { limit: 10, windowSec: DAY, algorithm: 'sliding_window' },
  ],
  ai_call: [
    { limit: 60, windowSec: MINUTE, algorithm: 'token_bucket' },
    { limit: 3000, windowSec: DAY, algorithm: 'token_bucket' },
  ],
  sync_trigger: [
    { limit: 4, windowSec: MINUTE, algorithm: 'sliding_window' },
    { limit: 120, windowSec: DAY, algorithm: 'sliding_window' },
  ],
  search: [
    { limit: 30, windowSec: MINUTE, algorithm: 'token_bucket' },
    { limit: 1000, windowSec: DAY, algorithm: 'token_bucket' },
  ],
};

export function isRateLimitAction(value: string): value is RateLimitAction {
  return (RATE_LIMIT_ACTIONS as readonly string[]).includes(value);
}

/** Merge per-action overrides (an override replaces the whole rule list for that action). */
export function resolveRateLimitPolicies(
  overrides: Partial<RateLimitPolicies> = {},
): RateLimitPolicies {
  const out = { ...DEFAULT_RATE_LIMIT_POLICIES };
  for (const action of RATE_LIMIT_ACTIONS) {
    const rules = overrides[action];
    if (rules && rules.length > 0) out[action] = rules;
  }
  return out;
}
