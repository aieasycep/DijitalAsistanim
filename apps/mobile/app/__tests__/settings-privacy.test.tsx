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
jest.mock('@/lib/i18n', () => ({
  formatCtx: (overrides: Record<string, unknown> = {}) => ({
    locale: 'tr',
    timezone: 'Europe/Istanbul',
    ...overrides,
  }),
  setupI18n: jest.fn(),
  changeLocale: jest.fn(),
}));
jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
  trackScreen: jest.fn(),
  resetAnalytics: jest.fn(),
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
jest.mock('@/services/contacts', () => ({
  requestContactsPermission: jest.fn(async () => 'granted'),
  getContactsPermission: jest.fn(async () => 'granted'),
  pickDeviceContact: jest.fn(async () => ({
    id: 'device-1',
    displayName: 'Burak Tan',
    emails: ['burak@example.com'],
    phones: [],
    company: 'Arkadaş',
  })),
  primaryEmail: (contact: { emails: string[] }) => contact.emails[0] ?? null,
  searchDeviceContacts: jest.fn(async () => []),
}));
jest.mock('@/services/handoff', () => ({
  openAppSettings: jest.fn(async () => true),
  openHandoff: jest.fn(async () => ({ ok: true, url: null })),
  detectMeetingProvider: () => 'other',
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
  usePathname: () => '/settings/privacy',
  useFocusEffect: jest.fn(),
}));

const mockAndroid = {
  supported: true,
  permissionGranted: false,
  apps: [
    {
      packageName: 'com.trendyol.app',
      appName: 'Trendyol',
      isDefaultExcluded: false,
      isMessaging: false,
    },
    {
      packageName: 'com.whatsapp',
      appName: 'WhatsApp',
      isDefaultExcluded: false,
      isMessaging: true,
    },
    { packageName: 'com.bank.app', appName: 'Banka', isDefaultExcluded: true, isMessaging: false },
  ],
  isLoadingApps: false,
  config: { scope: 'selected', allowedPackages: ['com.trendyol.app'], uploadConsent: false },
  recent: [
    {
      id: 'n1',
      packageName: 'com.trendyol.app',
      appName: 'Trendyol',
      title: 'Kargon yola çıktı',
      text: 'Teslimat yarın',
      postedAt: '2026-09-05T06:30:00Z',
      fingerprint: 'fp1',
      origin: 'device',
      hasInsight: false,
    },
  ],
  isLoadingRecent: false,
  isSaving: false,
  refresh: jest.fn(async () => true),
  openSettings: jest.fn(async () => true),
  setScope: jest.fn(async () => undefined),
  setAllowedPackages: jest.fn(async () => undefined),
  toggleApp: jest.fn(async () => undefined),
  setUploadConsent: jest.fn(async () => undefined),
  clearRecent: jest.fn(async () => undefined),
};
jest.mock('@/hooks/useAndroidNotifications', () => ({
  useAndroidNotifications: () => mockAndroid,
}));

import { Platform } from 'react-native';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { PRO_QUOTAS, type EntitlementState } from '@da/domain';
import PrivacyScreen from '../settings/privacy';
import VipScreen from '../settings/vip';
import AndroidNotificationsScreen from '../settings/android-notifications';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';

import { openExternal } from '@/lib/openExternal';
import { pickDeviceContact } from '@/services/contacts';
import { useSessionStore } from '@/store/session';

/** Mutations must not keep 5-minute GC timers alive after a test (would stall Jest's exit). */
function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}

/** Seed ids (mirror packages/api-client/src/demo/ids.ts). */
const VIP_MEHMET = '00000000-0000-4000-8000-000000002301';

const FIND_OPTS = { timeout: 5000 };
const POLL_OPTS = { timeout: 9000 };

const PRO: EntitlementState = {
  plan: 'pro',
  isPro: true,
  source: 'demo',
  isTrial: false,
  quotas: PRO_QUOTAS,
  usage: { assistantQueriesToday: 0, capturesToday: 0, emailAccounts: 1, calendarAccounts: 1 },
};

