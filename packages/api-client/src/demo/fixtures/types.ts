import type { EmailAnalysis, ISODate, ISODateTime, SourceRef, SourceType, UUID } from '@da/domain';

/** Everything a fixture builder needs; all timestamps derive from the injected clock. */
export interface FixtureContext {
  userId: UUID;
  /** Greeting / signature name ("Yunus"). */
  userName: string;
  displayName: string;
  email: string;
  timeZone: string;
  today: ISODate;
  nowIso: ISODateTime;
  /** Local time relative to today, mirrors `pg_temp.lt` in seed.sql. */
  lt(dayOffset: number, hhmm: string): ISODateTime;
  day(offset: number): ISODate;
  /** now minus N minutes */
  minus(minutes: number): ISODateTime;
  /** now plus N days */
  plusDays(days: number): ISODateTime;
}

export function source(
  type: SourceType,
  id: string,
  label: string,
  timestamp: ISODateTime,
  extra: Partial<Omit<SourceRef, 'type' | 'id' | 'label' | 'timestamp'>> = {},
): SourceRef {
  return { type, id, label, timestamp, ...extra };
}

export function analysis(
  partial: Pick<EmailAnalysis, 'summary' | 'importance' | 'category'> & Partial<EmailAnalysis>,
): EmailAnalysis {
  return {
    reasonImportant: null,
    requiresUserAction: false,
    deadline: null,
    deadlineText: null,
    keyPoints: [],
    people: [],
    commitments: [],
    followUp: null,
    suggestedActions: [],
    lifeEvent: null,
    confidence: 0.9,
    producedBy: 'heuristic',
    ...partial,
  };
}
