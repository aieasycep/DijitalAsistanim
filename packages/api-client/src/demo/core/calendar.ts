import type {
  CalendarConflict,
  CalendarEvent,
  FreeBlock,
  ISODate,
  ISODateTime,
  UUID,
} from '@da/domain';
import { addDaysToKey, type DemoClock } from '../clock';
import type { DemoState, StoredConflict } from '../state';

export const WORKDAY_START = '09:00';
export const WORKDAY_END = '18:00';
const MIN_FREE_BLOCK_MINUTES = 30;
const BACK_TO_BACK_GAP_MINUTES = 15;

export function eventOverlapsDay(event: CalendarEvent, clock: DemoClock, key: ISODate): boolean {
  const dayStart = clock.at(key, '00:00').getTime();
  const dayEnd = clock.at(addDaysToKey(key, 1), '00:00').getTime();
  return Date.parse(event.startAt) < dayEnd && Date.parse(event.endAt) > dayStart;
}

export function liveEvents(state: DemoState): CalendarEvent[] {
  return state.events.filter((e) => !e.deletedAt && e.status !== 'cancelled');
}

export function eventsOnDay(state: DemoState, clock: DemoClock, key: ISODate): CalendarEvent[] {
  return liveEvents(state)
    .filter((e) => eventOverlapsDay(e, clock, key))
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

export function eventsBetween(
  state: DemoState,
  from: ISODateTime,
  to: ISODateTime,
): CalendarEvent[] {
  const f = Date.parse(from);
  const t = Date.parse(to);
  return liveEvents(state)
    .filter((e) => Date.parse(e.startAt) < t && Date.parse(e.endAt) > f)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

export function overlapMinutes(
  a: { startAt: ISODateTime; endAt: ISODateTime },
  b: { startAt: ISODateTime; endAt: ISODateTime },
): number {
  const start = Math.max(Date.parse(a.startAt), Date.parse(b.startAt));
  const end = Math.min(Date.parse(a.endAt), Date.parse(b.endAt));
  return Math.max(0, Math.round((end - start) / 60_000));
}

/** Gaps ≥ 30 min inside the 09:00–18:00 working window, given busy intervals. */
export function computeFreeBlocks(
  busy: Array<{ startAt: ISODateTime; endAt: ISODateTime }>,
  clock: DemoClock,
  key: ISODate,
): FreeBlock[] {
  const windowStart = clock.at(key, WORKDAY_START).getTime();
  const windowEnd = clock.at(key, WORKDAY_END).getTime();
  const intervals = busy
    .map((b) => ({ start: Date.parse(b.startAt), end: Date.parse(b.endAt) }))
    .filter((b) => b.end > windowStart && b.start < windowEnd)
    .sort((a, b) => a.start - b.start);
  const blocks: FreeBlock[] = [];
  let cursor = windowStart;
  for (const interval of intervals) {
    if (interval.start - cursor >= MIN_FREE_BLOCK_MINUTES * 60_000) {
      blocks.push({
        startAt: new Date(cursor).toISOString(),
        endAt: new Date(interval.start).toISOString(),
        minutes: Math.round((interval.start - cursor) / 60_000),
      });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (windowEnd - cursor >= MIN_FREE_BLOCK_MINUTES * 60_000) {
    blocks.push({
      startAt: new Date(cursor).toISOString(),
      endAt: new Date(windowEnd).toISOString(),
      minutes: Math.round((windowEnd - cursor) / 60_000),
    });
  }
  return blocks;
}

export function backToBackWarnings(
  events: CalendarEvent[],
): { fromEventId: UUID; toEventId: UUID }[] {
  const sorted = [...events].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const warnings: { fromEventId: UUID; toEventId: UUID }[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (!prev || !next) continue;
    const gap = (Date.parse(next.startAt) - Date.parse(prev.endAt)) / 60_000;
    if (gap >= 0 && gap < BACK_TO_BACK_GAP_MINUTES)
      warnings.push({ fromEventId: prev.id, toEventId: next.id });
  }
  return warnings;
}

export function toCalendarConflict(
  state: DemoState,
  stored: StoredConflict,
): CalendarConflict | null {
  const eventA = state.events.find((e) => e.id === stored.eventAId);
  const eventB = state.events.find((e) => e.id === stored.eventBId);
  if (!eventA || !eventB) return null;
  return {
    id: stored.id,
    eventA,
    eventB,
    overlapMinutes: stored.overlapMinutes,
    suggestions: stored.suggestions,
    status: stored.status,
  };
}

/**
 * Keeps stored conflicts in sync with the events: new overlaps get a conflict (with a generic move suggestion),
 * open conflicts whose events no longer overlap become resolved.
 */
export function syncConflicts(
  state: DemoState,
  clock: DemoClock,
  nextId: () => UUID,
  nowIso: ISODateTime,
): void {
  const events = liveEvents(state).filter((e) => !e.allDay);
  for (const stored of state.conflicts) {
    if (stored.status !== 'open') continue;
    const a = events.find((e) => e.id === stored.eventAId);
    const b = events.find((e) => e.id === stored.eventBId);
    const minutes = a && b ? overlapMinutes(a, b) : 0;
    if (minutes === 0) stored.status = 'resolved';
    else stored.overlapMinutes = minutes;
  }
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i];
      const b = events[j];
      if (!a || !b) continue;
      const minutes = overlapMinutes(a, b);
      if (minutes === 0) continue;
      const exists = state.conflicts.some(
        (c) =>
          (c.eventAId === a.id && c.eventBId === b.id) ||
          (c.eventAId === b.id && c.eventBId === a.id),
      );
      if (exists) continue;
      const later = Date.parse(a.startAt) <= Date.parse(b.startAt) ? b : a;
      const earlier = later === a ? b : a;
      const proposedStart = earlier.endAt;
      const duration = Date.parse(later.endAt) - Date.parse(later.startAt);
      state.conflicts.push({
        id: nextId(),
        eventAId: earlier.id,
        eventBId: later.id,
        overlapMinutes: minutes,
        suggestions: [
          {
            id: `sg-${later.id.slice(-4)}`,
            kind: 'move_event',
            title: `${later.title} etkinliğini ${clock.hhmm(proposedStart)}'a almayı önerebilirim.`,
            detail: `${earlier.title} ${clock.hhmm(earlier.endAt)}'de bitiyor.`,
            proposedStartAt: proposedStart,
            proposedEndAt: new Date(Date.parse(proposedStart) + duration).toISOString(),
            targetEventId: later.id,
            targetTaskId: null,
            reason: `${earlier.title} ile ${minutes} dk çakışıyor`,
          },
        ],
        status: 'open',
      });
      const conflictInsightExists = state.insights.some(
        (ins) =>
          ins.kind === 'conflict' &&
          ins.entityId === state.conflicts[state.conflicts.length - 1]?.id,
      );
      if (!conflictInsightExists) {
        const stored = state.conflicts[state.conflicts.length - 1];
        if (stored) {
          state.insights.push({
            id: nextId(),
            userId: state.profile.id,
            kind: 'conflict',
            badge: 'calendar',
            title: `Takvim çakışması: ${earlier.title} ile ${later.title}`,
            subtitle: `${clock.hhmm(earlier.startAt)}–${clock.hhmm(earlier.endAt)} ve ${clock.hhmm(later.startAt)} çakışıyor.`,
            reason: null,
            importance: 'high',
            priorityScore: 650,
            priorityReasons: ['Çakışma'],
            timeLabel: clock.hhmm(later.startAt),
            dueAt: later.startAt,
            status: 'active',
            snoozedUntil: null,
            source: { type: earlier.source, id: stored.id, label: 'Takvim', timestamp: nowIso },
            actions: [
              { id: 'see_options', label: 'Seçenekleri Gör', kind: 'see_options', primary: true },
              { id: 'ignore', label: 'Yoksay', kind: 'snooze', primary: false },
            ],
            entityType: 'conflict',
            entityId: stored.id,
            tags: ['calendar'],
            forDate: clock.dateKey(later.startAt) < clock.today() ? clock.today() : clock.today(),
            confidence: 0.99,
            isLowConfidence: false,
            dedupeKey: `conflict:conflict:${stored.id}`,
            createdAt: nowIso,
            updatedAt: nowIso,
            deletedAt: null,
          });
        }
      }
    }
  }
}
