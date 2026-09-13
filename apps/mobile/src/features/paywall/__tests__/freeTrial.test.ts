jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));

import type {
  PurchasesIntroPrice,
  PurchasesOfferings,
  PurchasesPackage,
  PurchasesStoreProduct,
  SubscriptionOption,
} from 'react-native-purchases';
import { selectProPackages } from '@/services/purchases';
import { freeTrialFor, periodDays } from '../freeTrial';

function intro(
  price: number,
  periodUnit: string,
  periodNumberOfUnits: number,
  cycles = 1,
): PurchasesIntroPrice {
  return {
    price,
    priceString: price === 0 ? '₺0,00' : `₺${price},00`,
    cycles,
    period: `P${periodNumberOfUnits}${periodUnit[0]}`,
    periodUnit,
    periodNumberOfUnits,
  };
}

function product(overrides: Partial<PurchasesStoreProduct> = {}): PurchasesStoreProduct {
  return {
    identifier: 'da_pro_monthly',
    price: 199,
    priceString: '₺199,00',
    currencyCode: 'TRY',
    introPrice: null,
    defaultOption: null,
    subscriptionOptions: null,
    ...overrides,
  } as PurchasesStoreProduct;
}

/** Google Play subscription option with an optional free phase (0 micros) of `unit × value`. */
function option(
  id: string,
  free: { unit: string; value: number; cycles?: number | null } | null,
): SubscriptionOption {
  return {
    id,
    storeProductId: `da_pro_monthly:${id}`,
    productId: 'da_pro_monthly',
    isBasePlan: free === null,
    tags: [],
    pricingPhases: [],
    freePhase: free
      ? {
          billingPeriod: { unit: free.unit, value: free.value, iso8601: `P${free.value}D` },
          recurrenceMode: 3,
          billingCycleCount: free.cycles ?? null,
          price: { formatted: '₺0,00', amountMicros: 0, currencyCode: 'TRY' },
          offerPaymentMode: 'FREE_TRIAL',
        }
      : null,
  } as unknown as SubscriptionOption;
}

describe('periodDays', () => {
  it('converts store period units into days', () => {
    expect(periodDays('DAY', 3)).toBe(3);
    expect(periodDays('WEEK', 1)).toBe(7);
    expect(periodDays('week', 2)).toBe(14);
    expect(periodDays('MONTH', 1)).toBe(30);
    expect(periodDays('YEAR', 1)).toBe(365);
    expect(periodDays('WEEK', 1, 2)).toBe(14);
  });

  it('refuses unknown units and non-positive counts instead of guessing', () => {
    expect(periodDays('UNKNOWN', 1)).toBeNull();
    expect(periodDays(undefined, 1)).toBeNull();
    expect(periodDays('DAY', 0)).toBeNull();
    expect(periodDays('DAY', null)).toBeNull();
    expect(periodDays('DAY', Number.NaN)).toBeNull();
  });
});

describe('freeTrialFor (App Store / introPrice)', () => {
  it('returns null without any intro offer', () => {
    expect(freeTrialFor(null)).toBeNull();
    expect(freeTrialFor(product())).toBeNull();
  });

  it('never treats a paid introductory price as a free trial', () => {
    expect(freeTrialFor(product({ introPrice: intro(49, 'MONTH', 1) }))).toBeNull();
    expect(freeTrialFor(product({ introPrice: intro(0.99, 'WEEK', 1) }))).toBeNull();
  });

  it('derives a free 7-day trial from a 0-priced one-week offer', () => {
    expect(freeTrialFor(product({ introPrice: intro(0, 'WEEK', 1) }))).toEqual({ days: 7 });
  });

  it('derives a free 3-day trial from a 0-priced three-day offer', () => {
    expect(freeTrialFor(product({ introPrice: intro(0, 'DAY', 3) }))).toEqual({ days: 3 });
  });

  it('returns null when the free offer has an unknown period', () => {
    expect(freeTrialFor(product({ introPrice: intro(0, 'UNKNOWN', 1) }))).toBeNull();
  });
});

describe('freeTrialFor (Google Play / subscriptionOptions)', () => {
  it('uses the free phase of the default option that purchasePackage buys', () => {
    const trial = option('base:trial14', { unit: 'DAY', value: 14 });
    const p = product({
      introPrice: intro(0, 'DAY', 14),
      defaultOption: trial,
      subscriptionOptions: [option('base', null), trial],
    });
    expect(freeTrialFor(p)).toEqual({ days: 14 });
  });

  it('ignores a trial on an option that is not the default (the user would not get it)', () => {
    const trial = option('base:trial7', { unit: 'WEEK', value: 1 });
    const base = option('base', null);
    const p = product({
      introPrice: intro(0, 'WEEK', 1),
      defaultOption: base,
      subscriptionOptions: [base, trial],
    });
    expect(freeTrialFor(p)).toBeNull();
    expect(freeTrialFor(product({ subscriptionOptions: [base, trial] }))).toBeNull();
  });

  it('multiplies by the billing cycle count when the phase repeats', () => {
    const trial = option('base:trial', { unit: 'WEEK', value: 1, cycles: 2 });
    expect(freeTrialFor(product({ defaultOption: trial, subscriptionOptions: [trial] }))).toEqual({
      days: 14,
    });
  });
});

describe('selectProPackages', () => {
  function pkg(id: string, type: string, p: PurchasesStoreProduct): PurchasesPackage {
    return { identifier: id, packageType: type, product: p } as unknown as PurchasesPackage;
  }

  it('exposes a per-plan free trial derived from the store product', () => {
    const offerings = {
      all: {},
      current: {
        identifier: 'default',
        availablePackages: [
          pkg('$rc_monthly', 'MONTHLY', product({ introPrice: intro(0, 'DAY', 3) })),
          pkg(
            '$rc_annual',
            'ANNUAL',
            product({
              identifier: 'da_pro_annual',
              price: 1490,
              introPrice: intro(99, 'MONTH', 1),
            }),
          ),
        ],
      },
    } as unknown as PurchasesOfferings;
    const pro = selectProPackages(offerings, {
      monthly: 'da_pro_monthly',
      annual: 'da_pro_annual',
    });
    expect(pro.monthly?.identifier).toBe('$rc_monthly');
    expect(pro.annual?.identifier).toBe('$rc_annual');
    expect(pro.freeTrial).toEqual({ monthly: { days: 3 }, annual: null });
    expect(selectProPackages(null, { monthly: 'x', annual: 'y' }).freeTrial).toEqual({
      monthly: null,
      annual: null,
    });
  });
});
