import type { BriefingSchedule, Locale } from '@da/domain';

const LOCALE_TAG: Record<Locale, string> = { tr: 'tr-TR', en: 'en-GB' };

/** ISO weekday: 1 = Monday … 7 = Sunday (the `quietDays` encoding). */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

/** `BriefingSchedule.weeklyDay` encoding: 0 = Sunday … 6 = Saturday. */
export type WeeklyDay = BriefingSchedule['weeklyDay'];

/** Monday 1 January 2024 is a stable UTC anchor for localized weekday names. */
function anchor(iso: IsoWeekday): Date {
  return new Date(Date.UTC(2024, 0, iso));
}

export function weekdayLabel(
  iso: IsoWeekday,
  locale: Locale,
  style: 'short' | 'long' = 'short',
): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { weekday: style, timeZone: 'UTC' }).format(
    anchor(iso),
  );
}

export function weeklyDayToIso(day: WeeklyDay): IsoWeekday {
  return day === 0 ? 7 : day;
}

export function isoToWeeklyDay(iso: IsoWeekday): WeeklyDay {
  return iso === 7 ? 0 : iso;
}

export function isIsoWeekday(value: number): value is IsoWeekday {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

/** Adds or removes a quiet day, keeping the list sorted and free of duplicates. */
export function toggleQuietDay(days: readonly number[], iso: IsoWeekday): number[] {
  const set = new Set(days.filter(isIsoWeekday));
  if (set.has(iso)) set.delete(iso);
  else set.add(iso);
  return [...set].sort((a, b) => a - b);
}
