import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/lib/monitoring', () => ({
  captureError: jest.fn(),
  setupMonitoring: jest.fn(),
  wrapWithMonitoring: (c: unknown) => c,
}));
jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
  trackScreen: jest.fn(),
  resetAnalytics: jest.fn(),
}));
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
  mapsUrl: (q: string) => `maps://?q=${encodeURIComponent(q)}`,
  telUrl: (p: string) => `tel:${p}`,
}));
jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: () => require('@/features/flow/testing/demoSource').getTestDataSource(),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  usePathname: () => '/reminders',
  useFocusEffect: jest.fn(),
}));

import { QueryClient, onlineManager } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { ClientApiError } from '@da/api-client';
import RemindersScreen from '../reminders';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';
import { clear as clearOfflineQueue, resetOfflineQueueForTests, size } from '@/lib/offlineQueue';

const FIND_OPTS = { timeout: 5000 };
const TITLE = "Ahmet'e revize teklif";

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      // Mirrors the app's queryClient: mutations run immediately so runOrQueue can persist them offline.
      mutations: { retry: false, gcTime: 0, networkMode: 'always' },
    },
  });
}

describe('Reminders screen', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    onlineManager.setOnline(true);
    resetOfflineQueueForTests(() => new Date('2026-09-05T06:41:00Z'));
  });

  afterEach(() => {
    clearOfflineQueue();
    onlineManager.setOnline(true);
  });

  it('lists the scheduled reminder with its time, option and reason', async () => {
    const screen = renderWithProviders(<RemindersScreen />, { queryClient: makeClient() });
    expect(screen.getByTestId('reminders-screen')).toBeTruthy();
    expect(await screen.findByText(TITLE, {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByText("Bugün 17:00'ye kadar")).toBeTruthy();
    expect(screen.getByText(/12:10 · Uygun zamanda/)).toBeTruthy();
    expect(screen.getByText('Takviminde 12:10 boş; toplantından önce.')).toBeTruthy();
    expect(screen.getByText('1 planlı hatırlatıcı')).toBeTruthy();
    expect(screen.getByTestId('reminder-item-0')).toBeTruthy();
  });

  it('completes a reminder and shows the calm empty state afterwards', async () => {
    const ds = getTestDataSource();
    const screen = renderWithProviders(<RemindersScreen />, { queryClient: makeClient() });
    await screen.findByText(TITLE, {}, FIND_OPTS);
    const [reminder] = await ds.reminders.listReminders({ status: 'scheduled' });
    fireEvent.press(screen.getByTestId(`reminder-complete-${reminder?.id}`));
    expect(await screen.findByText('Hatırlatıcı tamamlandı', {}, FIND_OPTS)).toBeTruthy();
    expect(await screen.findByTestId('reminders-empty', {}, FIND_OPTS)).toBeTruthy();
    const completed = await ds.reminders.listReminders({ status: 'completed' });
    expect(completed.map((r) => r.id)).toContain(reminder?.id);
    expect(size()).toBe(0);
  });

  it('cancels a reminder through the data source when online', async () => {
    const ds = getTestDataSource();
    const screen = renderWithProviders(<RemindersScreen />, { queryClient: makeClient() });
    await screen.findByText(TITLE, {}, FIND_OPTS);
    const [reminder] = await ds.reminders.listReminders({ status: 'scheduled' });
    fireEvent.press(screen.getByTestId(`reminder-cancel-${reminder?.id}`));
    expect(await screen.findByText('Hatırlatıcı iptal edildi', {}, FIND_OPTS)).toBeTruthy();
    await waitFor(async () =>
      expect((await ds.reminders.listReminders({ status: 'cancelled' })).length).toBe(1),
    );
  });

  it('queues the cancellation while offline and keeps the optimistic list', async () => {
    const ds = getTestDataSource();
    const screen = renderWithProviders(<RemindersScreen />, { queryClient: makeClient() });
    await screen.findByText(TITLE, {}, FIND_OPTS);
    const [reminder] = await ds.reminders.listReminders({ status: 'scheduled' });
    onlineManager.setOnline(false);
    fireEvent.press(screen.getByTestId(`reminder-cancel-${reminder?.id}`));
    expect(await screen.findByText('Bağlantı gelince gönderilecek.', {}, FIND_OPTS)).toBeTruthy();
    expect(await screen.findByTestId('reminders-empty', {}, FIND_OPTS)).toBeTruthy();
    expect(size()).toBe(1);
    // Nothing reached the data source yet — the queue replays it on reconnect.
    expect((await ds.reminders.listReminders({ status: 'scheduled' })).length).toBe(1);
  });

  it('opens the source mail from the source line', async () => {
    const ds = getTestDataSource();
    const screen = renderWithProviders(<RemindersScreen />, { queryClient: makeClient() });
    await screen.findByText(TITLE, {}, FIND_OPTS);
    const [reminder] = await ds.reminders.listReminders({ status: 'scheduled' });
    fireEvent.press(screen.getByLabelText(/Kaynağı Gör/));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/email/[id]',
      params: { id: reminder?.source?.id },
    });
  });

  it('shows the error state and recovers on retry', async () => {
    const ds = getTestDataSource();
    const spy = jest
      .spyOn(ds.reminders, 'listReminders')
      .mockRejectedValueOnce(new ClientApiError({ code: 'internal', message: 'boom' }));
    const screen = renderWithProviders(<RemindersScreen />, { queryClient: makeClient() });
    const retry = await screen.findByText('Tekrar dene', {}, FIND_OPTS);
    fireEvent.press(retry);
    expect(await screen.findByText(TITLE, {}, FIND_OPTS)).toBeTruthy();
    spy.mockRestore();
  });
});
