import { describe, expect, it } from 'vitest';
import { isAppError } from '../errors';
import {
  DEFAULT_RATE_LIMIT_POLICIES,
  RATE_LIMIT_ACTIONS,
  assertRateLimit,
  consumeSlidingWindow,
  consumeTokenBucket,
  createMemoryRateLimitStore,
  createRateLimiter,
  isRateLimitAction,
  parseRateLimitState,
  rateLimitHeaders,
  rateLimitMessage,
  rateLimitedError,
  resolveRateLimitPolicies,
} from './index';

// 2026-09-05 08:00 Europe/Istanbul (UTC+3)
const T0 = Date.parse('2026-09-05T05:00:00.000Z');

function clock(start = T0) {
  let now = start;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe('ratelimit/algorithms', () => {
  it('token bucket allows a burst up to the limit then refills', () => {
    const rule = { limit: 5, windowSec: 60 };
    let state = null as ReturnType<typeof consumeTokenBucket>['state'] | null;
    for (let i = 0; i < 5; i++) {
      const r = consumeTokenBucket(state, rule, T0);
      expect(r.outcome.allowed).toBe(true);
      expect(r.outcome.remaining).toBe(4 - i);
      state = r.state;
    }
    const denied = consumeTokenBucket(state, rule, T0);
    expect(denied.outcome.allowed).toBe(false);
    expect(denied.outcome.retryAfterSec).toBe(12); // 60s / 5 tokens
    expect(denied.outcome.remaining).toBe(0);

    const later = consumeTokenBucket(denied.state, rule, T0 + 12_000);
    expect(later.outcome.allowed).toBe(true);
    const full = consumeTokenBucket(later.state, rule, T0 + 10 * 60_000);
    expect(full.outcome.remaining).toBe(4);
  });
  it('token bucket honours cost and burst', () => {
    const rule = { limit: 10, windowSec: 60, burst: 3 };
    const r = consumeTokenBucket(null, rule, T0, 2);
    expect(r.outcome.allowed).toBe(true);
    expect(r.outcome.remaining).toBe(1);
    const denied = consumeTokenBucket(r.state, rule, T0, 2);
    expect(denied.outcome.allowed).toBe(false);
    expect(denied.outcome.retryAfterSec).toBe(6);
    expect(() => consumeTokenBucket(null, rule, T0, 0)).toThrow();
    expect(() => consumeTokenBucket(null, { limit: 0, windowSec: 60 }, T0)).toThrow();
  });
  it('sliding window weights the previous window', () => {
    const rule = { limit: 4, windowSec: 60 };
    const windowStart = Math.floor(T0 / 60_000) * 60_000;
    let state = null as ReturnType<typeof consumeSlidingWindow>['state'] | null;
    for (let i = 0; i < 4; i++) {
      const r = consumeSlidingWindow(state, rule, windowStart + 1000);
      expect(r.outcome.allowed).toBe(true);
      state = r.state;
    }
    const denied = consumeSlidingWindow(state, rule, windowStart + 2000);
    expect(denied.outcome.allowed).toBe(false);
    expect(denied.outcome.retryAfterSec).toBe(58);
    expect(denied.outcome.resetAtMs).toBe(windowStart + 60_000);

    // 15s into the next window: previous 4 × 0.75 = 3 weighted → one more allowed, then denied.
    const next = consumeSlidingWindow(denied.state, rule, windowStart + 75_000);
    expect(next.outcome.allowed).toBe(true);
    expect(next.state.prevCount).toBe(4);
    expect(next.state.count).toBe(1);
    const nextDenied = consumeSlidingWindow(next.state, rule, windowStart + 75_000);
    expect(nextDenied.outcome.allowed).toBe(false);
    expect(nextDenied.outcome.retryAfterSec).toBeGreaterThan(0);
    expect(nextDenied.outcome.retryAfterSec).toBeLessThanOrEqual(45);

    // Two windows later everything is forgotten.
    const fresh = consumeSlidingWindow(nextDenied.state, rule, windowStart + 200_000);
    expect(fresh.state.prevCount).toBe(0);
    expect(fresh.outcome.remaining).toBe(3);
  });
  it('parses stored state defensively', () => {
    expect(parseRateLimitState(null)).toBeNull();
    expect(parseRateLimitState('not json')).toBeNull();
    expect(parseRateLimitState('{"kind":"token_bucket","tokens":"x"}')).toBeNull();
    expect(parseRateLimitState('{"kind":"token_bucket","tokens":2,"updatedAt":5}')).toEqual({
      kind: 'token_bucket',
      tokens: 2,
      updatedAt: 5,
    });
    expect(
      parseRateLimitState('{"kind":"sliding_window","windowStart":1,"count":2,"prevCount":3}'),
    ).toEqual({
      kind: 'sliding_window',
      windowStart: 1,
      count: 2,
      prevCount: 3,
    });
  });
});

describe('ratelimit/policies', () => {
  it('has minute and day rules for every action', () => {
    for (const action of RATE_LIMIT_ACTIONS) {
      const rules = DEFAULT_RATE_LIMIT_POLICIES[action];
      expect(rules.map((r) => r.windowSec)).toEqual([60, 86_400]);
      expect(rules.every((r) => r.limit > 0)).toBe(true);
    }
    expect(isRateLimitAction('search')).toBe(true);
    expect(isRateLimitAction('nope')).toBe(false);
  });
  it('overrides replace a single action only', () => {
    const merged = resolveRateLimitPolicies({ search: [{ limit: 1, windowSec: 10 }] });
    expect(merged.search).toEqual([{ limit: 1, windowSec: 10 }]);
    expect(merged.assistant_query).toBe(DEFAULT_RATE_LIMIT_POLICIES.assistant_query);
    expect(resolveRateLimitPolicies({ search: [] }).search).toBe(
      DEFAULT_RATE_LIMIT_POLICIES.search,
    );
  });
});

describe('ratelimit/limiter', () => {
  it('allows up to the per-minute limit then denies with retryAfterSec', async () => {
    const c = clock();
    const limiter = createRateLimiter({
      store: createMemoryRateLimitStore({ now: c.now }),
      now: c.now,
    });
    for (let i = 0; i < 5; i++) {
      const r = await limiter.check('oauth_start', 'user-1');
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }
    const denied = await limiter.check('oauth_start', 'user-1');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
    expect(denied.limit).toBe(5);
    expect(denied.windowSec).toBe(60);
    expect(Date.parse(denied.resetAt)).toBeGreaterThan(c.now());

    // Another subject is independent.
    expect((await limiter.check('oauth_start', 'user-2')).allowed).toBe(true);

    c.advance(61_000);
    expect((await limiter.check('oauth_start', 'user-1')).allowed).toBe(true);
  });
  it('does not consume from any rule when one rule denies', async () => {
    const c = clock();
    const store = createMemoryRateLimitStore({ now: c.now });
    const limiter = createRateLimiter({
      store,
      now: c.now,
      policies: {
        search: [
          { limit: 10, windowSec: 60 },
          { limit: 2, windowSec: 86_400 },
        ],
      },
    });
    expect((await limiter.check('search', 'u')).allowed).toBe(true);
    expect((await limiter.check('search', 'u')).allowed).toBe(true);
    const denied = await limiter.check('search', 'u');
    expect(denied.allowed).toBe(false);
    expect(denied.limit).toBe(2);
    expect(denied.windowSec).toBe(86_400);
    // Per-minute bucket must still hold 8 (not 7): the denied request did not consume it.
    const peek = await limiter.peek('search', 'u');
    expect(peek.allowed).toBe(false);
    const minuteState = await store.get('rl:search:u:60');
    expect(parseRateLimitState(minuteState)).toMatchObject({ tokens: 8 });
  });
  it('peek never consumes', async () => {
    const c = clock();
    const limiter = createRateLimiter({
      store: createMemoryRateLimitStore({ now: c.now }),
      now: c.now,
    });
    const a = await limiter.peek('search', 'u');
    const b = await limiter.peek('search', 'u');
    expect(a.remaining).toBe(b.remaining);
    expect(a.remaining).toBe(29);
  });
  it('supports cost and injected now per call', async () => {
    const store = createMemoryRateLimitStore({ now: () => T0 });
    const limiter = createRateLimiter({
      store,
      policies: { capture_upload: [{ limit: 4, windowSec: 60 }] },
    });
    const r = await limiter.check('capture_upload', 'u', { cost: 3, now: new Date(T0) });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(1);
    expect((await limiter.check('capture_upload', 'u', { cost: 2, now: T0 })).allowed).toBe(false);
    expect(
      (await limiter.check('capture_upload', 'u', { cost: 2, now: T0 + 30_000 })).allowed,
    ).toBe(true);
  });
  it('enforce throws a Turkish rate_limited AppError with retryAfterSec', async () => {
    const c = clock();
    const limiter = createRateLimiter({
      store: createMemoryRateLimitStore({ now: c.now }),
      now: c.now,
      policies: { referral_redeem: [{ limit: 1, windowSec: 60, algorithm: 'sliding_window' }] },
    });
    await limiter.enforce('referral_redeem', 'u');
    const err = await limiter.enforce('referral_redeem', 'u').catch((e: unknown) => e);
    expect(isAppError(err)).toBe(true);
    if (!isAppError(err)) return;
    expect(err.code).toBe('rate_limited');
    expect(err.status).toBe(429);
    expect(err.retryAfterSec).toBeGreaterThan(0);
    expect(err.retryAfterSec).toBe(60);
    expect(err.message).toBe('Biraz hızlı gittik. 1 dakika sonra tekrar deneyebilirsin.');
    expect(err.details).toMatchObject({ action: 'referral_redeem', limit: 1, windowSec: 60 });
    expect(err.toApiError().retryAfterSec).toBe(err.retryAfterSec);
  });
  it('produces English messages and human wait labels', () => {
    expect(rateLimitMessage(5, 'en')).toBe('That was a bit fast. You can try again in 5 seconds.');
    expect(rateLimitMessage(1, 'en')).toBe('That was a bit fast. You can try again in 1 second.');
    expect(rateLimitMessage(90, 'tr')).toBe(
      'Biraz hızlı gittik. 2 dakika sonra tekrar deneyebilirsin.',
    );
    expect(rateLimitMessage(7200, 'tr')).toBe(
      'Biraz hızlı gittik. 2 saat sonra tekrar deneyebilirsin.',
    );
    const err = rateLimitedError({ retryAfterSec: 0.2 }, 'en');
    expect(err.retryAfterSec).toBe(1);
    expect(err.details).toEqual({});
  });
  it('assertRateLimit passes allowed results and builds headers', () => {
    const allowed = {
      action: 'search' as const,
      allowed: true,
      remaining: 3,
      retryAfterSec: 0,
      limit: 30,
      windowSec: 60,
      resetAt: new Date(T0 + 60_000).toISOString(),
    };
    expect(() => assertRateLimit(allowed)).not.toThrow();
    expect(rateLimitHeaders(allowed)).toEqual({
      'X-RateLimit-Limit': '30',
      'X-RateLimit-Remaining': '3',
      'X-RateLimit-Reset': String(Math.ceil((T0 + 60_000) / 1000)),
    });
    const denied = { ...allowed, allowed: false, remaining: 0, retryAfterSec: 12 };
    expect(() => assertRateLimit(denied, 'en')).toThrow(/try again/);
    expect(rateLimitHeaders(denied)['Retry-After']).toBe('12');
  });
  it('rejects an empty subject and tolerates corrupt store values', async () => {
    const store = createMemoryRateLimitStore();
    const limiter = createRateLimiter({ store, keyPrefix: 'test' });
    await expect(limiter.check('search', '')).rejects.toMatchObject({ code: 'validation' });
    await store.set('test:search:u:60', '{broken', 60);
    const r = await limiter.check('search', 'u');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(29);
  });
});

describe('ratelimit/memory store', () => {
  it('expires entries by ttl', async () => {
    const c = clock();
    const store = createMemoryRateLimitStore({ now: c.now });
    await store.set('k', 'v', 10);
    expect(await store.get('k')).toBe('v');
    c.advance(9_999);
    expect(await store.get('k')).toBe('v');
    c.advance(1);
    expect(await store.get('k')).toBeNull();
    await store.set('a', '1', 5);
    expect(store.size()).toBe(1);
    await store.delete('a');
    expect(store.size()).toBe(0);
    await store.set('b', '1', 5);
    store.clear();
    expect(store.size()).toBe(0);
  });
});
