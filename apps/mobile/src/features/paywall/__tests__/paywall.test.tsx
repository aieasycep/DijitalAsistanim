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
jest.mock('@/lib/openExternal', () => ({
  openExternal: jest.fn(async () => true),
  providerMailUrl: (webUrl: string | null | undefined) => webUrl ?? '',
  mapsUrl: (q: string) => `maps://?q=${q}`,
  telUrl: (p: string) => `tel:${p}`,
}));

const mockDs: { override: null | ((ds: DataSource) => DataSource) } = { override: null };
jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: () => {
    const ds = require('@/features/flow/testing/demoSource').getTestDataSource();
    return mockDs.override ? mockDs.override(ds) : ds;
  },
}));

const mockStore = {
  available: false,
  offerings: null as ProOfferings | null,
  purchaseOutcome: 'purchased' as PurchaseOutcome,
  restoreOutcome: 'restored' as RestoreResult['outcome'],
};
jest.mock('@/services/purchases', () => ({
  isPurchasesAvailable: () => mockStore.available,
  getProOfferings: jest.fn(async () => mockStore.offerings),
  purchasePro: jest.fn(async () => ({
    outcome: mockStore.purchaseOutcome,
    customerInfo: { originalAppUserId: 'rc-user-1' },
  })),
  restorePro: jest.fn(async () => ({ outcome: mockStore.restoreOutcome, customerInfo: null })),
  openManageSubscriptions: jest.fn(async () => true),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
  useSegments: () => [],
  usePathname: () => '/paywall',
  useFocusEffect: jest.fn(),
}));

import { fireEvent, waitFor, within } from '@testing-library/react-native';
import type { DataSource } from '@da/api-client';
import type { PurchasesPackage } from 'react-native-purchases';
import PaywallScreen from '../../../../app/paywall';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';
import { openExternal } from '@/lib/openExternal';
import {
  openManageSubscriptions,
  purchasePro,
  type ProOfferings,
  type PurchaseOutcome,
  type RestoreResult,
} from '@/services/purchases';
import { useSessionStore } from '@/store/session';
import { planPricing, savingsPercent } from '../paywallCopy';

function pkg(id: string, price: number, priceString: string, intro = false): PurchasesPackage {
  return {
    identifier: id,
    packageType: id.includes('annual') ? 'ANNUAL' : 'MONTHLY',
    product: {
      identifier: id,
      price,
      priceString,
      currencyCode: 'TRY',
      introPrice: intro ? { price: 0, priceString: '₺0,00' } : null,
    },
    offeringIdentifier: 'default',
  } as unknown as PurchasesPackage;
}

function storeOfferings(intro: boolean): ProOfferings {
  return {
    monthly: pkg('da_pro_monthly', 199, '₺199,00', intro),
    annual: pkg('da_pro_annual', 1490, '₺1.490,00', intro),
    monthlyPriceLabel: '₺199,00',
    annualPriceLabel: '₺1.490,00',
    hasIntroOffer: intro,
  };
}

beforeEach(() => {
  resetTestDataSource();
  mockDs.override = null;
  mockStore.available = false;
  mockStore.offerings = null;
  mockStore.purchaseOutcome = 'purchased';
  mockStore.restoreOutcome = 'restored';
  mockBack.mockClear();
  mockReplace.mockClear();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  useSessionStore.setState({ status: 'signedIn', entitlement: null });
  jest.clearAllMocks();
});

describe('planPricing', () => {
  it('uses the design fallback copy without a store and never invents a trial', () => {
    const p = planPricing(null, 'tr');
    expect(p.monthly).toBe('199 TL / ay');
    expect(p.annual).toBe('1.490 TL / yıl');
    expect(p.annualPerMonth).toBe('124 TL');
    expect(p.savingsPercent).toBe(38);
    expect(p.fromStore).toBe(false);
    expect(p.hasIntroOffer).toBe(false);
  });

  it('prefers localized store prices and the store intro flag', () => {
    const p = planPricing(storeOfferings(true), 'tr');
    expect(p.monthly).toBe('₺199,00');
    expect(p.annual).toBe('₺1.490,00');
    expect(p.fromStore).toBe(true);
    expect(p.hasIntroOffer).toBe(true);
    expect(savingsPercent(0, 10)).toBeNull();
  });
});

