import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { DataSource } from '@da/api-client';
import {
  makeSettingsDataSource,
  renderSettings,
  seedSession,
} from '@/features/settings/testing/settingsTestUtils';
import * as i18nLib from '@/lib/i18n';
import { useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';
import LanguageScreen from '../../../../app/settings/language';

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
  usePathname: () => '/settings/language',
}));

let mockDs: DataSource;
jest.mock('@/hooks/useDataSource', () => ({ useDataSource: () => mockDs }));

beforeEach(async () => {
  jest.clearAllMocks();
  useUiStore.setState({ offline: false });
  mockDs = makeSettingsDataSource();
  await seedSession(mockDs);
});

describe('Language screen', () => {
  it('switches to English: i18next + preferences + session store', async () => {
    const spy = jest.spyOn(mockDs.profile, 'updatePreferences');
    renderSettings(<LanguageScreen />);

    expect(await screen.findByTestId('language-tr')).toBeTruthy();
    fireEvent.press(screen.getByTestId('language-en'));

    await waitFor(() => expect(spy).toHaveBeenCalledWith({ locale: 'en' }));
    expect(jest.mocked(i18nLib.changeLocale)).toHaveBeenCalledWith('en');
    await waitFor(() => expect(useSessionStore.getState().preferences?.locale).toBe('en'));
    expect(await screen.findByText('Dil değiştirildi')).toBeTruthy();
  });

  it('ignores re-selecting the current language', async () => {
    const spy = jest.spyOn(mockDs.profile, 'updatePreferences');
    renderSettings(<LanguageScreen />);
    fireEvent.press(await screen.findByTestId('language-tr'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spy).not.toHaveBeenCalled();
    expect(jest.mocked(i18nLib.changeLocale)).not.toHaveBeenCalled();
  });

  it('restores the previous language when saving fails', async () => {
    mockDs.profile.updatePreferences = async () => {
      throw { code: 'offline', message: 'offline' };
    };
    renderSettings(<LanguageScreen />);
    fireEvent.press(await screen.findByTestId('language-en'));
    expect(await screen.findByText('Çevrimdışısın.')).toBeTruthy();
    await waitFor(() => expect(jest.mocked(i18nLib.changeLocale)).toHaveBeenLastCalledWith('tr'));
    expect(useSessionStore.getState().preferences?.locale).toBe('tr');
  });
});
