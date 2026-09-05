/**
 * Pure row ↔ entity mappers. Forward mappers turn snake_case PostgREST rows into domain entities (camelCase,
 * UTC ISO timestamps); reverse mappers turn client patches into the exact column subsets the RLS guards allow.
 * No I/O here — everything is unit-testable with sample rows.
 */
import type {
  AndroidNotificationItem,
  ApprovalAction,
  ApprovalActionType,
  ApprovalPayloadMap,
  AssistantMessage,
  AssistantThread,
  Briefing,
  BriefingCounts,
  BriefingItem,
  CalendarConflict,
  CalendarEvent,
  Capture,
  CaptureCreateRequest,
  Commitment,
  ConnectedAccount,
  Contact,
  DataSourceControls,
  EmailThread,
  FollowUp,
  Insight,
  LearnedPreference,
  LifeEvent,
  NotificationCategory,
  NotificationPreferences,
  PersonalizationInterest,
  PriorityRule,
  Profile,
  Provider,
  RegisterPushTokenRequest,
  Reminder,
  Subscription,
  TaskItem,
  UserPreferences,
  VipPerson,
} from '@da/domain';
import { NOTIFICATION_CATEGORIES } from '@da/domain';
import type {
  AndroidNotificationsApi,
  PeopleApi,
  PrivacyApi,
  ProfileApi,
  RulesApi,
} from '../datasource';
import type {
  AndroidNotificationRow,
  ApprovalActionRow,
  AssistantMessageRow,
  AssistantThreadRow,
  AuditLogRow,
  BriefingItemRow,
  BriefingRow,
  CalendarConflictRow,
  CalendarEventRow,
  CaptureRow,
  CommitmentRow,
  ConnectedAccountRow,
  ContactRow,
  EmailThreadRow,
  FeedbackSubmissionRow,
  FollowUpRow,
  InsightRow,
  LearnedPreferenceRow,
  LifeEventRow,
  NotificationPreferencesRow,
  PostMeetingNoteRow,
  PriorityRuleRow,
  ProfileRow,
  PushTokenRow,
  ReminderRow,
  SubscriptionRow,
  TaskRow,
  UserPreferencesRow,
  VipPersonRow,
  AiFeedbackRow,
} from './rows';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Normalises any parseable timestamp to a UTC ISO string (`…Z`); unparseable input is returned as-is. */
export function iso(value: string): string {
  const t = Date.parse(value);
  return Number.isNaN(t) ? value : new Date(t).toISOString();
}

export function isoOrNull(value: string | null | undefined): string | null {
  return value ? iso(value) : null;
}

/** Drops `undefined` entries so a patch never overwrites a column with `null` by accident. */
export function compact<T extends Record<string, unknown>>(patch: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] !== undefined) out[key] = patch[key];
  }
  return out;
}

export const DEFAULT_CONTROLS: DataSourceControls = {
  readEmail: true,
  analyzeAttachments: false,
  detectDeadlines: true,
  prepareDrafts: true,
  readEvents: true,
  suggestSchedule: true,
  createEventsWithApproval: true,
  readTasks: true,
};

export const DEFAULT_BRIEFING_SCHEDULE: UserPreferences['briefing'] = {
  morningTime: '07:30',
  middayEnabled: true,
  middayTime: '13:00',
  eveningEnabled: true,
  eveningTime: '19:00',
  weeklyEnabled: true,
  weeklyDay: 0,
  weeklyTime: '18:00',
  weekendEnabled: false,
  quietDays: [],
};

const EMPTY_COUNTS: BriefingCounts = {
  importantEmails: 0,
  events: 0,
  followUps: 0,
  deadlines: 0,
  total: 0,
  analyzedEmails: 0,
  analyzedCalendars: 0,
  analyzedDays: 0,
};

// ---------------------------------------------------------------------------
// Profile & preferences
// ---------------------------------------------------------------------------

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    firstName: row.first_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    timezone: row.timezone,
    locale: row.locale,
    onboardingCompletedAt: isoOrNull(row.onboarding_completed_at),
    firstAnalysisCompletedAt: isoOrNull(row.first_analysis_completed_at),
    referralCode: row.referral_code,
    referredByCode: row.referred_by_code,
    plan: row.plan,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export type ProfilePatch = Parameters<ProfileApi['updateProfile']>[0];

