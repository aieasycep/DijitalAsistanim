import type { SourceType } from './enums';

/**
 * Source traceability. Every important AI insight, briefing row, life event, commitment and
 * assistant claim carries at least one SourceRef so the UI can render
 * "Gmail · Ahmet Yılmaz · 08:42" and open the underlying source.
 */
export interface SourceRef {
  type: SourceType;
  /** Internal id of the source row (email_messages.id, calendar_events.id, captures.id ...). */
  id: string;
  /** Provider-side id (Gmail message id, Graph event id, EventKit identifier) when applicable. */
  externalId?: string;
  /** Human label of the source system: "Gmail", "Google Takvim", "Kargo", "Toplantı notu". */
  label: string;
  /** Person/sender associated with the source. */
  person?: string;
  personId?: string;
  /** ISO timestamp (UTC) of the source item. */
  timestamp: string;
  /** Deep link to the original (web/app URL) when available. */
  url?: string;
  /** Short excerpt used as citation in assistant answers (≤ 280 chars, never full body). */
  excerpt?: string;
}

/** Display helper contract — implemented in packages/ui & i18n. */
export interface SourceLineParts {
  label: string;
  person?: string;
  time: string;
}
