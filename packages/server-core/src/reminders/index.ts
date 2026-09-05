/**
 * reminders — the "Hatırlat" sheet options and the smart suggestion behind "Akıllı öneri".
 *
 * Fixed options are simple and predictable (30 min / 1 h before, this evening 19:00, tomorrow
 * morning 09:10). The smart option looks for a free ≥15-minute slot in working hours before the
 * deadline, avoids busy intervals and quiet hours, and — for meetings — prefers 25 minutes before
 * the start. Every suggestion explains itself ("Takviminde 12:10 boş; toplantından önce.").
 */
import type { Locale, ReminderOption, SmartReminderSuggestResponse } from '@da/domain';
import { addDays as addLocalDays, formatDayLabel, localDateOf, localToUtcIso } from '../dates';
import { isQuietHours, nextQuietHoursEnd, type QuietHoursConfig } from '../notifications';
import { DAY, HOUR, MINUTE, localDateKey, localHHmm } from '../util';

export const REMINDER_DEFAULTS = {
  evening: { hh: 19, mm: 0 },
  lateEvening: { hh: 20, mm: 30 },
  morning: { hh: 9, mm: 10 },
  /** Working window for smart suggestions (local time). */
  workStartMinutes: 9 * 60,
  workEndMinutes: 20 * 60,
  minFreeSlotMinutes: 15,
  /** Never suggest anything sooner than this. */
  minLeadMinutes: 10,
  meetingLeadMinutes: 25,
  stepMinutes: 5,
  /** Without a deadline, search this far ahead. */
  horizonHours: 48,
  /** With a far deadline, start searching this long before it. */
  lookbackHours: 24,
  customFallbackMinutes: 60,
  maxCustomDays: 365,
} as const;

export interface BusyInterval {
  startAt: string;
  endAt: string;
}

export interface ReminderTarget {
  dueAt?: string | null;
  startAt?: string | null;
  isMeeting: boolean;
}

export interface ComputeReminderOptionsInput {
  target: ReminderTarget;
  now: string;
  timezone: string;
  busy: readonly BusyInterval[];
  quietHours?: QuietHoursConfig | null;
  locale?: Locale;
  /** Preferred lead before a meeting (user preference); default 25. */
  meetingLeadMinutes?: number;
}

export type ReminderSuggestion = SmartReminderSuggestResponse['options'][number];

interface Ctx {
  locale: Locale;
  timezone: string;
  now: string;
}

const LABELS = {
  tr: {
    before_30m: '30 dakika önce',
    before_1h: '1 saat önce',
    this_evening: 'Bu akşam {time}',
    tomorrow_morning: 'Yarın sabah {time}',
    smart: 'Akıllı öneri · {when}',
    custom: 'Özel zaman',
    shifted: 'Sessiz saatler nedeniyle {time} olarak ayarlandı.',
  },
  en: {
    before_30m: '30 minutes before',
    before_1h: '1 hour before',
    this_evening: 'This evening at {time}',
    tomorrow_morning: 'Tomorrow morning at {time}',
    smart: 'Smart · {when}',
    custom: 'Custom time',
    shifted: 'Moved to {time} because of quiet hours.',
  },
} as const satisfies Record<Locale, Record<string, string>>;

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

function anchorOf(target: ReminderTarget): number | null {
  const iso = target.startAt ?? target.dueAt ?? null;
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** "12:10" today, "yarın 12:10" / "tomorrow 12:10" otherwise. */
function whenLabel(iso: string, ctx: Ctx): string {
  const clock = localHHmm(iso, ctx.timezone);
  if (localDateKey(iso, ctx.timezone) === localDateKey(ctx.now, ctx.timezone)) return clock;
  return `${formatDayLabel(iso, { now: ctx.now, timezone: ctx.timezone, locale: ctx.locale })} ${clock}`;
}

// --- Smart suggestion -------------------------------------------------------------------------------

export interface SmartReminderInput {
  /** Deadline or meeting start; null when the target has no time. */
  anchorAt: string | null;
  isMeeting: boolean;
  now: string;
  timezone: string;
  busy: readonly BusyInterval[];
  quietHours?: QuietHoursConfig | null;
  locale?: Locale;
  meetingLeadMinutes?: number;
}

interface BusyMs {
  start: number;
  end: number;
}

function normalizeBusy(busy: readonly BusyInterval[]): BusyMs[] {
  const out: BusyMs[] = [];
  for (const b of busy) {
    const start = Date.parse(b.startAt);
    const end = Date.parse(b.endAt);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) out.push({ start, end });
  }
  return out;
}

function ceilToStep(ms: number, stepMs: number): number {
  return Math.ceil(ms / stepMs) * stepMs;
}

function floorToStep(ms: number, stepMs: number): number {
  return Math.floor(ms / stepMs) * stepMs;
}