describe('Privacy centre', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    (openExternal as jest.Mock).mockClear();
    // status 'loading' keeps the entitlement query disabled so the store's PRO entitlement is used.
    useSessionStore.setState({ preferences: null, entitlement: PRO, status: 'loading' });
  });

  it('shows the assurances without an end-to-end claim and changes retention', async () => {
    const ds = getTestDataSource();
    const screen = renderWithProviders(<PrivacyScreen />, { queryClient: makeClient() });
    expect(screen.getByTestId('privacy-screen')).toBeTruthy();
    expect(screen.getByText('Veriler aktarım sırasında ve saklanırken şifrelenir.')).toBeTruthy();
    expect(screen.getByText('Verilerin reklamverenlere satılmaz.')).toBeTruthy();
    expect(screen.queryByText(/uçtan uca şifre/i)).toBeNull();
    const row = await screen.findByTestId('retention-30d', {}, FIND_OPTS);
    await waitFor(() => expect(row.props.accessibilityState?.disabled).toBe(false));
    fireEvent.press(screen.getByTestId('retention-30d'));
    await waitFor(async () => expect((await ds.profile.getPreferences()).retention).toBe('30d'));
    expect(useSessionStore.getState().preferences?.retention).toBe('30d');
    await screen.findByTestId('privacy-audit-0', {}, FIND_OPTS);
    expect(screen.getByText('Eşitleme çalıştı')).toBeTruthy();
    fireEvent.press(screen.getByTestId('privacy-row-dataSources'));
    expect(mockPush).toHaveBeenCalledWith('/settings/data-sources');
  });

  it('requests an export, polls until ready and opens the download link', async () => {
    const ds = getTestDataSource();
    const request = jest.spyOn(ds.privacy, 'requestExport');
    const screen = renderWithProviders(<PrivacyScreen />, { queryClient: makeClient() });
    const start = await screen.findByTestId('privacy-export-start', {}, FIND_OPTS);
    await waitFor(() => expect(start.props.accessibilityState?.disabled).toBe(false));
    fireEvent.press(screen.getByTestId('privacy-export-start'));
    await waitFor(() => expect(request).toHaveBeenCalled());
    const download = await screen.findByTestId('privacy-export-download', {}, POLL_OPTS);
    fireEvent.press(download);
    await waitFor(() =>
      expect(openExternal).toHaveBeenCalledWith(expect.stringContaining('demo-export.json')),
    );
  }, 15000);

  it('deletes the analysis history only from the confirmation sheet', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.privacy, 'deleteHistory');
    const screen = renderWithProviders(<PrivacyScreen />, { queryClient: makeClient() });
    fireEvent.press(await screen.findByTestId('privacy-delete-history', {}, FIND_OPTS));
    expect(spy).not.toHaveBeenCalled();
    const confirm = await screen.findByTestId('privacy-delete-history-confirm', {}, FIND_OPTS);
    fireEvent.press(confirm);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    await screen.findByText(/Analiz geçmişi silindi/, {}, FIND_OPTS);
  });

  it('deletes the account only after typing SİL, then wipes local state', async () => {
    const ds = getTestDataSource();
    const del = jest.spyOn(ds.privacy, 'deleteAccount');
    const clear = jest.spyOn(ds, 'clearLocalState');
    const screen = renderWithProviders(<PrivacyScreen />, { queryClient: makeClient() });
    fireEvent.press(await screen.findByTestId('privacy-delete-account', {}, FIND_OPTS));
    fireEvent.press(await screen.findByTestId('privacy-delete-continue', {}, FIND_OPTS));
    const input = await screen.findByTestId('privacy-delete-input', {}, FIND_OPTS);
    const confirm = screen.getByTestId('privacy-delete-confirm');
    expect(confirm.props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(input, 'sil');
    await waitFor(() =>
      expect(screen.getByTestId('privacy-delete-confirm').props.accessibilityState?.disabled).toBe(
        false,
      ),
    );
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('privacy-delete-confirm'));
    await waitFor(() => expect(del).toHaveBeenCalledWith({ confirmation: 'SİL' }));
    await waitFor(() => expect(clear).toHaveBeenCalled());
    await waitFor(() => expect(useSessionStore.getState().status).toBe('signedOut'));
  });
});

