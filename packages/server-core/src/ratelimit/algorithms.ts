/**
 * Pure rate-limit algorithms. State in, state out — no clocks, no storage.
 *
 *  - token_bucket:   burst up to `limit`, then refills continuously at limit/windowSec.
 *                    Good for interactive actions (assistant, search).
 *  - sliding_window: weighted count over the previous + current fixed window.
 *                    Strict, no burst beyond `limit` — good for security-sensitive actions.
 */

export type RateLimitAlgorithm = 'token_bucket' | 'sliding_window';

export interface RateLimitRule {
  /** Max requests per window. */
  limit: number;
  windowSec: number;
  algorithm?: RateLimitAlgorithm;
  /** Token bucket only: bucket capacity when different from `limit`. */
  burst?: number;
}

export interface TokenBucketState {
  kind: 'token_bucket';
  tokens: number;
  updatedAt: number;
}

export interface SlidingWindowState {
  kind: 'sliding_window';
  windowStart: number;
  count: number;
  prevCount: number;
}

export type RateLimitState = TokenBucketState | SlidingWindowState;

export interface RuleOutcome {
  allowed: boolean;
  remaining: number;
  /** Seconds until `cost` more units are available. 0 when allowed. */
  retryAfterSec: number;
  /** When the rule is fully reset (bucket full / window rolled over). */
  resetAtMs: number;
}

export interface RuleEvaluation<S extends RateLimitState = RateLimitState> {
  state: S;
  outcome: RuleOutcome;
}

function assertRule(rule: RateLimitRule, cost: number): void {
  if (!(rule.limit > 0) || !(rule.windowSec > 0)) throw new Error('Geçersiz rate limit kuralı');
  if (!(cost > 0)) throw new Error('Geçersiz rate limit maliyeti');
}

export function consumeTokenBucket(
  state: TokenBucketState | null,
  rule: RateLimitRule,
  nowMs: number,
  cost = 1,
): RuleEvaluation<TokenBucketState> {
  assertRule(rule, cost);
  const capacity = Math.max(rule.burst ?? rule.limit, 1);
  const refillPerMs = rule.limit / (rule.windowSec * 1000);
  let tokens = capacity;
  if (state) {
    const elapsed = Math.max(0, nowMs - state.updatedAt);
    tokens = Math.min(capacity, state.tokens + elapsed * refillPerMs);
  }
  const allowed = tokens >= cost;
  if (allowed) tokens -= cost;
  const deficit = allowed ? 0 : cost - tokens;
  const retryAfterSec = allowed ? 0 : Math.max(1, Math.ceil(deficit / refillPerMs / 1000));
  const resetAtMs = nowMs + Math.ceil((capacity - tokens) / refillPerMs);
  return {
    state: { kind: 'token_bucket', tokens, updatedAt: nowMs },
    outcome: { allowed, remaining: Math.floor(tokens), retryAfterSec, resetAtMs },
  };
}

export function consumeSlidingWindow(
  state: SlidingWindowState | null,
  rule: RateLimitRule,
  nowMs: number,
  cost = 1,
): RuleEvaluation<SlidingWindowState> {
  assertRule(rule, cost);
  const windowMs = rule.windowSec * 1000;
  const windowStart = Math.floor(nowMs / windowMs) * windowMs;
  let count = 0;
  let prevCount = 0;
  if (state) {
    if (state.windowStart === windowStart) {
      count = state.count;
      prevCount = state.prevCount;
    } else if (state.windowStart === windowStart - windowMs) {
      prevCount = state.count;
    }
  }
  const elapsedFraction = (nowMs - windowStart) / windowMs;
  const weighted = prevCount * (1 - elapsedFraction) + count;
  const allowed = weighted + cost <= rule.limit;
  if (allowed) count += cost;
  const remaining = Math.max(0, Math.floor(rule.limit - weighted - (allowed ? cost : 0)));
  const windowEndMs = windowStart + windowMs;

  let retryAfterSec = 0;
  if (!allowed) {
    const excess = weighted + cost - rule.limit;
    // The weighted count only falls as the previous window fades out; otherwise wait for rollover.
    const fadeMs = prevCount > 0 ? (excess / prevCount) * windowMs : Number.POSITIVE_INFINITY;
    const waitMs = Math.min(fadeMs, windowEndMs - nowMs);
    retryAfterSec = Math.max(1, Math.ceil(waitMs / 1000));
  }

  return {
    state: { kind: 'sliding_window', windowStart, count, prevCount },
    outcome: { allowed, remaining, retryAfterSec, resetAtMs: windowEndMs },
  };
}

export function evaluateRule(
  state: RateLimitState | null,
  rule: RateLimitRule,
  nowMs: number,
  cost = 1,
): RuleEvaluation {
  const algorithm = rule.algorithm ?? 'token_bucket';
  if (algorithm === 'sliding_window') {
    const prior = state?.kind === 'sliding_window' ? state : null;
    return consumeSlidingWindow(prior, rule, nowMs, cost);
  }
  const prior = state?.kind === 'token_bucket' ? state : null;
  return consumeTokenBucket(prior, rule, nowMs, cost);
}

export function parseRateLimitState(raw: string | null): RateLimitState | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    record.kind === 'token_bucket' &&
    typeof record.tokens === 'number' &&
    typeof record.updatedAt === 'number'
  ) {
    return { kind: 'token_bucket', tokens: record.tokens, updatedAt: record.updatedAt };
  }
  if (
    record.kind === 'sliding_window' &&
    typeof record.windowStart === 'number' &&
    typeof record.count === 'number' &&
    typeof record.prevCount === 'number'
  ) {
    return {
      kind: 'sliding_window',
      windowStart: record.windowStart,
      count: record.count,
      prevCount: record.prevCount,
    };
  }
  return null;
}
