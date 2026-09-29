/** Small shared helpers (runtime-agnostic). */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

export function addMinutes(iso: string | Date, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * MINUTE).toISOString();
}

export function addDays(iso: string | Date, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY).toISOString();
}

export function diffMinutes(a: string | Date, b: string | Date): number {
  return (new Date(a).getTime() - new Date(b).getTime()) / MINUTE;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function uniqBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = key(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Collapse whitespace, strip HTML tags & quoted reply history — used before hashing/AI. */
export function normalizeText(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Remove quoted reply history ("On ... wrote:", "> ", Outlook separators). */
export function stripQuotedHistory(text: string): string {
  const markers = [
    /\n\s*On .+wrote:\s*$/ms,
    /\n\s*.+ tarihinde .+ şunu yazdı:\s*$/ms,
    /\n\s*-{3,}\s*Original Message\s*-{3,}[\s\S]*$/i,
    /\n\s*From: .+\nSent: .+\nTo: .+[\s\S]*$/i,
    /\n\s*Kimden: .+\nGönderme Tarihi: .+[\s\S]*$/i,
    /\n\s*_{5,}[\s\S]*$/,
  ];
  let out = text;
  for (const m of markers) out = out.replace(m, '');
  return out
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('>'))
    .join('\n')
    .trim();
}

/** Roughly 4 chars per token for mixed Turkish/English text. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Deterministic pseudo-random for demo fixtures (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${String(x)}`);
}

export function isNonEmpty<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined && (typeof v !== 'string' || v.length > 0);
}

export function safeJsonParse<T = unknown>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/** Extract e-mail domain, lowercased. */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

/** Local date key (YYYY-MM-DD) in an IANA timezone. */
export function localDateKey(iso: string | Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** Local hour (0-23) in an IANA timezone. */
export function localHour(iso: string | Date, timezone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date(iso)),
  );
}

/** Local weekday 1 (Mon) … 7 (Sun) in an IANA timezone. */
export function localIsoWeekday(iso: string | Date, timezone: string): number {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(
    new Date(iso),
  );
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[w] ?? 1;
}

/** Offset of a timezone at a given instant, in minutes east of UTC. */
export function tzOffsetMinutes(iso: string | Date, timezone: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - d.getTime()) / MINUTE);
}

/** Build an ISO instant from a local date (YYYY-MM-DD), local time (HH:mm) and timezone. */
export function zonedTimeToUtc(dateKey: string, hhmm: string, timezone: string): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const [hh, mm] = hhmm.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  const offset1 = tzOffsetMinutes(new Date(guess), timezone);
  let instant = guess - offset1 * MINUTE;
  const offset2 = tzOffsetMinutes(new Date(instant), timezone);
  if (offset2 !== offset1) instant = guess - offset2 * MINUTE;
  return new Date(instant).toISOString();
}

/** Local HH:mm in a timezone. */
export function localHHmm(iso: string | Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}
