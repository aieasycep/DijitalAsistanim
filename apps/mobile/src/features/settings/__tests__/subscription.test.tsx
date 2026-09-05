import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { qk, type DataSource } from '@da/api-client';
import {
  FREE_ENTITLEMENT,
  makeSettingsDataSource,
  PRO_ENTITLEMENT,
  renderSettings,
  seedSession,
  withEntitlement,
} from '@/features/settings/testing/settingsTestUtils';
import * as purchases from '@/services/purchases';
import { useUiStore } from '@/store/ui';
import SubscriptionScreen from '../../../../app/settings/subscription';

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
jest.mock('@/services/purchases', () => ({
  resetPurchasesUser: jest.fn(async () => undefined),
  restorePro: jest.fn(async () => ({ outcome: 'nothing', customerInfo: null })),
  openManageSubscriptions: jest.fn(async () => true),
  isPurchasesAvailable: () => false,
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
  usePathname: () => '/settings/subscription',
}));

let mockDs: DataSource;
jest.mock('@/hooks/useDataSource', () => ({ useDataSource: () => mockDs }));

beforeEach(async () => {
  jest.clearAllMocks();
  useUiStore.setState({ offline: false });
  mockDs = makeSettingsDataSource();
  await seedSession(mockDs);
});

describe('Subscription screen', () => {
  it('shows the Free plan with usage and opens the paywall from the upgrade button', async () => {
    mockDs = withEntitlement(mockDs, FREE_ENTITLEMENT);
    renderSettings(<SubscriptionScreen />);

    expect(await screen.findByText('Ücretsiz plan')).toBeTruthy();
    expect(screen.getByText('3 / 10 bugün')).toBeTruthy();
    expect(screen.getByText('1 / 5 bugün')).toBeTruthy();
    expect(screen.queryByText('Pro aktif')).toBeNull();
    expect(screen.queryByTestId('subscription-manage')).toBeNull();

    fireEvent.press(screen.getByTestId('subscription-upgrade'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/paywall',
      params: { context: 'subscription' },
    });
  });

  it('shows the Pro state with expiry, source, manage and restore', async () => {
    mockDs = withEntitlement(mockDs, PRO_ENTITLEMENT);
    renderSettings(<SubscriptionScreen />);

    expect(await screen.findByText('Pro aktif')).toBeTruthy();
    expect(screen.queryByTestId('subscription-upgrade')).toBeNull();
    expect(screen.getByText('5 Eylül 2027')).toBeTruthy();
    expect(screen.getByText('Demo')).toBeTruthy();

    fireEvent.press(screen.getByTestId('subscription-manage'));
    await waitFor(() => expect(purchases.openManageSubscriptions).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('subscription-restore'));
    await waitFor(() => expect(purchases.restorePro).toHaveBeenCalled());
    expect(await screen.findByText('Geri yüklenecek satın alım bulunamadı')).toBeTruthy();
  });

  it('refetches the entitlement after a successful restore', async () => {
    let entitlement = FREE_ENTITLEMENT;
    mockDs = { ...mockDs, billing: { ...mockDs.billing, getEntitlement: async () => entitlement } };
    jest.mocked(purchases.restorePro).mockResolvedValueOnce({
      outcome: 'restored',
      customerInfo: null,
    });
    renderSettings(<SubscriptionScreen />);

    expect(await screen.findByText('Ücretsiz plan')).toBeTruthy();
    entitlement = PRO_ENTITLEMENT;
    fireEvent.press(screen.getByTestId('subscription-restore'));
    expect(await screen.findByText('Satın alımlar geri yüklendi')).toBeTruthy();
    expect(await screen.findByText('Pro aktif')).toBeTruthy();
  });

  it('re-renders when the paywall invalidates the entitlement query', async () => {
    let entitlement = FREE_ENTITLEMENT;
    mockDs = { ...mockDs, billing: { ...mockDs.billing, getEntitlement: async () => entitlement } };
    const { client } = renderSettings(<SubscriptionScreen />);

    expect(await screen.findByTestId('subscription-upgrade')).toBeTruthy();
    entitlement = PRO_ENTITLEMENT;
    await client.invalidateQueries({ queryKey: qk.entitlement });
    expect(await screen.findByText('Pro aktif')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('subscription-upgrade')).toBeNull());
  });
});
