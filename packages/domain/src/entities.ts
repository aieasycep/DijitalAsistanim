import type {
  AccountKind,
  AiFeedbackKind,
  AndroidNotificationScope,
  ApprovalActionType,
  ApprovalStatus,
  AuditAction,
  BriefingKind,
  BriefingSection,
  CaptureDetectedType,
  CaptureKind,
  CaptureStatus,
  CommitmentDirection,
  CommitmentStatus,
  ConnectionStatus,
  DevicePlatform,
  EmailCategory,
  ExportStatus,
  FollowUpStatus,
  Importance,
  InsightKind,
  InsightStatus,
  LearnedPreferenceKind,
  LifeEventType,
  Locale,
  LockScreenPrivacy,
  NotificationCategory,
  PersonalizationInterest,
  Plan,
  PriorityRuleType,
  Provider,
  PushDeliveryStatus,
  ReferralStatus,
  ReminderOption,
  ReminderStatus,
  ReplyTone,
  RetentionOption,
  SourceType,
  SubscriptionSource,
  SubscriptionStatus,
  TaskStatus,
  ThemePreference,
  TriageBucket,
} from './enums';
import type { SourceRef } from './source';

/** ISO-8601 UTC timestamp string. */
export type ISODateTime = string;
/** YYYY-MM-DD */
export type ISODate = string;
export type UUID = string;