describe('VIP screen', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    (pickDeviceContact as jest.Mock).mockClear();
    // status 'loading' keeps the entitlement query disabled so the store's PRO entitlement is used.
    useSessionStore.setState({ preferences: null, entitlement: PRO, status: 'loading' });
  });

  it('toggles always-notify and removes a VIP after confirmation', async () => {
    const ds = getTestDataSource();
    const screen = renderWithProviders(<VipScreen />, { queryClient: makeClient() });
    await screen.findByTestId(`vip-row-${VIP_MEHMET}`, {}, FIND_OPTS);
    expect(screen.getByText('Mehmet Yılmaz')).toBeTruthy();
    fireEvent.press(screen.getByTestId(`vip-notify-${VIP_MEHMET}`));
    await waitFor(async () =>
      expect((await ds.people.listVips()).find((v) => v.id === VIP_MEHMET)?.notifyAlways).toBe(
        false,
      ),
    );
    fireEvent.press(screen.getByTestId(`vip-remove-${VIP_MEHMET}`));
    const confirm = await screen.findByText("VIP'den çıkar", {}, FIND_OPTS);
    fireEvent.press(confirm);
    await waitFor(async () => expect(await ds.people.listVips()).toHaveLength(0));
    await screen.findByTestId('vip-empty', {}, FIND_OPTS);
  });

  it('adds VIPs by e-mail and from the device contacts', async () => {
    const ds = getTestDataSource();
    const screen = renderWithProviders(<VipScreen />, { queryClient: makeClient() });
    await screen.findByTestId(`vip-row-${VIP_MEHMET}`, {}, FIND_OPTS);
    fireEvent.press(screen.getByTestId('vip-add'));
    const email = await screen.findByTestId('vip-add-email-input', {}, FIND_OPTS);
    fireEvent.changeText(screen.getByTestId('vip-add-name-input'), 'Selin Kaya');
    fireEvent.changeText(email, 'not-an-email');
    fireEvent.press(screen.getByTestId('vip-add-save'));
    await screen.findByText('Geçerli bir e-posta adresi gir.', {}, FIND_OPTS);
    fireEvent.changeText(screen.getByTestId('vip-add-email-input'), 'Selin@Firma.com');
    fireEvent.press(screen.getByTestId('vip-add-save'));
    await waitFor(async () =>
      expect((await ds.people.listVips()).some((v) => v.email === 'selin@firma.com')).toBe(true),
    );
    await screen.findByText('Selin Kaya', {}, FIND_OPTS);

    fireEvent.press(screen.getByTestId('vip-add'));
    fireEvent.press(await screen.findByTestId('vip-add-contacts', {}, FIND_OPTS));
    await waitFor(() => expect(pickDeviceContact).toHaveBeenCalled());
    await waitFor(async () =>
      expect((await ds.people.listVips()).some((v) => v.displayName === 'Burak Tan')).toBe(true),
    );
    await screen.findByText('3 kişi', {}, FIND_OPTS);
  });
});

describe('Android notifications screen', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    resetTestDataSource();
    // status 'loading' keeps the entitlement query disabled so the store's PRO entitlement is used.
    useSessionStore.setState({ preferences: null, entitlement: PRO, status: 'loading' });
    mockAndroid.setScope.mockClear();
    mockAndroid.setUploadConsent.mockClear();
    mockAndroid.toggleApp.mockClear();
    mockAndroid.openSettings.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      value: originalOS,
      configurable: true,
      writable: true,
    });
  });

  it('explains that the feature is Android-only on iOS', () => {
    const screen = renderWithProviders(<AndroidNotificationsScreen />, {
      queryClient: makeClient(),
    });
    expect(screen.getByTestId('anotif-unsupported')).toBeTruthy();
    expect(screen.getByText("Bu özellik yalnızca Android'de")).toBeTruthy();
    expect(screen.queryByTestId('anotif-grant')).toBeNull();
  });

  it('drives access, scope, app allow-list and consent on Android', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true, writable: true });
    const screen = renderWithProviders(<AndroidNotificationsScreen />, {
      queryClient: makeClient(),
    });
    expect(screen.getByTestId('anotif-grant')).toBeTruthy();
    expect(screen.getByText('Erişim verilmedi')).toBeTruthy();
    fireEvent.press(screen.getByTestId('anotif-grant'));
    await waitFor(() => expect(mockAndroid.openSettings).toHaveBeenCalled());
    fireEvent.press(screen.getByTestId('anotif-scope-all_allowed'));
    await waitFor(() => expect(mockAndroid.setScope).toHaveBeenCalledWith('all_allowed'));
    const trendyol = screen.getByTestId('anotif-app-com.trendyol.app');
    expect(trendyol.props.accessibilityState?.checked).toBe(true);
    fireEvent.press(screen.getByTestId('anotif-app-com.whatsapp'));
    await waitFor(() => expect(mockAndroid.toggleApp).toHaveBeenCalledWith('com.whatsapp'));
    expect(screen.getByTestId('anotif-app-com.bank.app').props.accessibilityState?.disabled).toBe(
      true,
    );
    expect(screen.getByText('Varsayılan olarak hariç')).toBeTruthy();
    fireEvent.press(screen.getByTestId('anotif-consent'));
    await waitFor(() => expect(mockAndroid.setUploadConsent).toHaveBeenCalledWith(true));
    expect(screen.getByTestId('anotif-recent-0')).toBeTruthy();
    expect(
      screen.getByText('Doğrulama kodları ve şifre yöneticisi bildirimleri asla kaydedilmez.'),
    ).toBeTruthy();
  });
});
