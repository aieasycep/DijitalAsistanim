import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
import { Linking } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { DataSource } from '@da/api-client';
import {
  makeSettingsDataSource,
  renderSettings,
  seedSession,
} from '@/features/settings/testing/settingsTestUtils';
import * as notifications from '@/services/notifications';
import { useUiStore } from '@/store/ui';
import NotificationSettingsScreen from '../../../../app/settings/notifications';

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
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  const Picker = ({
    onChange,
    testID,
  }: {
    onChange: (event: { type: string }, date?: Date) => void;
    testID?: string;
  }) =>
    React.createElement(
      Pressable,
      { testID, onPress: () => onChange({ type: 'set' }, new Date(2026, 0, 1, 23, 0)) },
      React.createElement(Text, null, 'picker'),
    );
  return {
    __esModule: true,
    default: Picker,
    DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
  };
});
jest.mock('@/services/notifications', () => ({
  getPermissionStatus: jest.fn(async () => 'granted'),
  requestPermission: jest.fn(async () => 'granted'),
  registerPushToken: jest.fn(async () => ({ status: 'skipped', reason: 'permission' })),
  unregisterPushToken: jest.fn(async () => undefined),
  cancelAllLocalNotifications: jest.fn(async () => undefined),
  cacheNotificationPreferences: jest.fn(),
  getCachedNotificationPreferences: jest.fn(() => null),
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
  usePathname: () => '/settings/notifications',
}));

let mockDs: DataSource;
jest.mock('@/hooks/useDataSource', () => ({ useDataSource: () => mockDs }));

const getPermissionStatus = jest.mocked(notifications.getPermissionStatus);
const requestPermission = jest.mocked(notifications.requestPermission);

beforeEach(async () => {
  jest.clearAllMocks();
  getPermissionStatus.mockResolvedValue('granted');
  requestPermission.mockResolvedValue('granted');
  useUiStore.setState({ offline: false });
  mockDs = makeSettingsDataSource();
  await seedSession(mockDs);
});

describe('Notification settings screen', () => {
  it('loads categories, toggles one (full record) and mirrors the OS permission state', async () => {
    getPermissionStatus.mockResolvedValue('denied');
    const spy = jest.spyOn(mockDs.profile, 'updateNotificationPreferences');
    renderSettings(<NotificationSettingsScreen />);

    expect(await screen.findByTestId('nset-meeting')).toBeTruthy();
    expect(await screen.findByText('Sistem bildirimleri kapalı.')).toBeTruthy();
    expect(screen.getByTestId('nset-quiet-start')).toBeTruthy();
    expect(screen.getByTestId('nset-lock')).toBeTruthy();

    fireEvent.press(screen.getByTestId('nset-meeting'));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        categories: expect.objectContaining({ meeting: false, morning: true, reminder: true }),
      }),
    );
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ systemPermissionGranted: false }));
    expect(notifications.cacheNotificationPreferences).toHaveBeenCalled();
  });

  it('opens the system settings from the permission row when denied', async () => {
    getPermissionStatus.mockResolvedValue('denied');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    renderSettings(<NotificationSettingsScreen />);

    fireEvent.press(await screen.findByTestId('nset-system'));
    await waitFor(() => expect(openSettings).toHaveBeenCalled());
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('asks for permission first when it was never requested', async () => {
    getPermissionStatus.mockResolvedValue('undetermined');
    renderSettings(<NotificationSettingsScreen />);

    expect(await screen.findByText('Bildirim izni henüz istenmedi.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('nset-system'));
    await waitFor(() => expect(requestPermission).toHaveBeenCalled());
    await waitFor(() => expect(notifications.registerPushToken).toHaveBeenCalled());
    expect(await screen.findByText('Sistem bildirimleri açık.')).toBeTruthy();
  });

  it('updates only-important, lock-screen privacy, quiet hours and the meeting lead', async () => {
    const spy = jest.spyOn(mockDs.profile, 'updateNotificationPreferences');
    renderSettings(<NotificationSettingsScreen />);

    fireEvent.press(await screen.findByTestId('nset-only-important'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ onlyWhenImportant: true }));

    fireEvent.press(screen.getByText('Genel bildirim'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ lockScreenPrivacy: 'generic' }));

    fireEvent.press(screen.getByText('30'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ meetingLeadMinutes: 30 }));
    expect(await screen.findByText('30 dk önce')).toBeTruthy();

    fireEvent.press(screen.getByTestId('nset-quiet-start'));
    fireEvent.press(await screen.findByTestId('nset-quiet-start-picker'));
    fireEvent.press(screen.getByTestId('nset-quiet-start-done'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ quietHoursStart: '23:00' }));

    fireEvent.press(screen.getByTestId('nset-quiet'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ quietHoursEnabled: false }));
    await waitFor(() => expect(screen.queryByTestId('nset-quiet-start')).toBeNull());
  });

  it('shows the error state with retry when preferences cannot be loaded', async () => {
    let calls = 0;
    const original = mockDs.profile.getNotificationPreferences.bind(mockDs.profile);
    mockDs.profile.getNotificationPreferences = async () => {
      calls += 1;
      if (calls === 1) throw { code: 'internal', message: 'boom' };
      return original();
    };
    renderSettings(<NotificationSettingsScreen />);

    expect(await screen.findByTestId('nset-error')).toBeTruthy();
    fireEvent.press(screen.getByText('Tekrar dene'));
    expect(await screen.findByTestId('nset-meeting')).toBeTruthy();
  });
});