export interface Timestamps {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
export interface SoftDelete {
  deletedAt?: ISODateTime | null;
}
export interface UserOwned {
  userId: UUID;
}

// ---------------------------------------------------------------------------
// Profile & preferences
// ---------------------------------------------------------------------------

export interface Profile extends Timestamps {
  id: UUID;
  displayName: string;
  firstName: string;
  email?: string | null;
  avatarUrl?: string | null;
  /** IANA timezone, e.g. Europe/Istanbul */
  timezone: string;
  locale: Locale;
  onboardingCompletedAt?: ISODateTime | null;
  firstAnalysisCompletedAt?: ISODateTime | null;
  referralCode: string;
  referredByCode?: string | null;
  plan: Plan;
}

export interface BriefingSchedule {
  morningTime: string; // "07:30"
  middayEnabled: boolean;
  middayTime: string; // "13:00"
  eveningEnabled: boolean;
  eveningTime: string; // "19:00"
  weeklyEnabled: boolean;
  weeklyDay: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
  weeklyTime: string; // "18:00"
  weekendEnabled: boolean;
  /** ISO weekday numbers (1=Mon..7=Sun) on which no briefings are sent */
  quietDays: number[];
}

export interface UserPreferences extends UserOwned, Timestamps {
  theme: ThemePreference;
  locale: Locale;
  timezone: string;
  briefing: BriefingSchedule;
  interests: PersonalizationInterest[];
  /** "Etkileşimlerimden öğren" */
  learnFromInteractions: boolean;
  /** Only used for meeting prep reminders and smart reminder suggestions. */
  defaultReminderLeadMinutes: number;
  retention: RetentionOption;
  /** "Ekleri analiz et" — opt-in per user (can be narrowed per account) */
  analyzeAttachments: boolean;
  /** Free-plan daily assistant quota consumption is tracked separately (usage_counters). */
  reducedMotion: boolean;
  hapticsEnabled: boolean;
  /** Android only */
  androidNotificationScope: AndroidNotificationScope;
  androidAllowedPackages: string[];
  androidNotificationUploadConsent: boolean;
}

// ---------------------------------------------------------------------------
// Connections & sync
// ---------------------------------------------------------------------------

export interface DataSourceControls {
  readEmail: boolean;
  analyzeAttachments: boolean;
  detectDeadlines: boolean;
  prepareDrafts: boolean;
  readEvents: boolean;
  suggestSchedule: boolean;
  createEventsWithApproval: boolean;
  readTasks: boolean;
}

export interface ConnectedAccount extends UserOwned, Timestamps, SoftDelete {
  id: UUID;
  provider: Provider;
  kinds: AccountKind[];
  /** Provider account identifier (email address for Google/Microsoft, "device" for EventKit). */
  externalAccountId: string;
  displayName: string;
  email?: string | null;
  status: ConnectionStatus;
  /** Granted OAuth scopes (least-privilege; write scopes appear after progressive auth). */
  grantedScopes: string[];
  controls: DataSourceControls;
  lastSyncAt?: ISODateTime | null;
  lastError?: string | null;
  /** True once history backfill (default 90 days) has finished. */
  backfillCompleted: boolean;
  isPrimary: boolean;
}

export interface SyncState extends UserOwned, Timestamps {
  id: UUID;
  accountId: UUID;
  resource: 'mail' | 'calendar' | 'tasks' | 'notifications';
  /** Gmail historyId / Graph deltaLink / EventKit last modified */
  cursor?: string | null;
  /** Webhook subscription id (Gmail watch / Graph subscription) */
  subscriptionId?: string | null;
  subscriptionExpiresAt?: ISODateTime | null;
  mode: 'webhook' | 'polling';
  lastRunAt?: ISODateTime | null;
  lastSuccessAt?: ISODateTime | null;
  backfillUntil?: ISODateTime | null;
  /** Continuation token of a multi-page backfill listing. */
  backfillPageToken?: string | null;
  errorCount: number;
  lastError?: string | null;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface Contact extends UserOwned, Timestamps, SoftDelete {
  id: UUID;
  displayName: string;
  emails: string[];
  phones: string[];
  company?: string | null;
  title?: string | null;
  avatarUrl?: string | null;
  /** Derived stats */
  lastContactAt?: ISODateTime | null;
  interactionCount: number;
  /** Explicit VIP (mirrors vip_people row) */
  isVip: boolean;
  source: 'communication' | 'native_contacts' | 'manual';
}

export interface VipPerson extends UserOwned, Timestamps {
  id: UUID;
  contactId?: UUID | null;
  displayName: string;
  email?: string | null;
  relation?: string | null; // "Yönetici", "Müşteri", "Aile"
  notifyAlways: boolean;
}

export interface PersonIntelligence {
  contact: Contact;
  lastContact?: { at: ISODateTime; channel: SourceType; summary: string; source: SourceRef } | null;
  upcomingMeetings: CalendarEvent[];
  openLoops: number;
  recentTopics: { topic: string; at: ISODateTime; source: SourceRef }[];
  userOwes: Commitment[];
  theyOwe: Commitment[];
  relatedMessages: EmailThread[];
  relatedCommitments: Commitment[];
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export interface EmailParticipant {
  name?: string | null;
  email: string;
}

export interface EmailAnalysis {
  summary: string;
  importance: Importance;
  category: EmailCategory;
  reasonImportant?: string | null;
  requiresUserAction: boolean;
  /** Only if explicitly present in the source. */
  deadline?: ISODateTime | null;
  deadlineText?: string | null;
  keyPoints: string[];
  people: { name?: string | null; email?: string | null; role?: string | null }[];
  commitments: {
    text: string;
    direction: CommitmentDirection;
    dueAt?: ISODateTime | null;
    dueText?: string | null;
    counterpart?: string | null;
  }[];
  followUp?: { expected: boolean; nudgeAfterDays?: number | null; reason?: string | null } | null;
  suggestedActions: SuggestedAction[];
  lifeEvent?: LifeEventExtraction | null;
  confidence: number;
  /** Model/heuristic that produced this analysis (cost telemetry). */
  producedBy: 'heuristic' | 'rules' | 'ai_small' | 'ai_large';
}

export interface SuggestedAction {
  kind:
    | 'reply'
    | 'create_task'
    | 'add_to_calendar'
    | 'remind'
    | 'open_original'
    | 'follow_up'
    | 'track'
    | 'check_in'
    | 'pay'
    | 'open_link';
  label: string;
  payload?: Record<string, unknown>;
}

export interface EmailThread extends UserOwned, Timestamps, SoftDelete {
  id: UUID;
  accountId: UUID;
  externalThreadId: string;
  subject: string;
  snippet: string;
  participants: EmailParticipant[];
  lastMessageAt: ISODateTime;
  messageCount: number;
  /** True if the last message was sent by the user (candidate for follow-up watching). */
  lastFromUser: boolean;
  isRead: boolean;
  labels: string[];
  importance: Importance;
  category: EmailCategory;
  analysis?: EmailAnalysis | null;
  /** Final rank score from the priority engine (higher = more important). */
  priorityScore: number;
  priorityReasons: string[];
  triage: TriageBucket;
  /** Content fingerprint so identical content is never sent to AI twice. */
  fingerprint: string;
  userDismissed: boolean;
  userMarkedDone: boolean;
}

export interface EmailMessage extends UserOwned, Timestamps, SoftDelete {
  id: UUID;
  accountId: UUID;
  threadId: UUID;
  externalMessageId: string;
  from: EmailParticipant;
  to: EmailParticipant[];
  cc: EmailParticipant[];
  subject: string;
  snippet: string;
  /** Plain-text body (retention-limited; never cached offline on device). */
  bodyText?: string | null;
  sentAt: ISODateTime;
  isFromUser: boolean;
  hasAttachments: boolean;
  attachments: { id: string; filename: string; mimeType: string; size: number }[];
  labels: string[];
  webUrl?: string | null;
  fingerprint: string;
  analysis?: EmailAnalysis | null;
}

// ---------------------------------------------------------------------------
// Calendar, tasks, reminders
// ---------------------------------------------------------------------------

export interface CalendarAttendee {
  name?: string | null;
  email?: string | null;
  contactId?: UUID | null;
  isOrganizer: boolean;
  responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction' | null;
}

export interface CalendarEvent extends UserOwned, Timestamps, SoftDelete {
  id: UUID;
  accountId: UUID;
  externalEventId: string;
  calendarId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  meetingProvider?: 'google_meet' | 'teams' | 'zoom' | 'other' | null;
  startAt: ISODateTime;
  endAt: ISODateTime;
  allDay: boolean;
  attendees: CalendarAttendee[];
  organizerIsUser: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
  /** Provider updatedAt used for sync conflict resolution. */
  providerUpdatedAt?: ISODateTime | null;
  source: SourceType;
  /** Meeting-prep metadata */
  prepGeneratedAt?: ISODateTime | null;
  postMeetingHandledAt?: ISODateTime | null;
  isAiCreated: boolean;
}

export interface TaskItem extends UserOwned, Timestamps, SoftDelete {
  id: UUID;
  accountId?: UUID | null;
  externalTaskId?: string | null;
  title: string;
  notes?: string | null;
  dueAt?: ISODateTime | null;
  status: TaskStatus;
  completedAt?: ISODateTime | null;
  source?: SourceRef | null;
  provider: Provider | 'internal';
  /** Planned time block (from Plan → Planla) */
  scheduledStartAt?: ISODateTime | null;
  scheduledEndAt?: ISODateTime | null;
  priority: Importance;
}

export interface Reminder extends UserOwned, Timestamps {
  id: UUID;
  title: string;
  body?: string | null;
  remindAt: ISODateTime;
  option: ReminderOption;
  status: ReminderStatus;
  /** What the reminder points to */
  targetType?:
    | 'email_thread'
    | 'calendar_event'
    | 'task'
    | 'commitment'
    | 'life_event'
    | 'insight'
    | 'follow_up'
    | null;
  targetId?: UUID | null;
  source?: SourceRef | null;
  /** For smart reminders: why this time was chosen */
  smartReason?: string | null;
  localNotificationId?: string | null;
}

// ---------------------------------------------------------------------------
// Commitments & follow-ups
// ---------------------------------------------------------------------------

export interface Commitment extends UserOwned, Timestamps, SoftDelete {
  id: UUID;
  text: string; // "Mehmet'e teklif gönder"
  quote?: string | null; // "yarın göndereceğim"
  direction: CommitmentDirection;
  counterpartName?: string | null;
  counterpartContactId?: UUID | null;
  dueAt?: ISODateTime | null;
  dueText?: string | null;
  status: CommitmentStatus;
  source: SourceRef;
  confidence: number;
  completedAt?: ISODateTime | null;
  postponedUntil?: ISODateTime | null;
  relatedEventId?: UUID | null;
}

export interface FollowUp extends UserOwned, Timestamps {
  id: UUID;
  threadId: UUID;
  contactId?: UUID | null;
  counterpartName: string;
  topic: string;
  sentAt: ISODateTime;
  nudgeAfterDays: number;
  status: FollowUpStatus;
  snoozedUntil?: ISODateTime | null;
  repliedAt?: ISODateTime | null;
  closedAt?: ISODateTime | null;
  source: SourceRef;
  dismissCount: number;
}

// ---------------------------------------------------------------------------
// Insights (Today / Flow cards), life events
// ---------------------------------------------------------------------------

export interface InsightAction {
  id: string;
  label: string;
  kind:
    | SuggestedAction['kind']
    | 'prepare'
    | 'plan'
    | 'postpone'
    | 'complete'
    | 'snooze'
    | 'view_source'
    | 'suggest_time'
    | 'see_options'
    | 'ask_in_meeting'
    | 'wallet'
    | 'alarm';
  primary: boolean;
  payload?: Record<string, unknown>;
}

export interface Insight extends UserOwned, Timestamps, SoftDelete {
  id: UUID;
  kind: InsightKind;
  /** Badge tone label key: ACİL / SON TARİH / TOPLANTI / TAKİP / KİŞİSEL / TAAHHÜT / TAKVİM / GÜVENLİK */
  badge:
    | 'urgent'
    | 'deadline'
    | 'meeting'
    | 'follow_up'
    | 'personal'
    | 'commitment'
    | 'calendar'
    | 'security'
    | 'waiting';
  title: string;
  subtitle?: string | null;
  /** Why it is important (bottom sheet "Neden önemli?") */
  reason?: string | null;
  importance: Importance;
  priorityScore: number;
  priorityReasons: string[];
  /** Time label shown top-right: "08:42", "Yarın 12:00", "3 gün" */
  timeLabel?: string | null;
  dueAt?: ISODateTime | null;
  status: InsightStatus;
  snoozedUntil?: ISODateTime | null;
  source: SourceRef;
  actions: InsightAction[];
  /** Backing entity */
  entityType:
    | 'email_thread'
    | 'calendar_event'
    | 'task'
    | 'commitment'
    | 'follow_up'
    | 'life_event'
    | 'suggestion'
    | 'conflict';
  entityId: UUID;
  /** Flow filter tags */
  tags: ('important' | 'mail' | 'calendar' | 'follow_up' | 'personal')[];
  /** Day bucket (user tz) used for Today vs Flow grouping */
  forDate: ISODate;
  confidence: number;
  isLowConfidence: boolean;
  /** Dedupe key: kind+entity so re-runs never duplicate */
  dedupeKey: string;
}

export interface LifeEventExtraction {
  type: LifeEventType;
  title: string;
  /** Only fields explicitly present in the source. */
  details: {
    carrier?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    merchant?: string | null;
    deliveryWindow?: { start?: ISODateTime | null; end?: ISODateTime | null } | null;
    flightNumber?: string | null;
    airline?: string | null;
    from?: string | null;
    to?: string | null;
    departureAt?: ISODateTime | null;
    arrivalAt?: ISODateTime | null;
    pnr?: string | null;
    checkInUrl?: string | null;
    venue?: string | null;
    address?: string | null;
    reservationAt?: ISODateTime | null;
    partySize?: number | null;
    amount?: number | null;
    currency?: string | null;
    dueAt?: ISODateTime | null;
    payee?: string | null;
    paymentUrl?: string | null;
    serviceName?: string | null;
    renewsAt?: ISODateTime | null;
    securityEvent?: string | null;
    device?: string | null;
    location?: string | null;
  };
  confidence: number;
}

export interface LifeEvent extends UserOwned, Timestamps, SoftDelete {
  id: UUID;
  type: LifeEventType;
  title: string;
  details: LifeEventExtraction['details'];
  eventAt?: ISODateTime | null;
  status: 'upcoming' | 'today' | 'done' | 'dismissed' | 'expired';
  source: SourceRef;
  confidence: number;
  dedupeKey: string;
}

// ---------------------------------------------------------------------------
// Briefings
// ---------------------------------------------------------------------------

export interface BriefingItem {
  id: UUID;
  briefingId: UUID;
  section: BriefingSection;
  position: number;
  icon: string;
  title: string;
  meta?: string | null;
  source?: SourceRef | null;
  insightId?: UUID | null;
  entityType?: Insight['entityType'] | null;
  entityId?: UUID | null;
  /** Audio chapter this item belongs to */
  chapterIndex?: number | null;
  status?: 'open' | 'done' | null;
}

export interface BriefingAudio {
  provider: 'device_tts' | 'server_tts';
  url?: string | null;
  durationSec?: number | null;
  chapters: { index: number; title: string; startSec: number; durationSec: number; text: string }[];
  /** SSML-free plain narration script for device TTS */
  script: string;
}

export interface BriefingCounts {
  importantEmails: number;
  events: number;
  followUps: number;
  deadlines: number;
  total: number;
  analyzedEmails: number;
  analyzedCalendars: number;
  analyzedDays: number;
}

export interface Briefing extends UserOwned, Timestamps {
  id: UUID;
  kind: BriefingKind;
  forDate: ISODate;
  generatedAt: ISODateTime;
  /** "Bugün bilmen gereken 5 şey var." */
  headline: string;
  highlightNumber: number;
  /** "3 önemli mail · 4 etkinlik · 2 takip" */
  subline: string;
  /** "Bugün oldukça sakin bir günün var." */
  mood: string;
  /** Lora narrative paragraph */
  narrative: string;
  /** Editorial closing (weekly) */
  outlook?: string | null;
  counts: BriefingCounts;
  items: BriefingItem[];
  audio?: BriefingAudio | null;
  estimatedReadSec: number;
  openedAt?: ISODateTime | null;
  /** Evening: "Yarına Hazırım" */
  closedAt?: ISODateTime | null;
  /** Weekly metrics */
  weekly?: WeeklyMetrics | null;
  /** Midday: no changes → single line */
  hasChanges: boolean;
  version: number;
}

export interface WeeklyMetrics {
  weekStart: ISODate;
  weekEnd: ISODate;
  analyzedEmails: number;
  importantItems: number;
  followUps: number;
  followUpsAnswered: number;
  meetings: number;
  meetingsWithPrep: number;
  deadlines: number;
  deadlinesMissed: number;
  estimatedTimeSavedMinutes: number;
  timeSavedBreakdown: { unreadMails: number; prepNotes: number; followUpDrafts: number };
  busiestDay?: { date: ISODate; meetings: number; note: string } | null;
  topPeople: { name: string; count: number }[];
  nextWeek: string;
}

// ---------------------------------------------------------------------------
// Meeting prep / post meeting
// ---------------------------------------------------------------------------

export interface MeetingPrep {
  eventId: UUID;
  event: CalendarEvent;
  primaryPerson?: Contact | null;
  purpose: string;
  lastContact?: { at: ISODateTime; summary: string; source: SourceRef } | null;
  relevantEmails: { thread: EmailThread; why: string }[];
  openLoops: { text: string; source: SourceRef }[];
  userCommitments: Commitment[];
  theirCommitments: Commitment[];
  relevantFiles: { name: string; mimeType: string; source: SourceRef }[];
  talkingPoints: { title: string; detail: string; source?: SourceRef | null }[];
  twoMinuteSummary: string;
  travel?: { leaveAt: ISODateTime; durationMin: number; provider: string } | null;
  generatedAt: ISODateTime;
  confidence: number;
}

export interface PostMeetingNote extends UserOwned, Timestamps {
  id: UUID;
  eventId: UUID;
  text: string;
  inputMode: 'text' | 'voice';
  extractedCommitmentIds: UUID[];
}

// ---------------------------------------------------------------------------
// Calendar intelligence
// ---------------------------------------------------------------------------

export interface CalendarConflict {
  id: UUID;
  eventA: CalendarEvent;
  eventB: CalendarEvent;
  overlapMinutes: number;
  suggestions: ScheduleSuggestion[];
  status: 'open' | 'resolved' | 'ignored';
}

export interface ScheduleSuggestion {
  id: string;
  kind: 'move_event' | 'schedule_task' | 'add_prep_time' | 'add_buffer';
  title: string; // "Yarın 14:00–16:30 arasında 2,5 saat boşluğun var."
  detail: string; // "Teklif hazırlama görevini buraya yerleştirebilirim."
  proposedStartAt: ISODateTime;
  proposedEndAt: ISODateTime;
  targetEventId?: UUID | null;
  targetTaskId?: UUID | null;
  reason: string;
}

export interface FreeBlock {
  startAt: ISODateTime;
  endAt: ISODateTime;
  minutes: number;
}

export interface PlanDay {
  date: ISODate;
  events: CalendarEvent[];
  tasks: TaskItem[];
  commitments: Commitment[];
  freeBlocks: FreeBlock[];
  suggestions: ScheduleSuggestion[];
  conflicts: CalendarConflict[];
  backToBackWarnings: { fromEventId: UUID; toEventId: UUID }[];
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export interface EmailSendPayload {
  accountId: UUID;
  threadId?: UUID | null;
  inReplyToExternalId?: string | null;
  to: EmailParticipant[];
  cc?: EmailParticipant[];
  subject: string;
  bodyText: string;
  tone?: ReplyTone | null;
}
export interface CalendarCreatePayload {
  accountId: UUID;
  title: string;
  startAt: ISODateTime;
  endAt: ISODateTime;
  location?: string | null;
  description?: string | null;
  attendees?: EmailParticipant[];
  allDay?: boolean;
}
export interface CalendarUpdatePayload {
  accountId: UUID;
  eventId: UUID;
  externalEventId: string;
  expectedProviderUpdatedAt?: ISODateTime | null;
  changes: Partial<
    Pick<CalendarCreatePayload, 'title' | 'startAt' | 'endAt' | 'location' | 'description'>
  >;
}
export interface TaskCreatePayload {
  accountId?: UUID | null;
  title: string;
  notes?: string | null;
  dueAt?: ISODateTime | null;
  scheduledStartAt?: ISODateTime | null;
  scheduledEndAt?: ISODateTime | null;
}
export interface ReminderCreatePayload {
  title: string;
  body?: string | null;
  remindAt: ISODateTime;
  option: ReminderOption;
  targetType?: Reminder['targetType'];
  targetId?: UUID | null;
  smartReason?: string | null;
}
export interface CommitmentCreatePayload {
  text: string;
  direction: CommitmentDirection;
  counterpartName?: string | null;
  dueAt?: ISODateTime | null;
  dueText?: string | null;
  quote?: string | null;
  relatedEventId?: UUID | null;
}

export type ApprovalPayloadMap = {
  email_send: EmailSendPayload;
  calendar_create: CalendarCreatePayload;
  calendar_update: CalendarUpdatePayload;
  task_create: TaskCreatePayload;
  reminder_create: ReminderCreatePayload;
  commitment_create: CommitmentCreatePayload;
};

export interface ApprovalAction<T extends ApprovalActionType = ApprovalActionType>
  extends UserOwned, Timestamps {
  id: UUID;
  type: T;
  status: ApprovalStatus;
  /** What the AI wants to do */
  what: string;
  /** Why */
  why: string;
  /** Exact change summary lines shown in the card */
  changeSummary: string[];
  source?: SourceRef | null;
  payload: ApprovalPayloadMap[T];
  /** Original AI proposal before user edits (kept for audit). */
  originalPayload: ApprovalPayloadMap[T];
  editedByUser: boolean;
  idempotencyKey: string;
  expiresAt: ISODateTime;
  approvedAt?: ISODateTime | null;
  rejectedAt?: ISODateTime | null;
  executedAt?: ISODateTime | null;
  executionResult?: Record<string, unknown> | null;
  failureReason?: string | null;
  attemptCount: number;
  requestedBy:
    | 'assistant'
    | 'voice'
    | 'capture'
    | 'email_detail'
    | 'plan'
    | 'post_meeting'
    | 'reminder'
    | 'follow_up'
    | 'conflict'
    | 'midday'
    | 'evening';
  /** Backing insight to update once executed */
  insightId?: UUID | null;
  /** Progressive OAuth: scope that must be granted before execution */
  requiredScope?: string | null;
}

// ---------------------------------------------------------------------------
// Assistant, memory, captures
// ---------------------------------------------------------------------------

export interface AssistantThread extends UserOwned, Timestamps, SoftDelete {
  id: UUID;
  title: string;
  lastMessageAt: ISODateTime;
  /** Person-scoped thread ("Mehmet hakkında sor…") */
  contactId?: UUID | null;
}

export interface AssistantRichCard {
  kind: 'email' | 'event' | 'person' | 'commitment' | 'life_event' | 'approval' | 'plan_block';
  entityId: UUID;
  title: string;
  subtitle?: string | null;
  source?: SourceRef | null;
}

export interface AssistantMessage extends UserOwned, Timestamps {
  id: UUID;
  threadId: UUID;
  role: 'user' | 'assistant' | 'system';
  content: string;
  inputMode: 'text' | 'voice';
  sources: SourceRef[];
  cards: AssistantRichCard[];
  /** Write intents detected → approvals created, never executed directly */
  approvalIds: UUID[];
  /** "Kaynakta kesinleşmiyor." style uncertainty */
  uncertain: boolean;
  tokensIn?: number | null;
  tokensOut?: number | null;
  model?: string | null;
}

export interface MemoryChunk extends UserOwned, Timestamps {
  id: UUID;
  sourceType: SourceType;
  sourceId: UUID;
  source: SourceRef;
  /** Normalized summary or selected chunk (never a blind full-email dump). */
  content: string;
  topic?: string | null;
  personName?: string | null;
  contactId?: UUID | null;
  occurredAt: ISODateTime;
  /** pgvector embedding present only when an embedding provider is configured. */
  hasEmbedding: boolean;
  tokenCount: number;
  expiresAt?: ISODateTime | null;
}

export interface SearchResult {
  id: string;
  kind: 'email' | 'event' | 'person' | 'life_event' | 'commitment' | 'task' | 'memory';
  title: string;
  summary: string;
  date: ISODateTime;
  source: SourceRef;
  score: number;
  entityId: UUID;
}

export interface CaptureAnalysis {
  detectedType: CaptureDetectedType;
  title: string;
  summary: string;
  /** Extracted, only when explicitly present. */
  event?: {
    title: string;
    startAt?: ISODateTime | null;
    endAt?: ISODateTime | null;
    location?: string | null;
    dateText?: string | null;
  } | null;
  task?: { title: string; dueAt?: ISODateTime | null } | null;
  deadline?: { title: string; dueAt?: ISODateTime | null; dueText?: string | null } | null;
  person?: {
    name: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
  } | null;
  payment?: {
    payee?: string | null;
    amount?: number | null;
    currency?: string | null;
    dueAt?: ISODateTime | null;
  } | null;
  keyPoints: string[];
  dates: { text: string; iso?: ISODateTime | null }[];
  suggestedActions: SuggestedAction[];
  confidence: number;
}

export interface Capture extends UserOwned, Timestamps, SoftDelete {
  id: UUID;
  kind: CaptureKind;
  status: CaptureStatus;
  /** Storage path (private bucket, user-scoped) */
  storagePath?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  originalText?: string | null;
  url?: string | null;
  /** Extracted text (OCR / PDF / web) — retention-limited */
  extractedText?: string | null;
  analysis?: CaptureAnalysis | null;
  failureReason?: string | null;
  origin: 'in_app' | 'share_extension' | 'android_intent';
  approvalIds: UUID[];
}

// ---------------------------------------------------------------------------
// Rules & personalization
// ---------------------------------------------------------------------------

export interface PriorityRule extends UserOwned, Timestamps {
  id: UUID;
  type: PriorityRuleType;
  /** email address / domain / keyword / contact id depending on type */
  value: string;
  label: string;
  enabled: boolean;
  position: number;
}

export interface LearnedPreference extends UserOwned, Timestamps {
  id: UUID;
  kind: LearnedPreferenceKind;
  /** Human-readable: "Mehmet Yılmaz yüksek öncelikli." */
  statement: string;
  subjectKey: string; // e.g. contact id / category / "reminder_lead"
  weight: number; // -1..1
  evidenceCount: number;
  enabled: boolean;
  lastReinforcedAt: ISODateTime;
}

export interface AiFeedback extends UserOwned, Timestamps {
  id: UUID;
  kind: AiFeedbackKind;
  entityType: Insight['entityType'] | 'insight' | 'assistant_message' | 'briefing_item';
  entityId: UUID;
  contactId?: UUID | null;
  category?: EmailCategory | null;
  note?: string | null;
}

// ---------------------------------------------------------------------------
// Notifications & push
// ---------------------------------------------------------------------------

export interface NotificationPreferences extends UserOwned, Timestamps {
  categories: Record<NotificationCategory, boolean>;
  onlyWhenImportant: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "22:00"
  quietHoursEnd: string; // "08:00"
  lockScreenPrivacy: LockScreenPrivacy;
  meetingLeadMinutes: number;
  systemPermissionGranted?: boolean | null;
}

export interface PushToken extends UserOwned, Timestamps {
  id: UUID;
  token: string;
  platform: DevicePlatform;
  deviceId: string;
  deviceName?: string | null;
  appVersion?: string | null;
  isActive: boolean;
  lastSeenAt: ISODateTime;
}

export interface PushDelivery extends UserOwned, Timestamps {
  id: UUID;
  category: NotificationCategory;
  dedupeKey: string;
  title: string;
  body: string;
  deepLink: string;
  status: PushDeliveryStatus;
  attemptCount: number;
  sentAt?: ISODateTime | null;
  receiptId?: string | null;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Monetization
// ---------------------------------------------------------------------------

export interface Subscription extends UserOwned, Timestamps {
  id: UUID;
  source: SubscriptionSource;
  status: SubscriptionStatus;
  plan: Plan;
  productId?: string | null;
  entitlementId: string;
  startsAt: ISODateTime;
  expiresAt?: ISODateTime | null;
  isTrial: boolean;
  willRenew: boolean;
  store?: 'app_store' | 'play_store' | 'promotional' | 'referral' | 'demo' | null;
  revenuecatAppUserId?: string | null;
  lastEventId?: string | null;
}

export interface Referral extends Timestamps {
  id: UUID;
  referrerUserId: UUID;
  referredUserId?: UUID | null;
  code: string;
  status: ReferralStatus;
  redeemedAt?: ISODateTime | null;
  rejectionReason?: string | null;
  deviceFingerprintHash?: string | null;
}

export interface ReferralCredit extends UserOwned, Timestamps {
  id: UUID;
  referralId: UUID;
  days: number;
  startsAt: ISODateTime;
  expiresAt: ISODateTime;
  role: 'referrer' | 'referred';
}

export interface EntitlementState {
  plan: Plan;
  isPro: boolean;
  source: SubscriptionSource | 'none';
  expiresAt?: ISODateTime | null;
  isTrial: boolean;
  /** Free-plan quotas */
  quotas: {
    maxEmailAccounts: number;
    maxCalendarAccounts: number;
    assistantQueriesPerDay: number;
    capturesPerDay: number;
  };
  usage: {
    assistantQueriesToday: number;
    capturesToday: number;
    emailAccounts: number;
    calendarAccounts: number;
  };
}

// ---------------------------------------------------------------------------
// Privacy, audit, export
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: UUID;
  userId?: UUID | null;
  action: AuditAction;
  actor: 'user' | 'system' | 'assistant' | 'cron' | 'webhook';
  targetType?: string | null;
  targetId?: string | null;
  /** Never contains message bodies, tokens or PII beyond ids. */
  metadata: Record<string, string | number | boolean | null>;
  ip?: string | null;
  createdAt: ISODateTime;
}

export interface DataExportRequest extends UserOwned, Timestamps {
  id: UUID;
  status: ExportStatus;
  storagePath?: string | null;
  downloadUrl?: string | null;
  urlExpiresAt?: ISODateTime | null;
  failureReason?: string | null;
  completedAt?: ISODateTime | null;
  sizeBytes?: number | null;
}

// ---------------------------------------------------------------------------
// Android notification intelligence
// ---------------------------------------------------------------------------

export interface AndroidNotificationItem extends UserOwned, Timestamps {
  id: UUID;
  packageName: string;
  appName: string;
  title: string;
  text: string;
  postedAt: ISODateTime;
  fingerprint: string;
  analysis?: EmailAnalysis | null;
  insightId?: UUID | null;
}

// ---------------------------------------------------------------------------
// Onboarding / first analysis
// ---------------------------------------------------------------------------

export interface FirstAnalysisProgress {
  step: 'scanning' | 'classifying' | 'calendar' | 'open_loops' | 'done' | 'failed';
  emailsFound: number;
  potentialImportant: number;
  upcomingEvents: number;
  possibleFollowUps: number;
  startedAt: ISODateTime;
  completedAt?: ISODateTime | null;
  windowHours: number;
  error?: string | null;
}

export interface TodayFeed {
  greeting: string;
  dateLabel: string;
  briefing?: Briefing | null;
  priorities: Insight[];
  meetings: Insight[];
  deadlines: Insight[];
  lifeEvents: Insight[];
  pendingApprovals: number;
  isEvening: boolean;
  lastAnalyzedAt?: ISODateTime | null;
  offline: boolean;
}
