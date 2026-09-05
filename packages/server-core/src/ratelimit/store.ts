/**
 * Storage contract for the rate limiter. Edge functions implement it over Postgres / Deno KV /
 * Redis; values are opaque JSON strings so any KV works.
 */
export interface RateLimitStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
}

export interface MemoryRateLimitStore extends RateLimitStore {
  delete(key: string): Promise<void>;
  clear(): void;
  size(): number;
}

/** In-memory store with TTL — for tests and single-instance local runs only. */
export function createMemoryRateLimitStore(
  opts: { now?: () => number } = {},
): MemoryRateLimitStore {
  const now = opts.now ?? (() => Date.now());
  const entries = new Map<string, { value: string; expiresAt: number }>();

  const purge = () => {
    const t = now();
    for (const [key, entry] of entries) if (entry.expiresAt <= t) entries.delete(key);
  };

  return {
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, ttlSec) {
      if (entries.size > 10_000) purge();
      entries.set(key, { value, expiresAt: now() + Math.max(1, ttlSec) * 1000 });
    },
    async delete(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
    size() {
      purge();
      return entries.size;
    },
  };
}
