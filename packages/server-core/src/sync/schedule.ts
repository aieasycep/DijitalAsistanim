/**
 * Sync scheduling: poll intervals per plan/resource, exponential backoff, due selection with
 * per-user fairness, webhook renewal timing and history backfill windows. Pure functions over
 * SyncState rows — the cron dispatcher persists the outcome.
 */
import type { SyncState } from '@da/domain';
import { MINUTE, addDays, clamp } from '../util';

export type SyncResource = SyncState['resource'];
export type SyncMode = SyncState['mode'];

/** Minutes between polls. Webhook-backed states only get a 6-hour safety poll. */
export const POLL_INTERVALS = {
  free: { mail: 15, calendar: 30, tasks: 60, notifications: 60 },
  pro: { mail: 5, calendar: 10, tasks: 30, notifications: 30 },
  webhookSafetyPoll: 6 * 60,
} as const satisfies {
  free: Record<SyncResource, number>;
  pro: Record<SyncResource, number>;
  webhookSafetyPoll: number;
};

export const MAX_BACKOFF_MINUTES = 6 * 60;
const BACKOFF_BASE_MINUTES = 2;

/** Order in which a user's due resources are served when the budget is tight. */
const RESOURCE_PRIORITY: Record<SyncResource, number> = {
  mail: 0,
  calendar: 1,
  tasks: 2,
  notifications: 3,
};

function toMs(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/** 0 → 0, 1 → 2, 2 → 4, 3 → 8 … capped at 6 hours. */
export function backoffMinutes(errorCount: number): number {
  const n = Math.max(0, Math.floor(errorCount));
  if (n === 0) return 0;
  return Math.min(MAX_BACKOFF_MINUTES, BACKOFF_BASE_MINUTES * 2 ** (n - 1));
}

export interface PollContext {
  isPro: boolean;
  mode?: SyncMode;
}

export function pollIntervalMinutes(resource: SyncResource, ctx: PollContext): number {
  if (ctx.mode === 'webhook') return POLL_INTERVALS.webhookSafetyPoll;
  return (ctx.isPro ? POLL_INTERVALS.pro : POLL_INTERVALS.free)[resource];
}

export type SyncDueState = Pick<SyncState, 'resource' | 'mode' | 'lastRunAt' | 'errorCount'>;

export interface SyncDueContext {
  now: string | Date;
  isPro: boolean;
}

/** Minutes to wait after the last run: the poll interval, stretched by backoff after errors. */
export function waitMinutes(state: SyncDueState, ctx: Pick<SyncDueContext, 'isPro'>): number {
  return Math.max(
    pollIntervalMinutes(state.resource, { isPro: ctx.isPro, mode: state.mode }),
    backoffMinutes(state.errorCount),
  );
}

/** Instant of the next run (`now` when never run or the last run time is unreadable). */
export function nextSyncAt(state: SyncDueState, ctx: SyncDueContext): string {
  const nowMs = toMs(ctx.now);
  const last = state.lastRunAt ? Date.parse(state.lastRunAt) : Number.NaN;
  if (Number.isNaN(last)) return new Date(nowMs).toISOString();
  return new Date(last + waitMinutes(state, ctx) * MINUTE).toISOString();
}

/** A state with no `lastRunAt` (fresh or reset by sync-now) is always due. */
export function isSyncDue(state: SyncDueState, ctx: SyncDueContext): boolean {
  return Date.parse(nextSyncAt(state, ctx)) <= toMs(ctx.now);
}

export interface SelectDueStatesInput {
  now: string | Date;
  isProByUser: (userId: string) => boolean;
  /** Maximum states returned (default: all due). */
  limit?: number;
}

function staleness(state: SyncState): number {
  const last = state.lastRunAt ? Date.parse(state.lastRunAt) : Number.NaN;
  return Number.isNaN(last) ? Number.NEGATIVE_INFINITY : last;
}

function byStalenessThenResource(a: SyncState, b: SyncState): number {
  const diff = staleness(a) - staleness(b);
  if (diff !== 0) return diff;
  return RESOURCE_PRIORITY[a.resource] - RESOURCE_PRIORITY[b.resource];
}

/**
 * Due states, served round-robin across users (one state per user per round, users ordered by
 * their stalest state) so a single account with many resources never starves the others.
 */
export function selectDueStates(
  states: readonly SyncState[],
  input: SelectDueStatesInput,
): SyncState[] {
  const limit = input.limit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, input.limit);
  const byUser = new Map<string, SyncState[]>();
  for (const state of states) {
    if (!isSyncDue(state, { now: input.now, isPro: input.isProByUser(state.userId) })) continue;
    const list = byUser.get(state.userId) ?? [];
    list.push(state);
    byUser.set(state.userId, list);
  }
  const queues = [...byUser.values()].map((list) => list.sort(byStalenessThenResource));
  queues.sort((a, b) => byStalenessThenResource(a[0] as SyncState, b[0] as SyncState));
  const out: SyncState[] = [];
  let progressed = true;
  while (progressed && out.length < limit) {
    progressed = false;
    for (const queue of queues) {
      if (out.length >= limit) break;
      const next = queue.shift();
      if (!next) continue;
      out.push(next);
      progressed = true;
    }
  }
  return out;
}

export type SubscriptionState = Pick<
  SyncState,
  'mode' | 'subscriptionId' | 'subscriptionExpiresAt'
>;

/** Webhook mode without a live subscription: one must be created. */
export function needsSubscription(state: SubscriptionState): boolean {
  return state.mode === 'webhook' && !state.subscriptionId;
}

/** Existing subscription expiring within `leadMinutes` (default 12 h) or with no known expiry. */
export function subscriptionRenewalDue(
  state: SubscriptionState,
  now: string | Date,
  leadMinutes: number = 12 * 60,
): boolean {
  if (state.mode !== 'webhook' || !state.subscriptionId) return false;
  if (!state.subscriptionExpiresAt) return true;
  const expires = Date.parse(state.subscriptionExpiresAt);
  if (Number.isNaN(expires)) return true;
  return expires - toMs(now) <= Math.max(0, leadMinutes) * MINUTE;
}

export interface BackfillWindowInput {
  now: string | Date;
  /** Earliest instant already covered by backfill (`sync_states.backfill_until`). */
  backfillUntil?: string | null;
  /** How far back history is fetched in total (default 90 days). */
  horizonDays?: number;
  /** Size of one backfill step (default 7 days). */
  stepDays?: number;
}

export interface BackfillWindow {
  since: string;
  until: string;
  /** True when this window reaches the horizon — the backfill is complete after it. */
  isLast: boolean;
}

/**
 * Next slice of history to fetch, walking backwards from `backfillUntil` (or `now`) in
 * `stepDays` steps until the horizon; `null` once the horizon is covered.
 */
export function nextBackfillWindow(input: BackfillWindowInput): BackfillWindow | null {
  const nowIso = new Date(toMs(input.now)).toISOString();
  const horizonDays = clamp(input.horizonDays ?? 90, 1, 3650);
  const stepDays = clamp(input.stepDays ?? 7, 1, horizonDays);
  const horizonStart = Date.parse(addDays(nowIso, -horizonDays));
  const untilMs = input.backfillUntil ? Date.parse(input.backfillUntil) : Number.NaN;
  const until = Number.isNaN(untilMs) ? Date.parse(nowIso) : untilMs;
  if (until <= horizonStart) return null;
  const since = Math.max(horizonStart, Date.parse(addDays(new Date(until), -stepDays)));
  return {
    since: new Date(since).toISOString(),
    until: new Date(until).toISOString(),
    isLast: since <= horizonStart,
  };
}
