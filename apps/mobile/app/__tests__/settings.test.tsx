import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
import { Platform } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { DataSource } from '@da/api-client';
import {
  makeSettingsDataSource,
  PRO_ENTITLEMENT,
  renderSettings,
  seedSession,
  withEntitlement,
} from '@/features/settings/testing/settingsTestUtils';
import * as notifications from '@/services/notifications';
import { useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';
import SettingsIndexScreen from '../settings/index';

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
jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
  resetAnalytics: jest.fn(),
  identifyUser: jest.fn(),
  trackScreen: jest.fn(),
}));
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
jest.mock('@/services/notifications', () => ({
  getPermissionStatus: jest.fn(async () => 'granted'),
  requestPermission: jest.fn(async () => 'granted'),
  registerPushToken: jest.fn(async () => ({ status: 'skipped', reason: 'permission' })),
  unregisterPushToken: jest.fn(async () => undefined),
  cancelAllLocalNotifications: jest.fn(async () => undefined),
  cacheNotificationPreferences: jest.fn(),
  getCachedNotificationPreferences: jest.fn(() => null),
}));
jest.mock('@/services/purchases', () => ({
  resetPurchasesUser: jest.fn(async () => undefined),
  restorePro: jest.fn(async () => ({ outcome: 'nothing', customerInfo: null })),
  openManageSubscriptions: jest.fn(async () => true),
  isPurchasesAvailable: () => false,
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
  usePathname: () => '/settings',
}));

let mockDs: DataSource;
jest.mock('@/hooks/useDataSource', () => ({ useDataSource: () => mockDs }));

const ROW_KEYS = [
  'profile',
  'briefing',
  'notifications',
  'priority-rules',
  'vip',
  'ai-personalization',
  'subscription',
  'integrations',
  'data-sources',
  'privacy',
  'referral',
  'appearance',
  'language',
  'help',
  'feedback',
];

beforeEach(async () => {
  jest.clearAllMocks();
  useUiStore.setState({ offline: false, pendingApprovals: 0 });
  mockDs = makeSettingsDataSource();
  await seedSession(mockDs);
});

describe('Settings index', () => {
  it('renders the hub: profile card, grouped rows, plan value and app version', async () => {
    mockDs = withEntitlement(mockDs, PRO_ENTITLEMENT);
    renderSettings(<SettingsIndexScreen />);

    expect(await screen.findByText('Ayarlar')).toBeTruthy();
    for (const key of ROW_KEYS) expect(screen.getByTestId(`settings-row-${key}`)).toBeTruthy();
    expect(screen.queryByTestId('settings-row-android-notifications')).toBeNull();
    expect(screen.getByText('Yunus Emre')).toBeTruthy();
    expect(await screen.findByText('Pro aktif')).toBeTruthy();
    expect(await screen.findByText('08:00 · 13:00 · 19:00')).toBeTruthy();
    expect(screen.getByText(/1\.2\.3 \(45\)/)).toBeTruthy();
    expect(screen.getByTestId('settings-signout')).toBeTruthy();
  });

  it('shows the phone-notifications row only on Android', async () => {
    const original = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true, writable: true });
    try {
      renderSettings(<SettingsIndexScreen />);
      expect(await screen.findByTestId('settings-row-android-notifications')).toBeTruthy();
    } finally {
      if (original) Object.defineProperty(Platform, 'OS', original);
    }
  });

  it('shows the free plan value for a Free user', async () => {
    renderSettings(<SettingsIndexScreen />);
    expect(await screen.findByText('Ücretsiz plan')).toBeTruthy();
    expect(screen.queryByText('Pro aktif')).toBeNull();
  });

  it('navigates to the section screens and the approval centre', async () => {
    renderSettings(<SettingsIndexScreen />);
    fireEvent.press(await screen.findByTestId('settings-row-appearance'));
    expect(mockPush).toHaveBeenCalledWith('/settings/appearance');
    fireEvent.press(screen.getByTestId('settings-row-subscription'));
    expect(mockPush).toHaveBeenCalledWith('/settings/subscription');
    fireEvent.press(screen.getByTestId('settings-row-profile'));
    expect(mockPush).toHaveBeenCalledWith('/settings/profile');
    fireEvent.press(screen.getByTestId('settings-row-referral'));
    expect(mockPush).toHaveBeenCalledWith('/referral');
    fireEvent.press(screen.getByTestId('settings-row-approvals'));
    expect(mockPush).toHaveBeenCalledWith('/approvals');
  });

  it('signs out after confirmation: ends the session, clears local state and the store', async () => {
    const signOut = jest.spyOn(mockDs.auth, 'signOut');
    const clearLocal = jest.spyOn(mockDs, 'clearLocalState');
    renderSettings(<SettingsIndexScreen />);

    fireEvent.press(await screen.findByTestId('settings-signout'));
    expect(await screen.findByText('Çıkış yapılsın mı?')).toBeTruthy();
    const confirmButtons = screen.getAllByText('Çıkış Yap');
    const confirm = confirmButtons[confirmButtons.length - 1];
    if (!confirm) throw new Error('confirm button not found');
    fireEvent.press(confirm);

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(clearLocal).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useSessionStore.getState().status).toBe('signedOut'));
    expect(useSessionStore.getState().profile).toBeNull();
    expect(useSessionStore.getState().preferences).toBeNull();
    expect(notifications.unregisterPushToken).toHaveBeenCalled();
    expect(notifications.cancelAllLocalNotifications).toHaveBeenCalled();
  });

  it('keeps the session when sign-out fails and shows an error toast', async () => {
    mockDs = {
      ...mockDs,
      auth: {
        ...mockDs.auth,
        signOut: async () => {
          throw { code: 'internal', message: 'boom' };
        },
      },
    };
    renderSettings(<SettingsIndexScreen />);
    fireEvent.press(await screen.findByTestId('settings-signout'));
    const confirmButtons = await screen.findAllByText('Çıkış Yap');
    const confirm = confirmButtons[confirmButtons.length - 1];
    if (!confirm) throw new Error('confirm button not found');
    fireEvent.press(confirm);

    expect(await screen.findByText('Bir şeyler ters gitti.')).toBeTruthy();
    expect(useSessionStore.getState().status).toBe('signedIn');
  });
});
