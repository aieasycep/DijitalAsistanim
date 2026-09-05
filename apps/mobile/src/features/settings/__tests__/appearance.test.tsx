import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { DataSource } from '@da/api-client';
import {
  makeSettingsDataSource,
  renderSettings,
  seedSession,
} from '@/features/settings/testing/settingsTestUtils';
import { useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';
import AppearanceScreen from '../../../../app/settings/appearance';

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
  usePathname: () => '/settings/appearance',
}));

let mockDs: DataSource;
jest.mock('@/hooks/useDataSource', () => ({ useDataSource: () => mockDs }));

beforeEach(async () => {
  jest.clearAllMocks();
  useUiStore.setState({ offline: false });
  mockDs = makeSettingsDataSource();
  await seedSession(mockDs);
});

describe('Appearance screen', () => {
  it('applies the dark theme immediately (theme-dark marker) and persists it', async () => {
    const spy = jest.spyOn(mockDs.profile, 'updatePreferences');
    renderSettings(<AppearanceScreen />);

    expect(await screen.findByTestId('theme-light')).toBeTruthy();
    fireEvent.press(screen.getByTestId('appearance-dark'));

    expect(await screen.findByTestId('theme-dark')).toBeTruthy();
    expect(useSessionStore.getState().preferences?.theme).toBe('dark');
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ theme: 'dark' }));
    expect(screen.getByText('Şu an: Koyu')).toBeTruthy();

    fireEvent.press(screen.getByTestId('appearance-light'));
    expect(await screen.findByTestId('theme-light')).toBeTruthy();
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ theme: 'light' }));

    fireEvent.press(screen.getByTestId('appearance-system'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ theme: 'system' }));
  });

  it('toggles reduced motion and haptics through preferences', async () => {
    const spy = jest.spyOn(mockDs.profile, 'updatePreferences');
    renderSettings(<AppearanceScreen />);

    fireEvent.press(await screen.findByTestId('appearance-reduced-motion'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ reducedMotion: true }));
    await waitFor(() => expect(useSessionStore.getState().preferences?.reducedMotion).toBe(true));

    fireEvent.press(screen.getByTestId('appearance-haptics'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ hapticsEnabled: false }));
    await waitFor(() => expect(useSessionStore.getState().preferences?.hapticsEnabled).toBe(false));
  });

  it('reverts the optimistic theme and shows an error when saving fails', async () => {
    mockDs.profile.updatePreferences = async () => {
      throw { code: 'internal', message: 'boom' };
    };
    renderSettings(<AppearanceScreen />);

    fireEvent.press(await screen.findByTestId('appearance-dark'));
    expect(await screen.findByText('Bir şeyler ters gitti.')).toBeTruthy();
    await waitFor(() => expect(useSessionStore.getState().preferences?.theme).toBe('system'));
    expect(await screen.findByTestId('theme-light')).toBeTruthy();
  });
});
