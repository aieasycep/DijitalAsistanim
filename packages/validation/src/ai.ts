/**
 * AI structured-output schemas. Every model response is validated with these before it touches
 * the database. Invalid outputs are rejected (and retried once by the caller).
 *
 * Anti-hallucination invariants enforced here:
 *  - deadline / amounts / flight numbers / PNR are only accepted when the model also returns the
 *    verbatim `evidence` snippet it found them in (checked by the pipeline against the source).
 *  - confidence must be present; low-confidence actionable items require user confirmation.
 */
import { z } from 'zod';
import {
  captureDetectedTypeSchema,
  commitmentDirectionSchema,
  confidenceSchema,
  emailCategorySchema,
  importanceSchema,
  isoDateTimeSchema,
  lifeEventTypeSchema,
  replyToneSchema,
} from './common';

export const suggestedActionKindSchema = z.enum([
  'reply',
  'create_task',
  'add_to_calendar',
  'remind',
  'open_original',
  'follow_up',
  'track',
  'check_in',
  'pay',
  'open_link',
]);

export const suggestedActionSchema = z.object({
  kind: suggestedActionKindSchema,
  label: z.string().min(1).max(40),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const evidencedDateSchema = z
  .object({
    iso: isoDateTimeSchema.nullable(),
    text: z.string().max(120).nullable(),
    evidence: z.string().min(1).max(240),
  })
  .nullable();

export const lifeEventDetailsSchema = z.object({
  carrier: z.string().max(80).nullish(),
  trackingNumber: z.string().max(80).nullish(),
  trackingUrl: z.string().url().nullish(),
  merchant: z.string().max(120).nullish(),
  deliveryWindow: z
    .object({ start: isoDateTimeSchema.nullish(), end: isoDateTimeSchema.nullish() })
    .nullish(),
  flightNumber: z.string().max(12).nullish(),
  airline: z.string().max(80).nullish(),
  from: z.string().max(80).nullish(),
  to: z.string().max(80).nullish(),
  departureAt: isoDateTimeSchema.nullish(),
  arrivalAt: isoDateTimeSchema.nullish(),
  pnr: z.string().max(12).nullish(),
  checkInUrl: z.string().url().nullish(),
  venue: z.string().max(120).nullish(),
  address: z.string().max(240).nullish(),
  reservationAt: isoDateTimeSchema.nullish(),
  partySize: z.number().int().min(1).max(200).nullish(),
  amount: z.number().nonnegative().nullish(),
  currency: z.string().length(3).nullish(),
  dueAt: isoDateTimeSchema.nullish(),
  payee: z.string().max(120).nullish(),
  paymentUrl: z.string().url().nullish(),
  serviceName: z.string().max(80).nullish(),
  renewsAt: isoDateTimeSchema.nullish(),
  securityEvent: z.string().max(160).nullish(),
  device: z.string().max(80).nullish(),
  location: z.string().max(120).nullish(),
});

export const lifeEventExtractionSchema = z.object({
  type: lifeEventTypeSchema,
  title: z.string().min(1).max(120),
  details: lifeEventDetailsSchema,
  /** Verbatim source snippets that justify amount/date/number fields. */
  evidence: z.array(z.string().max(240)).max(8).default([]),
  confidence: confidenceSchema,
});

export const emailAnalysisAiSchema = z.object({
  summary: z.string().min(1).max(320),
  importance: importanceSchema,
  category: emailCategorySchema,
  reasonImportant: z.string().max(240).nullish(),
  requiresUserAction: z.boolean(),
  deadline: evidencedDateSchema.default(null),
  keyPoints: z.array(z.string().max(120)).max(5).default([]),
  people: z
    .array(
      z.object({
        name: z.string().max(120).nullish(),
        email: z.string().max(200).nullish(),
        role: z.string().max(60).nullish(),
      }),
    )
    .max(10)
    .default([]),
  commitments: z
    .array(
      z.object({
        text: z.string().min(1).max(200),
        direction: commitmentDirectionSchema,
        due: evidencedDateSchema.default(null),
        counterpart: z.string().max(120).nullish(),
        quote: z.string().max(200).nullish(),
      }),
    )
    .max(5)
    .default([]),
  followUp: z
    .object({
      expected: z.boolean(),
      nudgeAfterDays: z.number().int().min(1).max(30).nullish(),
      reason: z.string().max(160).nullish(),
    })
    .nullish(),
  suggestedActions: z.array(suggestedActionSchema).max(4).default([]),
  lifeEvent: lifeEventExtractionSchema.nullish(),
  /** "Kaynakta kesinleşmiyor." when facts are uncertain */
  uncertainties: z.array(z.string().max(160)).max(5).default([]),
  confidence: confidenceSchema,
});
export type EmailAnalysisAi = z.infer<typeof emailAnalysisAiSchema>;

/** Batched classification (small model) — one entry per input id. */
export const emailBatchClassificationSchema = z.object({
  results: z.array(
    z.object({
      id: z.string().min(1),
      importance: importanceSchema,
      category: emailCategorySchema,
      requiresUserAction: z.boolean(),
      needsDeepAnalysis: z.boolean(),
      oneLine: z.string().max(160),
      confidence: confidenceSchema,
    }),
  ),
});
export type EmailBatchClassification = z.infer<typeof emailBatchClassificationSchema>;

export const briefingAiSchema = z.object({
  headline: z.string().min(1).max(80),
  highlightNumber: z.number().int().min(0).max(99),
  subline: z.string().min(1).max(120),
  mood: z.string().min(1).max(100),
  narrative: z.string().min(1).max(900),
  outlook: z.string().max(400).nullish(),
  /** Item ordering decided by the model, referencing candidate ids we supplied (no invention). */
  sections: z
    .array(
      z.object({
        section: z.string().min(1),
        itemIds: z.array(z.string()).max(8),
      }),
    )
    .max(12),
  audioScript: z.array(z.object({ title: z.string().max(60), text: z.string().max(900) })).max(8),
  uncertainties: z.array(z.string().max(160)).max(5).default([]),
});
export type BriefingAi = z.infer<typeof briefingAiSchema>;

export const meetingPrepAiSchema = z.object({
  purpose: z.string().min(1).max(240),
  talkingPoints: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        detail: z.string().min(1).max(240),
        sourceId: z.string().nullish(),
      }),
    )
    .min(1)
    .max(3),
  twoMinuteSummary: z.string().min(1).max(1200),
  relevantEmailIds: z
    .array(z.object({ id: z.string(), why: z.string().max(120) }))
    .max(6)
    .default([]),
  openLoops: z
    .array(z.object({ text: z.string().max(160), sourceId: z.string().nullish() }))
    .max(6)
    .default([]),
  uncertainties: z.array(z.string().max(160)).max(5).default([]),
  confidence: confidenceSchema,
});
export type MeetingPrepAi = z.infer<typeof meetingPrepAiSchema>;

