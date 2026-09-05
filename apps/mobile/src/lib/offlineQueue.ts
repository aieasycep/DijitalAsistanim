/**
 * Offline write queue.
 *
 * Screens call `enqueue()` when a mutation cannot reach the backend (the data source raised `offline`, or the
 * UI store already says we are offline). Entries are persisted in the encrypted MMKV cache and replayed in
 * order as soon as connectivity returns (`startOfflineQueue` listens to TanStack's `onlineManager`, which
 * `setupQueryClientListeners` feeds from NetInfo). Every entry carries an idempotency key: approvals reuse the
 * key the server dedupes on, and the remaining mutations are status sets keyed by their target, so a replay
 * after a crash never double-applies and a newer intent for the same target replaces the older one.
 *
 * Non-retryable failures (validation, not found, forbidden…) drop the entry; transient ones retry up to
 * `MAX_ATTEMPTS`. Nothing here bypasses approvals — `approval_create` only *proposes*.
 */
import { onlineManager } from '@tanstack/react-query';
import { ClientApiError, type DataSource } from '@da/api-client';
import type {
  AiFeedbackKind,
  CreateApprovalRequest,
  ISODateTime,
  UserPreferences,
  UUID,
} from '@da/domain';
import { captureError } from './monitoring';
import { CacheKeys, readCache, removeCache, writeCache } from './storage';

export type OfflineMutation =
  | { kind: 'approval_create'; request: CreateApprovalRequest }
  | {
      kind: 'approval_decide';
      approvalId: UUID;
      decision: 'approve' | 'reject';
      editedPayload?: Record<string, unknown>;
    }
  | {
      kind: 'insight_resolve';
      insightId: UUID;
      status: 'completed' | 'dismissed' | 'active';
      feedback?: AiFeedbackKind;
    }
  | { kind: 'insight_snooze'; insightId: UUID; until: ISODateTime }
  | {
      kind: 'feedback';
      feedbackKind: AiFeedbackKind;
      entityType: string;
      entityId: UUID;
      contactId?: UUID | null;
      note?: string | null;
    }
  | { kind: 'email_mark_read'; threadId: UUID; isRead: boolean }
  | { kind: 'followup_snooze'; followUpId: UUID; until: ISODateTime }
  | { kind: 'followup_close'; followUpId: UUID }
  | { kind: 'task_complete'; taskId: UUID; completed: boolean }
  | { kind: 'commitment_complete'; commitmentId: UUID }
  | { kind: 'commitment_postpone'; commitmentId: UUID; until: ISODateTime }
  | { kind: 'commitment_confirm'; commitmentId: UUID; accept: boolean }
  | { kind: 'reminder_cancel'; reminderId: UUID }
  | { kind: 'reminder_complete'; reminderId: UUID }
  | { kind: 'conflict_ignore'; conflictId: UUID }
  | { kind: 'close_day'; briefingId: UUID; carryOverInsightIds: UUID[] }
  | {
      kind: 'preferences_update';
      patch: Partial<Omit<UserPreferences, 'userId' | 'createdAt' | 'updatedAt'>>;
    };

export type OfflineMutationKind = OfflineMutation['kind'];

export interface OfflineQueueEntry {
  id: string;
  idempotencyKey: string;
  mutation: OfflineMutation;
  createdAt: ISODateTime;
  attempts: number;
  lastError?: string | null;
}

export interface OfflineQueueSnapshot {
  size: number;
  flushing: boolean;
  lastFlushAt: ISODateTime | null;
  lastError: string | null;
}

export interface FlushResult {
  applied: number;
  dropped: number;
  remaining: number;
  /** The flush stopped early because the device went (or stayed) offline. */
  stoppedOffline: boolean;
}

export const MAX_ATTEMPTS = 5;
export const MAX_QUEUE_SIZE = 200;
/** Entries older than this are discarded on load — a week-old "mark read" is noise, not intent. */
export const MAX_ENTRY_AGE_MS = 7 * 24 * 60 * 60_000;

type Listener = (snapshot: OfflineQueueSnapshot) => void;

let entries: OfflineQueueEntry[] | null = null;
let flushing = false;
let lastFlushAt: ISODateTime | null = null;
let lastError: string | null = null;
let counter = 0;
const listeners = new Set<Listener>();
let now: () => Date = () => new Date();

function isEntry(value: unknown): value is OfflineQueueEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.idempotencyKey === 'string' &&
    typeof e.createdAt === 'string' &&
    typeof e.attempts === 'number' &&
    typeof e.mutation === 'object' &&
    e.mutation !== null &&
    typeof (e.mutation as { kind?: unknown }).kind === 'string'
  );
}

