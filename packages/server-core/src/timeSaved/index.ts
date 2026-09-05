/**
 * timeSaved — the "bu hafta 2 saat 48 dakika kazandın" estimate shown in weekly briefings.
 *
 * The estimate is deliberately conservative and fully documented so it never reads as a claim:
 * every input is something the product demonstrably did (a mail it kept out of the way, a prep
 * note it wrote, a draft the user actually used). It is capped at 20 hours per week.
 */
import type { Locale, WeeklyMetrics } from '@da/domain';
import { WEEKDAYS_EN_TITLE, WEEKDAYS_TR_TITLE, isoWeekday, parseDateKey } from '../dates';

/**
 * Minutes saved per unit. Rationale:
 *  - unreadLowPriorityMails 0.25 — a glance at a low-priority mail the user did not need to open.
 *  - importantSummariesRead 1.5 — reading a 3-line summary instead of a full thread.
 *  - prepNotesGenerated 12 — a meeting prep note replaces ~10–15 min of digging through mail.
 *  - followUpDraftsUsed 6 — a follow-up nudge draft the user sent (context + writing).
 *  - repliesDrafted 4 — a reply draft the user sent after light editing.
 *  - deadlinesCaught 5 — a deadline surfaced that would otherwise need a manual check.
 */
export const TIME_SAVED_WEIGHTS = {
  unreadLowPriorityMails: 0.25,
  importantSummariesRead: 1.5,
  prepNotesGenerated: 12,
  followUpDraftsUsed: 6,
  repliesDrafted: 4,
  deadlinesCaught: 5,
} as const;

export type TimeSavedKey = keyof typeof TIME_SAVED_WEIGHTS;
export type TimeSavedInputs = Record<TimeSavedKey, number>;

/** Upper bound per week (20 hours): the estimate is illustrative, not a timesheet. */
export const TIME_SAVED_WEEKLY_CAP_MINUTES = 20 * 60;

export interface TimeSavedOptions {
  /** Defaults to the weekly cap. */
  capMinutes?: number;
}

