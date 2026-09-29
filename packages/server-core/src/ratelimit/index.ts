/**
 * ratelimit — token-bucket / sliding-window limiter over an injected KV store,
 * with typed per-action policies and an AppError('rate_limited') helper.
 */
export type { MemoryRateLimitStore, RateLimitStore } from './store.ts';
export { createMemoryRateLimitStore } from './store.ts';
export type {
  RateLimitAlgorithm,
  RateLimitRule,
  RateLimitState,
  RuleEvaluation,
  RuleOutcome,
  SlidingWindowState,
  TokenBucketState,
} from './algorithms.ts';
export {
  consumeSlidingWindow,
  consumeTokenBucket,
  evaluateRule,
  parseRateLimitState,
} from './algorithms.ts';
export type { RateLimitAction, RateLimitPolicies } from './policies.ts';
export {
  DEFAULT_RATE_LIMIT_POLICIES,
  RATE_LIMIT_ACTIONS,
  isRateLimitAction,
  resolveRateLimitPolicies,
} from './policies.ts';
export type {
  RateLimitCheckOptions,
  RateLimitResult,
  RateLimiter,
  RateLimiterConfig,
} from './limiter.ts';
export {
  assertRateLimit,
  createRateLimiter,
  rateLimitHeaders,
  rateLimitKey,
  rateLimitMessage,
  rateLimitedError,
} from './limiter.ts';
