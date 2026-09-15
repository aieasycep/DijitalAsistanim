/**
 * Stable idempotency keys: the same intent (same namespace + same canonical parts) always
 * produces the same key, so retries and duplicate AI proposals collapse into one action.
 */
import { sha256Hex } from './hash';

const NAMESPACE_PATTERN = /^[A-Za-z0-9_.:-]{1,60}$/;
const KEY_HASH_CHARS = 32;

/** Deterministic JSON: object keys sorted, `undefined` dropped, non-finite numbers → null. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? 'null';
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const v = record[key];
      if (v === undefined) continue;
      out[key] = canonicalize(v);
    }
    return out;
  }
  return null;
}

/**
 * `<namespace>:<32 hex chars of sha256(canonical parts)>` — fits the API constraint (8–120 chars).
 * Example: `buildIdempotencyKey('approval:email_send', { userId, threadId, to, subject })`.
 */
export async function buildIdempotencyKey(
  namespace: string,
  parts: Record<string, unknown>,
): Promise<string> {
  if (!NAMESPACE_PATTERN.test(namespace)) throw new Error('Geçersiz idempotency namespace');
  const digest = await sha256Hex(canonicalJson(parts));
  return `${namespace}:${digest.slice(0, KEY_HASH_CHARS)}`;
}
