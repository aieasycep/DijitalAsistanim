/**
 * Pure paywall helpers: localized plan pricing (store first, i18n fallback copy otherwise), savings
 * math, the platform-gated benefit list and the contextual-title key. Never invents a trial:
 * `freeTrial` only ever comes from the store (`freeTrialFor`); the fallback copy has none.
 */
import type { TFunction } from 'i18next';
import type { PlatformOSType } from 'react-native';
import { FALLBACK_PRICES, PRODUCT_IDS, type Locale, type ProductId } from '@da/domain';
import { formatMoney } from '@da/i18n';
import type { ProOfferings } from '@/services/purchases';
import type { FreeTrial } from './freeTrial';

export type PlanKey = 'monthly' | 'annual';

export interface PlanPricing {
  monthly: string;
  annual: string;
  /** "124 TL" — the annual price spread over 12 months. */
  annualPerMonth: string | null;
  savingsPercent: number | null;
  /** True when both labels come from the store (RevenueCat offerings). */
  fromStore: boolean;
  /** Free trial per plan — store data only; `null` means the CTA must not promise a trial. */
  freeTrial: Record<PlanKey, FreeTrial | null>;
}

export function savingsPercent(monthly: number, annual: number): number | null {
  if (!(monthly > 0) || !(annual > 0)) return null;
  const pct = Math.round((1 - annual / (monthly * 12)) * 100);
  return pct > 0 ? pct : null;
}

/**
 * Store prices when both packages are known; otherwise the design fallback amounts rendered through
 * the locale's price copy (`paywall.monthlyPrice` / `paywall.annualPrice`) so English users never
 * see Turkish price labels.
 */
export function planPricing(
  offerings: ProOfferings | null,
  locale: Locale,
  t: TFunction,
): PlanPricing {
  const monthly = offerings?.monthly ?? null;
  const annual = offerings?.annual ?? null;
  if (offerings && monthly && annual) {
    const currency = annual.product.currencyCode;
    const a = annual.product.price;
    return {
      monthly: monthly.product.priceString,
      annual: annual.product.priceString,
      annualPerMonth: a > 0 ? formatMoney(Math.round(a / 12), currency, locale) : null,
      savingsPercent: savingsPercent(monthly.product.price, a),
      fromStore: true,
      freeTrial: { monthly: offerings.freeTrial.monthly, annual: offerings.freeTrial.annual },
    };
  }
  const m = FALLBACK_PRICES.monthly;
  const y = FALLBACK_PRICES.annual;
  return {
    monthly: t('paywall.monthlyPrice', { price: formatMoney(m.amount, m.currency, locale) }),
    annual: t('paywall.annualPrice', { price: formatMoney(y.amount, y.currency, locale) }),
    annualPerMonth: formatMoney(Math.round(y.amount / 12), y.currency, locale),
    savingsPercent: savingsPercent(m.amount, y.amount),
    fromStore: false,
    freeTrial: { monthly: null, annual: null },
  };
}

function stringList(t: TFunction, key: string): string[] {
  const raw: unknown = t(key, { returnObjects: true });
  return Array.isArray(raw) ? raw.filter((b): b is string => typeof b === 'string') : [];
}

/**
 * Pro benefit copy. `paywall.benefitsAndroid` (Android Notification Intelligence) is appended only on
 * Android — the feature must never be shown on iOS.
 */
export function paywallBenefits(t: TFunction, os: PlatformOSType): string[] {
  const base = stringList(t, 'paywall.benefits');
  return os === 'android' ? [...base, ...stringList(t, 'paywall.benefitsAndroid')] : base;
}

export function productIdFor(plan: PlanKey): ProductId {
  return PRODUCT_IDS[plan];
}

const CONTEXT_RE = /^[a-z][a-z0-9_]{0,39}$/;

/** `paywall.contextTitles.<context>` for a well-formed context; the caller checks existence. */
export function contextTitleKey(context: string | undefined | null): string | null {
  return context && CONTEXT_RE.test(context) ? `paywall.contextTitles.${context}` : null;
}
