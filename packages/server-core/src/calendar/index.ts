/**
 * calendar — calendar intelligence without writes: conflict and back-to-back detection, free
 * blocks, schedule / prep suggestions, conflict resolution options, travel time ("leave by") and
 * optimistic-write resolution for provider updates.
 *
 * Product law: nothing here moves a meeting. Every output is a suggestion the user approves.
 */
import type { CalendarConflict, CalendarEvent, Commitment, FreeBlock, ISODate, Locale, PlanDay, ScheduleSuggestion, TaskItem } from '@da/domain';
import { formatClock, formatDayLabel, timeWithDative, turkishDative } from '../dates';
import { AppError } from '../errors';
import { MINUTE, addMinutes, localDateKey, zonedTimeToUtc } from '../util';

export const DEFAULT_TIMEZONE = 'Europe/Istanbul';
export const DEFAULT_DAY_START = '09:00';
export const DEFAULT_DAY_END = '18:00';
export const DEFAULT_MIN_BLOCK_MINUTES = 30;
export const DEFAULT_MIN_GAP_MINUTES = 10;
export const DEFAULT_PREP_MINUTES = 15;
export const DEFAULT_TASK_MINUTES = 45;
/** A free block longer than this is only partially proposed for one task. */
export const MAX_TASK_BLOCK_MINUTES = 150;

// ---------------------------------------------------------------------------
// Event filtering
// ---------------------------------------------------------------------------

export interface EventFilterOptions {
  /** The user's own address — needed to recognise events the user declined. */
  userEmail?: string | null;
}

function ms(iso: string): number {
  return Date.parse(iso);
}

function byStart(a: CalendarEvent, b: CalendarEvent): number {
  const d = ms(a.startAt) - ms(b.startAt);
  return d !== 0 ? d : a.id.localeCompare(b.id);
}

function isDeclined(event: CalendarEvent, opts: EventFilterOptions): boolean {
  const email = opts.userEmail?.trim().toLowerCase();
  for (const a of event.attendees) {
    if (a.responseStatus !== 'declined') continue;
    if (email && a.email?.trim().toLowerCase() === email) return true;
    if (!email && a.isOrganizer && event.organizerIsUser) return true;
  }
  return false;
}

