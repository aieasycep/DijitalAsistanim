import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createDemoDataSource, type DataSource } from '@da/api-client';
import { useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';
import {
  makeInsight,
  renderWithProviders,
  setupTestI18n,
} from '@/features/today/__tests__/testUtils';
import TodayScreen from '../(tabs)/today';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});
jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View, Svg: View, Path: View };
});
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => undefined) }));
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'tr-TR' }],
  getCalendars: () => [{ timeZone: 'Europe/Istanbul' }],
}));
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(n),
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  usePathname: () => '/',
}));

let mockDs: DataSource;
jest.mock('@/hooks/useDataSource', () => ({ useDataSource: () => mockDs }));

function makeDemo(now = '2026-09-05T05:00:00Z'): DataSource {
  return createDemoDataSource(
    {
      mode: 'demo',
      appScheme: 'dijitalasistan',
      webUrl: 'https://dijitalasistan.app',
      now: () => new Date(now),
      timezone: 'Europe/Istanbul',
      locale: 'tr',
      isProduction: false,
    },
    { timeScale: 0 },
  );
}

async function seedSession(source: DataSource): Promise<void> {
  const [profile, preferences] = await Promise.all([
    source.profile.getProfile(),
    source.profile.getPreferences(),
  ]);
  const store = useSessionStore.getState();
  store.setSession({
    user: { id: profile.id, provider: 'demo' },
    accessToken: 'demo',
    expiresAt: '2099-01-01T00:00:00.000Z',
  });
  store.setProfile(profile);
  store.setPreferences(preferences);
}

beforeAll(() => setupTestI18n());

beforeEach(async () => {
  jest.clearAllMocks();
  useUiStore.setState({ offline: false });
  mockDs = makeDemo();
  await seedSession(mockDs);
});

describe('Today screen', () => {
  it('renders the greeting, hero briefing and up to five priorities from the feed', async () => {
    renderWithProviders(<TodayScreen />);

    expect(await screen.findByText('Günaydın, Yunus')).toBeTruthy();
    expect(screen.getByTestId('today-screen')).toBeTruthy();
    expect(await screen.findByTestId('today-hero-cta')).toBeTruthy();
    expect(screen.getByTestId('today-hero-listen')).toBeTruthy();
    const cards = await screen.findAllByTestId(/^priority-card-/);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(5);
    expect(screen.getByText('ÖNCELİKLERİN')).toBeTruthy();
    expect(screen.getByTestId('today-avatar')).toBeTruthy();
    expect(screen.getByTestId('today-search')).toBeTruthy();
    expect(screen.getByTestId('today-capture')).toBeTruthy();
  });

  it('opens the morning briefing from the hero CTA', async () => {
    renderWithProviders(<TodayScreen />);
    fireEvent.press(await screen.findByTestId('today-hero-cta'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/briefing/[kind]',
          params: expect.objectContaining({ kind: 'morning' }),
        }),
      ),
    );
  });

  it('shows the connect empty state when no account is connected', async () => {
    mockDs = { ...mockDs, accounts: { ...mockDs.accounts, listAccounts: async () => [] } };
    renderWithProviders(<TodayScreen />);

    expect(await screen.findByTestId('today-empty')).toBeTruthy();
    expect(
      screen.getByText('Mailini bağlayarak önemli konuları burada görebilirsin.'),
    ).toBeTruthy();
    fireEvent.press(screen.getByText('Hesap Bağla'));
    expect(mockPush).toHaveBeenCalledWith('/settings/integrations');
  });

  it('shows the calm empty state when the feed has nothing to show', async () => {
    const feed = await mockDs.feed.getToday();
    mockDs = {
      ...mockDs,
      feed: {
        ...mockDs.feed,
        getToday: async () => ({
          ...feed,
          priorities: [],
          meetings: [],
          deadlines: [],
          lifeEvents: [],
        }),
      },
    };
    renderWithProviders(<TodayScreen />);

    expect(await screen.findByTestId('today-empty')).toBeTruthy();
    expect(screen.getByText('Her şey kontrol altında.')).toBeTruthy();
  });

  it('shows an error state with retry when the feed fails', async () => {
    let calls = 0;
    const feed = await mockDs.feed.getToday();
    mockDs = {
      ...mockDs,
      feed: {
        ...mockDs.feed,
        getToday: async () => {
          calls += 1;
          if (calls === 1) throw { code: 'internal', message: 'boom' };
          return { ...feed, priorities: [makeInsight({ id: 'after-retry' })] };
        },
      },
    };
    renderWithProviders(<TodayScreen />);

    expect(await screen.findByTestId('today-error')).toBeTruthy();
    fireEvent.press(screen.getByText('Tekrar dene'));
    expect(await screen.findByTestId('priority-card-after-retry')).toBeTruthy();
  });

  it('opens the card menu from "···" and shows the reason', async () => {
    renderWithProviders(<TodayScreen />);
    const more = await screen.findAllByLabelText('Diğer seçenekler');
    fireEvent.press(more[0] as NonNullable<(typeof more)[number]>);
    fireEvent.press(await screen.findByTestId('insight-menu-why'));
    expect(await screen.findByText('Neden önemli?')).toBeTruthy();
  });

  it('renders the offline banner when the device is offline', async () => {
    useUiStore.setState({ offline: true });
    renderWithProviders(<TodayScreen />);
    expect(await screen.findByTestId('today-offline')).toBeTruthy();
  });
});