describe('Paywall (demo build, no store)', () => {
  it('shows fallback prices, a no-trial CTA and walks through the demo purchase', async () => {
    const ds = getTestDataSource();
    const demoPurchase = jest.spyOn(ds.billing, 'recordDemoPurchase');
    const screen = renderWithProviders(<PaywallScreen />);
    expect(screen.getByTestId('paywall-screen')).toBeTruthy();
    expect(screen.getByText("Dijital Asistan'ın tamamını aç.")).toBeTruthy();
    expect(
      within(screen.getByTestId('paywall-plan-monthly')).getByText(/199 TL \/ ay/),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('paywall-plan-annual')).getByText(/1\.490 TL \/ yıl · ayda 124 TL/),
    ).toBeTruthy();
    expect(screen.getByText("Pro'ya Geç")).toBeTruthy();
    expect(screen.queryByText('Ücretsiz Dene')).toBeNull();
    fireEvent.press(screen.getByTestId('paywall-plan-annual'));
    expect(screen.getByText('En Avantajlı')).toBeTruthy();
    fireEvent.press(screen.getByTestId('paywall-cta'));
    await waitFor(() => expect(demoPurchase).toHaveBeenCalledWith({ productId: 'da_pro_annual' }));
    await screen.findByText('Pro açıldı. Hoş geldin.', {}, { timeout: 5000 });
    await screen.findByTestId('paywall-pro-status', {}, { timeout: 5000 });
    expect(screen.getByTestId('paywall-manage')).toBeTruthy();
    expect(screen.queryByTestId('paywall-cta')).toBeNull();
    expect(purchasePro).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('paywall-restore'));
    await screen.findByText('Satın alımlar geri yüklendi', {}, { timeout: 5000 });
  }, 15000);

  it('uses the contextual title, closes on Free ile devam et and opens the legal pages', async () => {
    mockParams.context = 'meeting_prep';
    const screen = renderWithProviders(<PaywallScreen />);
    expect(screen.getByText('Toplantı hazırlığı Pro ile.')).toBeTruthy();
    expect(screen.getByText("Dijital Asistan'ın tamamını aç.")).toBeTruthy();
    fireEvent.press(screen.getByTestId('paywall-terms'));
    await waitFor(() =>
      expect(openExternal).toHaveBeenCalledWith(expect.stringMatching(/\/terms$/)),
    );
    fireEvent.press(screen.getByTestId('paywall-privacy'));
    await waitFor(() =>
      expect(openExternal).toHaveBeenCalledWith(expect.stringMatching(/\/privacy$/)),
    );
    fireEvent.press(screen.getByTestId('paywall-free'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows the calm unavailable state in a Supabase build without a store key', async () => {
    mockDs.override = (ds) => ({ ...ds, mode: 'supabase' });
    const screen = renderWithProviders(<PaywallScreen />);
    expect(screen.getByTestId('paywall-unavailable')).toBeTruthy();
    expect(screen.getByTestId('paywall-cta').props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(screen.getByTestId('paywall-restore'));
    await screen.findByText('Mağaza şu an kullanılamıyor.', {}, { timeout: 5000 });
  });
});

describe('Paywall (RevenueCat available)', () => {
  it('shows store prices, the trial CTA only with a real intro offer, and links the RC user', async () => {
    mockStore.available = true;
    mockStore.offerings = storeOfferings(true);
    const ds = getTestDataSource();
    const link = jest.spyOn(ds.billing, 'linkRevenueCatUser');
    const screen = renderWithProviders(<PaywallScreen />);
    await screen.findByText('Ücretsiz Dene', {}, { timeout: 5000 });
    expect(within(screen.getByTestId('paywall-plan-annual')).getByText(/₺1\.490,00/)).toBeTruthy();
    expect(screen.getByText(/7 gün sonra/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('paywall-plan-monthly'));
    fireEvent.press(screen.getByTestId('paywall-cta'));
    await waitFor(() =>
      expect(purchasePro).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: 'da_pro_monthly' }),
      ),
    );
    await waitFor(() => expect(link).toHaveBeenCalledWith('rc-user-1'));
    await screen.findByText('Pro açıldı. Hoş geldin.', {}, { timeout: 5000 });
  });

  it('never fakes a trial without an intro offer and reports a cancelled purchase calmly', async () => {
    mockStore.available = true;
    mockStore.offerings = storeOfferings(false);
    mockStore.purchaseOutcome = 'cancelled';
    const screen = renderWithProviders(<PaywallScreen />);
    // Prices come from the store: the CTA stays locked until the offerings have loaded.
    await within(screen.getByTestId('paywall-plan-monthly')).findByText(
      /₺199,00/,
      {},
      { timeout: 5000 },
    );
    expect(screen.getByText("Pro'ya Geç")).toBeTruthy();
    expect(screen.queryByText(/7 gün sonra/)).toBeNull();
    fireEvent.press(screen.getByTestId('paywall-cta'));
    await screen.findByText('Satın alma iptal edildi.', {}, { timeout: 5000 });
    expect(screen.getByTestId('paywall-cta')).toBeTruthy();
  });

  it('opens subscription management for Pro users', async () => {
    mockStore.available = true;
    mockStore.offerings = storeOfferings(false);
    const ds = getTestDataSource();
    await ds.billing.recordDemoPurchase?.({ productId: 'da_pro_annual' });
    const screen = renderWithProviders(<PaywallScreen />);
    const manage = await screen.findByTestId('paywall-manage', {}, { timeout: 5000 });
    fireEvent.press(manage);
    await waitFor(() => expect(openManageSubscriptions).toHaveBeenCalled());
  });
});
