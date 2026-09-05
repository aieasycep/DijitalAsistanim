import { z } from 'zod';
import {
  briefingKindSchema,
  captureKindSchema,
  emailSchema,
  flowFilterSchema,
  hhmmSchema,
  isoDateSchema,
  isoDateTimeSchema,
  localeSchema,
  lockScreenPrivacySchema,
  notificationCategorySchema,
  participantSchema,
  personalizationInterestSchema,
  priorityRuleTypeSchema,
  reminderOptionSchema,
  replyToneSchema,
  retentionOptionSchema,
  sourceRefSchema,
  themePreferenceSchema,
  timezoneSchema,
  uuidSchema,
} from './common';
import { NOTIFICATION_CATEGORIES } from '@da/domain';

// --- Approval payloads -------------------------------------------------------
export const emailSendPayloadSchema = z.object({
  accountId: uuidSchema,
  threadId: uuidSchema.nullish(),
  inReplyToExternalId: z.string().nullish(),
  to: z.array(participantSchema).min(1).max(20),
  cc: z.array(participantSchema).max(20).optional(),
  subject: z.string().min(1).max(300),
  bodyText: z.string().min(1).max(20000),
  tone: replyToneSchema.nullish(),
});
export const calendarCreatePayloadSchema = z
  .object({
    accountId: uuidSchema,
    title: z.string().min(1).max(200),
    startAt: isoDateTimeSchema,
    endAt: isoDateTimeSchema,
    location: z.string().max(300).nullish(),
    description: z.string().max(4000).nullish(),
    attendees: z.array(participantSchema).max(50).optional(),
    allDay: z.boolean().optional(),
  })
  .refine((v) => Date.parse(v.endAt) > Date.parse(v.startAt), {
    message: 'Bitiş, başlangıçtan sonra olmalı',
  });
export const calendarUpdatePayloadSchema = z.object({
  accountId: uuidSchema,
  eventId: uuidSchema,
  externalEventId: z.string().min(1),
  expectedProviderUpdatedAt: isoDateTimeSchema.nullish(),
  changes: z
    .object({
      title: z.string().min(1).max(200).optional(),
      startAt: isoDateTimeSchema.optional(),
      endAt: isoDateTimeSchema.optional(),
      location: z.string().max(300).nullish(),
      description: z.string().max(4000).nullish(),
    })
    .refine((c) => Object.keys(c).length > 0, { message: 'En az bir değişiklik gerekli' }),
});
export const taskCreatePayloadSchema = z.object({
  accountId: uuidSchema.nullish(),
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).nullish(),
  dueAt: isoDateTimeSchema.nullish(),
  scheduledStartAt: isoDateTimeSchema.nullish(),
  scheduledEndAt: isoDateTimeSchema.nullish(),
});
export const reminderCreatePayloadSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(500).nullish(),
  remindAt: isoDateTimeSchema,
  option: reminderOptionSchema,
  targetType: z
    .enum([
      'email_thread',
      'calendar_event',
      'task',
      'commitment',
      'life_event',
      'insight',
      'follow_up',
    ])
    .nullish(),
  targetId: uuidSchema.nullish(),
  smartReason: z.string().max(200).nullish(),
});
export const commitmentCreatePayloadSchema = z.object({
  text: z.string().min(1).max(200),
  direction: z.enum(['user_owes', 'other_owes']),
  counterpartName: z.string().max(120).nullish(),
  dueAt: isoDateTimeSchema.nullish(),
  dueText: z.string().max(80).nullish(),
  quote: z.string().max(240).nullish(),
  relatedEventId: uuidSchema.nullish(),
});

export const approvalPayloadSchemas = {
  email_send: emailSendPayloadSchema,
  calendar_create: calendarCreatePayloadSchema,
  calendar_update: calendarUpdatePayloadSchema,
  task_create: taskCreatePayloadSchema,
  reminder_create: reminderCreatePayloadSchema,
  commitment_create: commitmentCreatePayloadSchema,
} as const;

export const createApprovalRequestSchema = z
  .object({
    type: z.enum([
      'email_send',
      'calendar_create',
      'calendar_update',
      'task_create',
      'reminder_create',
      'commitment_create',
    ]),
    what: z.string().min(1).max(200),
    why: z.string().min(1).max(300),
    changeSummary: z.array(z.string().max(200)).max(8),
    payload: z.record(z.string(), z.unknown()),
    source: sourceRefSchema.nullish(),
    requestedBy: z.enum([
      'assistant',
      'voice',
      'capture',
      'email_detail',
      'plan',
      'post_meeting',
      'reminder',
      'follow_up',
      'conflict',
      'midday',
      'evening',
    ]),
    insightId: uuidSchema.nullish(),
    idempotencyKey: z.string().min(8).max(120),
  })
  .superRefine((v, ctx) => {
    const schema = approvalPayloadSchemas[v.type];
    const r = schema.safeParse(v.payload);
    if (!r.success) {
      ctx.addIssue({
        code: 'custom',
        message: `payload geçersiz: ${r.error.issues.map((i) => i.message).join(', ')}`,
      });
    }
  });

