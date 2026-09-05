import type * as ReactQuery from '@tanstack/react-query';
import type { DataSource } from '@da/api-client';
import type { TodayFeed } from '@da/domain';

jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n), randomUUID: () => '00000000-0000-4000-8000-000000000000' }));
jest.mock('@/lib/datasource', () => ({
  getDataSource: () => {
    throw new Error('runBackgroundSync must receive an explicit data source in tests');
  },
}));
jest.mock('@/lib/queryClient', () => {
  const { QueryClient } = jest.requireActual('@tanstack/react-query') as typeof ReactQuery;
  return { queryClient: new QueryClient() };
});
jest.mock('@/services/widgets', () => ({ syncWidgetsFromToday: jest.fn(async () => null) }));

const mockTaskState = { defined: new Map<string, () => Promise<unknown>>(), registered: false, available: true };
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn((name: string, executor: () => Promise<unknown>) => {
    mockTaskState.defined.set(name, executor);
  }),
  isTaskDefined: jest.fn((name: string) => mockTaskState.defined.has(name)),
  isTaskRegisteredAsync: jest.fn(async () => mockTaskState.registered),
  isAvailableAsync: jest.fn(async () => mockTaskState.available),
}));
jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  getStatusAsync: jest.fn(async () => (mockTaskState.available ? 2 : 1)),
  registerTaskAsync: jest.fn(async () => {
    mockTaskState.registered = true;
  }),
  unregisterTaskAsync: jest.fn(async () => {
    mockTaskState.registered = false;
  }),
}));

import type * as Background from '@/services/background';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { qk } from '@da/api-client';
import { queryClient } from '@/lib/queryClient';
import { CacheKeys, readCache } from '@/lib/storage';
import { syncWidgetsFromToday } from '@/services/widgets';

// Loaded after the mock state above is initialised, exactly like the app imports it once at start-up.
let background: typeof Background;
beforeAll(() => {
  background = require('@/services/background') as typeof Background;
});
afterAll(() => queryClient.clear());

const today: TodayFeed = {
  greeting: 'Günaydın',
  dateLabel: '5 Eylül',
  briefing: null,
  priorities: [],
  meetings: [],
  deadlines: [],
  lifeEvents: [],
  pendingApprovals: 1,
  isEvening: false,
  offline: false,
};

function fakeDs(signedIn: boolean, getToday: () => Promise<TodayFeed> = async () => today): DataSource {
  return {
    auth: { getSession: async () => (signedIn ? { user: { id: 'u1', provider: 'demo' }, accessToken: 't', expiresAt: '2030-01-01T00:00:00Z' } : null) },
    feed: { getToday },
  } as unknown as DataSource;
}

describe('background sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTaskState.registered = false;
    mockTaskState.available = true;
  });

  it('defines the task at module load with the stable identifier', async () => {
    expect(background.BACKGROUND_SYNC_TASK).toBe('da-background-sync');
    const executor = mockTaskState.defined.get(background.BACKGROUND_SYNC_TASK);
    expect(executor).toBeDefined();
    expect(TaskManager.defineTask).toHaveBeenCalledTimes(1);
  });

  it('skips without a session', async () => {
    expect(await background.runBackgroundSync(fakeDs(false))).toBe('skipped');
    expect(syncWidgetsFromToday).not.toHaveBeenCalled();
  });

  it('refreshes the query cache, offline snapshot and widgets when signed in', async () => {
    expect(await background.runBackgroundSync(fakeDs(true))).toBe('synced');
    expect(queryClient.getQueryData(qk.today())).toEqual(today);
    expect(readCache<TodayFeed>(CacheKeys.todaySnapshot)).toEqual(today);
    expect(syncWidgetsFromToday).toHaveBeenCalledWith(today, true);
  });

  it('reports failures without throwing', async () => {
    expect(
      await background.runBackgroundSync(
        fakeDs(true, async () => {
          throw new Error('offline');
        }),
      ),
    ).toBe('failed');
  });

  it('registers once and unregisters cleanly', async () => {
    expect(await background.registerBackgroundSync()).toBe(true);
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(background.BACKGROUND_SYNC_TASK, { minimumInterval: background.BACKGROUND_SYNC_MIN_INTERVAL_MINUTES });
    expect(await background.registerBackgroundSync()).toBe(true);
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledTimes(1);
    await background.unregisterBackgroundSync();
    expect(BackgroundTask.unregisterTaskAsync).toHaveBeenCalledWith(background.BACKGROUND_SYNC_TASK);
    expect(await TaskManager.isTaskRegisteredAsync(background.BACKGROUND_SYNC_TASK)).toBe(false);
  });

  it('stays off when the platform restricts background tasks', async () => {
    mockTaskState.available = false;
    expect(await background.registerBackgroundSync()).toBe(false);
    expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
  });
});
