/**
 * Pure paywall helpers: localized plan pricing (store first, design fallback copy otherwise), savings
 * math and the contextual-title key. Never invents a trial: `hasIntroOffer` only comes from the store.
 */
import { FALLBACK_PRICES, PRODUCT_IDS, type Locale, type ProductId } from '@da/domain';
import { formatMoney } from '@da/i18n';
import type { ProOfferings } from '@/services/purchases';

export type PlanKey = 'monthly' | 'annual';

export interface PlanPricing {
  monthly: string;
  annual: string;
  /** "124 TL" — the annual price spread over 12 months. */
  annualPerMonth: string | null;
  savingsPercent: number | null;
  /** True when both labels come from the store (RevenueCat offerings). */
  fromStore: boolean;
  hasIntroOffer: boolean;
}

export function savingsPercent(monthly: number, annual: number): number | null {
  if (!(monthly > 0) || !(annual > 0)) return null;
  const pct = Math.round((1 - annual / (monthly * 12)) * 100);
  return pct > 0 ? pct : null;
}

export function planPricing(offerings: ProOfferings | null, locale: Locale): PlanPricing {
  const monthly = offerings?.monthly ?? null;
  const annual = offerings?.annual ?? null;
  if (monthly && annual) {
    const currency = annual.product.currencyCode;
    const a = annual.product.price;
    return {
      monthly: monthly.product.priceString,
      annual: annual.product.priceString,
      annualPerMonth: a > 0 ? formatMoney(Math.round(a / 12), currency, locale) : null,
      savingsPercent: savingsPercent(monthly.product.price, a),
      fromStore: true,
      hasIntroOffer: offerings?.hasIntroOffer ?? false,
    };
  }
  const m = FALLBACK_PRICES.monthly;
  const y = FALLBACK_PRICES.annual;
  return {
    monthly: m.label,
    annual: y.label,
    annualPerMonth: formatMoney(Math.round(y.amount / 12), y.currency, locale),
    savingsPercent: savingsPercent(m.amount, y.amount),
    fromStore: false,
    hasIntroOffer: false,
  };
}

export function productIdFor(plan: PlanKey): ProductId {
  return PRODUCT_IDS[plan];
}

const CONTEXT_RE = /^[a-z][a-z0-9_]{0,39}$/;

/** `paywall.contextTitles.<context>` for a well-formed context; the caller checks existence. */
export function contextTitleKey(context: string | undefined | null): string | null {
  return context && CONTEXT_RE.test(context) ? `paywall.contextTitles.${context}` : null;
}
