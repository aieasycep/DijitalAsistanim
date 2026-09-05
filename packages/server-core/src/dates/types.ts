import type { Locale } from '@da/domain';

export type DateKind = 'deadline' | 'date' | 'time' | 'relative';

export interface ExtractDatesInput {
  text: string;
  /** Reference instant (ISO UTC) — usually the message's sentAt or "now". */
  now: string;
  /** IANA timezone used to resolve local wall-clock expressions (e.g. Europe/Istanbul). */
  timezone: string;
  locale?: Locale;
}

export interface ExtractedDate {
  /** Resolved instant in UTC. */
  iso: string;
  /** The matched span exactly as written in the source. */
  text: string;
  kind: DateKind;
  /** 0-1 */
  confidence: number;
  /** Short verbatim snippet around the match (never the full text). */
  evidence: string;
  /** False when the source only named a day and the clock time is a default. */
  hasTime: boolean;
  /** Local date key (YYYY-MM-DD) in the input timezone. */
  localDate: string;
  /** Deadline cue found next to the span ("kadar", "son ödeme tarihi", "by" …) when kind === 'deadline'. */
  cue?: string;
  start: number;
  end: number;
}
