/**
 * HTTP plumbing shared by the Google and Microsoft adapters: bearer auth, per-call timeout,
 * JSON parsing and a single mapping from provider status codes to the API error contract.
 *
 * Error messages never carry response bodies — mail content must not leak into logs or the
 * client. `details` only holds the status, the provider's error code/reason and (for 429/5xx)
 * the retry hint.
 */
import { AppError, isAppError } from '../errors';
import type { ProviderFetch } from './types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const DEFAULT_PROVIDER_TIMEOUT_MS = 20_000;
const DEFAULT_RATE_LIMIT_RETRY_SEC = 60;
const DEFAULT_SERVER_ERROR_RETRY_SEC = 30;

export type QueryValue = string | number | boolean | string[] | null | undefined;

export interface ProviderRequestInit {
  url: string;
  token: string;
  method?: HttpMethod;
  /** Objects are JSON-encoded; strings are sent verbatim (set `content-type` in `headers`). */
  body?: unknown;
  headers?: Record<string, string>;
  /** Appended to `url`; arrays repeat the key, null/undefined are skipped. */
  query?: Record<string, QueryValue>;
  timeoutMs?: number;
  /** Scope reported in a `scope_required` error when the provider answers "insufficient permissions". */
  requiredScope?: string;
}

export interface ProviderRawResponse {
  status: number;
  headers: Headers;
  text: string;
}

export interface ProviderErrorInfo {
  status: number;
  /** Graph `error.code` / Google `error.status` (e.g. `ErrorAccessDenied`, `PERMISSION_DENIED`). */
  code: string | null;
  /** Google `errors[].reason` / `details[].reason` (e.g. `insufficientPermissions`, `rateLimitExceeded`). */
  reason: string | null;
}

const MESSAGES = {
  expired: 'Hesap bağlantısının süresi dolmuş. Yeniden bağlaman gerekiyor.',
  scope: 'Bu işlem için ek bir izin gerekiyor.',
  forbidden: 'Sağlayıcı bu isteğe izin vermedi.',
  notFound: 'Kayıt sağlayıcıda bulunamadı.',
  gone: 'Eşitleme belirteci artık geçerli değil; tam eşitleme gerekiyor.',
  conflict: 'Kayıt sağlayıcı tarafında değişmiş.',
  rateLimited: 'Sağlayıcı istek sınırına ulaşıldı. Biraz sonra tekrar deneyelim.',
  unavailable: 'Sağlayıcıya şu an ulaşılamıyor. Biraz sonra tekrar deneyelim.',
  timeout: 'Sağlayıcı zamanında yanıt vermedi.',
  invalid: 'Sağlayıcı isteği kabul etmedi.',
  badBody: 'Sağlayıcı yanıtı çözümlenemedi.',
  emptyBody: 'Sağlayıcı boş yanıt döndürdü.',
} as const;

const SCOPE_REASONS = new Set([
  'insufficientpermissions',
  'access_token_scope_insufficient',
  'insufficient_scope',
]);
const SCOPE_CODES = new Set([
  'erroraccessdenied',
  'authorization_requestdenied',
  'accessdenied',
  'permission_denied',
]);
const RATE_LIMIT_REASONS = new Set([
  'ratelimitexceeded',
  'userratelimitexceeded',
  'quotaexceeded',
  'dailylimitexceeded',
  'concurrentlimitexceeded',
]);

/** Append query parameters to a URL (arrays repeat the key). */
export function withQuery(url: string, query?: Record<string, QueryValue>): string {
  if (!query) return url;
  const target = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) target.searchParams.append(key, v);
    else target.searchParams.set(key, String(value));
  }
  return target.toString();
}

function lowercaseKeys(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) out[k.toLowerCase()] = v;
  return out;
}

function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
}

/** `Retry-After` as seconds (integer form or HTTP date), null when absent/invalid. */
export function parseRetryAfter(header: string | null, now: number = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Math.max(0, Number(trimmed));
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(list: unknown, key: string): string | null {
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    const record = asRecord(item);
    const value = record?.[key];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

/** Extract the provider error code/reason from a Google or Graph error body (never the message). */
export function parseProviderErrorBody(text: string): Pick<ProviderErrorInfo, 'code' | 'reason'> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { code: null, reason: null };
  }
  const root = asRecord(parsed);
  if (!root) return { code: null, reason: null };
  const error = root.error;
  if (typeof error === 'string') return { code: error, reason: null };
  const record = asRecord(error);
  if (!record) return { code: null, reason: null };
  const code =
    typeof record.code === 'string'
      ? record.code
      : typeof record.status === 'string'
        ? record.status
        : null;
  const reason = firstString(record.errors, 'reason') ?? firstString(record.details, 'reason');
  return { code, reason };
}

export interface MapProviderErrorInput {
  status: number;
  /** Raw response body (only codes/reasons are extracted from it). */
  text?: string;
  retryAfter?: string | null;
  requiredScope?: string;
}