export const commitmentExtractionAiSchema = z.object({
  commitments: z
    .array(
      z.object({
        text: z.string().min(1).max(200),
        quote: z.string().min(1).max(240),
        direction: commitmentDirectionSchema,
        counterpart: z.string().max(120).nullish(),
        due: evidencedDateSchema.default(null),
        confidence: confidenceSchema,
      }),
    )
    .max(6),
});
export type CommitmentExtractionAi = z.infer<typeof commitmentExtractionAiSchema>;

export const captureAnalysisAiSchema = z.object({
  detectedType: captureDetectedTypeSchema,
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(400),
  event: z
    .object({
      title: z.string().max(120),
      start: evidencedDateSchema.default(null),
      end: evidencedDateSchema.default(null),
      location: z.string().max(160).nullish(),
    })
    .nullish(),
  task: z.object({ title: z.string().max(120), due: evidencedDateSchema.default(null) }).nullish(),
  deadline: z
    .object({ title: z.string().max(120), due: evidencedDateSchema.default(null) })
    .nullish(),
  person: z
    .object({
      name: z.string().max(120),
      email: z.string().max(200).nullish(),
      phone: z.string().max(40).nullish(),
      company: z.string().max(120).nullish(),
    })
    .nullish(),
  payment: z
    .object({
      payee: z.string().max(120).nullish(),
      amount: z.number().nonnegative().nullish(),
      currency: z.string().length(3).nullish(),
      due: evidencedDateSchema.default(null),
      evidence: z.string().max(240).nullish(),
    })
    .nullish(),
  keyPoints: z.array(z.string().max(160)).max(6).default([]),
  dates: z
    .array(z.object({ text: z.string().max(80), iso: isoDateTimeSchema.nullish() }))
    .max(6)
    .default([]),
  suggestedActions: z.array(suggestedActionSchema).max(4).default([]),
  uncertainties: z.array(z.string().max(160)).max(5).default([]),
  confidence: confidenceSchema,
});
export type CaptureAnalysisAi = z.infer<typeof captureAnalysisAiSchema>;