export const decideApprovalRequestSchema = z.object({
  approvalId: uuidSchema,
  decision: z.enum(['approve', 'reject']),
  editedPayload: z.record(z.string(), z.unknown()).optional(),
});

// --- OAuth --------------------------------------------------------------------
export const oauthStartRequestSchema = z.object({
  provider: z.enum(['google', 'microsoft']),
  kinds: z.array(z.enum(['email', 'calendar', 'tasks'])).min(1),
  scopeGroup: z.enum(['read', 'mail_send', 'calendar_write', 'tasks_write']).optional(),
  redirectTo: z.string().min(1).max(300),
  accountId: uuidSchema.optional(),
});

// --- Sync / analysis ------------------------------------------------------------
export const initialAnalysisStartSchema = z.object({
  windowHours: z.number().int().min(24).max(168).optional(),
});
export const syncNowSchema = z.object({
  accountId: uuidSchema.optional(),
  resource: z.enum(['mail', 'calendar', 'tasks']).optional(),
});

// --- Feed ---------------------------------------------------------------------------
export const todayRequestSchema = z.object({ date: isoDateSchema.optional() });
export const flowRequestSchema = z.object({
  filter: flowFilterSchema.default('all'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

// --- Email ----------------------------------------------------------------------------
export const draftReplyRequestSchema = z.object({
  threadId: uuidSchema,
  tone: replyToneSchema,
  instructions: z.string().max(500).optional(),
});

// --- Reminders ------------------------------------------------------------------------
export const smartReminderSuggestSchema = z.object({
  targetType: z.enum([
    'email_thread',
    'calendar_event',
    'task',
    'commitment',
    'life_event',
    'insight',
    'follow_up',
  ]),
  targetId: uuidSchema,
  dueAt: isoDateTimeSchema.nullish(),
});

// --- Plan -------------------------------------------------------------------------------
export const planRequestSchema = z.object({
  date: isoDateSchema,
  range: z.enum(['day', 'week']).default('day'),
});

// --- Meetings ---------------------------------------------------------------------------
export const postMeetingRequestSchema = z.object({
  eventId: uuidSchema,
  text: z.string().min(1).max(2000),
  inputMode: z.enum(['text', 'voice']),
});

// --- Assistant --------------------------------------------------------------------------
export const assistantAskRequestSchema = z.object({
  threadId: uuidSchema.nullish(),
  message: z.string().min(1).max(2000),
  inputMode: z.enum(['text', 'voice']).default('text'),
  contactId: uuidSchema.nullish(),
});

// --- Search -----------------------------------------------------------------------------
export const searchRequestSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(50).default(20),
  kinds: z
    .array(z.enum(['email', 'event', 'person', 'life_event', 'commitment', 'task', 'memory']))
    .optional(),
});

// --- Capture -----------------------------------------------------------------------------
export const captureCreateRequestSchema = z
  .object({
    kind: captureKindSchema,
    text: z.string().max(20000).optional(),
    url: z.string().url().max(2048).optional(),
    storagePath: z.string().max(400).optional(),
    mimeType: z.string().max(120).optional(),
    sizeBytes: z
      .number()
      .int()
      .nonnegative()
      .max(25 * 1024 * 1024)
      .optional(),
    origin: z.enum(['in_app', 'share_extension', 'android_intent']).default('in_app'),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'text' && !v.text) ctx.addIssue({ code: 'custom', message: 'text gerekli' });
    if (v.kind === 'link' && !v.url) ctx.addIssue({ code: 'custom', message: 'url gerekli' });
    if (
      (v.kind === 'image' || v.kind === 'pdf' || v.kind === 'file' || v.kind === 'audio') &&
      !v.storagePath
    )
      ctx.addIssue({ code: 'custom', message: 'storagePath gerekli' });
  });

// --- Briefings -----------------------------------------------------------------------------
export const briefingRequestSchema = z.object({
  kind: briefingKindSchema,
  date: isoDateSchema.optional(),
  regenerate: z.boolean().optional(),
});
export const briefingAudioRequestSchema = z.object({ briefingId: uuidSchema });

// --- Preferences -------------------------------------------------------------------------------
export const briefingScheduleSchema = z.object({
  morningTime: hhmmSchema,
  middayEnabled: z.boolean(),
  middayTime: hhmmSchema,
  eveningEnabled: z.boolean(),
  eveningTime: hhmmSchema,
  weeklyEnabled: z.boolean(),
  weeklyDay: z.number().int().min(0).max(6),
  weeklyTime: hhmmSchema,
  weekendEnabled: z.boolean(),
  quietDays: z.array(z.number().int().min(1).max(7)).max(7),
});

