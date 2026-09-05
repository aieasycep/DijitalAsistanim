import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { DataSource } from '@da/api-client';
import {
  makeSettingsDataSource,
  renderSettings,
  seedSession,
} from '@/features/settings/testing/settingsTestUtils';
import { openExternal } from '@/lib/openExternal';
import { useUiStore } from '@/store/ui';
import HelpScreen from '../../../../app/settings/help';

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
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'tr-TR' }],
  getCalendars: () => [{ timeZone: 'Europe/Istanbul' }],
}));
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(n),
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.2.3',
  nativeBuildVersion: '45',
  applicationId: 'com.dijitalasistan.app',
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), resetAnalytics: jest.fn() }));
jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));
jest.mock('@/lib/i18n', () => ({
  formatCtx: (overrides: Record<string, unknown> = {}) => ({
    locale: 'tr',
    timezone: 'Europe/Istanbul',
    ...overrides,
  }),
  setupI18n: jest.fn(),
  changeLocale: jest.fn(),
}));
jest.mock('@/lib/openExternal', () => ({ openExternal: jest.fn(async () => true) }));
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
  usePathname: () => '/settings/help',
}));

let mockDs: DataSource;
jest.mock('@/hooks/useDataSource', () => ({ useDataSource: () => mockDs }));

const openExternalMock = jest.mocked(openExternal);

beforeEach(async () => {
  jest.clearAllMocks();
  openExternalMock.mockResolvedValue(true);
  useUiStore.setState({ offline: false });
  mockDs = makeSettingsDataSource();
  await seedSession(mockDs);
});

describe('Help screen', () => {
  it('renders the FAQ from i18n and expands / collapses an item', async () => {
    renderSettings(<HelpScreen />);

    const rows = await screen.findAllByTestId(/^help-faq-\d+$/);
    expect(rows.length).toBe(5);
    expect(screen.queryByText(/Yalnızca sen ve senin adına/)).toBeNull();

    fireEvent.press(screen.getByTestId('help-faq-0'));
    expect(await screen.findByText(/Yalnızca sen ve senin adına/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('help-faq-1'));
    expect(await screen.findByText(/Onay Merkezi'ne düşer/)).toBeTruthy();
    expect(screen.queryByText(/Yalnızca sen ve senin adına/)).toBeNull();
    fireEvent.press(screen.getByTestId('help-faq-1'));
    await waitFor(() => expect(screen.queryByText(/Onay Merkezi'ne düşer/)).toBeNull());
  });

  it('opens the support mail and the web pages', async () => {
    renderSettings(<HelpScreen />);

    fireEvent.press(await screen.findByTestId('help-contact'));
    await waitFor(() =>
      expect(openExternalMock).toHaveBeenCalledWith(
        expect.stringMatching(/^mailto:destek@dijitalasistan\.app\?subject=/),
      ),
    );
    expect(openExternalMock.mock.calls[0]?.[0]).toContain(encodeURIComponent('1.2.3 (45)'));

    fireEvent.press(screen.getByTestId('help-docs'));
    await waitFor(() =>
      expect(openExternalMock).toHaveBeenCalledWith('https://dijitalasistan.app/help'),
    );
    fireEvent.press(screen.getByTestId('help-status'));
    await waitFor(() =>
      expect(openExternalMock).toHaveBeenCalledWith('https://dijitalasistan.app/status'),
    );
    fireEvent.press(screen.getByTestId('help-privacy'));
    await waitFor(() =>
      expect(openExternalMock).toHaveBeenCalledWith('https://dijitalasistan.app/privacy'),
    );
    expect(screen.getByText('Sürüm 1.2.3 (45)')).toBeTruthy();
  });

  it('shows a toast when a link cannot be opened', async () => {
    openExternalMock.mockResolvedValue(false);
    renderSettings(<HelpScreen />);
    fireEvent.press(await screen.findByTestId('help-terms'));
    expect(await screen.findByText('Bağlantı açılamadı.')).toBeTruthy();
  });
});
