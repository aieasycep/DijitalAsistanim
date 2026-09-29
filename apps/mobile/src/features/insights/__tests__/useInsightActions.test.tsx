import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
import type { PropsWithChildren } from 'react';
import { act, renderHook, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { ClientApiError, qk, type DataSource } from '@da/api-client';
import type { InsightAction, TodayFeed } from '@da/domain';
import { Providers, makeInsight, setupTestI18n } from '@/features/today/__tests__/testUtils';
import { list, resetOfflineQueueForTests } from '@/lib/offlineQueue';
import { useInsightActions } from '../useInsightActions';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});
jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View, Svg: View, Path: View };
});
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));
jest.mock('@/lib/i18n', () => ({
  formatCtx: (overrides: Record<string, unknown> = {}) => ({
    locale: 'tr',
    timezone: 'Europe/Istanbul',
    now: new Date('2026-09-05T06:41:00Z'),
    ...overrides,
  }),
  setupI18n: jest.fn(),
  changeLocale: jest.fn(),
}));
jest.mock('@/lib/openExternal', () => ({
  openExternal: jest.fn(async () => true),
  providerMailUrl: (webUrl: string | null | undefined) => webUrl ?? '',
}));
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
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  usePathname: () => '/',
}));

const mockSnoozeInsight = jest.fn(async (): Promise<unknown> => ({}));
const mockResolveInsight = jest.fn(async (): Promise<unknown> => ({}));
const mockCreateApproval = jest.fn(async (): Promise<unknown> => ({ id: 'a-1' }));
jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: (): Partial<DataSource> =>
    ({
      mode: 'demo',
      feed: {
        snoozeInsight: mockSnoozeInsight,
        resolveInsight: mockResolveInsight,
        sendFeedback: jest.fn(async () => undefined),
      },
      approvals: {
        pendingCount: jest.fn(async () => 0),
        createApproval: mockCreateApproval,
        decideApproval: jest.fn(),
        retryApproval: jest.fn(),
      },
      billing: {
        getEntitlement: jest.fn(async () => ({
          plan: 'pro',
          isPro: true,
          source: 'demo',
          isTrial: false,
          quotas: {},
          usage: {},
        })),
      },
    }) as unknown as DataSource,
}));

const QUEUED_COPY = 'Bağlantı gelince gönderilecek.';
const CREATE_TASK: InsightAction = {
  id: 'create_task',
  label: 'Görev oluştur',
  kind: 'create_task',
  primary: false,
};

function makeClient(): QueryClient {
  // `always`: the real onlineManager is flipped offline in some tests and mutations must still run.
  // Queries never GC (seeded feed data must survive without observers); mutations GC at once so no
  // 5-minute timer keeps Jest alive.
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, networkMode: 'always' },
      mutations: { retry: 0, gcTime: 0, networkMode: 'always' },
    },
  });
}

function renderActions(client: QueryClient) {
  const wrapper = ({ children }: PropsWithChildren) => (
    <Providers client={client}>{children}</Providers>
  );
  return renderHook(() => useInsightActions(), { wrapper });
}

function todayFeed(priorities: TodayFeed['priorities']): TodayFeed {
  return {
    greeting: 'Günaydın',
    dateLabel: '5 Eylül',
    briefing: null,
    priorities,
    meetings: [],
    deadlines: [],
    lifeEvents: [],
    pendingApprovals: 0,
    isEvening: false,
    offline: false,
  };
}

beforeAll(() => setupTestI18n());

beforeEach(() => {
  jest.clearAllMocks();
  mockMemory.clear();
  onlineManager.setOnline(true);
  resetOfflineQueueForTests(() => new Date('2026-09-05T06:41:00Z'));
});

afterAll(() => onlineManager.setOnline(true));

describe('useInsightActions', () => {
  it('snoozes until tomorrow 09:00 in the user’s timezone and toasts only once the server answers', async () => {
    let finish: (value: unknown) => void = () => undefined;
    mockSnoozeInsight.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderActions(makeClient());

    act(() => result.current.snoozeUntilTomorrow(makeInsight({ id: 'ins-snooze' })));
    // 09:00 Europe/Istanbul (UTC+3) on 6 September — not the device clock.
    await waitFor(() =>
      expect(mockSnoozeInsight).toHaveBeenCalledWith('ins-snooze', '2026-09-06T06:00:00.000Z'),
    );
    expect(screen.queryByText('YARINA KALANLAR')).toBeNull();

    await act(async () => {
      finish({});
    });
    expect(await screen.findByText('YARINA KALANLAR')).toBeTruthy();
  });

  it('shows the error copy when the snooze is rejected', async () => {
    mockSnoozeInsight.mockRejectedValueOnce(
      new ClientApiError({ code: 'validation', message: 'Geçersiz tarih' }),
    );
    const { result } = renderActions(makeClient());
    act(() => result.current.snoozeUntilTomorrow(makeInsight({ id: 'ins-fail' })));
    expect(await screen.findByText('Geçersiz tarih')).toBeTruthy();
    expect(screen.queryByText('YARINA KALANLAR')).toBeNull();
  });

  it('offline: queues the snooze, drops the card from the cached feed and shows the queued toast', async () => {
    onlineManager.setOnline(false);
    const client = makeClient();
    const insight = makeInsight({ id: 'ins-offline' });
    client.setQueryData<TodayFeed>(
      qk.today(),
      todayFeed([insight, makeInsight({ id: 'ins-keep' })]),
    );
    const { result } = renderActions(client);

    act(() => result.current.snoozeUntilTomorrow(insight));

    expect(await screen.findByText(QUEUED_COPY)).toBeTruthy();
    expect(mockSnoozeInsight).not.toHaveBeenCalled();
    expect(list()).toHaveLength(1);
    expect(list()[0]?.mutation).toEqual({
      kind: 'insight_snooze',
      insightId: 'ins-offline',
      until: '2026-09-06T06:00:00.000Z',
    });
    expect(client.getQueryData<TodayFeed>(qk.today())?.priorities.map((i) => i.id)).toEqual([
      'ins-keep',
    ]);
    expect(JSON.parse(mockMemory.get('offline.pending.v1') ?? '[]')).toHaveLength(1);
  });

  it('offline: a proposal is queued under its idempotency key instead of opening an approval card', async () => {
    onlineManager.setOnline(false);
    const { result } = renderActions(makeClient());

    let handled: boolean | undefined;
    await act(async () => {
      handled = await result.current.runAction(makeInsight({ id: 'ins-task' }), CREATE_TASK);
    });

    expect(handled).toBe(false);
    expect(mockCreateApproval).not.toHaveBeenCalled();
    expect(list()).toHaveLength(1);
    expect(list()[0]?.mutation).toMatchObject({
      kind: 'approval_create',
      request: { type: 'task_create', insightId: 'ins-task' },
    });
    expect(list()[0]?.idempotencyKey).toMatch(/^approval_create:client-/);
    expect(await screen.findByText(QUEUED_COPY)).toBeTruthy();
  });

  it('online: dismiss resolves with feedback and shows the learning toast', async () => {
    const { result } = renderActions(makeClient());
    act(() => result.current.dismiss(makeInsight({ id: 'ins-dismiss' })));
    await waitFor(() =>
      expect(mockResolveInsight).toHaveBeenCalledWith('ins-dismiss', 'dismissed', 'not_important'),
    );
    expect(await screen.findByText('Öğrendim · Bunu daha az göstereceğim')).toBeTruthy();
    expect(list()).toHaveLength(0);
  });
});
