/**
 * IANA time-zone helpers for the profile / briefing screens. Uses `Intl.supportedValuesOf` when the
 * engine provides it (Hermes ≥ 0.12) and falls back to a curated list otherwise — never a hard-coded
 * offset table, so DST is always resolved by the platform.
 */

export const COMMON_TIMEZONES: readonly string[] = [
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Brussels',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Zurich',
  'Europe/Rome',
  'Europe/Vienna',
  'Europe/Prague',
  'Europe/Warsaw',
  'Europe/Stockholm',
  'Europe/Oslo',
  'Europe/Copenhagen',
  'Europe/Helsinki',
  'Europe/Athens',
  'Europe/Sofia',
  'Europe/Bucharest',
  'Europe/Kyiv',
  'Europe/Moscow',
  'Asia/Baku',
  'Asia/Tbilisi',
  'Asia/Yerevan',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Tehran',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Tashkent',
  'Asia/Almaty',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Perth',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Africa/Cairo',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Casablanca',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Mexico_City',
  'America/New_York',
  'America/Toronto',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Vancouver',
  'UTC',
];

interface IntlWithValues {
  supportedValuesOf?: (key: 'timeZone') => string[];
}

/** All zones the engine knows, else the curated list. Always includes the given extras. */
export function availableTimezones(extras: readonly string[] = []): string[] {
  let list: string[] = [...COMMON_TIMEZONES];
  try {
    const values = (Intl as unknown as IntlWithValues).supportedValuesOf?.('timeZone');
    if (values && values.length > 0) list = values;
  } catch {
    // Older engines: keep the curated list.
  }
  return withExtras(list, extras);
}

/** The curated list (shown before the user types a search), plus the given extras. */
export function curatedTimezones(extras: readonly string[] = []): string[] {
  return withExtras(COMMON_TIMEZONES, extras);
}

function withExtras(list: readonly string[], extras: readonly string[]): string[] {
  const set = new Set(list);
  for (const tz of extras) if (tz && isValidTimezone(tz)) set.add(tz);
  return [...set];
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset from UTC in minutes at `at` (DST-aware, computed via Intl). `null` for unknown zones. */
export function timezoneOffsetMinutes(tz: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).formatToParts(at);
    const read = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((p) => p.type === type)?.value ?? NaN);
    const wall = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      read('hour') % 24,
      read('minute'),
    );
    if (Number.isNaN(wall)) return null;
    const utcMinutes = Math.floor(at.getTime() / 60_000) * 60_000;
    return Math.round((wall - utcMinutes) / 60_000);
  } catch {
    return null;
  }
}

/** "GMT+3" · "GMT-4:30" · "GMT" */
export function formatOffset(minutes: number | null): string {
  if (minutes === null) return 'GMT';
  if (minutes === 0) return 'GMT';
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** "America/Argentina/Buenos_Aires" → "Buenos Aires" */
export function timezoneCity(tz: string): string {
  const last = tz.split('/').pop() ?? tz;
  return last.replace(/_/g, ' ');
}

/** "America/Argentina/Buenos_Aires" → "America" */
export function timezoneRegion(tz: string): string {
  const [region] = tz.split('/');
  return region && region !== tz ? region : '';
}

export interface TimezoneOption {
  id: string;
  city: string;
  region: string;
  offsetMinutes: number | null;
  offsetLabel: string;
  isCurrent: boolean;
  isDevice: boolean;
}

function normalize(s: string): string {
  return s.toLocaleLowerCase('en-US').replace(/[_/]/g, ' ');
}

export function matchesTimezone(tz: string, query: string): boolean {
  const q = normalize(query).trim();
  if (!q) return true;
  return normalize(tz).includes(q) || normalize(timezoneCity(tz)).includes(q);
}

export interface TimezoneOptionsInput {
  current: string;
  device: string;
  query?: string;
  at: Date;
}

/**
 * Current zone first, device zone second, then the rest sorted by offset and city. Without a query
 * only the curated list is offered; a search runs over every zone the engine knows.
 */
export function timezoneOptions({ current, device, query = '', at }: TimezoneOptionsInput) {
  const pool = query.trim()
    ? availableTimezones([current, device])
    : curatedTimezones([current, device]);
  const list = pool.filter((tz) => matchesTimezone(tz, query));
  const options: TimezoneOption[] = list.map((id) => {
    const offsetMinutes = timezoneOffsetMinutes(id, at);
    return {
      id,
      city: timezoneCity(id),
      region: timezoneRegion(id),
      offsetMinutes,
      offsetLabel: formatOffset(offsetMinutes),
      isCurrent: id === current,
      isDevice: id === device,
    };
  });
  return options.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    if (a.isDevice !== b.isDevice) return a.isDevice ? -1 : 1;
    const ao = a.offsetMinutes ?? 0;
    const bo = b.offsetMinutes ?? 0;
    if (ao !== bo) return ao - bo;
    return a.city.localeCompare(b.city, 'en');
  });
}

/** "Istanbul · GMT+3" — compact label for settings rows. */
export function timezoneLabel(tz: string, at: Date): string {
  return `${timezoneCity(tz)} · ${formatOffset(timezoneOffsetMinutes(tz, at))}`;
}
