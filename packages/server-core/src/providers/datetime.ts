/** Date/time helpers for provider payloads (all-day anchoring, zone-local wall clocks). */
import { MINUTE, localDateKey, tzOffsetMinutes, zonedTimeToUtc } from '../util';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

/** Windows time-zone names Graph may return, mapped to IANA zones. */
const WINDOWS_ZONES: Record<string, string> = {
  utc: 'UTC',
  'turkey standard time': 'Europe/Istanbul',
  'gtb standard time': 'Europe/Athens',
  'e. europe standard time': 'Europe/Chisinau',
  'fle standard time': 'Europe/Kiev',
  'w. europe standard time': 'Europe/Berlin',
  'central europe standard time': 'Europe/Budapest',
  'central european standard time': 'Europe/Warsaw',
  'romance standard time': 'Europe/Paris',
  'gmt standard time': 'Europe/London',
  'greenwich standard time': 'Atlantic/Reykjavik',
  'russian standard time': 'Europe/Moscow',
  'arabian standard time': 'Asia/Dubai',
  'arab standard time': 'Asia/Riyadh',
  'israel standard time': 'Asia/Jerusalem',
  'india standard time': 'Asia/Kolkata',
  'china standard time': 'Asia/Shanghai',
  'tokyo standard time': 'Asia/Tokyo',
  'singapore standard time': 'Asia/Singapore',
  'aus eastern standard time': 'Australia/Sydney',
  'eastern standard time': 'America/New_York',
  'central standard time': 'America/Chicago',
  'mountain standard time': 'America/Denver',
  'pacific standard time': 'America/Los_Angeles',
  'e. south america standard time': 'America/Sao_Paulo',
};

function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Resolve a provider zone label (IANA, `UTC`, or Windows name) to an IANA zone; UTC when unknown. */
export function resolveZone(label: string | null | undefined, fallback = 'UTC'): string {
  if (!label) return fallback;
  const trimmed = label.trim();
  if (
    trimmed === '' ||
    /^(utc|z|gmt)$/i.test(trimmed) ||
    /^tzone:\/\/Microsoft\/Utc$/i.test(trimmed)
  )
    return 'UTC';
  const mapped = WINDOWS_ZONES[trimmed.toLowerCase()];
  if (mapped) return mapped;
  return isValidZone(trimmed) ? trimmed : fallback;
}

/** Midnight of a calendar date (YYYY-MM-DD) in `zone`, as an ISO instant. */
export function dateToInstant(date: string, zone: string): string {
  const match = ISO_DATE.exec(date.trim());
  if (!match) throw new Error('Geçersiz tarih');
  return zonedTimeToUtc(match[0], '00:00', resolveZone(zone, 'UTC'));
}

/** Add whole days to a YYYY-MM-DD date (UTC arithmetic — no zone involved). */
export function addCalendarDays(date: string, days: number): string {
  const match = ISO_DATE.exec(date.trim());
  if (!match) throw new Error('Geçersiz tarih');
  const [, y, m, d] = match;
  const ms = Date.UTC(Number(y), Number(m) - 1, Number(d) + days);
  return new Date(ms).toISOString().slice(0, 10);
}

/** Interpret a wall-clock `YYYY-MM-DDTHH:mm[:ss]` in `zone` as an ISO instant. */
export function zonedDateTimeToUtc(local: string, zone: string): string | null {
  const match = LOCAL_DATE_TIME.exec(local.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const guess = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? '0'),
  );
  const tz = resolveZone(zone, 'UTC');
  if (tz === 'UTC') return new Date(guess).toISOString();
  const offset1 = tzOffsetMinutes(new Date(guess), tz);
  let instant = guess - offset1 * MINUTE;
  const offset2 = tzOffsetMinutes(new Date(instant), tz);
  if (offset2 !== offset1) instant = guess - offset2 * MINUTE;
  return new Date(instant).toISOString();
}

/** Wall-clock `YYYY-MM-DDTHH:mm:ss` of an instant in `zone`. */
export function localDateTimeInZone(iso: string, zone: string): string {
  const tz = resolveZone(zone, 'UTC');
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Calendar date of an instant in `zone`. */
export function localDateInZone(iso: string, zone: string): string {
  return localDateKey(iso, resolveZone(zone, 'UTC'));
}
