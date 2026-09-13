import { AppError } from '@da/server-core/errors';
import { adminClient } from './db.ts';
import { log } from './log.ts';

export type RatePolicy =
  | 'assistant_query'
  | 'capture_upload'
  | 'oauth_start'
  | 'referral_redeem'
  | 'ai_call'
  | 'sync_trigger'
  | 'search'
  | 'export'
  | 'feedback';

const POLICIES: Record<RatePolicy, { limit: number; windowSec: number }> = {
  assistant_query: { limit: 20, windowSec: 60 },
  capture_upload: { limit: 30, windowSec: 600 },
  oauth_start: { limit: 10, windowSec: 600 },
  referral_redeem: { limit: 5, windowSec: 3600 },
  ai_call: { limit: 120, windowSec: 60 },
  sync_trigger: { limit: 6, windowSec: 300 },
  search: { limit: 60, windowSec: 60 },
  export: { limit: 3, windowSec: 86400 },
  feedback: { limit: 10, windowSec: 3600 },
};

/**
 * Fixed-window rate limit backed by public.rate_limits. Calls the service-role-only wrapper
 * `public.rate_limit_hit` (→ internal.rate_limit_hit); the `internal` schema itself is not exposed
 * through PostgREST.
 */
export async function enforceRateLimit(policy: RatePolicy, subject: string): Promise<void> {
  const p = POLICIES[policy];
  const key = `${policy}:${subject}`;
  const { data, error } = await adminClient().rpc('rate_limit_hit', {
    p_key: key,
    p_limit: p.limit,
    p_window_sec: p.windowSec,
  });
  if (error) {
    // Fail open: a broken limiter must never block legitimate traffic, but it must be visible.
    log.error('rate limit check failed; failing open', {
      policy,
      code: error.code,
      error: error.message,
    });
    return;
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    { allowed: boolean; remaining: number; retry_after_sec: number } | undefined;
  if (row && !row.allowed) {
    throw new AppError('rate_limited', 'Çok fazla istek. Kısa süre sonra tekrar dene.', {
      retryAfterSec: row.retry_after_sec,
    });
  }
}
