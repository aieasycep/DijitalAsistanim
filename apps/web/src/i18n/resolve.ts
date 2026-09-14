import { type Dictionary } from './types';

/** Values that drive copy which must never be hard-coded (see `publicEnv.trialDays`). */
export interface CopyVars {
  /** Positive when a trial is configured; null removes every trial mention. */
  trialDays: number | null;
  /** Referral bonus length (both sides), from `@da/domain`. */
  referralDays: number;
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/** Replaces `{{key}}` with `vars[key]`; unknown keys are left untouched. */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(PLACEHOLDER, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

function deepInterpolate<T>(value: T, vars: Record<string, string | number>): T {
  if (typeof value === 'string') return interpolate(value, vars) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => deepInterpolate(v, vars)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepInterpolate(v, vars);
    return out as T;
  }
  return value;
}

/**
 * Produces the dictionary the site renders from: when `trialDays` is set, the strings in
 * `trial` replace their no-trial counterparts (Pro CTA, plan note, trial FAQ answer, pricing meta
 * description, and a billing bullet inserted after the store-purchase bullet); then every
 * `{{trialDays}}` / `{{referralDays}}` placeholder is filled. Without a trial the base copy is used
 * unchanged, so no trial is ever promised that the stores do not offer.
 */
export function resolveDictionary(base: Dictionary, vars: CopyVars): Dictionary {
  const { trialDays, referralDays } = vars;
  const withTrial: Dictionary = trialDays
    ? {
        ...base,
        pricing: { ...base.pricing, ctaPro: base.trial.ctaPro, trialNote: base.trial.note },
        faq: {
          ...base.faq,
          items: base.faq.items.map((item) =>
            item.topic === 'trial' ? { ...item, a: base.trial.faqAnswer } : item,
          ),
        },
        pricingPage: {
          ...base.pricingPage,
          description: base.trial.pricingDescription,
          billing: [
            ...base.pricingPage.billing.slice(0, 1),
            base.trial.billingBullet,
            ...base.pricingPage.billing.slice(1),
          ],
        },
      }
    : base;
  const values: Record<string, string | number> = { referralDays };
  if (trialDays) values.trialDays = trialDays;
  return deepInterpolate(withTrial, values);
}
