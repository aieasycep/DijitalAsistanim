/**
 * Row helpers: snake_case DB rows → camelCase domain objects. jsonb payloads are stored in camelCase already,
 * so the transform only touches top-level/nested snake_case keys produced by Postgres.
 */
const SNAKE = /_([a-z0-9])/g;

export function camelKey(key: string): string {
  return key.replace(SNAKE, (_, c: string) => c.toUpperCase());
}

export function camelize<T = Record<string, unknown>>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => camelize(v)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[camelKey(k)] = camelize(v);
    return out as T;
  }
  return value as T;
}

/** Convert a camelCase patch to snake_case columns (shallow — jsonb values are kept as-is). */
export function snakeKeys(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)] = v;
  }
  return out;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function localDateKey(iso: string | Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}
