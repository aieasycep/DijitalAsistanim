/** "HH:mm" helpers shared by the briefing schedule and quiet-hours pickers. */

export interface ClockTime {
  hour: number;
  minute: number;
}

export function parseHHmm(value: string): ClockTime | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** Builds a local Date carrying the given wall-clock time (today by default) for the native picker. */
export function toDate(hhmm: string, base: Date = new Date()): Date {
  const parsed = parseHHmm(hhmm) ?? { hour: 8, minute: 0 };
  const d = new Date(base.getTime());
  d.setHours(parsed.hour, parsed.minute, 0, 0);
  return d;
}

export function toHHmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function isValidHHmm(value: string): boolean {
  return parseHHmm(value) !== null;
}
