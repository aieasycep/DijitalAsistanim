/**
 * @da/server-core — runtime-agnostic backend logic.
 *
 * Constraints (so the same code runs in Deno Edge Functions and Node/Vitest):
 *  - Only Web platform APIs: fetch, crypto.subtle, TextEncoder, URL, Intl, AbortController.
 *  - No Node built-ins, no `process.env` access inside modules — configuration is injected.
 *  - No database client here; edge functions pass data in and persist results (see supabase/functions/_shared).
 */
export * from './crypto';
export * from './ratelimit';
export * from './safefetch';
export * from './oauth';
export * from './triage';
export * from './priority';
export * from './dates';
export * from './commitments';
export * from './lifeEvents';
export * from './ai';
export * from './embeddings';
export * from './speech';
export * from './entitlements';
export * from './referral';
export * from './retention';
export * from './approvals';
export * from './reminders';
export * from './timeSaved';
export * from './analytics';
export * from './notifications';
export * from './calendar';
export * from './followups';
export * from './briefing';
export * from './insights';
export * from './memory';
export * from './providers';
export * from './push';
export * from './sync';
export * from './errors';
export * from './util';

// Explicit re-exports resolve star-export ambiguities (identical values defined in two modules).
export { DEFAULT_TIMEZONE } from './calendar';
export { addDays } from './dates';
