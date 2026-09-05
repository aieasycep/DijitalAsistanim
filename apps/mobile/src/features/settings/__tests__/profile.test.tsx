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
import ProfileScreen from '../../../../app/settings/profile';

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
  usePathname: () => '/settings/profile',
}));

let mockDs: DataSource;
jest.mock('@/hooks/useDataSource', () => ({ useDataSource: () => mockDs }));

beforeEach(async () => {
  jest.clearAllMocks();
  useUiStore.setState({ offline: false });
  mockDs = makeSettingsDataSource();
  await seedSession(mockDs);
});

describe('Profile screen', () => {
  it('shows the identity, disables save until dirty, and saves a new name', async () => {
    const spy = jest.spyOn(mockDs.profile, 'updateProfile');
    renderSettings(<ProfileScreen />);

    expect(await screen.findByText('Yunus Emre')).toBeTruthy();
    expect(screen.getByText('Google ile giriş yapıldı')).toBeTruthy();
    expect(screen.getByText('yunus@example.com')).toBeTruthy();
    expect(screen.getByText('Istanbul · GMT+3')).toBeTruthy();
    expect(screen.getByTestId('profile-save').props.accessibilityState?.disabled).toBe(true);

    fireEvent.changeText(screen.getByLabelText('Ad'), 'Ayşe Demir');
    await waitFor(() =>
      expect(screen.getByTestId('profile-save').props.accessibilityState?.disabled).toBe(false),
    );
    fireEvent.press(screen.getByTestId('profile-save'));

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ displayName: 'Ayşe Demir', firstName: 'Ayşe' }),
    );
    expect(await screen.findByText('Profil güncellendi')).toBeTruthy();
    expect(useSessionStore.getState().profile?.displayName).toBe('Ayşe Demir');
    expect(useSessionStore.getState().profile?.firstName).toBe('Ayşe');
  });

  it('blocks saving an empty name', async () => {
    const spy = jest.spyOn(mockDs.profile, 'updateProfile');
    renderSettings(<ProfileScreen />);

    fireEvent.changeText(await screen.findByLabelText('Ad'), '   ');
    expect(await screen.findByText('Ad boş olamaz.')).toBeTruthy();
    expect(screen.getByTestId('profile-save').props.accessibilityState?.disabled).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('changes the time zone from the searchable sheet and syncs preferences', async () => {
    const spy = jest.spyOn(mockDs.profile, 'updateProfile');
    renderSettings(<ProfileScreen />);

    fireEvent.press(await screen.findByTestId('profile-timezone'));
    fireEvent.changeText(await screen.findByLabelText('Şehir veya bölge ara'), 'London');
    fireEvent.press(await screen.findByTestId('profile-tz-option-Europe/London'));
    expect(await screen.findByText(/London · GMT/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ timezone: 'Europe/London' }));
    await waitFor(() => expect(useSessionStore.getState().profile?.timezone).toBe('Europe/London'));
    expect(useSessionStore.getState().preferences?.timezone).toBe('Europe/London');
  });

  it('shows an error toast when saving fails', async () => {
    mockDs.profile.updateProfile = async () => {
      throw { code: 'offline', message: 'offline' };
    };
    renderSettings(<ProfileScreen />);
    fireEvent.changeText(await screen.findByLabelText('Ad'), 'Deniz');
    fireEvent.press(screen.getByTestId('profile-save'));
    expect(await screen.findByText('Çevrimdışısın.')).toBeTruthy();
    expect(useSessionStore.getState().profile?.displayName).toBe('Yunus Emre');
  });
});
