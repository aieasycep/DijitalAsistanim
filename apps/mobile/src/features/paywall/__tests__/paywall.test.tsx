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
jest.mock('@/lib/analytics', () => ({
  setupAnalytics: jest.fn(async () => undefined),
  track: jest.fn(),
  trackScreen: jest.fn(),
  identifyUser: jest.fn(),
  resetAnalytics: jest.fn(),
}));
jest.mock('@/lib/i18n', () => ({
  formatCtx: (overrides: Record<string, unknown> = {}) => ({
    locale: 'tr',
    timezone: 'Europe/Istanbul',
    now: new Date('2026-09-05T06:41:00Z'),
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
  /** What the store reports after the purchase — the only source for `trial_started`. */
  purchaseTrial: false,
  restoreOutcome: 'restored' as RestoreResult['outcome'],
};
jest.mock('@/services/purchases', () => ({
  isPurchasesAvailable: () => mockStore.available,
  getProOfferings: jest.fn(async () => mockStore.offerings),
  purchasePro: jest.fn(async () => ({
    outcome: mockStore.purchaseOutcome,
    customerInfo: { originalAppUserId: 'rc-user-1' },
    isTrial: mockStore.purchaseTrial,
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

import { Platform } from 'react-native';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import type { DataSource } from '@da/api-client';
import { createI18n, formatMoney } from '@da/i18n';
import type { PurchasesIntroPrice, PurchasesPackage } from 'react-native-purchases';
import PaywallScreen from '../../../../app/paywall';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';
import { track } from '@/lib/analytics';
import { openExternal } from '@/lib/openExternal';
import {
  openManageSubscriptions,
  purchasePro,
  type ProOfferings,
  type PurchaseOutcome,
  type RestoreResult,
} from '@/services/purchases';
import { useSessionStore } from '@/store/session';
import { paywallBenefits, planPricing, savingsPercent } from '../paywallCopy';

const ANDROID_BENEFIT = 'Android Bildirim Zekâsı';
const ANDROID_BENEFIT_EN = 'Android Notification Intelligence';
const originalOS = Platform.OS;

function setPlatform(os: string) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
}

function pkg(
  id: string,
  price: number,
  priceString: string,
  introPrice: PurchasesIntroPrice | null,
): PurchasesPackage {
  return {
    identifier: id,
    packageType: id.includes('annual') ? 'ANNUAL' : 'MONTHLY',
    product: { identifier: id, price, priceString, currencyCode: 'TRY', introPrice },
    offeringIdentifier: 'default',
  } as unknown as PurchasesPackage;
}

/**
 * Store offerings as `selectProPackages` would return them: `freeTrialDays` → a 0-priced intro offer of
 * that length; `paidIntro` → a discounted first month (never a free trial); neither → no offer.
 */
function storeOfferings(freeTrialDays: number | null, opts: { paidIntro?: boolean } = {}) {
  const introPrice: PurchasesIntroPrice | null = freeTrialDays
    ? {
        price: 0,
        priceString: '₺0,00',
        cycles: 1,
        period: `P${freeTrialDays}D`,
        periodUnit: 'DAY',
        periodNumberOfUnits: freeTrialDays,
      }
    : opts.paidIntro
      ? {
          price: 49,
          priceString: '₺49,00',
          cycles: 1,
          period: 'P1M',
          periodUnit: 'MONTH',
          periodNumberOfUnits: 1,
        }
      : null;
  const trial = freeTrialDays ? { days: freeTrialDays } : null;
  const offerings: ProOfferings = {
    monthly: pkg('da_pro_monthly', 199, '₺199,00', introPrice),
    annual: pkg('da_pro_annual', 1490, '₺1.490,00', introPrice),
    monthlyPriceLabel: '₺199,00',
    annualPriceLabel: '₺1.490,00',
    freeTrial: { monthly: trial, annual: trial },
  };
  return offerings;
}

const i18n = createI18n('tr');
const tTr = i18n.getFixedT('tr');
const tEn = i18n.getFixedT('en');

beforeEach(() => {
  resetTestDataSource();
  mockDs.override = null;
  mockStore.available = false;
  mockStore.offerings = null;
  mockStore.purchaseOutcome = 'purchased';
  mockStore.purchaseTrial = false;
  mockStore.restoreOutcome = 'restored';
  mockBack.mockClear();
  mockReplace.mockClear();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  useSessionStore.setState({ status: 'signedIn', entitlement: null });
  jest.clearAllMocks();
});

afterEach(() => setPlatform(originalOS));

describe('planPricing', () => {
  it('uses the localized Turkish fallback copy without a store and never invents a trial', () => {
    const p = planPricing(null, 'tr', tTr);
    expect(p.monthly).toBe('199 TL / ay');
    expect(p.annual).toBe('1.490 TL / yıl');
    expect(p.annualPerMonth).toBe('124 TL');
    expect(p.savingsPercent).toBe(38);
    expect(p.fromStore).toBe(false);
    expect(p.freeTrial).toEqual({ monthly: null, annual: null });
  });

  it('renders the English fallback through i18n with the same 199 / 1.490 TL amounts', () => {
    const p = planPricing(null, 'en', tEn);
    expect(p.monthly).toBe(`${formatMoney(199, 'TRY', 'en')} / month`);
    expect(p.annual).toBe(`${formatMoney(1490, 'TRY', 'en')} / year`);
    expect(p.monthly).toMatch(/^TRY\s199\.00 \/ month$/);
    expect(p.annual).toMatch(/^TRY\s1,490\.00 \/ year$/);
    expect(p.annualPerMonth).toBe(formatMoney(124, 'TRY', 'en'));
    expect(p.savingsPercent).toBe(38);
    expect(p.fromStore).toBe(false);
    expect(p.freeTrial).toEqual({ monthly: null, annual: null });
  });

  it('prefers localized store prices and carries the per-plan free trial from the store', () => {
    const p = planPricing(storeOfferings(7), 'tr', tTr);
    expect(p.monthly).toBe('₺199,00');
    expect(p.annual).toBe('₺1.490,00');
    expect(p.fromStore).toBe(true);
    expect(p.freeTrial).toEqual({ monthly: { days: 7 }, annual: { days: 7 } });
    expect(planPricing(storeOfferings(null, { paidIntro: true }), 'tr', tTr).freeTrial).toEqual({
      monthly: null,
      annual: null,
    });
    expect(savingsPercent(0, 10)).toBeNull();
  });
});

describe('paywallBenefits', () => {
  it('appends the Android notification benefit only on Android', () => {
    const ios = paywallBenefits(tTr, 'ios');
    expect(ios).toContain('Sınırsız AI analiz');
    expect(ios[2]).toBe('Toplantı Hazırlığı');
    expect(ios).not.toContain(ANDROID_BENEFIT);
    expect(ios).not.toContain(ANDROID_BENEFIT_EN);
    const android = paywallBenefits(tTr, 'android');
    expect(android.slice(0, ios.length)).toEqual(ios);
    expect(android[android.length - 1]).toBe(ANDROID_BENEFIT);
    const iosEn = paywallBenefits(tEn, 'ios');
    expect(iosEn[2]).toBe('Meeting Prep');
    expect(iosEn).not.toContain(ANDROID_BENEFIT_EN);
    expect(paywallBenefits(tEn, 'android')).toContain(ANDROID_BENEFIT_EN);
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
    // Jest runs as iOS: the Android-only feature must not be advertised.
    expect(screen.getByText('Sınırsız AI analiz')).toBeTruthy();
    expect(screen.queryByText(ANDROID_BENEFIT)).toBeNull();
    fireEvent.press(screen.getByTestId('paywall-plan-annual'));
    expect(screen.getByText('En Avantajlı')).toBeTruthy();
    fireEvent.press(screen.getByTestId('paywall-cta'));
    await waitFor(() => expect(demoPurchase).toHaveBeenCalledWith({ productId: 'da_pro_annual' }));
    await screen.findByText('Pro açıldı. Hoş geldin.', {}, { timeout: 5000 });
    await screen.findByTestId('paywall-pro-status', {}, { timeout: 5000 });
    expect(screen.getByTestId('paywall-manage')).toBeTruthy();
    expect(screen.queryByTestId('paywall-cta')).toBeNull();
    expect(purchasePro).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('subscription_started', { productId: 'da_pro_annual' });
    expect(track).not.toHaveBeenCalledWith('trial_started', expect.anything());
    fireEvent.press(screen.getByTestId('paywall-restore'));
    await screen.findByText('Satın alımlar geri yüklendi', {}, { timeout: 5000 });
  }, 15000);

  it('lists the Android notification benefit on Android', () => {
    setPlatform('android');
    const screen = renderWithProviders(<PaywallScreen />);
    expect(within(screen.getByTestId('paywall-benefits')).getByText(ANDROID_BENEFIT)).toBeTruthy();
    expect(screen.getByText('Sınırsız AI analiz')).toBeTruthy();
  });

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
  it('shows store prices, the trial CTA with the real day count, links the RC user and reports the trial', async () => {
    mockStore.available = true;
    mockStore.offerings = storeOfferings(7);
    mockStore.purchaseTrial = true;
    const ds = getTestDataSource();
    const link = jest.spyOn(ds.billing, 'linkRevenueCatUser');
    const screen = renderWithProviders(<PaywallScreen />);
    await screen.findByText('Ücretsiz Dene', {}, { timeout: 5000 });
    expect(within(screen.getByTestId('paywall-plan-annual')).getByText(/₺1\.490,00/)).toBeTruthy();
    expect(screen.getByText(/^7 gün sonra ₺1\.490,00\./)).toBeTruthy();
    fireEvent.press(screen.getByTestId('paywall-plan-monthly'));
    expect(screen.getByText(/^7 gün sonra ₺199,00\./)).toBeTruthy();
    fireEvent.press(screen.getByTestId('paywall-cta'));
    await waitFor(() =>
      expect(purchasePro).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: 'da_pro_monthly' }),
      ),
    );
    await waitFor(() => expect(link).toHaveBeenCalledWith('rc-user-1'));
    await screen.findByText('Pro açıldı. Hoş geldin.', {}, { timeout: 5000 });
    expect(track).toHaveBeenCalledWith('subscription_started', { productId: 'da_pro_monthly' });
    expect(track).toHaveBeenCalledWith('trial_started', { productId: 'da_pro_monthly' });
  });

  it('takes the trial length from the store offer instead of a hard-coded 7 days', async () => {
    mockStore.available = true;
    mockStore.offerings = storeOfferings(3);
    const screen = renderWithProviders(<PaywallScreen />);
    await screen.findByText('Ücretsiz Dene', {}, { timeout: 5000 });
    expect(screen.getByText(/^3 gün sonra/)).toBeTruthy();
    expect(screen.queryByText(/7 gün sonra/)).toBeNull();
  });

  it('never fakes a trial for a paid introductory offer', async () => {
    mockStore.available = true;
    mockStore.offerings = storeOfferings(null, { paidIntro: true });
    const screen = renderWithProviders(<PaywallScreen />);
    await within(screen.getByTestId('paywall-plan-monthly')).findByText(
      /₺199,00/,
      {},
      { timeout: 5000 },
    );
    expect(screen.getByText("Pro'ya Geç")).toBeTruthy();
    expect(screen.queryByText('Ücretsiz Dene')).toBeNull();
    expect(screen.queryByText(/gün sonra/)).toBeNull();
    expect(screen.getByTestId('paywall-legal').props.children).toBe(
      '₺1.490,00. İstediğin zaman iptal.',
    );
  });

  it('only reports trial_started when the store actually opened a trial', async () => {
    mockStore.available = true;
    mockStore.offerings = storeOfferings(7);
    mockStore.purchaseTrial = false;
    const screen = renderWithProviders(<PaywallScreen />);
    await screen.findByText('Ücretsiz Dene', {}, { timeout: 5000 });
    fireEvent.press(screen.getByTestId('paywall-cta'));
    await screen.findByText('Pro açıldı. Hoş geldin.', {}, { timeout: 5000 });
    expect(track).toHaveBeenCalledWith('subscription_started', { productId: 'da_pro_annual' });
    expect(track).not.toHaveBeenCalledWith('trial_started', expect.anything());
  });

  it('never fakes a trial without an intro offer and reports a cancelled purchase calmly', async () => {
    mockStore.available = true;
    mockStore.offerings = storeOfferings(null);
    mockStore.purchaseOutcome = 'cancelled';
    const screen = renderWithProviders(<PaywallScreen />);
    // Prices come from the store: the CTA stays locked until the offerings have loaded.
    await within(screen.getByTestId('paywall-plan-monthly')).findByText(
      /₺199,00/,
      {},
      { timeout: 5000 },
    );
    expect(screen.getByText("Pro'ya Geç")).toBeTruthy();
    expect(screen.queryByText(/gün sonra/)).toBeNull();
    fireEvent.press(screen.getByTestId('paywall-cta'));
    await screen.findByText('Satın alma iptal edildi.', {}, { timeout: 5000 });
    expect(screen.getByTestId('paywall-cta')).toBeTruthy();
    expect(track).not.toHaveBeenCalledWith('trial_started', expect.anything());
  });

  it('opens subscription management for Pro users', async () => {
    mockStore.available = true;
    mockStore.offerings = storeOfferings(null);
    const ds = getTestDataSource();
    await ds.billing.recordDemoPurchase?.({ productId: 'da_pro_annual' });
    const screen = renderWithProviders(<PaywallScreen />);
    const manage = await screen.findByTestId('paywall-manage', {}, { timeout: 5000 });
    fireEvent.press(manage);
    await waitFor(() => expect(openManageSubscriptions).toHaveBeenCalled());
  });
});
