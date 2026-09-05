/**
 * Privacy-safe analytics event catalogue. Properties are strictly typed so that mail bodies,
 * subjects, names, emails or assistant text can never be attached.
 */
export type AnalyticsEventMap = {
  onboarding_started: { platform: 'ios' | 'android' };
  account_connected: { provider: 'google' | 'microsoft' | 'apple' | 'device'; kind: 'email' | 'calendar' | 'tasks' };
  calendar_connected: { provider: 'google' | 'microsoft' | 'apple' | 'device' };
  first_analysis_completed: { durationMs: number; emailsFound: number; insights: number };
  first_brief_opened: { itemCount: number };
  insight_opened: { kind: string; badge: string };
  action_approved: { actionType: string; edited: boolean };
  meeting_prep_opened: { minutesBefore: number };
  followup_completed: { daysWaited: number };
  assistant_query: { inputMode: 'text' | 'voice'; hadSources: boolean; createdApproval: boolean };
  paywall_viewed: { context: string };
  trial_started: { productId: string };
  subscription_started: { productId: string };
  referral_shared: { channel: 'whatsapp' | 'system' | 'copy' };
};
export type AnalyticsEventName = keyof AnalyticsEventMap;

/** Keys that must never appear in any analytics property (defense in depth). */
export const ANALYTICS_FORBIDDEN_KEYS = ['body', 'subject', 'name', 'email', 'text', 'message', 'content', 'query', 'snippet', 'draft'] as const;