function localMinutesOfDay(ms: number, timezone: string): number {
  const [hh, mm] = localHHmm(new Date(ms).toISOString(), timezone).split(':').map(Number) as [number, number];
  return hh * 60 + mm;
}

function smartReason(atIso: string, kind: 'meeting' | 'deadline' | 'none', ctx: Ctx): string {
  const clock = localHHmm(atIso, ctx.timezone);
  const sameDay = localDateKey(atIso, ctx.timezone) === localDateKey(ctx.now, ctx.timezone);
  const day = sameDay ? '' : formatDayLabel(atIso, { now: ctx.now, timezone: ctx.timezone, locale: ctx.locale });
  if (ctx.locale === 'en') {
    const where = !day ? `at ${clock}` : day === 'tomorrow' ? `tomorrow at ${clock}` : `on ${day} at ${clock}`;
    const suffix = kind === 'meeting' ? '; before the meeting.' : kind === 'deadline' ? '; before the deadline.' : '.';
    return `Your calendar is free ${where}${suffix}`;
  }
  const where = day ? `${day} ${clock}` : clock;
  const suffix = kind === 'meeting' ? '; toplantından önce.' : kind === 'deadline' ? '; son tarihten önce.' : '.';
  return `Takviminde ${where} boş${suffix}`;
}

/**
 * Find the smart reminder instant:
 *  - at least 10 minutes from now, on a 5-minute grid, inside 09:00–20:00 local, outside quiet hours;
 *  - a free ≥15-minute slot (no busy overlap) that still ends before the deadline;
 *  - for meetings: `meetingLeadMinutes` before the start when free, else the closest earlier slot;
 *  - for deadlines: the earliest slot, starting 24 h before the deadline when it is further away;
 *  - without a deadline: the earliest slot within the next 48 h.
 */
export function computeSmartReminder(input: SmartReminderInput): SmartReminderSuggestResponse['smart'] {
  const ctx: Ctx = { locale: input.locale ?? 'tr', timezone: input.timezone, now: input.now };
  const d = REMINDER_DEFAULTS;
  const stepMs = d.stepMinutes * MINUTE;
  const slotMs = d.minFreeSlotMinutes * MINUTE;
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) return null;
  const busy = normalizeBusy(input.busy);

  const anchorMs = input.anchorAt ? Date.parse(input.anchorAt) : Number.NaN;
  const hasAnchor = Number.isFinite(anchorMs) && anchorMs > nowMs;
  const deadlineMs = hasAnchor ? anchorMs : nowMs + d.horizonHours * HOUR;
  const earliest = ceilToStep(nowMs + d.minLeadMinutes * MINUTE, stepMs);
  const latest = floorToStep(deadlineMs - slotMs, stepMs);
  if (latest < earliest) return null;
  // A far-away deadline is best served the day before; without a real deadline start right away.
  const searchStart = hasAnchor ? Math.max(earliest, ceilToStep(deadlineMs - d.lookbackHours * HOUR, stepMs)) : earliest;

  const usable = (t: number): boolean => {
    if (t < searchStart || t > latest) return false;
    const m = localMinutesOfDay(t, input.timezone);
    if (m < d.workStartMinutes || m + d.minFreeSlotMinutes > d.workEndMinutes) return false;
    if (input.quietHours && isQuietHours(new Date(t).toISOString(), input.quietHours, input.timezone)) return false;
    return !busy.some((b) => b.start < t + slotMs && b.end > t);
  };

  let found: number | null = null;
  if (hasAnchor && input.isMeeting) {
    const lead = Math.max(d.minFreeSlotMinutes, input.meetingLeadMinutes ?? d.meetingLeadMinutes);
    const candidate = floorToStep(anchorMs - lead * MINUTE, stepMs);
    if (usable(candidate)) found = candidate;
    for (let t = Math.min(candidate, latest); found === null && t >= searchStart; t -= stepMs) if (usable(t)) found = t;
    for (let t = Math.max(candidate + stepMs, searchStart); found === null && t <= latest; t += stepMs) if (usable(t)) found = t;
  } else {
    for (let t = searchStart; found === null && t <= latest; t += stepMs) if (usable(t)) found = t;
  }
  if (found === null) return null;

  const at = new Date(found).toISOString();
  const kind = !hasAnchor ? 'none' : input.isMeeting ? 'meeting' : 'deadline';
  return { at, reason: smartReason(at, kind, ctx) };
}

// --- Fixed options ------------------------------------------------------------------------------------

function shiftOutOfQuietHours(iso: string, quiet: QuietHoursConfig | null | undefined, timezone: string): { at: string; shifted: boolean } {
  if (!quiet || !isQuietHours(iso, quiet, timezone)) return { at: iso, shifted: false };
  return { at: nextQuietHoursEnd(iso, quiet, timezone), shifted: true };
}

