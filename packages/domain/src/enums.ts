/**
 * Domain enums. These string unions are mirrored 1:1 by Postgres enum types in
 * supabase/migrations and by zod schemas in @da/validation. Change all three together.
 */

export const PROVIDERS = ['google', 'microsoft', 'apple', 'device', 'demo'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const ACCOUNT_KINDS = ['email', 'calendar', 'tasks', 'reminders', 'notifications'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const CONNECTION_STATUSES = ['active', 'syncing', 'expired', 'revoked', 'error', 'disconnected'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const SOURCE_TYPES = [
  'gmail',
  'outlook',
  'google_calendar',
  'microsoft_calendar',
  'apple_calendar',
  'device_calendar',
  'google_tasks',
  'microsoft_todo',
  'apple_reminders',
  'android_notification',
  'capture',
  'assistant',
  'meeting_note',
  'user',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const IMPORTANCE_LEVELS = ['critical', 'high', 'normal', 'low'] as const;
export type Importance = (typeof IMPORTANCE_LEVELS)[number];

export const EMAIL_CATEGORIES = [
  'action_required',
  'waiting_for_user',
  'waiting_for_other',
  'deadline',
  'meeting',
  'travel',
  'shipment',
  'payment',
  'subscription',
  'security',
  'information',
  'promotion',
] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

/** Stage-1 deterministic bucket before any AI. */
export const TRIAGE_BUCKETS = ['skip', 'low', 'rules', 'ai'] as const;
export type TriageBucket = (typeof TRIAGE_BUCKETS)[number];

export const INSIGHT_KINDS = [
  'priority',
  'meeting',
  'deadline',
  'follow_up',
  'waiting_for_user',
  'commitment',
  'life_event',
  'suggestion',
  'conflict',
  'security',
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export const INSIGHT_STATUSES = ['active', 'completed', 'dismissed', 'snoozed', 'expired'] as const;
export type InsightStatus = (typeof INSIGHT_STATUSES)[number];

export const LIFE_EVENT_TYPES = ['shipment', 'flight', 'reservation', 'payment', 'subscription', 'security'] as const;
export type LifeEventType = (typeof LIFE_EVENT_TYPES)[number];

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'executing', 'executed', 'failed', 'expired'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_ACTION_TYPES = [
  'email_send',
  'calendar_create',
  'calendar_update',
  'task_create',
  'reminder_create',
  'commitment_create',
] as const;
export type ApprovalActionType = (typeof APPROVAL_ACTION_TYPES)[number];

export const BRIEFING_KINDS = ['morning', 'midday', 'evening', 'weekly'] as const;
export type BriefingKind = (typeof BRIEFING_KINDS)[number];

export const BRIEFING_SECTIONS = [
  'priorities',
  'schedule',
  'waiting_for_you',
  'waiting_for_others',
  'deadlines',
  'personal',
  'completed',
  'carried_over',
  'follow_ups',
  'first_event_tomorrow',
  'changes',
  'rest_of_day',
] as const;
export type BriefingSection = (typeof BRIEFING_SECTIONS)[number];

export const REMINDER_OPTIONS = ['before_30m', 'before_1h', 'this_evening', 'tomorrow_morning', 'smart', 'custom'] as const;
export type ReminderOption = (typeof REMINDER_OPTIONS)[number];

export const REMINDER_STATUSES = ['scheduled', 'fired', 'completed', 'cancelled'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const TASK_STATUSES = ['open', 'completed', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const COMMITMENT_DIRECTIONS = ['user_owes', 'other_owes'] as const;
export type CommitmentDirection = (typeof COMMITMENT_DIRECTIONS)[number];

export const COMMITMENT_STATUSES = ['proposed', 'open', 'completed', 'postponed', 'cancelled'] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

export const FOLLOW_UP_STATUSES = ['watching', 'nudge_due', 'replied', 'closed', 'snoozed'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const PRIORITY_RULE_TYPES = [
  'sender_important',
  'domain_important',
  'vip_notify',
  'keyword_high',
  'promotions_low',
  'mute_sender',
  'mute_domain',
  'keyword_low',
] as const;
export type PriorityRuleType = (typeof PRIORITY_RULE_TYPES)[number];

export const LEARNED_PREFERENCE_KINDS = [
  'person_priority',
  'category_priority',
  'reminder_lead_time',
  'follow_up_cadence',
  'dismiss_pattern',
  'briefing_focus',
] as const;
export type LearnedPreferenceKind = (typeof LEARNED_PREFERENCE_KINDS)[number];

export const AI_FEEDBACK_KINDS = [
  'not_important',
  'important',
  'show_more',
  'show_less',
  'make_vip',
  'stop_following',
  'correct',
  'wrong',
] as const;
export type AiFeedbackKind = (typeof AI_FEEDBACK_KINDS)[number];

export const CAPTURE_KINDS = ['image', 'pdf', 'file', 'link', 'text', 'audio'] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export const CAPTURE_STATUSES = ['uploaded', 'analyzing', 'analyzed', 'failed'] as const;
export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];

export const CAPTURE_DETECTED_TYPES = [
  'event',
  'task',
  'deadline',
  'person',
  'note',
  'payment',
  'reservation',
  'travel',
  'product_info',
] as const;
export type CaptureDetectedType = (typeof CAPTURE_DETECTED_TYPES)[number];

export const NOTIFICATION_CATEGORIES = [
  'morning',
  'midday',
  'evening',
  'weekly',
  'critical_email',
  'meeting',
  'deadline',
  'follow_up',
  'life_event',
  'approval',
  'reminder',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const LOCK_SCREEN_PRIVACY = ['full', 'title_only', 'generic'] as const;
export type LockScreenPrivacy = (typeof LOCK_SCREEN_PRIVACY)[number];

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const LOCALES = ['tr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const REPLY_TONES = ['short', 'professional', 'friendly', 'detailed'] as const;
export type ReplyTone = (typeof REPLY_TONES)[number];

export const PLANS = ['free', 'pro'] as const;
export type Plan = (typeof PLANS)[number];

export const SUBSCRIPTION_STATUSES = ['none', 'trial', 'active', 'grace', 'billing_issue', 'expired', 'cancelled', 'referral_bonus'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_SOURCES = ['revenuecat', 'referral', 'promo', 'demo'] as const;
export type SubscriptionSource = (typeof SUBSCRIPTION_SOURCES)[number];

export const RETENTION_OPTIONS = ['30d', '90d', '1y', 'forever'] as const;
export type RetentionOption = (typeof RETENTION_OPTIONS)[number];

export const EXPORT_STATUSES = ['requested', 'processing', 'ready', 'failed', 'expired'] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export const REFERRAL_STATUSES = ['pending', 'redeemed', 'rejected', 'expired'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const PUSH_DELIVERY_STATUSES = ['queued', 'sent', 'delivered', 'failed', 'deduped', 'suppressed'] as const;
export type PushDeliveryStatus = (typeof PUSH_DELIVERY_STATUSES)[number];

export const FLOW_FILTERS = ['all', 'important', 'mail', 'calendar', 'follow_up', 'personal'] as const;
export type FlowFilter = (typeof FLOW_FILTERS)[number];

export const MAIL_INTELLIGENCE_CATEGORIES = [
  'important',
  'waiting_for_user',
  'waiting_for_other',
  'has_deadline',
  'information',
  'low_priority',
] as const;
export type MailIntelligenceCategory = (typeof MAIL_INTELLIGENCE_CATEGORIES)[number];

export const PERSONALIZATION_INTERESTS = ['work', 'family', 'finance', 'travel', 'shopping', 'appointments', 'deadlines', 'all'] as const;
export type PersonalizationInterest = (typeof PERSONALIZATION_INTERESTS)[number];

export const AUDIT_ACTIONS = [
  'oauth.connect',
  'oauth.refresh',
  'oauth.revoke',
  'oauth.scope_upgrade',
  'token.decrypt',
  'approval.create',
  'approval.approve',
  'approval.reject',
  'approval.edit',
  'approval.execute',
  'approval.fail',
  'email.send',
  'calendar.write',
  'task.write',
  'reminder.write',
  'data.export',
  'data.delete_history',
  'account.delete',
  'retention.cleanup',
  'sync.run',
  'push.send',
  'ai.call',
  'notification.access_change',
  'referral.redeem',
  'subscription.change',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const DEVICE_PLATFORMS = ['ios', 'android', 'web'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const ANDROID_NOTIFICATION_SCOPES = ['all_allowed', 'selected'] as const;
export type AndroidNotificationScope = (typeof ANDROID_NOTIFICATION_SCOPES)[number];