function load(): OfflineQueueEntry[] {
  if (entries) return entries;
  let stored: unknown = null;
  try {
    stored = readCache<unknown>(CacheKeys.pendingActions);
  } catch (e) {
    captureError(e, { where: 'offlineQueue.load' });
  }
  const cutoff = now().getTime() - MAX_ENTRY_AGE_MS;
  entries = Array.isArray(stored)
    ? stored.filter(isEntry).filter((e) => Date.parse(e.createdAt) >= cutoff)
    : [];
  return entries;
}

function persist(): void {
  const list = load();
  try {
    if (list.length === 0) removeCache(CacheKeys.pendingActions);
    else writeCache(CacheKeys.pendingActions, list);
  } catch (e) {
    captureError(e, { where: 'offlineQueue.persist' });
  }
  const snapshot = getSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

export function getSnapshot(): OfflineQueueSnapshot {
  return { size: load().length, flushing, lastFlushAt, lastError };
}

export function size(): number {
  return load().length;
}

export function list(): readonly OfflineQueueEntry[] {
  return load();
}

/** Notifies on every change (enqueue, flush progress, clear). Returns the unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Deterministic key per target so a newer intent replaces the older one; approvals keep the server key. */
export function idempotencyKeyFor(mutation: OfflineMutation): string {
  switch (mutation.kind) {
    case 'approval_create':
      return `approval_create:${mutation.request.idempotencyKey}`;
    case 'approval_decide':
      return `approval_decide:${mutation.approvalId}`;
    case 'insight_resolve':
    case 'insight_snooze':
      return `insight:${mutation.insightId}`;
    case 'feedback':
      return `feedback:${mutation.entityType}:${mutation.entityId}:${mutation.feedbackKind}`;
    case 'email_mark_read':
      return `email_mark_read:${mutation.threadId}`;
    case 'followup_snooze':
    case 'followup_close':
      return `followup:${mutation.followUpId}`;
    case 'task_complete':
      return `task_complete:${mutation.taskId}`;
    case 'commitment_complete':
    case 'commitment_postpone':
    case 'commitment_confirm':
      return `commitment:${mutation.commitmentId}`;
    case 'reminder_cancel':
    case 'reminder_complete':
      return `reminder:${mutation.reminderId}`;
    case 'conflict_ignore':
      return `conflict_ignore:${mutation.conflictId}`;
    case 'close_day':
      return `close_day:${mutation.briefingId}`;
    case 'preferences_update':
      return 'preferences_update';
  }
}

/** Queues a mutation for replay. Same idempotency key → the newer mutation replaces the older entry in place. */
export function enqueue(
  mutation: OfflineMutation,
  opts: { idempotencyKey?: string } = {},
): OfflineQueueEntry {
  const list = load();
  const idempotencyKey = opts.idempotencyKey ?? idempotencyKeyFor(mutation);
  const createdAt = now().toISOString();
  const existingIndex = list.findIndex((e) => e.idempotencyKey === idempotencyKey);
  if (existingIndex >= 0) {
    const existing = list[existingIndex];
    const replaced: OfflineQueueEntry = {
      id: existing?.id ?? nextId(),
      idempotencyKey,
      mutation,
      createdAt,
      attempts: 0,
      lastError: null,
    };
    list[existingIndex] = replaced;
    persist();
    return replaced;
  }
  const entry: OfflineQueueEntry = {
    id: nextId(),
    idempotencyKey,
    mutation,
    createdAt,
    attempts: 0,
    lastError: null,
  };
  list.push(entry);
  if (list.length > MAX_QUEUE_SIZE) list.splice(0, list.length - MAX_QUEUE_SIZE);
  persist();
  return entry;
}

export function remove(id: string): boolean {
  const list = load();
  const index = list.findIndex((e) => e.id === id);
  if (index < 0) return false;
  list.splice(index, 1);
  persist();
  return true;
}

export function clear(): void {
  load().splice(0);
  lastError = null;
  persist();
}

function nextId(): string {
  counter += 1;
  return `${now().getTime().toString(36)}-${counter.toString(36)}`;
}

/** Applies one mutation against the data source. Exported so screens can share the mapping for the online path. */
export async function applyMutation(ds: DataSource, mutation: OfflineMutation): Promise<void> {
  switch (mutation.kind) {
    case 'approval_create':
      await ds.approvals.createApproval(mutation.request);
      return;
    case 'approval_decide':
      await ds.approvals.decideApproval({
        approvalId: mutation.approvalId,
        decision: mutation.decision,
        editedPayload: mutation.editedPayload,
      });
      return;
    case 'insight_resolve':
      await ds.feed.resolveInsight(mutation.insightId, mutation.status, mutation.feedback);
      return;
    case 'insight_snooze':
      await ds.feed.snoozeInsight(mutation.insightId, mutation.until);
      return;
    case 'feedback':
      await ds.feed.sendFeedback({
        kind: mutation.feedbackKind,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        contactId: mutation.contactId,
        note: mutation.note,
      });
      return;
    case 'email_mark_read':
      await ds.email.markRead(mutation.threadId, mutation.isRead);
      return;
    case 'followup_snooze':
      await ds.email.snoozeFollowUp(mutation.followUpId, mutation.until);
      return;
    case 'followup_close':
      await ds.email.closeFollowUp(mutation.followUpId);
      return;
    case 'task_complete':
      await ds.plan.completeTask(mutation.taskId, mutation.completed);
      return;
    case 'commitment_complete':
      await ds.plan.completeCommitment(mutation.commitmentId);
      return;
    case 'commitment_postpone':
      await ds.plan.postponeCommitment(mutation.commitmentId, mutation.until);
      return;
    case 'commitment_confirm':
      await ds.plan.confirmCommitment(mutation.commitmentId, mutation.accept);
      return;
    case 'reminder_cancel':
      await ds.reminders.cancelReminder(mutation.reminderId);
      return;
    case 'reminder_complete':
      await ds.reminders.completeReminder(mutation.reminderId);
      return;
    case 'conflict_ignore':
      await ds.plan.ignoreConflict(mutation.conflictId);
      return;
    case 'close_day':
      await ds.briefings.closeDay({
        briefingId: mutation.briefingId,
        carryOverInsightIds: mutation.carryOverInsightIds,
      });
      return;
    case 'preferences_update':
      await ds.profile.updatePreferences(mutation.patch);
      return;
  }
}

/** Transient failures are retried; anything the server rejected outright is dropped. */
export function isRetryableError(e: unknown): boolean {
  const err = ClientApiError.from(e);
  switch (err.code) {
    case 'offline':
    case 'provider_unavailable':
    case 'rate_limited':
    case 'ai_unavailable':
    case 'internal':
      return true;
    default:
      return false;
  }
}

export function isOfflineError(e: unknown): boolean {
  return ClientApiError.from(e).code === 'offline';
}

/** Replays the queue in order. Safe to call repeatedly — concurrent calls share the running flush. */
export async function flush(ds: DataSource): Promise<FlushResult> {
  const list = load();
  if (flushing || list.length === 0)
    return { applied: 0, dropped: 0, remaining: list.length, stoppedOffline: false };
  flushing = true;
  lastError = null;
  listeners.forEach((listener) => listener(getSnapshot()));
  let applied = 0;
  let dropped = 0;
  let stoppedOffline = false;
  try {
    // Snapshot the ids: entries enqueued while flushing wait for the next run.
    const ids = list.map((e) => e.id);
    for (const id of ids) {
      if (!onlineManager.isOnline()) {
        stoppedOffline = true;
        break;
      }
      const entry = load().find((e) => e.id === id);
      if (!entry) continue;
      try {
        await applyMutation(ds, entry.mutation);
        applied += 1;
        removeSilently(entry.id);
      } catch (e) {
        if (isOfflineError(e)) {
          stoppedOffline = true;
          break;
        }
        entry.attempts += 1;
        entry.lastError = ClientApiError.from(e).code;
        if (!isRetryableError(e) || entry.attempts >= MAX_ATTEMPTS) {
          captureError(e, {
            where: 'offlineQueue.flush.drop',
            kind: entry.mutation.kind,
            attempts: entry.attempts,
          });
          dropped += 1;
          removeSilently(entry.id);
          lastError = entry.lastError;
        } else {
          lastError = entry.lastError;
        }
      }
    }
    lastFlushAt = now().toISOString();
  } finally {
    flushing = false;
    persist();
  }
  return { applied, dropped, remaining: load().length, stoppedOffline };
}

function removeSilently(id: string): void {
  const list = load();
  const index = list.findIndex((e) => e.id === id);
  if (index >= 0) list.splice(index, 1);
}

/**
 * Flushes when connectivity returns (and once at start when already online). Returns the stop function.
 * Call it once from the app root after the data source exists.
 */
export function startOfflineQueue(ds: DataSource): () => void {
  const run = (): void => {
    if (size() === 0) return;
    void flush(ds).catch((e) => captureError(e, { where: 'offlineQueue.autoFlush' }));
  };
  const unsubscribe = onlineManager.subscribe((online) => {
    if (online) run();
  });
  if (onlineManager.isOnline()) run();
  return unsubscribe;
}

/** Test seam: deterministic clocks and a fresh in-memory state. */
export function resetOfflineQueueForTests(clock?: () => Date): void {
  entries = null;
  flushing = false;
  lastFlushAt = null;
  lastError = null;
  counter = 0;
  listeners.clear();
  now = clock ?? (() => new Date());
}
