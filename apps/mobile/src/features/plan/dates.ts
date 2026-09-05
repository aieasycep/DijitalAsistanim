/**
 * Date-key helpers (YYYY-MM-DD in the user's timezone). Keys are manipulated as UTC calendar dates so
 * arithmetic never drifts across DST; formatting always goes through @da/i18n with the real timezone.
 */
import { toLocalDateKey, type FormatCtx } from '@da/i18n';

const DAY_MS = 24 * 60 * 60_000;

export function keyToDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

export function addDaysKey(key: string, days: number): string {
  return new Date(keyToDate(key).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Monday of the week containing `key`. */
export function weekStartOf(key: string): string {
  const dow = keyToDate(key).getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  return addDaysKey(key, -back);
}

export function weekKeys(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
}

export function todayKey(ctx: FormatCtx): string {
  return toLocalDateKey(ctx.now ?? new Date(), ctx);
}

export function dayNumber(key: string): string {
  return String(keyToDate(key).getUTCDate());
}

/** "Pzt" / "Mon" — the key is a calendar date, so format it in UTC to avoid shifting the day. */
export function weekdayShort(key: string, locale: FormatCtx['locale']): string {
  return new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
  })
    .format(keyToDate(key))
    .replace('.', '');
}

/** "5 Eylül Cumartesi" style header for a date key. */
export function dayHeader(key: string, locale: FormatCtx['locale']): string {
  const d = keyToDate(key);
  const tag = locale === 'tr' ? 'tr-TR' : 'en-GB';
  const day = new Intl.DateTimeFormat(tag, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(d);
  const weekday = new Intl.DateTimeFormat(tag, { weekday: 'long', timeZone: 'UTC' }).format(d);
  return locale === 'tr' ? `${day} ${weekday}` : `${weekday} ${day}`;
}

/** "1–7 Eylül" range label for the week starting at `start`. */
export function weekRangeLabel(start: string, locale: FormatCtx['locale']): string {
  const end = addDaysKey(start, 6);
  const tag = locale === 'tr' ? 'tr-TR' : 'en-GB';
  const s = keyToDate(start);
  const e = keyToDate(end);
  const sameMonth = s.getUTCMonth() === e.getUTCMonth();
  const long = (d: Date) =>
    new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
  if (sameMonth) return `${s.getUTCDate()}–${long(e)}`;
  return `${long(s)} – ${long(e)}`;
}

export function minutesBetween(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000));
}

/** ISO for `days` from now at HH:mm in the user's timezone (used for snooze / postpone). */
export function isoAtLocal(ctx: FormatCtx, daysFromNow: number, hour: number, minute = 0): string {
  const now = ctx.now ?? new Date();
  const key = addDaysKey(toLocalDateKey(now, ctx), daysFromNow);
  // Find the UTC instant whose local wall time is HH:mm on `key`.
  const guess = new Date(
    `${key}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  );
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ctx.timezone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(guess);
  const localHour = Number(parts.find((p) => p.type === 'hour')?.value ?? hour);
  const localMinute = Number(parts.find((p) => p.type === 'minute')?.value ?? minute);
  const localKey = toLocalDateKey(guess, ctx);
  const dayShift = (keyToDate(localKey).getTime() - keyToDate(key).getTime()) / DAY_MS;
  const offsetMinutes = dayShift * 24 * 60 + (localHour * 60 + localMinute) - (hour * 60 + minute);
  return new Date(guess.getTime() - offsetMinutes * 60_000).toISOString();
}
