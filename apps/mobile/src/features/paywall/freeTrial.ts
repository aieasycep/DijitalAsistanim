/**
 * Free-trial derivation from RevenueCat store products. A trial is only ever claimed when the store
 * data says the introductory phase costs exactly 0 and has a known length — paid intro offers,
 * unknown periods and missing offers all yield `null`, so the paywall can never advertise a trial the
 * user would not actually get (product rule: never fake a trial).
 */
import type {
  PricingPhase,
  PurchasesIntroPrice,
  PurchasesStoreProduct,
} from 'react-native-purchases';

export interface FreeTrial {
  /** Length of the free period in days, computed from the store's period unit and count. */
  days: number;
}

const DAYS_PER_UNIT: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

/** `periodDays('WEEK', 1)` → 7, `periodDays('DAY', 3)` → 3; unknown units or non-positive counts → null. */
export function periodDays(
  unit: string | null | undefined,
  count: number | null | undefined,
  cycles?: number | null,
): number | null {
  const perUnit = DAYS_PER_UNIT[String(unit ?? '').toUpperCase()];
  if (!perUnit || typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return null;
  const repeats = typeof cycles === 'number' && Number.isFinite(cycles) && cycles > 0 ? cycles : 1;
  const days = Math.round(perUnit * count * repeats);
  return days > 0 ? days : null;
}

/** Google Play pricing phase (`SubscriptionOption.freePhase`): free only at 0 micros. */
function fromPricingPhase(phase: PricingPhase | null | undefined): FreeTrial | null {
  if (!phase || phase.price.amountMicros !== 0) return null;
  const days = periodDays(
    phase.billingPeriod.unit,
    phase.billingPeriod.value,
    phase.billingCycleCount,
  );
  return days ? { days } : null;
}

/** App Store / generic introductory price: free only when the intro price is exactly 0. */
function fromIntroPrice(intro: PurchasesIntroPrice | null | undefined): FreeTrial | null {
  if (!intro || intro.price !== 0) return null;
  const days = periodDays(intro.periodUnit, intro.periodNumberOfUnits, intro.cycles);
  return days ? { days } : null;
}

/**
 * The free trial a purchase of `product` would start, or `null` when there is none.
 *
 * Google Play products expose `subscriptionOptions`; `purchasePackage` buys `defaultOption`, so only
 * that option's `freePhase` counts (another option's trial would not be what the user gets). Every
 * other store is judged by `introPrice`, which must cost 0.
 */
export function freeTrialFor(product: PurchasesStoreProduct | null | undefined): FreeTrial | null {
  if (!product) return null;
  if (product.subscriptionOptions && product.subscriptionOptions.length > 0) {
    return fromPricingPhase(product.defaultOption?.freePhase);
  }
  return fromIntroPrice(product.introPrice);
}
