import type { DataSource } from '@da/api-client';

jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));

const mockMemory = new Map<string, string>();
jest.mock('@/lib/storage', () => ({
  CacheKeys: { pendingActions: 'offline.pending.v1' },
  readCache: (key: string) => {
    const raw = mockMemory.get(key);
    return raw ? JSON.parse(raw) : null;
  },
  writeCache: (key: string, value: unknown) => {
    mockMemory.set(key, JSON.stringify(value));
  },
  removeCache: (key: string) => {
    mockMemory.delete(key);
  },
}));

let mockOnline = true;
const mockOnlineListeners = new Set<(online: boolean) => void>();
jest.mock('@tanstack/react-query', () => ({
  onlineManager: {
    isOnline: () => mockOnline,
    subscribe: (listener: (online: boolean) => void) => {
      mockOnlineListeners.add(listener);
      return () => mockOnlineListeners.delete(listener);
    },
  },
}));

import { ClientApiError } from '@da/api-client';
import {
  MAX_ATTEMPTS,
  applyMutation,
  clear,
  enqueue,
  flush,
  idempotencyKeyFor,
  isRetryableError,
  list,
  resetOfflineQueueForTests,
  size,
  startOfflineQueue,
  subscribe,
  type OfflineMutation,
} from '@/lib/offlineQueue';

function makeDs(overrides: Partial<Record<string, jest.Mock>> = {}): {
  ds: DataSource;
  calls: Record<string, jest.Mock>;
} {
  const calls: Record<string, jest.Mock> = {
    resolveInsight: jest.fn(async () => undefined),
    snoozeInsight: jest.fn(async () => undefined),
    sendFeedback: jest.fn(async () => undefined),
    markRead: jest.fn(async () => undefined),
    completeTask: jest.fn(async () => undefined),
    completeCommitment: jest.fn(async () => undefined),
    createApproval: jest.fn(async () => ({ id: 'a-1' })),
    decideApproval: jest.fn(async () => ({ status: 'executed' })),
    cancelReminder: jest.fn(async () => undefined),
    updatePreferences: jest.fn(async () => undefined),
    closeDay: jest.fn(async () => undefined),
    ...overrides,
  };
  const ds = {
    feed: {
      resolveInsight: calls.resolveInsight,
      snoozeInsight: calls.snoozeInsight,
      sendFeedback: calls.sendFeedback,
    },
    email: { markRead: calls.markRead },
    plan: { completeTask: calls.completeTask, completeCommitment: calls.completeCommitment },
    approvals: { createApproval: calls.createApproval, decideApproval: calls.decideApproval },
    reminders: { cancelReminder: calls.cancelReminder },
    profile: { updatePreferences: calls.updatePreferences },
    briefings: { closeDay: calls.closeDay },
  } as unknown as DataSource;
  return { ds, calls };
}

const apiError = (code: ConstructorParameters<typeof ClientApiError>[0]['code']): ClientApiError =>
  new ClientApiError({ code, message: code });

beforeEach(() => {
  mockMemory.clear();
  mockOnline = true;
  mockOnlineListeners.clear();
  let tick = 0;
  resetOfflineQueueForTests(() => new Date(Date.UTC(2026, 8, 5, 8, 0, tick++)));
});

describe('enqueue', () => {
  it('persists entries in the encrypted cache and dedupes by idempotency key', () => {
    const seen: number[] = [];
    subscribe((s) => seen.push(s.size));
    enqueue({ kind: 'email_mark_read', threadId: 't-1', isRead: true });
    enqueue({ kind: 'email_mark_read', threadId: 't-2', isRead: true });
    const replaced = enqueue({ kind: 'email_mark_read', threadId: 't-1', isRead: false });
    expect(size()).toBe(2);
    expect(list()[0]?.id).toBe(replaced.id);
    expect(list()[0]?.mutation).toEqual({
      kind: 'email_mark_read',
      threadId: 't-1',
      isRead: false,
    });
    expect(seen).toEqual([1, 2, 2]);
    const stored = JSON.parse(mockMemory.get('offline.pending.v1') ?? '[]') as unknown[];
    expect(stored).toHaveLength(2);

    // A fresh process reloads the persisted queue.
    resetOfflineQueueForTests();
    expect(size()).toBe(2);
  });

  it('derives stable keys per target and keeps the server key for approvals', () => {
    const approval: OfflineMutation = {
      kind: 'approval_create',
      request: {
        type: 'task_create',
        what: 'w',
        why: 'y',
        changeSummary: [],
        payload: { title: 't' },
        requestedBy: 'assistant',
        idempotencyKey: 'client-abc',
      },
    };
    expect(idempotencyKeyFor(approval)).toBe('approval_create:client-abc');
    expect(
      idempotencyKeyFor({ kind: 'insight_resolve', insightId: 'i-1', status: 'completed' }),
    ).toBe(
      idempotencyKeyFor({
        kind: 'insight_snooze',
        insightId: 'i-1',
        until: '2026-09-06T08:00:00Z',
      }),
    );
    expect(idempotencyKeyFor({ kind: 'preferences_update', patch: {} })).toBe('preferences_update');
  });

  it('drops stale entries on load', () => {
    enqueue({ kind: 'task_complete', taskId: 't-1', completed: true });
    resetOfflineQueueForTests(() => new Date(Date.UTC(2026, 8, 20)));
    expect(size()).toBe(0);
  });
});

