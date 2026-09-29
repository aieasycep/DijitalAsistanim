import type { LifeEventExtraction, LifeEventType, Locale } from '@da/domain';

export interface ExtractLifeEventInput {
  subject: string;
  from: { name?: string | null; email: string };
  bodyText?: string | null;
  /** Reference instant (ISO UTC) — the message's receivedAt/sentAt; relative dates ("bugün", "yarın") resolve against it. */
  now: string;
  timezone: string;
  locale?: Locale;
}

export type BillKind =
  | 'electricity'
  | 'water'
  | 'gas'
  | 'internet'
  | 'phone'
  | 'credit_card'
  | 'dues'
  | 'rent'
  | 'insurance'
  | 'tax'
  | 'school';

/**
 * LifeEventExtraction plus the verbatim evidence that justifies every date/amount/number field and
 * a few extraction-time facts (sender org, "delivered" phase, bill kind) needed to re-render the
 * title in another locale. `lifeEventExtractionSchema` validates it (unknown keys are stripped).
 */
export interface ExtractedLifeEvent extends LifeEventExtraction {
  type: LifeEventType;
  /** ≤ 8 verbatim snippets (≤ 240 chars each). */
  evidence: string[];
  /** When the event was observed (security alerts) — the message instant. Null for scheduled events. */
  occurredAt: string | null;
  /** Sender organisation / service the event belongs to ("Google", "Trendyol", "CK Enerji"). */
  provider: string | null;
  /** Shipment already delivered ("teslim edildi"). */
  delivered?: boolean;
  /** Bill category detected from the text (electricity, water …). */
  billKind?: BillKind | null;
}

export type LifeEventStatusValue = 'today' | 'upcoming' | 'expired';

export interface LifeEventTitleOptions {
  /** Reference instant for relative labels ("bugün", "yarın"); absolute dates are used when omitted. */
  now?: string;
  timezone?: string;
}
