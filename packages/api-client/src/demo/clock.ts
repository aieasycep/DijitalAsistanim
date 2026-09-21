/**
 * Deterministic clock for the demo adapter. All "local" computations run in the configured IANA timezone
 * (default Europe/Istanbul) using Intl only — no date library. Wall-clock → UTC conversion uses the classic
 * two-pass offset probe so DST transitions resolve correctly.
 */
import type { ISODate, ISODateTime } from '@da/domain';

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function localParts(date: Date, timeZone: string): LocalParts {
  const values: Record<string, string> = {};
  for (const part of partsFormatter(timeZone).formatToParts(date)) values[part.type] = part.value;
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: WEEKDAY_INDEX[values.weekday ?? 'Sun'] ?? 0,
  };
}

function offsetMs(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant.getTime();
}

/** Wall-clock time in `timeZone` → UTC instant. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const first = offsetMs(new Date(wall), timeZone);
  let utc = wall - first;
  const second = offsetMs(new Date(utc), timeZone);
  if (second !== first) utc = wall - second;
  return new Date(utc);
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toDateKey(p: Pick<LocalParts, 'year' | 'month' | 'day'>): ISODate {
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function parseDateKey(key: ISODate): { year: number; month: number; day: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y ?? 1970, month: m ?? 1, day: d ?? 1 };
}

export function parseHHMM(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

export function addDaysToKey(key: ISODate, days: number): ISODate {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return toDateKey({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

export function daysBetweenKeys(from: ISODate, to: ISODate): number {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}

export interface DemoClock {
  readonly timeZone: string;
  now(): Date;
  nowIso(): ISODateTime;
  /** Local wall-clock parts of an instant (defaults to now). */
  local(date?: Date | ISODateTime): LocalParts;
  /** Local YYYY-MM-DD of an instant (defaults to now). */
  dateKey(date?: Date | ISODateTime): ISODate;
  today(): ISODate;
  addDays(key: ISODate, days: number): ISODate;
  /** Instant for a local date + HH:mm. */
  at(key: ISODate, hhmm: string): Date;
  atIso(key: ISODate, hhmm: string): ISODateTime;
  /** Seed-style helper: local time relative to today (`lt(0, '14:30')`). */
  lt(dayOffset: number, hhmm: string): ISODateTime;
  /** Local HH:mm of an instant. */
  hhmm(date: Date | ISODateTime): string;
  /** Monday of the ISO week containing `key`. */
  weekStart(key: ISODate): ISODate;
  addMinutes(date: Date | ISODateTime, minutes: number): ISODateTime;
}

export function createClock(input: { now?: () => Date; timezone?: string }): DemoClock {
  const timeZone = input.timezone ?? 'Europe/Istanbul';
  const now = (): Date => new Date((input.now ?? (() => new Date()))().getTime());
  const asDate = (d?: Date | ISODateTime): Date =>
    d === undefined ? now() : d instanceof Date ? d : new Date(d);
  const local = (d?: Date | ISODateTime): LocalParts => localParts(asDate(d), timeZone);
  const dateKey = (d?: Date | ISODateTime): ISODate => toDateKey(local(d));
  const at = (key: ISODate, hhmm: string): Date => {
    const { year, month, day } = parseDateKey(key);
    const { hour, minute } = parseHHMM(hhmm);
    return zonedTimeToUtc(year, month, day, hour, minute, timeZone);
  };
  return {
    timeZone,
    now,
    nowIso: () => now().toISOString(),
    local,
    dateKey,
    today: () => dateKey(),
    addDays: addDaysToKey,
    at,
    atIso: (key, hhmm) => at(key, hhmm).toISOString(),
    lt: (dayOffset, hhmm) => at(addDaysToKey(dateKey(), dayOffset), hhmm).toISOString(),
    hhmm: (d) => {
      const p = local(d);
      return `${pad2(p.hour)}:${pad2(p.minute)}`;
    },
    weekStart: (key) => {
      const { year, month, day } = parseDateKey(key);
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
      const back = weekday === 0 ? 6 : weekday - 1;
      return addDaysToKey(key, -back);
    },
    addMinutes: (d, minutes) => new Date(asDate(d).getTime() + minutes * 60_000).toISOString(),
  };
}
