/**
 * @da/server-core — runtime-agnostic backend logic.
 *
 * Constraints (so the same code runs in Deno Edge Functions and Node/Vitest):
 *  - Only Web platform APIs: fetch, crypto.subtle, TextEncoder, URL, Intl, AbortController.
 *  - No Node built-ins, no `process.env` access inside modules — configuration is injected.
 *  - No database client here; edge functions pass data in and persist results (see supabase/functions/_shared).
 */
export * from './crypto/index.ts';
export * from './ratelimit/index.ts';
export * from './safefetch/index.ts';
export * from './oauth/index.ts';
export * from './triage/index.ts';
export * from './priority/index.ts';
export * from './dates/index.ts';
export * from './commitments/index.ts';
export * from './lifeEvents/index.ts';
export * from './ai/index.ts';
export * from './embeddings/index.ts';
export * from './speech/index.ts';
export * from './entitlements/index.ts';
export * from './referral/index.ts';
export * from './retention/index.ts';
export * from './approvals/index.ts';
export * from './reminders/index.ts';
export * from './timeSaved/index.ts';
export * from './analytics/index.ts';
export * from './notifications/index.ts';
export * from './calendar/index.ts';
export * from './followups/index.ts';
export * from './briefing/index.ts';
export * from './insights/index.ts';
export * from './memory/index.ts';
export * from './providers/index.ts';
export * from './push/index.ts';
export * from './sync/index.ts';
export * from './errors/index.ts';
export * from './util/index.ts';

// Explicit re-exports resolve star-export ambiguities (identical values defined in two modules).
export { DEFAULT_TIMEZONE } from './calendar/index.ts';
export { addDays } from './dates/index.ts';
