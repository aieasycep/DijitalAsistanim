import type { Plan } from './enums';

/** Gated product features. Checked ONLY via the central entitlement resolver (@da/server-core / api-client). */
export const FEATURES = [
  'multiple_accounts',
  'unlimited_assistant',
  'midday_pulse',
  'evening_close',
  'meeting_prep',
  'smart_follow_up',
  'voice_briefing',
  'ai_memory',
  'vip_people',
  'advanced_planning',
  'multiple_calendars',
  'android_notification_intelligence',
  'advanced_capture',
  'weekly_insights',
  'attachment_analysis',
] as const;
export type Feature = (typeof FEATURES)[number];

export const FREE_QUOTAS = {
  maxEmailAccounts: 1,
  maxCalendarAccounts: 1,
  assistantQueriesPerDay: 10,
  capturesPerDay: 5,
} as const;

export const PRO_QUOTAS = {
  maxEmailAccounts: 10,
  maxCalendarAccounts: 10,
  /** fair use */
  assistantQueriesPerDay: 300,
  capturesPerDay: 100,
} as const;

export const FEATURE_PLAN: Record<Feature, Plan> = {
  multiple_accounts: 'pro',
  unlimited_assistant: 'pro',
  midday_pulse: 'pro',
  evening_close: 'pro',
  meeting_prep: 'pro',
  smart_follow_up: 'pro',
  voice_briefing: 'pro',
  ai_memory: 'pro',
  vip_people: 'pro',
  advanced_planning: 'pro',
  multiple_calendars: 'pro',
  android_notification_intelligence: 'pro',
  advanced_capture: 'pro',
  weekly_insights: 'pro',
  attachment_analysis: 'pro',
};

export const PRODUCT_IDS = {
  monthly: 'da_pro_monthly',
  annual: 'da_pro_annual',
} as const;
export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

export const ENTITLEMENT_ID = 'pro';

/** Fallback design copy prices when the store has not returned localized prices. */
export const FALLBACK_PRICES = {
  monthly: { amount: 199, currency: 'TRY', label: '199 TL / ay' },
  annual: { amount: 1490, currency: 'TRY', label: '1.490 TL / yıl' },
} as const;

export const REFERRAL_BONUS_DAYS = 14;
export const TRIAL_DAYS = 7;