describe('flush', () => {
  it('replays in order, removes applied entries and reports the result', async () => {
    const { ds, calls } = makeDs();
    enqueue({
      kind: 'insight_resolve',
      insightId: 'i-1',
      status: 'completed',
      feedback: 'important',
    });
    enqueue({ kind: 'task_complete', taskId: 't-1', completed: true });
    enqueue({ kind: 'approval_decide', approvalId: 'a-1', decision: 'approve' });
    const result = await flush(ds);
    expect(result).toEqual({ applied: 3, dropped: 0, remaining: 0, stoppedOffline: false });
    expect(calls.resolveInsight).toHaveBeenCalledWith('i-1', 'completed', 'important');
    expect(calls.completeTask).toHaveBeenCalledWith('t-1', true);
    expect(calls.decideApproval).toHaveBeenCalledWith({
      approvalId: 'a-1',
      decision: 'approve',
      editedPayload: undefined,
    });
    expect(mockMemory.has('offline.pending.v1')).toBe(false);
  });

  it('stops when the device goes offline and keeps the rest for later', async () => {
    const { ds, calls } = makeDs({
      markRead: jest.fn(async () => {
        throw apiError('offline');
      }),
    });
    enqueue({ kind: 'email_mark_read', threadId: 't-1', isRead: true });
    enqueue({ kind: 'task_complete', taskId: 't-2', completed: true });
    const result = await flush(ds);
    expect(result).toMatchObject({ applied: 0, dropped: 0, remaining: 2, stoppedOffline: true });
    expect(calls.completeTask).not.toHaveBeenCalled();
    expect(list()[0]?.attempts).toBe(0);
  });

  it('drops non-retryable failures and retries transient ones up to the limit', async () => {
    const { ds, calls } = makeDs({
      markRead: jest.fn(async () => {
        throw apiError('not_found');
      }),
      completeTask: jest.fn(async () => {
        throw apiError('provider_unavailable');
      }),
    });
    enqueue({ kind: 'email_mark_read', threadId: 't-1', isRead: true });
    enqueue({ kind: 'task_complete', taskId: 't-2', completed: true });
    let result = await flush(ds);
    expect(result).toMatchObject({ applied: 0, dropped: 1, remaining: 1 });
    expect(list()[0]?.mutation.kind).toBe('task_complete');
    expect(list()[0]?.attempts).toBe(1);
    for (let i = 1; i < MAX_ATTEMPTS; i++) result = await flush(ds);
    expect(result.remaining).toBe(0);
    expect(calls.completeTask).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('is a no-op while offline or empty and never runs twice concurrently', async () => {
    const { ds } = makeDs();
    await expect(flush(ds)).resolves.toEqual({
      applied: 0,
      dropped: 0,
      remaining: 0,
      stoppedOffline: false,
    });
    mockOnline = false;
    enqueue({ kind: 'reminder_cancel', reminderId: 'r-1' });
    await expect(flush(ds)).resolves.toMatchObject({
      applied: 0,
      remaining: 1,
      stoppedOffline: true,
    });
    mockOnline = true;
    const [a, b] = await Promise.all([flush(ds), flush(ds)]);
    expect(a.applied + b.applied).toBe(1);
    expect(size()).toBe(0);
  });

  it('classifies retryable errors', () => {
    expect(isRetryableError(apiError('offline'))).toBe(true);
    expect(isRetryableError(apiError('rate_limited'))).toBe(true);
    expect(isRetryableError(apiError('internal'))).toBe(true);
    expect(isRetryableError(apiError('validation'))).toBe(false);
    expect(isRetryableError(apiError('forbidden'))).toBe(false);
    expect(isRetryableError(apiError('conflict'))).toBe(false);
  });
});

describe('applyMutation', () => {
  it('routes every mutation kind to the matching data source call', async () => {
    const { ds, calls } = makeDs();
    await applyMutation(ds, {
      kind: 'feedback',
      feedbackKind: 'not_important',
      entityType: 'insight',
      entityId: 'i-1',
    });
    await applyMutation(ds, { kind: 'commitment_complete', commitmentId: 'c-1' });
    await applyMutation(ds, { kind: 'close_day', briefingId: 'b-1', carryOverInsightIds: ['i-2'] });
    await applyMutation(ds, { kind: 'preferences_update', patch: { hapticsEnabled: false } });
    expect(calls.sendFeedback).toHaveBeenCalledWith({
      kind: 'not_important',
      entityType: 'insight',
      entityId: 'i-1',
      contactId: undefined,
      note: undefined,
    });
    expect(calls.completeCommitment).toHaveBeenCalledWith('c-1');
    expect(calls.closeDay).toHaveBeenCalledWith({
      briefingId: 'b-1',
      carryOverInsightIds: ['i-2'],
    });
    expect(calls.updatePreferences).toHaveBeenCalledWith({ hapticsEnabled: false });
  });
});

describe('startOfflineQueue', () => {
  it('flushes on reconnect and once at start when already online', async () => {
    const { ds, calls } = makeDs();
    enqueue({ kind: 'task_complete', taskId: 't-1', completed: true });
    const stop = startOfflineQueue(ds);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.completeTask).toHaveBeenCalledTimes(1);

    enqueue({ kind: 'task_complete', taskId: 't-2', completed: true });
    mockOnlineListeners.forEach((l) => l(false));
    mockOnlineListeners.forEach((l) => l(true));
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.completeTask).toHaveBeenCalledTimes(2);
    stop();
    expect(mockOnlineListeners.size).toBe(0);
    clear();
    expect(size()).toBe(0);
  });
});