export const userPreferencesUpdateSchema = z
  .object({
    theme: themePreferenceSchema,
    locale: localeSchema,
    timezone: timezoneSchema,
    briefing: briefingScheduleSchema,
    interests: z.array(personalizationInterestSchema).max(8),
    learnFromInteractions: z.boolean(),
    defaultReminderLeadMinutes: z.number().int().min(0).max(1440),
    retention: retentionOptionSchema,
    analyzeAttachments: z.boolean(),
    reducedMotion: z.boolean(),
    hapticsEnabled: z.boolean(),
    androidNotificationScope: z.enum(['all_allowed', 'selected']),
    androidAllowedPackages: z.array(z.string().max(200)).max(500),
    androidNotificationUploadConsent: z.boolean(),
  })
  .partial();

export const notificationPreferencesUpdateSchema = z
  .object({
    categories: z.object(
      Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, z.boolean()])) as Record<
        (typeof NOTIFICATION_CATEGORIES)[number],
        z.ZodBoolean
      >,
    ),
    onlyWhenImportant: z.boolean(),
    quietHoursEnabled: z.boolean(),
    quietHoursStart: hhmmSchema,
    quietHoursEnd: hhmmSchema,
    lockScreenPrivacy: lockScreenPrivacySchema,
    meetingLeadMinutes: z.number().int().min(0).max(240),
    systemPermissionGranted: z.boolean().nullish(),
  })
  .partial();
void notificationCategorySchema;

export const priorityRuleUpsertSchema = z.object({
  id: uuidSchema.optional(),
  type: priorityRuleTypeSchema,
  value: z.string().min(1).max(200),
  label: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
});

export const vipUpsertSchema = z.object({
  id: uuidSchema.optional(),
  contactId: uuidSchema.nullish(),
  displayName: z.string().min(1).max(120),
  email: emailSchema.nullish(),
  relation: z.string().max(60).nullish(),
  notifyAlways: z.boolean().default(true),
});

// --- Account / privacy ------------------------------------------------------------------------------
export const deleteAccountRequestSchema = z.object({ confirmation: z.enum(['SİL', 'DELETE']) });
export const deleteHistoryRequestSchema = z.object({
  olderThanDays: z.number().int().min(0).max(3650).optional(),
});

// --- Referral / subscription ------------------------------------------------------------------------
export const referralRedeemSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,10}$/, 'Geçersiz davet kodu'),
  deviceFingerprintHash: z.string().max(128).optional(),
});

export const revenueCatWebhookSchema = z.object({
  api_version: z.string().optional(),
  event: z.object({
    id: z.string(),
    type: z.string(),
    app_user_id: z.string(),
    original_app_user_id: z.string().optional(),
    product_id: z.string().optional(),
    entitlement_ids: z.array(z.string()).nullish(),
    period_type: z.string().optional(),
    purchased_at_ms: z.number().optional(),
    expiration_at_ms: z.number().nullish(),
    store: z.string().optional(),
    environment: z.string().optional(),
    is_trial_conversion: z.boolean().optional(),
    cancel_reason: z.string().nullish(),
    event_timestamp_ms: z.number().optional(),
  }),
});

// --- Push ------------------------------------------------------------------------------------------------
export const registerPushTokenSchema = z.object({
  token: z.string().min(10).max(300),
  platform: z.enum(['ios', 'android']),
  deviceId: z.string().min(4).max(128),
  deviceName: z.string().max(120).optional(),
  appVersion: z.string().max(40).optional(),
});

// --- Android notification ingest ------------------------------------------------------------------------
export const androidNotificationIngestSchema = z.object({
  items: z
    .array(
      z.object({
        packageName: z.string().min(1).max(200),
        appName: z.string().min(1).max(120),
        title: z.string().max(300),
        text: z.string().max(2000),
        postedAt: isoDateTimeSchema,
        fingerprint: z.string().min(8).max(128),
      }),
    )
    .min(1)
    .max(100),
});

// --- Feedback / personalization --------------------------------------------------------------------------
export const aiFeedbackSchema = z.object({
  kind: z.enum([
    'not_important',
    'important',
    'show_more',
    'show_less',
    'make_vip',
    'stop_following',
    'correct',
    'wrong',
  ]),
  entityType: z.enum([
    'email_thread',
    'calendar_event',
    'task',
    'commitment',
    'follow_up',
    'life_event',
    'suggestion',
    'conflict',
    'insight',
    'assistant_message',
    'briefing_item',
  ]),
  entityId: uuidSchema,
  contactId: uuidSchema.nullish(),
  note: z.string().max(300).nullish(),
});

export const feedbackFormSchema = z.object({
  category: z.enum(['bug', 'idea', 'praise', 'other']),
  message: z.string().min(5).max(2000),
  includeDiagnostics: z.boolean().default(false),
  appVersion: z.string().max(40).optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
});
