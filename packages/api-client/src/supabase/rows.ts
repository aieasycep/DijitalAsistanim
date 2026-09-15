/**
 * Minimal row shapes for every table this adapter reads or writes — snake_case, exactly as PostgREST returns
 * them (see supabase/migrations). jsonb columns are typed with the domain shapes the server writes into them;
 * timestamptz columns arrive as ISO strings and are normalised to UTC by the mappers.
 *
 * These are deliberately hand-written instead of generated `Database` types: the adapter only needs the
 * columns it touches and keeps the domain package as the single source of truth for enums/JSON shapes.
 */
import type {
  AiFeedbackKind,
  ApprovalAction,
  ApprovalActionType,
  ApprovalStatus,
  AssistantRichCard,
  BriefingAudio,
  BriefingCounts,
  BriefingKind,
  BriefingSection,
  CalendarAttendee,
  CalendarEvent,
  Capture,
  CaptureAnalysis,
  CaptureKind,
  CaptureStatus,
  CommitmentDirection,
  CommitmentStatus,
  ConnectionStatus,
  Contact,
  DataSourceControls,
  DevicePlatform,
  EmailAnalysis,
  EmailCategory,
  EmailParticipant,
  FollowUpStatus,
  Importance,
  Insight,
  InsightAction,
  InsightKind,
  InsightStatus,
  LearnedPreferenceKind,
  LifeEvent,
  LifeEventExtraction,
  LifeEventType,
  Locale,
  LockScreenPrivacy,
  NotificationCategory,
  Plan,
  PriorityRuleType,
  Provider,
  Reminder,
  ReminderOption,
  ReminderStatus,
  RetentionOption,
  ScheduleSuggestion,
  SourceRef,
  SourceType,
  SubscriptionSource,
  SubscriptionStatus,
  TaskStatus,
  ThemePreference,
  TriageBucket,
  WeeklyMetrics,
} from '@da/domain';

/** ISO-8601 string as returned by PostgREST for timestamptz (usually with a `+00:00` offset). */
export type Timestamp = string;