export function profilePatchToRow(patch: ProfilePatch): Partial<ProfileRow> {
  return compact({
    display_name: patch.displayName,
    first_name: patch.firstName,
    timezone: patch.timezone,
    locale: patch.locale,
    avatar_url: patch.avatarUrl,
  });
}

export function toUserPreferences(row: UserPreferencesRow): UserPreferences {
  return {
    userId: row.user_id,
    theme: row.theme,
    locale: row.locale,
    timezone: row.timezone,
    briefing: {
      ...DEFAULT_BRIEFING_SCHEDULE,
      ...(row.briefing as Partial<UserPreferences['briefing']>),
    },
    interests: row.interests as PersonalizationInterest[],
    learnFromInteractions: row.learn_from_interactions,
    defaultReminderLeadMinutes: row.default_reminder_lead_minutes,
    retention: row.retention,
    analyzeAttachments: row.analyze_attachments,
    reducedMotion: row.reduced_motion,
    hapticsEnabled: row.haptics_enabled,
    androidNotificationScope: row.android_notification_scope,
    androidAllowedPackages: row.android_allowed_packages,
    androidNotificationUploadConsent: row.android_notification_upload_consent,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export type UserPreferencesPatch = Parameters<ProfileApi['updatePreferences']>[0];

export function userPreferencesPatchToRow(
  patch: UserPreferencesPatch,
): Partial<UserPreferencesRow> {
  return compact({
    theme: patch.theme,
    locale: patch.locale,
    timezone: patch.timezone,
    briefing: patch.briefing as Record<string, unknown> | undefined,
    interests: patch.interests,
    learn_from_interactions: patch.learnFromInteractions,
    default_reminder_lead_minutes: patch.defaultReminderLeadMinutes,
    retention: patch.retention,
    analyze_attachments: patch.analyzeAttachments,
    reduced_motion: patch.reducedMotion,
    haptics_enabled: patch.hapticsEnabled,
    android_notification_scope: patch.androidNotificationScope,
    android_allowed_packages: patch.androidAllowedPackages,
    android_notification_upload_consent: patch.androidNotificationUploadConsent,
  });
}

export function toNotificationPreferences(
  row: NotificationPreferencesRow,
): NotificationPreferences {
  const categories = {} as Record<NotificationCategory, boolean>;
  for (const category of NOTIFICATION_CATEGORIES)
    categories[category] = row.categories[category] ?? true;
  return {
    userId: row.user_id,
    categories,
    onlyWhenImportant: row.only_when_important,
    quietHoursEnabled: row.quiet_hours_enabled,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    lockScreenPrivacy: row.lock_screen_privacy,
    meetingLeadMinutes: row.meeting_lead_minutes,
    systemPermissionGranted: row.system_permission_granted,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export type NotificationPreferencesPatch = Parameters<
  ProfileApi['updateNotificationPreferences']
>[0];

export function notificationPreferencesPatchToRow(
  patch: NotificationPreferencesPatch,
): Partial<NotificationPreferencesRow> {
  return compact({
    categories: patch.categories,
    only_when_important: patch.onlyWhenImportant,
    quiet_hours_enabled: patch.quietHoursEnabled,
    quiet_hours_start: patch.quietHoursStart,
    quiet_hours_end: patch.quietHoursEnd,
    lock_screen_privacy: patch.lockScreenPrivacy,
    meeting_lead_minutes: patch.meetingLeadMinutes,
    system_permission_granted: patch.systemPermissionGranted,
  });
}

export function pushTokenToRow(
  userId: string,
  req: RegisterPushTokenRequest,
  now: Date,
): Partial<PushTokenRow> {
  return {
    user_id: userId,
    token: req.token,
    platform: req.platform,
    device_id: req.deviceId,
    device_name: req.deviceName ?? null,
    app_version: req.appVersion ?? null,
    is_active: true,
    last_seen_at: now.toISOString(),
  };
}

export type FeedbackInput = Parameters<ProfileApi['submitFeedback']>[0];

export function feedbackToRow(
  userId: string,
  input: FeedbackInput,
  diagnostics: Record<string, unknown> | null,
): Partial<FeedbackSubmissionRow> {
  return {
    user_id: userId,
    category: input.category,
    message: input.message,
    diagnostics: input.includeDiagnostics ? diagnostics : null,
    app_version: input.appVersion ?? null,
    platform: input.platform ?? null,
  };
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export function toConnectedAccount(row: ConnectedAccountRow): ConnectedAccount {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    kinds: row.kinds as ConnectedAccount['kinds'],
    externalAccountId: row.external_account_id,
    displayName: row.display_name,
    email: row.email,
    status: row.status,
    grantedScopes: row.granted_scopes,
    controls: { ...DEFAULT_CONTROLS, ...row.controls },
    lastSyncAt: isoOrNull(row.last_sync_at),
    lastError: row.last_error,
    backfillCompleted: row.backfill_completed,
    isPrimary: row.is_primary,
    deletedAt: isoOrNull(row.deleted_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function deviceAccountToRow(
  userId: string,
  input: { provider: 'apple' | 'device'; displayName: string; calendarIds: string[] },
): Partial<ConnectedAccountRow> {
  const provider: Provider = input.provider;
  return {
    user_id: userId,
    provider,
    kinds: ['calendar'],
    external_account_id: `device:${[...input.calendarIds].sort().join(',')}`,
    display_name: input.displayName,
    status: 'active',
    backfill_completed: true,
    deleted_at: null,
  };
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    emails: row.emails,
    phones: row.phones,
    company: row.company,
    title: row.title,
    avatarUrl: row.avatar_url,
    lastContactAt: isoOrNull(row.last_contact_at),
    interactionCount: row.interaction_count,
    isVip: row.is_vip,
    source: row.source,
    deletedAt: isoOrNull(row.deleted_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toVipPerson(row: VipPersonRow): VipPerson {
  return {
    id: row.id,
    userId: row.user_id,
    contactId: row.contact_id,
    displayName: row.display_name,
    email: row.email,
    relation: row.relation,
    notifyAlways: row.notify_always,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export type VipInput = Parameters<PeopleApi['addVip']>[0];

export function vipToRow(userId: string, input: VipInput): Partial<VipPersonRow> {
  return {
    user_id: userId,
    contact_id: input.contactId ?? null,
    display_name: input.displayName,
    email: input.email ? input.email.trim().toLowerCase() : null,
    relation: input.relation ?? null,
    notify_always: input.notifyAlways ?? true,
  };
}

// ---------------------------------------------------------------------------
// Rules & personalisation
// ---------------------------------------------------------------------------

export function toPriorityRule(row: PriorityRuleRow): PriorityRule {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    value: row.value,
    label: row.label,
    enabled: row.enabled,
    position: row.position,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export type PriorityRuleInput = Parameters<RulesApi['upsertRule']>[0];

export function priorityRuleToRow(
  userId: string,
  rule: PriorityRuleInput,
): Partial<PriorityRuleRow> {
  return compact({
    id: rule.id,
    user_id: userId,
    type: rule.type,
    value: rule.value,
    label: rule.label,
    enabled: rule.enabled,
    position: rule.position,
  });
}

export function toLearnedPreference(row: LearnedPreferenceRow): LearnedPreference {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    statement: row.statement,
    subjectKey: row.subject_key,
    weight: row.weight,
    evidenceCount: row.evidence_count,
    enabled: row.enabled,
    lastReinforcedAt: iso(row.last_reinforced_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function aiFeedbackToRow(
  userId: string,
  input: {
    kind: AiFeedbackRow['kind'];
    entityType: string;
    entityId: string;
    contactId?: string | null;
    note?: string | null;
  },
): Partial<AiFeedbackRow> {
  return {
    user_id: userId,
    kind: input.kind,
    entity_type: input.entityType,
    entity_id: input.entityId,
    contact_id: input.contactId ?? null,
    note: input.note ?? null,
  };
}

// ---------------------------------------------------------------------------
// Email, calendar, tasks, reminders, commitments, follow-ups
// ---------------------------------------------------------------------------

export function toEmailThread(row: EmailThreadRow): EmailThread {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    externalThreadId: row.external_thread_id,
    subject: row.subject,
    snippet: row.snippet,
    participants: row.participants ?? [],
    lastMessageAt: iso(row.last_message_at),
    messageCount: row.message_count,
    lastFromUser: row.last_from_user,
    isRead: row.is_read,
    labels: row.labels ?? [],
    importance: row.importance,
    category: row.category,
    analysis: row.analysis,
    priorityScore: row.priority_score,
    priorityReasons: row.priority_reasons ?? [],
    triage: row.triage,
    fingerprint: row.fingerprint,
    userDismissed: row.user_dismissed,
    userMarkedDone: row.user_marked_done,
    deletedAt: isoOrNull(row.deleted_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    externalEventId: row.external_event_id,
    calendarId: row.calendar_id,
    title: row.title,
    description: row.description,
    location: row.location,
    meetingUrl: row.meeting_url,
    meetingProvider: row.meeting_provider as CalendarEvent['meetingProvider'],
    startAt: iso(row.start_at),
    endAt: iso(row.end_at),
    allDay: row.all_day,
    attendees: row.attendees ?? [],
    organizerIsUser: row.organizer_is_user,
    status: row.status,
    providerUpdatedAt: isoOrNull(row.provider_updated_at),
    source: row.source,
    prepGeneratedAt: isoOrNull(row.prep_generated_at),
    postMeetingHandledAt: isoOrNull(row.post_meeting_handled_at),
    isAiCreated: row.is_ai_created,
    deletedAt: isoOrNull(row.deleted_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toTask(row: TaskRow): TaskItem {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    externalTaskId: row.external_task_id,
    title: row.title,
    notes: row.notes,
    dueAt: isoOrNull(row.due_at),
    status: row.status,
    completedAt: isoOrNull(row.completed_at),
    source: row.source,
    provider: row.provider as TaskItem['provider'],
    scheduledStartAt: isoOrNull(row.scheduled_start_at),
    scheduledEndAt: isoOrNull(row.scheduled_end_at),
    priority: row.priority,
    deletedAt: isoOrNull(row.deleted_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function taskCompletionToRow(completed: boolean, now: Date): Partial<TaskRow> {
  return completed
    ? { status: 'completed', completed_at: now.toISOString() }
    : { status: 'open', completed_at: null };
}

export function toReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    remindAt: iso(row.remind_at),
    option: row.option,
    status: row.status,
    targetType: row.target_type,
    targetId: row.target_id,
    source: row.source,
    smartReason: row.smart_reason,
    localNotificationId: row.local_notification_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function reminderStatusToRow(
  status: Extract<Reminder['status'], 'cancelled' | 'completed'>,
): Partial<ReminderRow> {
  return { status };
}

export function toCommitment(row: CommitmentRow): Commitment {
  return {
    id: row.id,
    userId: row.user_id,
    text: row.text,
    quote: row.quote,
    direction: row.direction,
    counterpartName: row.counterpart_name,
    counterpartContactId: row.counterpart_contact_id,
    dueAt: isoOrNull(row.due_at),
    dueText: row.due_text,
    status: row.status,
    source: row.source,
    confidence: row.confidence,
    completedAt: isoOrNull(row.completed_at),
    postponedUntil: isoOrNull(row.postponed_until),
    relatedEventId: row.related_event_id,
    deletedAt: isoOrNull(row.deleted_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function commitmentStatusToRow(
  status: Commitment['status'],
  now: Date,
  postponedUntil?: string,
): Partial<CommitmentRow> {
  switch (status) {
    case 'completed':
      return { status, completed_at: now.toISOString() };
    case 'postponed':
      return { status, postponed_until: postponedUntil ?? null };
    default:
      return { status };
  }
}

export function toFollowUp(row: FollowUpRow): FollowUp {
  return {
    id: row.id,
    userId: row.user_id,
    threadId: row.thread_id,
    contactId: row.contact_id,
    counterpartName: row.counterpart_name,
    topic: row.topic,
    sentAt: iso(row.sent_at),
    nudgeAfterDays: row.nudge_after_days,
    status: row.status,
    snoozedUntil: isoOrNull(row.snoozed_until),
    repliedAt: isoOrNull(row.replied_at),
    closedAt: isoOrNull(row.closed_at),
    source: row.source,
    dismissCount: row.dismiss_count,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function followUpSnoozeToRow(until: string): Partial<FollowUpRow> {
  return { status: 'snoozed', snoozed_until: until };
}

export function followUpCloseToRow(now: Date): Partial<FollowUpRow> {
  return { status: 'closed', closed_at: now.toISOString() };
}

export function toLifeEvent(row: LifeEventRow): LifeEvent {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    details: row.details ?? {},
    eventAt: isoOrNull(row.event_at),
    status: row.status,
    source: row.source,
    confidence: row.confidence,
    dedupeKey: row.dedupe_key,
    deletedAt: isoOrNull(row.deleted_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toCalendarConflict(row: CalendarConflictRow): CalendarConflict | null {
  if (!row.event_a || !row.event_b) return null;
  return {
    id: row.id,
    eventA: toCalendarEvent(row.event_a),
    eventB: toCalendarEvent(row.event_b),
    overlapMinutes: row.overlap_minutes,
    suggestions: row.suggestions ?? [],
    status: row.status,
  };
}

// ---------------------------------------------------------------------------
// Insights & briefings
// ---------------------------------------------------------------------------

export function toInsight(row: InsightRow): Insight {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    badge: row.badge,
    title: row.title,
    subtitle: row.subtitle,
    reason: row.reason,
    importance: row.importance,
    priorityScore: row.priority_score,
    priorityReasons: row.priority_reasons ?? [],
    timeLabel: row.time_label,
    dueAt: isoOrNull(row.due_at),
    status: row.status,
    snoozedUntil: isoOrNull(row.snoozed_until),
    source: row.source,
    actions: row.actions ?? [],
    entityType: row.entity_type,
    entityId: row.entity_id,
    tags: (row.tags ?? []) as Insight['tags'],
    forDate: row.for_date,
    confidence: row.confidence,
    isLowConfidence: row.is_low_confidence,
    dedupeKey: row.dedupe_key,
    deletedAt: isoOrNull(row.deleted_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function insightSnoozeToRow(until: string): Partial<InsightRow> {
  return { status: 'snoozed', snoozed_until: until };
}

export function toBriefingItem(row: BriefingItemRow): BriefingItem {
  return {
    id: row.id,
    briefingId: row.briefing_id,
    section: row.section,
    position: row.position,
    icon: row.icon,
    title: row.title,
    meta: row.meta,
    source: row.source,
    insightId: row.insight_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    chapterIndex: row.chapter_index,
    status: row.status === 'open' || row.status === 'done' ? row.status : null,
  };
}

export function toBriefing(row: BriefingRow, items: BriefingItemRow[] = row.items ?? []): Briefing {
  const sortedItems = [...items].sort((a, b) => a.position - b.position).map(toBriefingItem);
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    forDate: row.for_date,
    generatedAt: iso(row.generated_at),
    headline: row.headline,
    highlightNumber: row.highlight_number,
    subline: row.subline,
    mood: row.mood,
    narrative: row.narrative,
    outlook: row.outlook,
    counts: { ...EMPTY_COUNTS, ...(row.counts ?? {}) },
    items: sortedItems,
    audio: row.audio,
    estimatedReadSec: row.estimated_read_sec,
    openedAt: isoOrNull(row.opened_at),
    closedAt: isoOrNull(row.closed_at),
    weekly: row.weekly,
    hasChanges: row.has_changes,
    version: row.version,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export function toApprovalAction<T extends ApprovalActionType = ApprovalActionType>(
  row: ApprovalActionRow,
): ApprovalAction<T> {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as T,
    status: row.status,
    what: row.what,
    why: row.why,
    changeSummary: row.change_summary ?? [],
    source: row.source,
    payload: row.payload as unknown as ApprovalPayloadMap[T],
    originalPayload: row.original_payload as unknown as ApprovalPayloadMap[T],
    editedByUser: row.edited_by_user,
    idempotencyKey: row.idempotency_key,
    expiresAt: iso(row.expires_at),
    approvedAt: isoOrNull(row.approved_at),
    rejectedAt: isoOrNull(row.rejected_at),
    executedAt: isoOrNull(row.executed_at),
    executionResult: row.execution_result,
    failureReason: row.failure_reason,
    attemptCount: row.attempt_count,
    requestedBy: row.requested_by,
    insightId: row.insight_id,
    requiredScope: row.required_scope,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Assistant & captures
// ---------------------------------------------------------------------------

export function toAssistantThread(row: AssistantThreadRow): AssistantThread {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    lastMessageAt: iso(row.last_message_at),
    contactId: row.contact_id,
    deletedAt: isoOrNull(row.deleted_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toAssistantMessage(row: AssistantMessageRow): AssistantMessage {
  return {
    id: row.id,
    userId: row.user_id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    inputMode: row.input_mode,
    sources: row.sources ?? [],
    cards: row.cards ?? [],
    approvalIds: row.approval_ids ?? [],
    uncertain: row.uncertain,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    model: row.model,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toCapture(row: CaptureRow): Capture {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    status: row.status,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    originalText: row.original_text,
    url: row.url,
    extractedText: row.extracted_text,
    analysis: row.analysis,
    failureReason: row.failure_reason,
    origin: row.origin,
    approvalIds: row.approval_ids ?? [],
    deletedAt: isoOrNull(row.deleted_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function captureToRow(userId: string, req: CaptureCreateRequest): Partial<CaptureRow> {
  return {
    user_id: userId,
    kind: req.kind,
    status: 'uploaded',
    storage_path: req.storagePath ?? null,
    mime_type: req.mimeType ?? null,
    size_bytes: req.sizeBytes ?? null,
    original_text: req.text ?? null,
    url: req.url ?? null,
    origin: req.origin,
  };
}

export function postMeetingNoteToRow(
  userId: string,
  input: {
    eventId: string;
    text: string;
    inputMode: 'text' | 'voice';
    extractedCommitmentIds?: string[];
  },
): Partial<PostMeetingNoteRow> {
  return {
    user_id: userId,
    event_id: input.eventId,
    text: input.text,
    input_mode: input.inputMode,
    extracted_commitment_ids: input.extractedCommitmentIds ?? [],
  };
}

// ---------------------------------------------------------------------------
// Android notifications, billing, audit
// ---------------------------------------------------------------------------

export function toAndroidNotification(row: AndroidNotificationRow): AndroidNotificationItem {
  return {
    id: row.id,
    userId: row.user_id,
    packageName: row.package_name,
    appName: row.app_name,
    title: row.title,
    text: row.text,
    postedAt: iso(row.posted_at),
    fingerprint: row.fingerprint,
    analysis: row.analysis,
    insightId: row.insight_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export type AndroidNotificationInput = Parameters<AndroidNotificationsApi['ingest']>[0][number];

export function androidNotificationToRow(
  userId: string,
  item: AndroidNotificationInput,
): Partial<AndroidNotificationRow> {
  return {
    user_id: userId,
    package_name: item.packageName,
    app_name: item.appName,
    title: item.title,
    text: item.text,
    posted_at: item.postedAt,
    fingerprint: item.fingerprint,
  };
}

export function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    status: row.status,
    plan: row.plan,
    productId: row.product_id,
    entitlementId: row.entitlement_id,
    startsAt: iso(row.starts_at),
    expiresAt: isoOrNull(row.expires_at),
    isTrial: row.is_trial,
    willRenew: row.will_renew,
    store: row.store as Subscription['store'],
    revenuecatAppUserId: row.revenuecat_app_user_id,
    lastEventId: row.last_event_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export type AuditLogEntry = Awaited<ReturnType<PrivacyApi['listAuditLogs']>>[number];

export function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    action: row.action,
    actor: row.actor,
    createdAt: iso(row.created_at),
    targetType: row.target_type,
  };
}
