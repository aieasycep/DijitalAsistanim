-- Dijital Asistan · 0002 · enum types (mirrors packages/domain/src/enums.ts — change both together)

create type public.provider_t as enum ('google', 'microsoft', 'apple', 'device', 'demo');
create type public.account_kind_t as enum ('email', 'calendar', 'tasks', 'reminders', 'notifications');
create type public.connection_status_t as enum ('active', 'syncing', 'expired', 'revoked', 'error', 'disconnected');
create type public.source_type_t as enum (
  'gmail', 'outlook', 'google_calendar', 'microsoft_calendar', 'apple_calendar', 'device_calendar',
  'google_tasks', 'microsoft_todo', 'apple_reminders', 'android_notification', 'capture', 'assistant', 'meeting_note', 'user'
);
create type public.importance_t as enum ('critical', 'high', 'normal', 'low');
create type public.email_category_t as enum (
  'action_required', 'waiting_for_user', 'waiting_for_other', 'deadline', 'meeting', 'travel', 'shipment',
  'payment', 'subscription', 'security', 'information', 'promotion'
);
create type public.triage_bucket_t as enum ('skip', 'low', 'rules', 'ai');
create type public.insight_kind_t as enum (
  'priority', 'meeting', 'deadline', 'follow_up', 'waiting_for_user', 'commitment', 'life_event', 'suggestion', 'conflict', 'security'
);
create type public.insight_status_t as enum ('active', 'completed', 'dismissed', 'snoozed', 'expired');
create type public.insight_badge_t as enum ('urgent', 'deadline', 'meeting', 'follow_up', 'personal', 'commitment', 'calendar', 'security', 'waiting');
create type public.insight_entity_t as enum ('email_thread', 'calendar_event', 'task', 'commitment', 'follow_up', 'life_event', 'suggestion', 'conflict');
create type public.life_event_type_t as enum ('shipment', 'flight', 'reservation', 'payment', 'subscription', 'security');
create type public.life_event_status_t as enum ('upcoming', 'today', 'done', 'dismissed', 'expired');
create type public.approval_status_t as enum ('pending', 'approved', 'rejected', 'executing', 'executed', 'failed', 'expired');
create type public.approval_action_type_t as enum ('email_send', 'calendar_create', 'calendar_update', 'task_create', 'reminder_create', 'commitment_create');
create type public.approval_requested_by_t as enum ('assistant', 'voice', 'capture', 'email_detail', 'plan', 'post_meeting', 'reminder', 'follow_up', 'conflict', 'midday', 'evening');
create type public.briefing_kind_t as enum ('morning', 'midday', 'evening', 'weekly');
create type public.briefing_section_t as enum (
  'priorities', 'schedule', 'waiting_for_you', 'waiting_for_others', 'deadlines', 'personal', 'completed', 'carried_over',
  'follow_ups', 'first_event_tomorrow', 'changes', 'rest_of_day'
);
create type public.reminder_option_t as enum ('before_30m', 'before_1h', 'this_evening', 'tomorrow_morning', 'smart', 'custom');
create type public.reminder_status_t as enum ('scheduled', 'fired', 'completed', 'cancelled');
create type public.reminder_target_t as enum ('email_thread', 'calendar_event', 'task', 'commitment', 'life_event', 'insight', 'follow_up');
create type public.task_status_t as enum ('open', 'completed', 'cancelled');
create type public.commitment_direction_t as enum ('user_owes', 'other_owes');
create type public.commitment_status_t as enum ('proposed', 'open', 'completed', 'postponed', 'cancelled');
create type public.follow_up_status_t as enum ('watching', 'nudge_due', 'replied', 'closed', 'snoozed');
create type public.priority_rule_type_t as enum (
  'sender_important', 'domain_important', 'vip_notify', 'keyword_high', 'promotions_low', 'mute_sender', 'mute_domain', 'keyword_low'
);
create type public.learned_preference_kind_t as enum (
  'person_priority', 'category_priority', 'reminder_lead_time', 'follow_up_cadence', 'dismiss_pattern', 'briefing_focus'
);
create type public.ai_feedback_kind_t as enum ('not_important', 'important', 'show_more', 'show_less', 'make_vip', 'stop_following', 'correct', 'wrong');
create type public.capture_kind_t as enum ('image', 'pdf', 'file', 'link', 'text', 'audio');
create type public.capture_status_t as enum ('uploaded', 'analyzing', 'analyzed', 'failed');
create type public.capture_origin_t as enum ('in_app', 'share_extension', 'android_intent');
create type public.notification_category_t as enum (
  'morning', 'midday', 'evening', 'weekly', 'critical_email', 'meeting', 'deadline', 'follow_up', 'life_event', 'approval', 'reminder'
);
create type public.lock_screen_privacy_t as enum ('full', 'title_only', 'generic');
create type public.theme_preference_t as enum ('system', 'light', 'dark');
create type public.locale_t as enum ('tr', 'en');
create type public.plan_t as enum ('free', 'pro');
create type public.subscription_status_t as enum ('none', 'trial', 'active', 'grace', 'billing_issue', 'expired', 'cancelled', 'referral_bonus');
create type public.subscription_source_t as enum ('revenuecat', 'referral', 'promo', 'demo');
create type public.retention_option_t as enum ('30d', '90d', '1y', 'forever');
create type public.export_status_t as enum ('requested', 'processing', 'ready', 'failed', 'expired');
create type public.referral_status_t as enum ('pending', 'redeemed', 'rejected', 'expired');
create type public.push_delivery_status_t as enum ('queued', 'sent', 'delivered', 'failed', 'deduped', 'suppressed');
create type public.device_platform_t as enum ('ios', 'android', 'web');
create type public.android_notification_scope_t as enum ('all_allowed', 'selected');
create type public.sync_resource_t as enum ('mail', 'calendar', 'tasks', 'notifications');
create type public.sync_mode_t as enum ('webhook', 'polling');
create type public.event_status_t as enum ('confirmed', 'tentative', 'cancelled');
create type public.contact_source_t as enum ('communication', 'native_contacts', 'manual');
create type public.audit_actor_t as enum ('user', 'system', 'assistant', 'cron', 'webhook');
create type public.message_role_t as enum ('user', 'assistant', 'system');
create type public.input_mode_t as enum ('text', 'voice');
create type public.conflict_status_t as enum ('open', 'resolved', 'ignored');
create type public.first_analysis_step_t as enum ('scanning', 'classifying', 'calendar', 'open_loops', 'done', 'failed');
