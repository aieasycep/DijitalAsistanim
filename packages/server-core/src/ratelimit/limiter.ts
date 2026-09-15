/** Rate limiter over an injected store; evaluates every rule of a policy and commits atomically-ish. */
import type { Locale } from '@da/domain';
import { AppError } from '../errors';
import { evaluateRule, parseRateLimitState, type RateLimitRule } from './algorithms';
import { resolveRateLimitPolicies, type RateLimitAction, type RateLimitPolicies } from './policies';
import type { RateLimitStore } from './store';

export interface RateLimitResult {
  action: RateLimitAction;
  allowed: boolean;
  /** Smallest remaining budget across the policy's rules. */
  remaining: number;
  /** Seconds to wait before retrying; 0 when allowed. */
  retryAfterSec: number;
  /** The rule that limited (or is closest to limiting) the request. */
  limit: number;
  windowSec: number;
  resetAt: string;
}

export interface RateLimitCheckOptions {
  /** Units consumed by this request (default 1). */
  cost?: number;
  /** Injected clock for tests. */
  now?: Date | number;
}

export interface RateLimiterConfig {
  store: RateLimitStore;
  policies?: Partial<RateLimitPolicies>;
  /** Key namespace, e.g. an environment name. */
  keyPrefix?: string;
  locale?: Locale;
  now?: () => number;
}

export interface RateLimiter {
  /** Consume `cost` units when allowed; never throws for a denied request. */
  check(
    action: RateLimitAction,
    subject: string,
    opts?: RateLimitCheckOptions,
  ): Promise<RateLimitResult>;
  /** Like `check` but throws AppError('rate_limited') when denied. */
  enforce(
    action: RateLimitAction,
    subject: string,
    opts?: RateLimitCheckOptions,
  ): Promise<RateLimitResult>;
  /** Read-only view: same result shape without consuming anything. */
  peek(
    action: RateLimitAction,
    subject: string,
    opts?: RateLimitCheckOptions,
  ): Promise<RateLimitResult>;
}

export function rateLimitKey(
  prefix: string,
  action: RateLimitAction,
  subject: string,
  rule: RateLimitRule,
): string {
  return `${prefix}:${action}:${subject}:${rule.windowSec}`;
}

function waitLabel(seconds: number, locale: Locale): string {
  if (seconds >= 3600) {
    const hours = Math.ceil(seconds / 3600);
    return locale === 'tr' ? `${hours} saat` : `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return locale === 'tr' ? `${minutes} dakika` : `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  return locale === 'tr' ? `${seconds} saniye` : `${seconds} second${seconds === 1 ? '' : 's'}`;
}

export function rateLimitMessage(retryAfterSec: number, locale: Locale = 'tr'): string {
  const wait = waitLabel(Math.max(1, retryAfterSec), locale);
  return locale === 'tr'
    ? `Biraz hızlı gittik. ${wait} sonra tekrar deneyebilirsin.`
    : `That was a bit fast. You can try again in ${wait}.`;
}

/** Build the API error for a denied result (or a bare retry-after value). */
export function rateLimitedError(
  denied: Pick<RateLimitResult, 'retryAfterSec'> &
    Partial<Pick<RateLimitResult, 'action' | 'limit' | 'windowSec'>>,
  locale: Locale = 'tr',
): AppError {
  const retryAfterSec = Math.max(1, Math.ceil(denied.retryAfterSec));
  return new AppError('rate_limited', rateLimitMessage(retryAfterSec, locale), {
    retryAfterSec,
    details: {
      ...(denied.action ? { action: denied.action } : {}),
      ...(denied.limit !== undefined ? { limit: denied.limit } : {}),
      ...(denied.windowSec !== undefined ? { windowSec: denied.windowSec } : {}),
    },
  });
}

export function assertRateLimit(result: RateLimitResult, locale: Locale = 'tr'): void {
  if (!result.allowed) throw rateLimitedError(result, locale);
}

/** Standard response headers for a result. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(Math.max(0, result.remaining)),
    'X-RateLimit-Reset': String(Math.ceil(Date.parse(result.resetAt) / 1000)),
  };
  if (!result.allowed) headers['Retry-After'] = String(Math.max(1, result.retryAfterSec));
  return headers;
}

function toMs(now: Date | number | undefined, fallback: () => number): number {
  if (now === undefined) return fallback();
  return typeof now === 'number' ? now : now.getTime();
}

export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const policies = resolveRateLimitPolicies(config.policies);
  const prefix = config.keyPrefix ?? 'rl';
  const clock = config.now ?? (() => Date.now());
  const locale = config.locale ?? 'tr';

  const evaluate = async (
    action: RateLimitAction,
    subject: string,
    opts: RateLimitCheckOptions,
    commit: boolean,
  ): Promise<RateLimitResult> => {
    if (!subject) throw new AppError('validation', 'Rate limit öznesi boş olamaz.');
    const rules = policies[action];
    const nowMs = toMs(opts.now, clock);
    const cost = opts.cost ?? 1;

    const evaluations = await Promise.all(
      rules.map(async (rule) => {
        const key = rateLimitKey(prefix, action, subject, rule);
        const prior = parseRateLimitState(await config.store.get(key));
        return { rule, key, ...evaluateRule(prior, rule, nowMs, cost) };
      }),
    );

    const allowed = evaluations.every((e) => e.outcome.allowed);
    if (allowed && commit) {
      await Promise.all(
        evaluations.map((e) =>
          config.store.set(e.key, JSON.stringify(e.state), Math.max(1, e.rule.windowSec)),
        ),
      );
    }

    // Report the binding rule: a denied one with the longest wait, else the one with least headroom.
    const denied = evaluations.filter((e) => !e.outcome.allowed);
    const binding = denied.length
      ? denied.reduce((a, b) => (b.outcome.retryAfterSec > a.outcome.retryAfterSec ? b : a))
      : evaluations.reduce((a, b) => (b.outcome.remaining < a.outcome.remaining ? b : a));

    return {
      action,
      allowed,
      remaining: Math.min(...evaluations.map((e) => e.outcome.remaining)),
      retryAfterSec: allowed ? 0 : binding.outcome.retryAfterSec,
      limit: binding.rule.limit,
      windowSec: binding.rule.windowSec,
      resetAt: new Date(binding.outcome.resetAtMs).toISOString(),
    };
  };

  return {
    check: (action, subject, opts = {}) => evaluate(action, subject, opts, true),
    peek: (action, subject, opts = {}) => evaluate(action, subject, opts, false),
    enforce: async (action, subject, opts = {}) => {
      const result = await evaluate(action, subject, opts, true);
      assertRateLimit(result, locale);
      return result;
    },
  };
}