export const assistantAnswerAiSchema = z.object({
  answer: z.string().min(1).max(2000),
  /** Ids of retrieved chunks that ground the answer. Empty ⇒ answer must be generic. */
  citedSourceIds: z.array(z.string()).max(8).default([]),
  cards: z
    .array(
      z.object({
        kind: z.enum(['email', 'event', 'person', 'commitment', 'life_event', 'plan_block']),
        id: z.string(),
      }),
    )
    .max(5)
    .default([]),
  /** Write intents → converted to approval actions by the server, never executed directly. */
  writeIntents: z
    .array(
      z.object({
        type: z.enum([
          'email_send',
          'calendar_create',
          'calendar_update',
          'task_create',
          'reminder_create',
          'commitment_create',
        ]),
        what: z.string().max(160),
        why: z.string().max(200),
        draft: z.record(z.string(), z.unknown()),
      }),
    )
    .max(3)
    .default([]),
  uncertain: z.boolean().default(false),
  suggestedFollowUps: z.array(z.string().max(80)).max(3).default([]),
});
export type AssistantAnswerAi = z.infer<typeof assistantAnswerAiSchema>;

export const replyDraftAiSchema = z.object({
  subject: z.string().max(200),
  body: z.string().min(1).max(4000),
  tone: replyToneSchema,
  /** The facts the draft relies on; used to render source chips. */
  basedOnIds: z.array(z.string()).max(6).default([]),
});
export type ReplyDraftAi = z.infer<typeof replyDraftAiSchema>;

export const voiceIntentAiSchema = z.object({
  intent: z.enum(['question', 'read_briefing', 'write_action', 'navigate', 'unknown']),
  navigateTo: z.string().max(80).nullish(),
  question: z.string().max(500).nullish(),
  writeAction: z
    .object({
      type: z.enum([
        'email_send',
        'calendar_create',
        'calendar_update',
        'task_create',
        'reminder_create',
        'commitment_create',
      ]),
      what: z.string().max(160),
      why: z.string().max(200),
      draft: z.record(z.string(), z.unknown()),
    })
    .nullish(),
  confidence: confidenceSchema,
});
export type VoiceIntentAi = z.infer<typeof voiceIntentAiSchema>;

export const scheduleSuggestionAiSchema = z.object({
  suggestions: z
    .array(
      z.object({
        kind: z.enum(['move_event', 'schedule_task', 'add_prep_time', 'add_buffer']),
        title: z.string().max(120),
        detail: z.string().max(200),
        proposedStartAt: isoDateTimeSchema,
        proposedEndAt: isoDateTimeSchema,
        targetEventId: z.string().nullish(),
        targetTaskId: z.string().nullish(),
        reason: z.string().max(200),
      }),
    )
    .max(5),
});
export type ScheduleSuggestionAi = z.infer<typeof scheduleSuggestionAiSchema>;

export const suggestedQuestionsAiSchema = z.object({
  questions: z
    .array(z.object({ text: z.string().max(80), reason: z.string().max(120).nullish() }))
    .min(3)
    .max(6),
});
