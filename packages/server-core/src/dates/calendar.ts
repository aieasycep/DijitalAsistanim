/** Timezone-aware calendar arithmetic on local dates (no Node APIs; Intl + Date.UTC only). */
import { DAY, zonedTimeToUtc } from '../util';
import { pad2 } from './turkish';

export interface LocalDate {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

export interface LocalDateTime {
  date: LocalDate;
  hh: number;
  mm: number;
}

export function localDateTimeOf(iso: string | Date, timezone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === t)?.value ?? '0');
  return {
    date: { y: get('year'), m: get('month'), d: get('day') },
    hh: get('hour') % 24,
    mm: get('minute'),
  };
}

export function localDateOf(iso: string | Date, timezone: string): LocalDate {
  return localDateTimeOf(iso, timezone).date;
}

export function dateKey(d: LocalDate): string {
  return `${d.y}-${pad2(d.m)}-${pad2(d.d)}`;
}

export function parseDateKey(key: string): LocalDate {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return { y, m, d };
}

function utcMs(d: LocalDate): number {
  return Date.UTC(d.y, d.m - 1, d.d);
}

function fromUtcMs(ms: number): LocalDate {
  const x = new Date(ms);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}

export function addDays(d: LocalDate, n: number): LocalDate {
  return fromUtcMs(utcMs(d) + n * DAY);
}

export function addMonths(d: LocalDate, n: number): LocalDate {
  const total = d.y * 12 + (d.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(d.d, daysInMonth(y, m)) };
}

/** 1 = Monday … 7 = Sunday */
export function isoWeekday(d: LocalDate): number {
  const w = new Date(utcMs(d)).getUTCDay();
  return w === 0 ? 7 : w;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidDate(y: number, m: number, d: number): boolean {
  return Number.isInteger(y) && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** b - a in whole days. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((utcMs(b) - utcMs(a)) / DAY);
}

export function sameDate(a: LocalDate, b: LocalDate): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

export function addBusinessDays(d: LocalDate, n: number): LocalDate {
  let cur = d;
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    if (isoWeekday(cur) <= 5) left -= 1;
  }
  return cur;
}

export function localToUtcIso(d: LocalDate, hh: number, mm: number, timezone: string): string {
  return zonedTimeToUtc(dateKey(d), `${pad2(hh)}:${pad2(mm)}`, timezone);
}

/** Next date (including today) whose ISO weekday equals `target`. */
export function nextWeekday(
  from: LocalDate,
  target: number,
  opts: { skipToday?: boolean; nextWeek?: boolean } = {},
): LocalDate {
  const w = isoWeekday(from);
  if (opts.nextWeek) {
    const mondayNext = addDays(from, 8 - w);
    return addDays(mondayNext, target - 1);
  }
  let offset = (target - w + 7) % 7;
  if (offset === 0 && opts.skipToday) offset = 7;
  return addDays(from, offset);
}