function count(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function minutesFor(inputs: Partial<TimeSavedInputs>, key: TimeSavedKey): number {
  return count(inputs[key]) * TIME_SAVED_WEIGHTS[key];
}

export type TimeSavedBreakdown = WeeklyMetrics['timeSavedBreakdown'] & { total: number };

/**
 * Breakdown in the three buckets the weekly card shows:
 *  - unreadMails: low-priority mails skipped + summaries read + deadlines caught (mail intelligence)
 *  - prepNotes: meeting prep notes
 *  - followUpDrafts: follow-up nudges and reply drafts used
 * When the cap applies, buckets are scaled proportionally so they still add up to the total.
 */
export function computeTimeSavedBreakdown(inputs: Partial<TimeSavedInputs>, opts: TimeSavedOptions = {}): TimeSavedBreakdown {
  const cap = opts.capMinutes ?? TIME_SAVED_WEEKLY_CAP_MINUTES;
  const raw = {
    unreadMails: minutesFor(inputs, 'unreadLowPriorityMails') + minutesFor(inputs, 'importantSummariesRead') + minutesFor(inputs, 'deadlinesCaught'),
    prepNotes: minutesFor(inputs, 'prepNotesGenerated'),
    followUpDrafts: minutesFor(inputs, 'followUpDraftsUsed') + minutesFor(inputs, 'repliesDrafted'),
  };
  const rawTotal = raw.unreadMails + raw.prepNotes + raw.followUpDrafts;
  const scale = rawTotal > cap && rawTotal > 0 ? cap / rawTotal : 1;
  const out = {
    unreadMails: Math.round(raw.unreadMails * scale),
    prepNotes: Math.round(raw.prepNotes * scale),
    followUpDrafts: Math.round(raw.followUpDrafts * scale),
  };
  let total = out.unreadMails + out.prepNotes + out.followUpDrafts;
  if (total > cap) {
    // Rounding pushed the sum over the cap: trim the largest bucket.
    const largest = (['unreadMails', 'prepNotes', 'followUpDrafts'] as const).reduce((a, b) => (out[b] > out[a] ? b : a));
    out[largest] -= total - cap;
    total = cap;
  }
  return { ...out, total };
}

/** Whole minutes saved, capped. */
export function computeTimeSavedMinutes(inputs: Partial<TimeSavedInputs>, opts: TimeSavedOptions = {}): number {
  return computeTimeSavedBreakdown(inputs, opts).total;
}

/** "2 saat 48 dakika" / "2 hours 48 minutes"; "45 dakika"; "3 saat". */
export function formatTimeSaved(minutes: number, locale: Locale = 'tr'): string {
  const total = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (locale === 'en') {
    const hours = h > 0 ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '';
    const mins = m > 0 || h === 0 ? `${m} ${m === 1 ? 'minute' : 'minutes'}` : '';
    return [hours, mins].filter(Boolean).join(' ');
  }
  const hours = h > 0 ? `${h} saat` : '';
  const mins = m > 0 || h === 0 ? `${m} dakika` : '';
  return [hours, mins].filter(Boolean).join(' ');
}

// --- Weekly metrics --------------------------------------------------------------------------------

export interface WeeklyMetricsInput {
  weekStart: string;
  weekEnd: string;
  analyzedEmails: number;
  importantItems: number;
  followUps: number;
  followUpsAnswered: number;
  meetings: number;
  meetingsWithPrep: number;
  deadlines: number;
  deadlinesMissed: number;
  timeSaved: Partial<TimeSavedInputs>;
  /** Meetings per local date key (YYYY-MM-DD) — used for "busiest day". */
  meetingsByDay?: Record<string, number>;
  topPeople?: readonly { name: string; count: number }[];
  /** Editorial closing line, or counts to build a calm default from. */
  nextWeek?: string | { meetings: number; deadlines: number } | null;
  locale?: Locale;
}

export const WEEKLY_TOP_PEOPLE_LIMIT = 5;

function nonNegativeInt(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function weekdayName(dateKey: string, locale: Locale): string {
  const wd = isoWeekday(parseDateKey(dateKey)) - 1;
  return (locale === 'en' ? WEEKDAYS_EN_TITLE[wd] : WEEKDAYS_TR_TITLE[wd]) ?? dateKey;
}

function busiestDay(byDay: Record<string, number> | undefined, locale: Locale): WeeklyMetrics['busiestDay'] {
  if (!byDay) return null;
  let best: { date: string; meetings: number } | null = null;
  for (const date of Object.keys(byDay).sort()) {
    const meetings = nonNegativeInt(byDay[date] ?? 0);
    if (meetings > 0 && (best === null || meetings > best.meetings)) best = { date, meetings };
  }
  if (!best) return null;
  const day = weekdayName(best.date, locale);
  const note =
    locale === 'en'
      ? `Your busiest day was ${day}: ${best.meetings} ${best.meetings === 1 ? 'meeting' : 'meetings'}.`
      : `En yoğun günün ${day} oldu: ${best.meetings} toplantı.`;
  return { ...best, note };
}

function nextWeekLine(input: WeeklyMetricsInput['nextWeek'], locale: Locale): string {
  if (typeof input === 'string' && input.trim()) return input.trim();
  if (input && typeof input === 'object') {
    const m = nonNegativeInt(input.meetings);
    const d = nonNegativeInt(input.deadlines);
    if (locale === 'en') {
      const parts = [m > 0 ? `${m} ${m === 1 ? 'meeting' : 'meetings'}` : '', d > 0 ? `${d} ${d === 1 ? 'deadline' : 'deadlines'}` : ''].filter(Boolean);
      return parts.length ? `Next week you have ${parts.join(' and ')}.` : 'Next week looks calm so far.';
    }
    const parts = [m > 0 ? `${m} toplantın` : '', d > 0 ? `${d} son tarihin` : ''].filter(Boolean);
    return parts.length ? `Gelecek hafta ${parts.join(' ve ')} var.` : 'Gelecek hafta şimdilik sakin görünüyor.';
  }
  return locale === 'en' ? 'Next week’s plan will take shape as it gets closer.' : 'Gelecek haftanın planı yaklaştıkça netleşecek.';
}

/** Assemble the WeeklyMetrics block of the weekly briefing from raw counters. */
export function buildWeeklyMetrics(raw: WeeklyMetricsInput): WeeklyMetrics {
  const locale = raw.locale ?? 'tr';
  const breakdown = computeTimeSavedBreakdown(raw.timeSaved);
  const followUps = nonNegativeInt(raw.followUps);
  const meetings = nonNegativeInt(raw.meetings);
  const deadlines = nonNegativeInt(raw.deadlines);
  const topPeople = (raw.topPeople ?? [])
    .map((p) => ({ name: p.name.trim(), count: nonNegativeInt(p.count) }))
    .filter((p) => p.name && p.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, locale === 'en' ? 'en' : 'tr'))
    .slice(0, WEEKLY_TOP_PEOPLE_LIMIT);

  return {
    weekStart: raw.weekStart,
    weekEnd: raw.weekEnd,
    analyzedEmails: nonNegativeInt(raw.analyzedEmails),
    importantItems: nonNegativeInt(raw.importantItems),
    followUps,
    followUpsAnswered: Math.min(followUps, nonNegativeInt(raw.followUpsAnswered)),
    meetings,
    meetingsWithPrep: Math.min(meetings, nonNegativeInt(raw.meetingsWithPrep)),
    deadlines,
    deadlinesMissed: Math.min(deadlines, nonNegativeInt(raw.deadlinesMissed)),
    estimatedTimeSavedMinutes: breakdown.total,
    timeSavedBreakdown: { unreadMails: breakdown.unreadMails, prepNotes: breakdown.prepNotes, followUpDrafts: breakdown.followUpDrafts },
    busiestDay: busiestDay(raw.meetingsByDay, locale),
    topPeople,
    nextWeek: nextWeekLine(raw.nextWeek, locale),
  };
}