export interface ProfileRow {
  id: string;
  display_name: string;
  first_name: string;
  email: string | null;
  avatar_url: string | null;
  timezone: string;
  locale: Locale;
  onboarding_completed_at: Timestamp | null;
  first_analysis_completed_at: Timestamp | null;
  referral_code: string;
  referred_by_code: string | null;
  plan: Plan;
  revenuecat_app_user_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface UserPreferencesRow {
  user_id: string;
  theme: ThemePreference;
  locale: Locale;
  timezone: string;
  briefing: Record<string, unknown>;
  interests: string[];
  learn_from_interactions: boolean;
  default_reminder_lead_minutes: number;
  retention: RetentionOption;
  analyze_attachments: boolean;
  reduced_motion: boolean;
  haptics_enabled: boolean;
  android_notification_scope: 'all_allowed' | 'selected';
  android_allowed_packages: string[];
  android_notification_upload_consent: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface NotificationPreferencesRow {
  user_id: string;
  categories: Partial<Record<NotificationCategory, boolean>>;
  only_when_important: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  lock_screen_privacy: LockScreenPrivacy;
  meeting_lead_minutes: number;
  system_permission_granted: boolean | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ConnectedAccountRow {
  id: string;
  user_id: string;
  provider: Provider;
  kinds: string[];
  external_account_id: string;
  display_name: string;
  email: string | null;
  status: ConnectionStatus;
  granted_scopes: string[];
  controls: Partial<DataSourceControls>;
  last_sync_at: Timestamp | null;
  last_error: string | null;
  backfill_completed: boolean;
  is_primary: boolean;
  deleted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ContactRow {
  id: string;
  user_id: string;
  display_name: string;
  emails: string[];
  phones: string[];
  company: string | null;
  title: string | null;
  avatar_url: string | null;
  last_contact_at: Timestamp | null;
  interaction_count: number;
  is_vip: boolean;
  source: Contact['source'];
  deleted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface VipPersonRow {
  id: string;
  user_id: string;
  contact_id: string | null;
  display_name: string;
  email: string | null;
  relation: string | null;
  notify_always: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PriorityRuleRow {
  id: string;
  user_id: string;
  type: PriorityRuleType;
  value: string;
  label: string;
  enabled: boolean;
  position: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface LearnedPreferenceRow {
  id: string;
  user_id: string;
  kind: LearnedPreferenceKind;
  statement: string;
  subject_key: string;
  weight: number;
  evidence_count: number;
  enabled: boolean;
  last_reinforced_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface EmailThreadRow {
  id: string;
  user_id: string;
  account_id: string;
  external_thread_id: string;
  subject: string;
  snippet: string;
  participants: EmailParticipant[];
  last_message_at: Timestamp;
  message_count: number;
  last_from_user: boolean;
  is_read: boolean;
  labels: string[];
  importance: Importance;
  category: EmailCategory;
  analysis: EmailAnalysis | null;
  priority_score: number;
  priority_reasons: string[];
  triage: TriageBucket;
  fingerprint: string;
  user_dismissed: boolean;
  user_marked_done: boolean;
  analyzed_at: Timestamp | null;
  deleted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CalendarEventRow {
  id: string;
  user_id: string;
  account_id: string;
  external_event_id: string;
  calendar_id: string;
  title: string;
  description: string | null;
  location: string | null;
  meeting_url: string | null;
  meeting_provider: string | null;
  start_at: Timestamp;
  end_at: Timestamp;
  all_day: boolean;
  attendees: CalendarAttendee[];
  organizer_is_user: boolean;
  status: CalendarEvent['status'];
  provider_updated_at: Timestamp | null;
  source: SourceType;
  prep_generated_at: Timestamp | null;
  post_meeting_handled_at: Timestamp | null;
  is_ai_created: boolean;
  deleted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TaskRow {
  id: string;
  user_id: string;
  account_id: string | null;
  external_task_id: string | null;
  title: string;
  notes: string | null;
  due_at: Timestamp | null;
  status: TaskStatus;
  completed_at: Timestamp | null;
  source: SourceRef | null;
  provider: string;
  scheduled_start_at: Timestamp | null;
  scheduled_end_at: Timestamp | null;
  priority: Importance;
  deleted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ReminderRow {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  remind_at: Timestamp;
  option: ReminderOption;
  status: ReminderStatus;
  target_type: NonNullable<Reminder['targetType']> | null;
  target_id: string | null;
  source: SourceRef | null;
  smart_reason: string | null;
  local_notification_id: string | null;
  fired_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CommitmentRow {
  id: string;
  user_id: string;
  text: string;
  quote: string | null;
  direction: CommitmentDirection;
  counterpart_name: string | null;
  counterpart_contact_id: string | null;
  due_at: Timestamp | null;
  due_text: string | null;
  status: CommitmentStatus;
  source: SourceRef;
  confidence: number;
  completed_at: Timestamp | null;
  postponed_until: Timestamp | null;
  related_event_id: string | null;
  dedupe_key: string;
  deleted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface FollowUpRow {
  id: string;
  user_id: string;
  thread_id: string;
  contact_id: string | null;
  counterpart_name: string;
  topic: string;
  sent_at: Timestamp;
  nudge_after_days: number;
  status: FollowUpStatus;
  snoozed_until: Timestamp | null;
  replied_at: Timestamp | null;
  closed_at: Timestamp | null;
  last_nudged_at: Timestamp | null;
  source: SourceRef;
  dismiss_count: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface LifeEventRow {
  id: string;
  user_id: string;
  type: LifeEventType;
  title: string;
  details: LifeEventExtraction['details'];
  event_at: Timestamp | null;
  status: LifeEvent['status'];
  source: SourceRef;
  confidence: number;
  dedupe_key: string;
  deleted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** `calendar_conflicts` with both events embedded through their FK names (see plan.ts CONFLICT_SELECT). */
export interface CalendarConflictRow {
  id: string;
  user_id: string;
  event_a_id: string;
  event_b_id: string;
  overlap_minutes: number;
  suggestions: ScheduleSuggestion[];
  status: 'open' | 'resolved' | 'ignored';
  created_at: Timestamp;
  updated_at: Timestamp;
  event_a?: CalendarEventRow | null;
  event_b?: CalendarEventRow | null;
}

export interface InsightRow {
  id: string;
  user_id: string;
  kind: InsightKind;
  badge: Insight['badge'];
  title: string;
  subtitle: string | null;
  reason: string | null;
  importance: Importance;
  priority_score: number;
  priority_reasons: string[];
  time_label: string | null;
  due_at: Timestamp | null;
  status: InsightStatus;
  snoozed_until: Timestamp | null;
  source: SourceRef;
  actions: InsightAction[];
  entity_type: Insight['entityType'];
  entity_id: string;
  tags: string[];
  for_date: string;
  confidence: number;
  is_low_confidence: boolean;
  dedupe_key: string;
  completed_at: Timestamp | null;
  dismissed_at: Timestamp | null;
  deleted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface BriefingItemRow {
  id: string;
  briefing_id: string;
  user_id: string;
  section: BriefingSection;
  position: number;
  icon: string;
  title: string;
  meta: string | null;
  source: SourceRef | null;
  insight_id: string | null;
  entity_type: Insight['entityType'] | null;
  entity_id: string | null;
  chapter_index: number | null;
  status: string | null;
  created_at: Timestamp;
}

/** `briefings` optionally embedding `items:briefing_items(*)` (see briefings.ts BRIEFING_SELECT). */
export interface BriefingRow {
  id: string;
  user_id: string;
  kind: BriefingKind;
  for_date: string;
  generated_at: Timestamp;
  headline: string;
  highlight_number: number;
  subline: string;
  mood: string;
  narrative: string;
  outlook: string | null;
  counts: Partial<BriefingCounts>;
  audio: BriefingAudio | null;
  estimated_read_sec: number;
  opened_at: Timestamp | null;
  closed_at: Timestamp | null;
  weekly: WeeklyMetrics | null;
  has_changes: boolean;
  version: number;
  produced_by: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  items?: BriefingItemRow[] | null;
}

export interface ApprovalActionRow {
  id: string;
  user_id: string;
  type: ApprovalActionType;
  status: ApprovalStatus;
  what: string;
  why: string;
  change_summary: string[];
  source: SourceRef | null;
  payload: Record<string, unknown>;
  original_payload: Record<string, unknown>;
  edited_by_user: boolean;
  idempotency_key: string;
  expires_at: Timestamp;
  approved_at: Timestamp | null;
  rejected_at: Timestamp | null;
  executed_at: Timestamp | null;
  execution_result: Record<string, unknown> | null;
  failure_reason: string | null;
  attempt_count: number;
  requested_by: ApprovalAction['requestedBy'];
  insight_id: string | null;
  required_scope: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AssistantThreadRow {
  id: string;
  user_id: string;
  title: string;
  last_message_at: Timestamp;
  contact_id: string | null;
  deleted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AssistantMessageRow {
  id: string;
  user_id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  input_mode: 'text' | 'voice';
  sources: SourceRef[];
  cards: AssistantRichCard[];
  approval_ids: string[];
  uncertain: boolean;
  tokens_in: number | null;
  tokens_out: number | null;
  model: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CaptureRow {
  id: string;
  user_id: string;
  kind: CaptureKind;
  status: CaptureStatus;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  original_text: string | null;
  url: string | null;
  extracted_text: string | null;
  analysis: CaptureAnalysis | null;
  failure_reason: string | null;
  origin: Capture['origin'];
  approval_ids: string[];
  deleted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PostMeetingNoteRow {
  id: string;
  user_id: string;
  event_id: string;
  text: string;
  input_mode: 'text' | 'voice';
  extracted_commitment_ids: string[];
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AndroidNotificationRow {
  id: string;
  user_id: string;
  package_name: string;
  app_name: string;
  title: string;
  text: string;
  posted_at: Timestamp;
  fingerprint: string;
  analysis: EmailAnalysis | null;
  insight_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PushTokenRow {
  id: string;
  user_id: string;
  token: string;
  platform: DevicePlatform;
  device_id: string;
  device_name: string | null;
  app_version: string | null;
  is_active: boolean;
  last_seen_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AiFeedbackRow {
  id: string;
  user_id: string;
  kind: AiFeedbackKind;
  entity_type: string;
  entity_id: string;
  contact_id: string | null;
  category: EmailCategory | null;
  note: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  source: SubscriptionSource;
  status: SubscriptionStatus;
  plan: Plan;
  product_id: string | null;
  entitlement_id: string;
  starts_at: Timestamp;
  expires_at: Timestamp | null;
  is_trial: boolean;
  will_renew: boolean;
  store: string | null;
  revenuecat_app_user_id: string | null;
  last_event_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  actor: 'user' | 'system' | 'assistant' | 'cron' | 'webhook';
  target_type: string | null;
  target_id: string | null;
  created_at: Timestamp;
}

export interface FeedbackSubmissionRow {
  id: string;
  user_id: string | null;
  category: string;
  message: string;
  diagnostics: Record<string, unknown> | null;
  app_version: string | null;
  platform: DevicePlatform | null;
  created_at: Timestamp;
}