/** Timed, not cancelled, not declined and with a valid positive duration. */
export function isSchedulable(event: CalendarEvent, opts: EventFilterOptions = {}): boolean {
  if (event.deletedAt) return false;
  if (event.status === 'cancelled') return false;
  if (event.allDay) return false;
  const start = ms(event.startAt);
  const end = ms(event.endAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return false;
  return !isDeclined(event, opts);
}

export function durationMinutes(event: Pick<CalendarEvent, 'startAt' | 'endAt'>): number {
  return Math.max(0, Math.round((ms(event.endAt) - ms(event.startAt)) / MINUTE));
}

/** Attendees other than the organizer-user (people the meeting is *with*). */
export function externalAttendees(event: CalendarEvent, opts: EventFilterOptions = {}): CalendarEvent['attendees'] {
  const email = opts.userEmail?.trim().toLowerCase();
  return event.attendees.filter((a) => {
    if (email && a.email?.trim().toLowerCase() === email) return false;
    if (!email && a.isOrganizer && event.organizerIsUser) return false;
    return true;
  });
}

const ONLINE_LOCATION = /^(online|çevrimiçi|cevrimici|remote|uzaktan|zoom|teams|google meet|meet)$/i;

/** True when the event has a physical place worth travelling to. */
export function hasPhysicalLocation(event: Pick<CalendarEvent, 'location' | 'meetingUrl'>): boolean {
  const loc = event.location?.trim() ?? '';
  if (!loc) return false;
  if (ONLINE_LOCATION.test(loc)) return false;
  if (/^https?:\/\//i.test(loc)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Conflicts & back-to-back
// ---------------------------------------------------------------------------

function sameMirroredEvent(a: CalendarEvent, b: CalendarEvent): boolean {
  if (a.id === b.id) return true;
  if (a.externalEventId && a.externalEventId === b.externalEventId) return true;
  return a.title.trim() === b.title.trim() && a.startAt === b.startAt && a.endAt === b.endAt;
}

/** Overlapping timed events (all-day, cancelled and declined events are ignored). */
export function detectConflicts(events: readonly CalendarEvent[], opts: EventFilterOptions = {}): CalendarConflict[] {
  const active = events.filter((e) => isSchedulable(e, opts)).sort(byStart);
  const out: CalendarConflict[] = [];
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    if (!a) continue;
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
      if (!b) continue;
      if (ms(b.startAt) >= ms(a.endAt)) break;
      if (sameMirroredEvent(a, b)) continue;
      const overlap = Math.round((Math.min(ms(a.endAt), ms(b.endAt)) - Math.max(ms(a.startAt), ms(b.startAt))) / MINUTE);
      if (overlap <= 0) continue;
      out.push({ id: `conflict:${a.id}:${b.id}`, eventA: a, eventB: b, overlapMinutes: overlap, suggestions: [], status: 'open' });
    }
  }
  return out;
}

export interface BackToBackWarning {
  fromEventId: string;
  toEventId: string;
  gapMinutes: number;
}

export interface BackToBackOptions extends EventFilterOptions {
  /** Gaps shorter than this (but not overlapping) are flagged. Default 10. */
  minGapMin?: number;
}

/** Consecutive events with less than `minGapMin` minutes between them (overlaps are conflicts, not warnings). */
export function detectBackToBack(events: readonly CalendarEvent[], opts: BackToBackOptions = {}): BackToBackWarning[] {
  const minGap = opts.minGapMin ?? DEFAULT_MIN_GAP_MINUTES;
  const active = events.filter((e) => isSchedulable(e, opts)).sort(byStart);
  const out: BackToBackWarning[] = [];
  let prev: CalendarEvent | null = null;
  for (const event of active) {
    if (prev) {
      const gap = Math.round((ms(event.startAt) - ms(prev.endAt)) / MINUTE);
      if (gap >= 0 && gap < minGap) out.push({ fromEventId: prev.id, toEventId: event.id, gapMinutes: gap });
    }
    if (!prev || ms(event.endAt) > ms(prev.endAt)) prev = event;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Free blocks
// ---------------------------------------------------------------------------

export interface FreeBlockOptions extends EventFilterOptions {
  date: ISODate;
  timezone: string;
  /** Local HH:mm, default 09:00. */
  dayStart?: string;
  /** Local HH:mm, default 18:00. */
  dayEnd?: string;
  /** Shorter gaps are not reported. Default 30. */
  minMinutes?: number;
  /** When given and inside the window, blocks start no earlier than now (rounded up to 5 min). */
  now?: string;
}

function roundUpToFiveMinutes(t: number): number {
  const step = 5 * MINUTE;
  return Math.ceil(t / step) * step;
}

function block(start: number, end: number): FreeBlock {
  return { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), minutes: Math.round((end - start) / MINUTE) };
}

/** Free time inside the working window of a local date, after removing every schedulable event. */
export function freeBlocks(events: readonly CalendarEvent[], opts: FreeBlockOptions): FreeBlock[] {
  const minMinutes = opts.minMinutes ?? DEFAULT_MIN_BLOCK_MINUTES;
  const windowStart = ms(zonedTimeToUtc(opts.date, opts.dayStart ?? DEFAULT_DAY_START, opts.timezone));
  const windowEnd = ms(zonedTimeToUtc(opts.date, opts.dayEnd ?? DEFAULT_DAY_END, opts.timezone));
  if (windowEnd <= windowStart) return [];
  let cursor = windowStart;
  if (opts.now) {
    const now = ms(opts.now);
    if (!Number.isNaN(now) && now > cursor) cursor = roundUpToFiveMinutes(now);
  }
  const busy = events
    .filter((e) => isSchedulable(e, opts))
    .map((e) => ({ start: ms(e.startAt), end: ms(e.endAt) }))
    .filter((b) => b.end > windowStart && b.start < windowEnd)
    .sort((a, b) => a.start - b.start);
  const out: FreeBlock[] = [];
  for (const b of busy) {
    if (b.start > cursor) {
      const end = Math.min(b.start, windowEnd);
      if (end - cursor >= minMinutes * MINUTE) out.push(block(cursor, end));
    }
    cursor = Math.max(cursor, b.end);
    if (cursor >= windowEnd) break;
  }
  if (windowEnd - cursor >= minMinutes * MINUTE) out.push(block(cursor, windowEnd));
  return out;
}

// ---------------------------------------------------------------------------
// Formatting helpers (exported for the plan UI and other modules)
// ---------------------------------------------------------------------------

/** "45 dk", "2 saat", "2,5 saat", "1 saat 40 dk" / "45 min", "2 hours", "2.5 hours", "1 hour 40 min". */
export function formatDuration(minutes: number, locale: Locale = 'tr'): string {
  const m = Math.max(0, Math.round(minutes));
  const en = locale === 'en';
  if (m < 60) return en ? `${m} min` : `${m} dk`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (rest === 0) return en ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : `${hours} saat`;
  if (rest === 30) return en ? `${hours}.5 hours` : `${hours},5 saat`;
  return en ? `${hours} ${hours === 1 ? 'hour' : 'hours'} ${rest} min` : `${hours} saat ${rest} dk`;
}

function capitalize(s: string): string {
  const first = s[0] ?? '';
  return first.toLocaleUpperCase('tr-TR') + s.slice(1);
}

/** "Bugün" / "Yarın" / "Cuma" / "12 Eylül" — title-cased day label. */
export function dayLabelTitle(iso: string, opts: { now: string; timezone: string; locale?: Locale }): string {
  return capitalize(formatDayLabel(iso, opts));
}

function clockRange(startAt: string, endAt: string, timezone: string): string {
  return `${formatClock(startAt, timezone)}–${formatClock(endAt, timezone)}`;
}

// ---------------------------------------------------------------------------
// Suggestions (never applied — shown for approval)
// ---------------------------------------------------------------------------

export interface PrepTimeOptions {
  /** Prep length in minutes, default 15. */
  minutes?: number;
  timezone?: string;
  locale?: Locale;
  /** Only free time after this instant is considered. */
  now?: string;
}

/**
 * Propose a prep block right before an event, inside a free block. When nothing is free directly
 * before the event, the latest free block that ends at most 90 minutes earlier is used.
 */
export function suggestPrepTime(event: CalendarEvent, blocks: readonly FreeBlock[], opts: PrepTimeOptions = {}): ScheduleSuggestion | null {
  const minutes = Math.max(5, opts.minutes ?? DEFAULT_PREP_MINUTES);
  const timezone = opts.timezone ?? DEFAULT_TIMEZONE;
  const locale = opts.locale ?? 'tr';
  const en = locale === 'en';
  const start = ms(event.startAt);
  if (Number.isNaN(start)) return null;
  const nowMs = opts.now ? ms(opts.now) : Number.NEGATIVE_INFINITY;
  const need = minutes * MINUTE;
  let proposed: { start: number; end: number } | null = null;
  const usable = blocks.filter((b) => b.minutes >= minutes && ms(b.startAt) >= Math.min(nowMs, start)).sort((a, b) => ms(b.startAt) - ms(a.startAt));
  for (const b of usable) {
    const bStart = ms(b.startAt);
    const bEnd = ms(b.endAt);
    if (bEnd < start - 90 * MINUTE) continue;
    if (bStart > start) continue;
    const end = Math.min(bEnd, start);
    const candidateStart = end - need;
    if (candidateStart < bStart || candidateStart < nowMs) continue;
    proposed = { start: candidateStart, end };
    break;
  }
  if (!proposed) return null;
  const range = clockRange(new Date(proposed.start).toISOString(), new Date(proposed.end).toISOString(), timezone);
  return {
    id: `prep:${event.id}`,
    kind: 'add_prep_time',
    title: en ? `Reserve ${minutes} min to prepare before ${event.title}.` : `${event.title} öncesi ${minutes} dk hazırlık ayır.`,
    detail: en ? `${range} is free.` : `${range} arası boş.`,
    proposedStartAt: new Date(proposed.start).toISOString(),
    proposedEndAt: new Date(proposed.end).toISOString(),
    targetEventId: event.id,
    targetTaskId: null,
    reason: en ? `Reserve ${minutes} min to prepare` : `Hazırlık için ${minutes} dk ayır`,
  };
}

export interface ScheduleSuggestionsInput extends EventFilterOptions {
  tasks: readonly TaskItem[];
  commitments: readonly Commitment[];
  freeBlocks: readonly FreeBlock[];
  events: readonly CalendarEvent[];
  now: string;
  timezone: string;
  locale?: Locale;
  /** Default 5. */
  max?: number;
  /** Buffer to propose between back-to-back meetings (default 10). */
  minGapMin?: number;
  /** Prep minutes before meetings with other people (default 15). */
  prepMinutes?: number;
}

interface Placeable {
  kind: 'task' | 'commitment';
  id: string;
  title: string;
  dueAt: string | null;
  priorityRank: number;
}

const PRIORITY_RANK: Record<TaskItem['priority'], number> = { critical: 0, high: 1, normal: 2, low: 3 };

function placeables(input: ScheduleSuggestionsInput): Placeable[] {
  const nowMs = ms(input.now);
  const items: Placeable[] = [];
  for (const t of input.tasks) {
    if (t.deletedAt || t.status !== 'open' || t.scheduledStartAt) continue;
    items.push({ kind: 'task', id: t.id, title: t.title, dueAt: t.dueAt ?? null, priorityRank: PRIORITY_RANK[t.priority] });
  }
  for (const c of input.commitments) {
    if (c.deletedAt || c.status !== 'open' || c.direction !== 'user_owes') continue;
    items.push({ kind: 'commitment', id: c.id, title: c.text, dueAt: c.dueAt ?? null, priorityRank: 2 });
  }
  return items
    .filter((p) => !p.dueAt || ms(p.dueAt) >= nowMs - 24 * 60 * MINUTE)
    .sort((a, b) => {
      const da = a.dueAt ? ms(a.dueAt) : Number.POSITIVE_INFINITY;
      const db = b.dueAt ? ms(b.dueAt) : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
      return a.title.localeCompare(b.title);
    });
}

/**
 * Deterministic schedule suggestions: prep before meetings with people, open tasks / promises into
 * free blocks ("Yarın 14:00–16:30 arasında 2,5 saat boşluğun var."), buffers after back-to-back meetings.
 */
export function scheduleSuggestions(input: ScheduleSuggestionsInput): ScheduleSuggestion[] {
  const locale = input.locale ?? 'tr';
  const en = locale === 'en';
  const tz = input.timezone;
  const max = input.max ?? 5;
  const nowMs = ms(input.now);
  const fmt = { now: input.now, timezone: tz, locale };
  const out: ScheduleSuggestion[] = [];
  const activeEvents = input.events.filter((e) => isSchedulable(e, input)).sort(byStart);

  // 1 — prep before upcoming meetings with other people (next 24h)
  for (const event of activeEvents) {
    const start = ms(event.startAt);
    if (start <= nowMs || start > nowMs + 24 * 60 * MINUTE) continue;
    if (externalAttendees(event, input).length === 0) continue;
    if (event.prepGeneratedAt) continue;
    const prep = suggestPrepTime(event, input.freeBlocks, { minutes: input.prepMinutes, timezone: tz, locale, now: input.now });
    if (prep) out.push(prep);
    if (out.length >= max) return out;
  }

  // 2 — tasks / promises into free blocks
  const queue = placeables(input);
  const blocks = [...input.freeBlocks].filter((b) => ms(b.endAt) > nowMs).sort((a, b) => ms(a.startAt) - ms(b.startAt));
  for (const b of blocks) {
    if (out.length >= max) break;
    const blockStart = Math.max(ms(b.startAt), nowMs);
    const blockEnd = ms(b.endAt);
    const available = Math.round((blockEnd - blockStart) / MINUTE);
    if (available < DEFAULT_MIN_BLOCK_MINUTES) continue;
    const idx = queue.findIndex((p) => !p.dueAt || ms(p.dueAt) >= blockStart + DEFAULT_TASK_MINUTES * MINUTE || ms(p.dueAt) >= blockEnd);
    if (idx < 0) continue;
    const item = queue.splice(idx, 1)[0];
    if (!item) continue;
    const length = Math.min(available, MAX_TASK_BLOCK_MINUTES);
    const proposedStart = blockStart;
    const proposedEnd = blockStart + length * MINUTE;
    const day = dayLabelTitle(b.startAt, fmt);
    const range = clockRange(b.startAt, b.endAt, tz);
    const duration = formatDuration(b.minutes, locale);
    const title = en ? `You have ${duration} free ${day.toLowerCase()} between ${range}.` : `${day} ${range} arasında ${duration} boşluğun var.`;
    const detail =
      item.kind === 'task'
        ? en
          ? `I can place the ${item.title} task here.`
          : `${item.title} görevini buraya yerleştirebilirim.`
        : en
          ? `I can place your promise “${item.title}” here.`
          : `“${item.title}” sözünü buraya yerleştirebilirim.`;
    const reason = item.dueAt
      ? en
        ? `Due ${formatDayLabel(item.dueAt, fmt)} ${formatClock(item.dueAt, tz)}`
        : `Son tarih ${formatDayLabel(item.dueAt, fmt)} ${formatClock(item.dueAt, tz)}`
      : en
        ? 'Open item without a planned time'
        : 'Planlanmamış açık iş';
    out.push({
      id: `schedule:${item.kind}:${item.id}:${b.startAt}`,
      kind: 'schedule_task',
      title,
      detail,
      proposedStartAt: new Date(proposedStart).toISOString(),
      proposedEndAt: new Date(proposedEnd).toISOString(),
      targetEventId: null,
      targetTaskId: item.kind === 'task' ? item.id : null,
      reason,
    });
  }

  // 3 — buffers after back-to-back meetings (only when the shifted slot stays free)
  const minGap = input.minGapMin ?? DEFAULT_MIN_GAP_MINUTES;
  for (const w of detectBackToBack(activeEvents, { minGapMin: minGap, userEmail: input.userEmail })) {
    if (out.length >= max) break;
    const from = activeEvents.find((e) => e.id === w.fromEventId);
    const to = activeEvents.find((e) => e.id === w.toEventId);
    if (!from || !to) continue;
    if (ms(to.startAt) <= nowMs) continue;
    const shift = (minGap - w.gapMinutes) * MINUTE;
    const newStart = ms(to.startAt) + shift;
    const newEnd = ms(to.endAt) + shift;
    const collides = activeEvents.some((e) => e.id !== to.id && e.id !== from.id && ms(e.startAt) < newEnd && ms(e.endAt) > newStart);
    if (collides) continue;
    const newStartIso = new Date(newStart).toISOString();
    const t = formatClock(newStartIso, tz);
    const hh = Number(t.slice(0, 2));
    const mm = Number(t.slice(3, 5));
    out.push({
      id: `buffer:${from.id}:${to.id}`,
      kind: 'add_buffer',
      title: en
        ? `Your ${formatClock(from.startAt, tz)} and ${formatClock(to.startAt, tz)} meetings are back-to-back.`
        : `${formatClock(from.startAt, tz)} ve ${formatClock(to.startAt, tz)} toplantıların arka arkaya.`,
      detail: en ? `No break in between; I could suggest moving ${to.title} to ${t}.` : `Arada mola yok; ${to.title} toplantısını ${timeWithDative(hh, mm)} kaydırmayı önerebilirim.`,
      proposedStartAt: newStartIso,
      proposedEndAt: new Date(newEnd).toISOString(),
      targetEventId: to.id,
      targetTaskId: null,
      reason: en ? `${minGap} min buffer between meetings` : `Toplantılar arasında ${minGap} dk tampon`,
    });
  }

  return out.slice(0, max);
}

// ---------------------------------------------------------------------------
// Conflict resolution options (ordered, first is recommended; never applied)
// ---------------------------------------------------------------------------

export type ConflictOptionKind = 'move_b' | 'move_a' | 'shorten_a' | 'keep';

export interface ConflictOption {
  id: string;
  kind: ConflictOptionKind;
  title: string;
  subtitle: string;
  icon: 'auto_awesome' | 'event_repeat' | 'schedule' | 'visibility_off';
  isRecommended: boolean;
  /** Chevron: leads to a confirmation / draft step. `keep` completes immediately. */
  needsFurtherStep: boolean;
  /** The calendar change this option would submit for approval (null for `keep`). */
  suggestion: ScheduleSuggestion | null;
}

export interface ConflictOptionsInput {
  locale?: Locale;
  timezone?: string;
  now?: string;
  userEmail?: string | null;
}

function affectedPeople(event: CalendarEvent, userEmail: string | null | undefined): number {
  return externalAttendees(event, { userEmail }).length;
}

function counterpartName(event: CalendarEvent, userEmail: string | null | undefined): string | null {
  const first = externalAttendees(event, { userEmail })[0];
  return first?.name?.trim() || first?.email?.trim() || null;
}

/**
 * Options to resolve a conflict: move the event that affects the fewest people into free time,
 * propose a new time for the other one, shorten the first, or keep both. Nothing is applied.
 */
export function resolveConflictOptions(conflict: CalendarConflict, blocks: readonly FreeBlock[], opts: ConflictOptionsInput = {}): ConflictOption[] {
  const locale = opts.locale ?? 'tr';
  const en = locale === 'en';
  const tz = opts.timezone ?? DEFAULT_TIMEZONE;
  const nowMs = opts.now ? ms(opts.now) : Number.NEGATIVE_INFINITY;
  const { eventA, eventB } = conflict;
  // "B" = the event that is cheaper to move: fewer people, then the one the user organises, then the later one.
  const [first, second] = ms(eventA.startAt) <= ms(eventB.startAt) ? [eventA, eventB] : [eventB, eventA];
  const peopleFirst = affectedPeople(first, opts.userEmail);
  const peopleSecond = affectedPeople(second, opts.userEmail);
  let movable = second;
  let fixed = first;
  if (peopleFirst < peopleSecond || (peopleFirst === peopleSecond && first.organizerIsUser && !second.organizerIsUser)) {
    movable = first;
    fixed = second;
  }
  const out: ConflictOption[] = [];
  const sortedBlocks = [...blocks].sort((a, b) => ms(a.startAt) - ms(b.startAt));
  const findSlot = (minutes: number, notBefore: number, avoid: CalendarEvent): { start: number; end: number } | null => {
    for (const b of sortedBlocks) {
      const start = Math.max(ms(b.startAt), notBefore, nowMs);
      const end = start + minutes * MINUTE;
      if (end > ms(b.endAt)) continue;
      if (start < ms(avoid.endAt) && end > ms(avoid.startAt)) continue;
      return { start, end };
    }
    return null;
  };

  const withDative = (iso: string): string => {
    const t = formatClock(iso, tz);
    return timeWithDative(Number(t.slice(0, 2)), Number(t.slice(3, 5)));
  };
  const moveSuggestion = (event: CalendarEvent, slot: { start: number; end: number }, id: string, reason: string): ScheduleSuggestion => ({
    id,
    kind: 'move_event',
    title: en ? `Move “${event.title}” to ${formatClock(new Date(slot.start).toISOString(), tz)}` : `“${event.title}” etkinliğini ${withDative(new Date(slot.start).toISOString())} al`,
    detail: en ? `${clockRange(new Date(slot.start).toISOString(), new Date(slot.end).toISOString(), tz)} is free.` : `${clockRange(new Date(slot.start).toISOString(), new Date(slot.end).toISOString(), tz)} boş görünüyor.`,
    proposedStartAt: new Date(slot.start).toISOString(),
    proposedEndAt: new Date(slot.end).toISOString(),
    targetEventId: event.id,
    targetTaskId: null,
    reason,
  });

  // 1 — move the cheaper event after the fixed one ends (recommended)
  const slotB = findSlot(durationMinutes(movable), ms(fixed.endAt), fixed);
  if (slotB) {
    const reason = en ? 'Moving this affects the fewest people' : 'Bu etkinliği kaydırmak en az kişiyi etkiler';
    const s = moveSuggestion(movable, slotB, `${conflict.id}:move_b`, reason);
    out.push({
      id: `${conflict.id}:move_b`,
      kind: 'move_b',
      title: s.title,
      subtitle: en ? `Recommended · ${s.detail}` : `Önerilen · ${s.detail}`,
      icon: 'auto_awesome',
      isRecommended: true,
      needsFurtherStep: true,
      suggestion: s,
    });
  }

  // 2 — propose a new time for the fixed event (before the movable one starts)
  const slotA = findSlot(durationMinutes(fixed), nowMs, movable);
  if (slotA) {
    const person = counterpartName(fixed, opts.userEmail);
    const reason = en ? 'Alternative when the other event cannot move' : 'Diğer etkinlik taşınamazsa alternatif';
    const s = moveSuggestion(fixed, slotA, `${conflict.id}:move_a`, reason);
    const subtitle = person
      ? en
        ? `A proposal email to ${person} is drafted`
        : `${turkishDative(person)} öneri maili taslağı hazırlanır`
      : en
        ? 'Submitted for your approval before anything moves'
        : 'Taşıma işlemi onayına sunulur';
    out.push({
      id: `${conflict.id}:move_a`,
      kind: 'move_a',
      title: en ? `Propose ${formatClock(s.proposedStartAt, tz)} for “${fixed.title}”` : `“${fixed.title}” için ${withDative(s.proposedStartAt)} öner`,
      subtitle,
      icon: 'event_repeat',
      isRecommended: out.length === 0,
      needsFurtherStep: true,
      suggestion: s,
    });
  }

  // 3 — shorten the first event so it ends when the second starts
  const cut = Math.round((ms(first.endAt) - ms(second.startAt)) / MINUTE);
  const firstLength = durationMinutes(first);
  if (cut > 0 && cut < firstLength && firstLength - cut >= 15) {
    const newEnd = second.startAt;
    out.push({
      id: `${conflict.id}:shorten_a`,
      kind: 'shorten_a',
      title: en ? `Shorten “${first.title}” by ${cut} min` : `“${first.title}” etkinliğini ${cut} dk kısalt`,
      subtitle: en ? `${clockRange(first.startAt, newEnd, tz)} · You make it to the next one on time` : `${clockRange(first.startAt, newEnd, tz)} · Sonrakine zamanında yetişirsin`,
      icon: 'schedule',
      isRecommended: out.length === 0,
      needsFurtherStep: true,
      suggestion: {
        id: `${conflict.id}:shorten_a`,
        kind: 'move_event',
        title: en ? `End “${first.title}” at ${formatClock(newEnd, tz)}` : `“${first.title}” ${formatClock(newEnd, tz)} bitsin`,
        detail: en ? `${cut} min shorter` : `${cut} dk daha kısa`,
        proposedStartAt: first.startAt,
        proposedEndAt: newEnd,
        targetEventId: first.id,
        targetTaskId: null,
        reason: en ? 'Removes the overlap without moving anything' : 'Hiçbir şeyi taşımadan çakışmayı kaldırır',
      },
    });
  }

  out.push({
    id: `${conflict.id}:keep`,
    kind: 'keep',
    title: en ? 'Keep it as is' : 'Böyle kalsın',
    subtitle: en ? 'Do not show this conflict again' : 'Bu çakışmayı bir daha gösterme',
    icon: 'visibility_off',
    isRecommended: false,
    needsFurtherStep: false,
    suggestion: null,
  });
  return out;
}

// ---------------------------------------------------------------------------
// Routes (travel time)
// ---------------------------------------------------------------------------

export type TravelMode = 'DRIVE' | 'TRANSIT' | 'WALK';

export interface RouteRequest {
  origin: string;
  destination: string;
  /** ISO instant; must be in the future for traffic-aware estimates. */
  departureAt?: string | null;
  travelMode?: TravelMode;
}

export interface RouteEstimate {
  durationMinutes: number;
  distanceMeters: number | null;
  provider: string;
}

export interface RoutesProvider {
  readonly name: string;
  /** Resolves to null when no route exists; throws AppError('provider_unavailable') on transport errors. */
  computeRoute(req: RouteRequest): Promise<RouteEstimate | null>;
}

export type RoutesFetch = (input: string, init: RequestInit) => Promise<Response>;

export const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
export const GOOGLE_ROUTES_FIELD_MASK = 'routes.duration,routes.staticDuration,routes.distanceMeters';

interface GoogleRoutesResponse {
  routes?: { duration?: string; staticDuration?: string; distanceMeters?: number }[];
}

function parseSeconds(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(v.trim());
  return m ? Number(m[1]) : null;
}

/** Google Routes API (computeRoutes) adapter. Only addresses go out; the API key never leaves headers. */
export class GoogleRoutesProvider implements RoutesProvider {
  readonly name = 'google_routes';
  private readonly fetchFn: RoutesFetch;
  private readonly apiKey: string;

  constructor(fetchFn: RoutesFetch, apiKey: string) {
    this.fetchFn = fetchFn;
    this.apiKey = apiKey;
  }

  async computeRoute(req: RouteRequest): Promise<RouteEstimate | null> {
    const origin = req.origin.trim();
    const destination = req.destination.trim();
    if (!origin || !destination) return null;
    const mode: TravelMode = req.travelMode ?? 'DRIVE';
    const body: Record<string, unknown> = {
      origin: { address: origin },
      destination: { address: destination },
      travelMode: mode,
      languageCode: 'tr',
      units: 'METRIC',
    };
    if (mode === 'DRIVE') body['routingPreference'] = 'TRAFFIC_AWARE';
    if (req.departureAt && Date.parse(req.departureAt) > Date.now() + MINUTE) body['departureTime'] = new Date(req.departureAt).toISOString();
    let res: Response;
    try {
      res = await this.fetchFn(GOOGLE_ROUTES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': GOOGLE_ROUTES_FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new AppError('provider_unavailable', 'Yol tarifi sağlayıcısına ulaşılamıyor.', { cause });
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new AppError('provider_unavailable', 'Yol tarifi sağlayıcısı hata döndürdü.', { details: { status: res.status } });
    }
    let json: GoogleRoutesResponse;
    try {
      json = (await res.json()) as GoogleRoutesResponse;
    } catch (cause) {
      throw new AppError('provider_unavailable', 'Yol tarifi yanıtı okunamadı.', { cause });
    }
    const route = json.routes?.[0];
    if (!route) return null;
    const seconds = parseSeconds(route.duration) ?? parseSeconds(route.staticDuration);
    if (seconds === null) return null;
    return { durationMinutes: Math.max(1, Math.ceil(seconds / 60)), distanceMeters: typeof route.distanceMeters === 'number' ? route.distanceMeters : null, provider: this.name };
  }
}

export interface RoutesConfig {
  provider: 'google' | 'none';
  apiKey?: string | null;
  fetch?: RoutesFetch;
}

/** Null when routing is disabled ('none') or not configured (missing key). */
export function createRoutesProvider(config: RoutesConfig): RoutesProvider | null {
  if (config.provider === 'none') return null;
  const key = config.apiKey?.trim();
  if (!key) return null;
  const fetchFn: RoutesFetch = config.fetch ?? ((input, init) => globalThis.fetch(input, init));
  return new GoogleRoutesProvider(fetchFn, key);
}

export interface LeaveByOptions {
  /** Where the user leaves from (home / office / previous event). Null → no estimate. */
  origin: string | null | undefined;
  /** Extra minutes added on top of travel time (parking, walking in). Default 10. */
  bufferMinutes?: number;
  travelMode?: TravelMode;
  now?: string;
}

export interface LeaveBy {
  leaveAt: string;
  arriveBy: string;
  durationMin: number;
  provider: string;
}

/**
 * When to leave for an event with a physical location. Null when the event has no place, no
 * origin or provider is known, or the provider cannot answer (never throws).
 */
export async function leaveByTime(event: CalendarEvent, routes: RoutesProvider | null, opts: LeaveByOptions): Promise<LeaveBy | null> {
  if (!routes) return null;
  const origin = opts.origin?.trim();
  if (!origin) return null;
  if (!hasPhysicalLocation(event)) return null;
  const destination = event.location?.trim() ?? '';
  const start = ms(event.startAt);
  if (Number.isNaN(start)) return null;
  let estimate: RouteEstimate | null;
  try {
    estimate = await routes.computeRoute({ origin, destination, departureAt: opts.now ?? null, travelMode: opts.travelMode ?? 'DRIVE' });
  } catch {
    return null;
  }
  if (!estimate) return null;
  const buffer = opts.bufferMinutes ?? 10;
  const arriveBy = start - buffer * MINUTE;
  return {
    leaveAt: new Date(arriveBy - estimate.durationMinutes * MINUTE).toISOString(),
    arriveBy: new Date(arriveBy).toISOString(),
    durationMin: estimate.durationMinutes,
    provider: estimate.provider,
  };
}

// ---------------------------------------------------------------------------
// Optimistic write resolution
// ---------------------------------------------------------------------------

export interface CalendarWriteCheck {
  /** Provider updatedAt the approval was created against (null = unknown). */
  expectedProviderUpdatedAt?: string | null;
  /** Provider updatedAt read right before writing. */
  remoteProviderUpdatedAt?: string | null;
}

/** 'conflict' when the provider copy changed after the approval was prepared. */
export function resolveCalendarWrite(check: CalendarWriteCheck): 'apply' | 'conflict' {
  const expected = check.expectedProviderUpdatedAt ? ms(check.expectedProviderUpdatedAt) : Number.NaN;
  const remote = check.remoteProviderUpdatedAt ? ms(check.remoteProviderUpdatedAt) : Number.NaN;
  if (Number.isNaN(expected) || Number.isNaN(remote)) return 'apply';
  return remote > expected ? 'conflict' : 'apply';
}

// ---------------------------------------------------------------------------
// Plan day
// ---------------------------------------------------------------------------

export interface BuildPlanDayInput extends EventFilterOptions {
  date: ISODate;
  timezone: string;
  events: readonly CalendarEvent[];
  tasks?: readonly TaskItem[];
  commitments?: readonly Commitment[];
  suggestions?: readonly ScheduleSuggestion[];
  conflicts?: readonly CalendarConflict[];
  dayStart?: string;
  dayEnd?: string;
  minGapMin?: number;
  now?: string;
}

function onDate(iso: string | null | undefined, date: ISODate, timezone: string): boolean {
  if (!iso || Number.isNaN(ms(iso))) return false;
  return localDateKey(iso, timezone) === date;
}

/** Assemble a PlanDay for one local date from already-loaded entities (no DB access). */
export function buildPlanDay(input: BuildPlanDayInput): PlanDay {
  const { date, timezone } = input;
  const events = input.events
    .filter((e) => !e.deletedAt && e.status !== 'cancelled')
    .filter((e) => onDate(e.startAt, date, timezone) || (e.allDay && onDate(addMinutes(e.endAt, -1), date, timezone) && ms(e.startAt) <= ms(zonedTimeToUtc(date, '00:00', timezone))))
    .filter((e) => !isDeclined(e, input))
    .sort(byStart);
  const tasks = (input.tasks ?? [])
    .filter((t) => !t.deletedAt && t.status === 'open')
    .filter((t) => onDate(t.scheduledStartAt, date, timezone) || onDate(t.dueAt, date, timezone))
    .sort((a, b) => ms(a.scheduledStartAt ?? a.dueAt ?? '') - ms(b.scheduledStartAt ?? b.dueAt ?? ''));
  const commitments = (input.commitments ?? [])
    .filter((c) => !c.deletedAt && (c.status === 'open' || c.status === 'proposed'))
    .filter((c) => onDate(c.dueAt, date, timezone))
    .sort((a, b) => ms(a.dueAt ?? '') - ms(b.dueAt ?? ''));
  const blocks = freeBlocks(events, { date, timezone, dayStart: input.dayStart, dayEnd: input.dayEnd, now: input.now, userEmail: input.userEmail });
  const suggestions = (input.suggestions ?? []).filter((s) => onDate(s.proposedStartAt, date, timezone));
  const conflicts = (input.conflicts ?? []).filter((c) => c.status !== 'resolved' && (onDate(c.eventA.startAt, date, timezone) || onDate(c.eventB.startAt, date, timezone)));
  const backToBackWarnings = detectBackToBack(events, { minGapMin: input.minGapMin, userEmail: input.userEmail }).map((w) => ({ fromEventId: w.fromEventId, toEventId: w.toEventId }));
  return { date, events, tasks, commitments, freeBlocks: blocks, suggestions, conflicts, backToBackWarnings };
}