/** Map a non-2xx provider answer to an AppError. */
export function mapProviderError(input: MapProviderErrorInput): AppError {
  const { status } = input;
  const { code, reason } = parseProviderErrorBody(input.text ?? '');
  const details: Record<string, unknown> = {
    status,
    ...(code ? { providerCode: code } : {}),
    ...(reason ? { providerReason: reason } : {}),
  };
  const retryAfterSec = parseRetryAfter(input.retryAfter ?? null);
  const lowerCode = code?.toLowerCase() ?? '';
  const lowerReason = reason?.toLowerCase() ?? '';

  if (status === 401) return new AppError('oauth_expired', MESSAGES.expired, { details });
  if (status === 403) {
    if (RATE_LIMIT_REASONS.has(lowerReason)) {
      return new AppError('provider_unavailable', MESSAGES.rateLimited, {
        details,
        retryAfterSec: retryAfterSec ?? DEFAULT_RATE_LIMIT_RETRY_SEC,
      });
    }
    if (SCOPE_REASONS.has(lowerReason) || SCOPE_CODES.has(lowerCode) || input.requiredScope) {
      return new AppError('scope_required', MESSAGES.scope, {
        details,
        ...(input.requiredScope ? { requiredScope: input.requiredScope } : {}),
      });
    }
    return new AppError('forbidden', MESSAGES.forbidden, { details });
  }
  if (status === 404) return new AppError('not_found', MESSAGES.notFound, { details });
  if (status === 410) return new AppError('not_found', MESSAGES.gone, { status: 410, details });
  if (status === 409 || status === 412) {
    return new AppError('conflict', MESSAGES.conflict, { details });
  }
  if (status === 429) {
    return new AppError('provider_unavailable', MESSAGES.rateLimited, {
      details,
      retryAfterSec: retryAfterSec ?? DEFAULT_RATE_LIMIT_RETRY_SEC,
    });
  }
  if (status >= 500) {
    return new AppError('provider_unavailable', MESSAGES.unavailable, {
      details,
      retryAfterSec: retryAfterSec ?? DEFAULT_SERVER_ERROR_RETRY_SEC,
    });
  }
  return new AppError('validation', MESSAGES.invalid, { details });
}

/** True when `e` is a provider error carrying the given HTTP status (404, 410 …). */
export function isProviderStatus(e: unknown, status: number): boolean {
  return isAppError(e) && e.details?.status === status;
}

/**
 * Perform an authenticated request and return the body as text. Throws an AppError for
 * timeouts, network failures and non-2xx answers.
 */
export async function providerRequestRaw(
  fetchImpl: ProviderFetch,
  init: ProviderRequestInit,
): Promise<ProviderRawResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS);
  const headers: Record<string, string> = {
    authorization: `Bearer ${init.token}`,
    accept: 'application/json',
    ...lowercaseKeys(init.headers),
  };
  let body: string | undefined;
  if (init.body !== undefined) {
    if (typeof init.body === 'string') body = init.body;
    else {
      body = JSON.stringify(init.body);
      headers['content-type'] ??= 'application/json';
    }
  }
  try {
    let response: Response;
    try {
      response = await fetchImpl(withQuery(init.url, init.query), {
        method: init.method ?? 'GET',
        headers,
        ...(body !== undefined ? { body } : {}),
        signal: controller.signal,
      });
    } catch (cause) {
      throw networkError(controller.signal.aborted || isAbortError(cause), cause);
    }
    let text: string;
    try {
      text = await response.text();
    } catch (cause) {
      throw networkError(controller.signal.aborted || isAbortError(cause), cause);
    }
    if (response.status < 200 || response.status >= 300) {
      throw mapProviderError({
        status: response.status,
        text,
        retryAfter: response.headers.get('retry-after'),
        ...(init.requiredScope ? { requiredScope: init.requiredScope } : {}),
      });
    }
    return { status: response.status, headers: response.headers, text };
  } finally {
    clearTimeout(timer);
  }
}

function networkError(timedOut: boolean, cause: unknown): AppError {
  return new AppError('provider_unavailable', timedOut ? MESSAGES.timeout : MESSAGES.unavailable, {
    details: { reason: timedOut ? 'timeout' : 'network' },
    retryAfterSec: DEFAULT_SERVER_ERROR_RETRY_SEC,
    cause,
  });
}

/** Authenticated request returning the parsed JSON body (empty bodies are an `internal` error). */
export async function providerRequest<T>(
  fetchImpl: ProviderFetch,
  init: ProviderRequestInit,
): Promise<T> {
  const { text } = await providerRequestRaw(fetchImpl, init);
  if (text.trim() === '') throw new AppError('internal', MESSAGES.emptyBody);
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new AppError('internal', MESSAGES.badBody, { cause });
  }
}

/** Map with a bounded number of in-flight promises; results keep the input order. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  const concurrency = Math.max(1, Math.min(limit, items.length));
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

/** Percent-encode a path segment (provider ids can contain `/`, `=`, `+`). */
export function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment);
}

/** Normalise any provider timestamp to an ISO-8601 UTC string; null when unparsable. */
export function toIsoOrNull(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
