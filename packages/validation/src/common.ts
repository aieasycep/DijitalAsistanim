import { z } from 'zod';
import {
  ACCOUNT_KINDS,
  AI_FEEDBACK_KINDS,
  APPROVAL_ACTION_TYPES,
  APPROVAL_STATUSES,
  BRIEFING_KINDS,
  BRIEFING_SECTIONS,
  CAPTURE_DETECTED_TYPES,
  CAPTURE_KINDS,
  COMMITMENT_DIRECTIONS,
  COMMITMENT_STATUSES,
  CONNECTION_STATUSES,
  EMAIL_CATEGORIES,
  FLOW_FILTERS,
  IMPORTANCE_LEVELS,
  INSIGHT_KINDS,
  LIFE_EVENT_TYPES,
  LOCALES,
  LOCK_SCREEN_PRIVACY,
  NOTIFICATION_CATEGORIES,
  PERSONALIZATION_INTERESTS,
  PLANS,
  PRIORITY_RULE_TYPES,
  PROVIDERS,
  REMINDER_OPTIONS,
  REPLY_TONES,
  RETENTION_OPTIONS,
  SOURCE_TYPES,
  THEME_PREFERENCES,
} from '@da/domain';

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: 'Geçerli bir ISO tarih-saat değeri değil',
});
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD bekleniyor');
export const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm bekleniyor');
export const emailSchema = z.string().trim().toLowerCase().email();
export const timezoneSchema = z
  .string()
  .min(1)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Geçersiz saat dilimi' },
  );

export const providerSchema = z.enum(PROVIDERS);
export const accountKindSchema = z.enum(ACCOUNT_KINDS);
export const connectionStatusSchema = z.enum(CONNECTION_STATUSES);
export const sourceTypeSchema = z.enum(SOURCE_TYPES);
export const importanceSchema = z.enum(IMPORTANCE_LEVELS);
export const emailCategorySchema = z.enum(EMAIL_CATEGORIES);
export const insightKindSchema = z.enum(INSIGHT_KINDS);
export const lifeEventTypeSchema = z.enum(LIFE_EVENT_TYPES);
export const approvalStatusSchema = z.enum(APPROVAL_STATUSES);
export const approvalActionTypeSchema = z.enum(APPROVAL_ACTION_TYPES);
export const briefingKindSchema = z.enum(BRIEFING_KINDS);
export const briefingSectionSchema = z.enum(BRIEFING_SECTIONS);
export const reminderOptionSchema = z.enum(REMINDER_OPTIONS);
export const commitmentDirectionSchema = z.enum(COMMITMENT_DIRECTIONS);
export const commitmentStatusSchema = z.enum(COMMITMENT_STATUSES);
export const priorityRuleTypeSchema = z.enum(PRIORITY_RULE_TYPES);
export const aiFeedbackKindSchema = z.enum(AI_FEEDBACK_KINDS);
export const captureKindSchema = z.enum(CAPTURE_KINDS);
export const captureDetectedTypeSchema = z.enum(CAPTURE_DETECTED_TYPES);
export const notificationCategorySchema = z.enum(NOTIFICATION_CATEGORIES);
export const lockScreenPrivacySchema = z.enum(LOCK_SCREEN_PRIVACY);
export const themePreferenceSchema = z.enum(THEME_PREFERENCES);
export const localeSchema = z.enum(LOCALES);
export const replyToneSchema = z.enum(REPLY_TONES);
export const planSchema = z.enum(PLANS);
export const retentionOptionSchema = z.enum(RETENTION_OPTIONS);
export const flowFilterSchema = z.enum(FLOW_FILTERS);
export const personalizationInterestSchema = z.enum(PERSONALIZATION_INTERESTS);

export const sourceRefSchema = z.object({
  type: sourceTypeSchema,
  id: z.string().min(1),
  externalId: z.string().optional(),
  label: z.string().min(1).max(80),
  person: z.string().max(120).optional(),
  personId: z.string().optional(),
  timestamp: isoDateTimeSchema,
  url: z.string().url().optional(),
  excerpt: z.string().max(280).optional(),
});

export const participantSchema = z.object({
  name: z.string().max(200).nullish(),
  email: emailSchema,
});

/** Confidence is clamped to [0,1]. */
export const confidenceSchema = z.number().min(0).max(1);

export type Infer<T extends z.ZodTypeAny> = z.infer<T>;