/**
 * Build the option list of the reminder sheet. Options that would fire in the past, or after the
 * target's own time, are omitted. "This evening" and "tomorrow morning" move to the end of quiet
 * hours when they fall inside them (and are dropped if that pushes them to another day).
 */
export function computeReminderOptions(input: ComputeReminderOptionsInput): SmartReminderSuggestResponse {
  const ctx: Ctx = { locale: input.locale ?? 'tr', timezone: input.timezone, now: input.now };
  const t = LABELS[ctx.locale];
  const d = REMINDER_DEFAULTS;
  const nowMs = Date.parse(input.now);
  const anchorMs = anchorOf(input.target);
  const futureAnchor = anchorMs !== null && anchorMs > nowMs;
  const options: ReminderSuggestion[] = [];

  const push = (option: ReminderOption, atMs: number, label: string, reason: string | null = null): void => {
    options.push({ option, at: new Date(atMs).toISOString(), label, reason });
  };

  // Relative to the target's own time; never shifted (the user picks them deliberately).
  if (futureAnchor && anchorMs !== null) {
    if (anchorMs - 30 * MINUTE > nowMs) push('before_30m', anchorMs - 30 * MINUTE, t.before_30m);
    if (anchorMs - HOUR > nowMs) push('before_1h', anchorMs - HOUR, t.before_1h);
  }

  const today = localDateOf(input.now, input.timezone);
  const fixed = (option: 'this_evening' | 'tomorrow_morning', iso: string): void => {
    const { at, shifted } = shiftOutOfQuietHours(iso, input.quietHours, input.timezone);
    const atMs = Date.parse(at);
    if (atMs <= nowMs) return;
    if (futureAnchor && anchorMs !== null && atMs >= anchorMs) return;
    if (shifted && localDateKey(at, input.timezone) !== localDateKey(iso, input.timezone)) return;
    const time = localHHmm(at, input.timezone);
    push(option, atMs, fill(t[option], { time }), shifted ? fill(t.shifted, { time }) : null);
  };

  let evening = localToUtcIso(today, d.evening.hh, d.evening.mm, input.timezone);
  if (Date.parse(evening) <= nowMs) evening = localToUtcIso(today, d.lateEvening.hh, d.lateEvening.mm, input.timezone);
  if (Date.parse(evening) > nowMs) fixed('this_evening', evening);
  fixed('tomorrow_morning', localToUtcIso(addLocalDays(today, 1), d.morning.hh, d.morning.mm, input.timezone));

  const smart = computeSmartReminder({
    anchorAt: anchorMs !== null ? new Date(anchorMs).toISOString() : null,
    isMeeting: input.target.isMeeting,
    now: input.now,
    timezone: input.timezone,
    busy: input.busy,
    quietHours: input.quietHours ?? null,
    locale: ctx.locale,
    meetingLeadMinutes: input.meetingLeadMinutes,
  });
  if (smart) push('smart', Date.parse(smart.at), fill(t.smart, { when: whenLabel(smart.at, ctx) }), smart.reason);

  const customMs = futureAnchor && anchorMs !== null ? anchorMs : nowMs + d.customFallbackMinutes * MINUTE;
  push('custom', customMs, t.custom);

  return { options, smart };
}

// --- Custom time validation ----------------------------------------------------------------------------

export type CustomReminderResult =
  | { ok: true; at: string }
  | { ok: false; reason: 'invalid' | 'past' | 'too_far'; message: string };

const CUSTOM_MESSAGES: Record<Locale, Record<'invalid' | 'past' | 'too_far', string>> = {
  tr: {
    invalid: 'Geçerli bir tarih ve saat seç.',
    past: 'Hatırlatma zamanı gelecekte olmalı.',
    too_far: 'Hatırlatma en fazla bir yıl sonrası için kurulabilir.',
  },
  en: {
    invalid: 'Pick a valid date and time.',
    past: 'The reminder time must be in the future.',
    too_far: 'Reminders can be set at most one year ahead.',
  },
};

/** A custom reminder must be a valid instant, strictly in the future and within a year. */
export function validateCustomReminder(at: string, now: string, opts: { locale?: Locale; maxDays?: number } = {}): CustomReminderResult {
  const locale = opts.locale ?? 'tr';
  const atMs = Date.parse(at);
  const nowMs = Date.parse(now);
  const fail = (reason: 'invalid' | 'past' | 'too_far'): CustomReminderResult => ({ ok: false, reason, message: CUSTOM_MESSAGES[locale][reason] });
  if (!Number.isFinite(atMs) || !Number.isFinite(nowMs)) return fail('invalid');
  if (atMs <= nowMs) return fail('past');
  if (atMs - nowMs > (opts.maxDays ?? REMINDER_DEFAULTS.maxCustomDays) * DAY) return fail('too_far');
  return { ok: true, at: new Date(atMs).toISOString() };
}
