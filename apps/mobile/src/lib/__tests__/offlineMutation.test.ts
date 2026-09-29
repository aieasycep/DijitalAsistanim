import type { TFunction } from 'i18next';
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
jest.mock('@tanstack/react-query', () => ({
  onlineManager: {
    isOnline: () => mockOnline,
    subscribe: () => () => undefined,
  },
}));

import { ClientApiError } from '@da/api-client';
import { isDeviceOffline, queuedToast, runOrQueue } from '@/lib/offlineMutation';
import { list, resetOfflineQueueForTests, size } from '@/lib/offlineQueue';

const markRead = jest.fn(async () => undefined);
const ds = { email: { markRead } } as unknown as DataSource;

const apiError = (code: ConstructorParameters<typeof ClientApiError>[0]['code']): ClientApiError =>
  new ClientApiError({ code, message: code });

beforeEach(() => {
  jest.clearAllMocks();
  mockMemory.clear();
  mockOnline = true;
  resetOfflineQueueForTests(() => new Date(Date.UTC(2026, 8, 5, 8, 0, 0)));
});

describe('runOrQueue', () => {
  it('online: runs the call, resolves its value and queues nothing', async () => {
    const run = jest.fn(async () => ({ id: 'a-1' }));
    await expect(
      runOrQueue(ds, { kind: 'email_mark_read', threadId: 't-1', isRead: true }, run),
    ).resolves.toEqual({ queued: false, value: { id: 'a-1' } });
    expect(run).toHaveBeenCalledTimes(1);
    expect(size()).toBe(0);
    expect(mockMemory.has('offline.pending.v1')).toBe(false);
  });

  it('falls back to the queue’s own data-source mapping when no runner is given', async () => {
    await expect(
      runOrQueue(ds, { kind: 'email_mark_read', threadId: 't-1', isRead: true }),
    ).resolves.toEqual({ queued: false, value: undefined });
    expect(markRead).toHaveBeenCalledWith('t-1', true);
    expect(size()).toBe(0);
  });

  it('offline (online manager): persists the intent without touching the data source', async () => {
    mockOnline = false;
    expect(isDeviceOffline()).toBe(true);
    const run = jest.fn(async () => undefined);
    const outcome = await runOrQueue(
      ds,
      { kind: 'task_complete', taskId: 't-1', completed: true },
      run,
    );
    expect(outcome.queued).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect(list()).toHaveLength(1);
    expect(list()[0]?.mutation).toEqual({ kind: 'task_complete', taskId: 't-1', completed: true });
    expect(JSON.parse(mockMemory.get('offline.pending.v1') ?? '[]')).toHaveLength(1);
  });

  it('offline error from the call: queues the intent for replay', async () => {
    const run = jest.fn(async () => {
      throw apiError('offline');
    });
    const outcome = await runOrQueue(ds, { kind: 'reminder_cancel', reminderId: 'r-1' }, run);
    expect(outcome).toMatchObject({
      queued: true,
      entry: { mutation: { kind: 'reminder_cancel', reminderId: 'r-1' }, attempts: 0 },
    });
    expect(size()).toBe(1);
  });

  it('rethrows every other failure and queues nothing', async () => {
    const run = jest.fn(async () => {
      throw apiError('validation');
    });
    await expect(
      runOrQueue(ds, { kind: 'reminder_cancel', reminderId: 'r-1' }, run),
    ).rejects.toMatchObject({ code: 'validation' });
    expect(size()).toBe(0);
  });

  it('queuedToast uses the shared offline copy', () => {
    const t = jest.fn((key: string) => key) as unknown as TFunction;
    expect(queuedToast(t)).toEqual({ message: 'common.queuedOffline', icon: 'offline' });
  });
});
