import type { AiProviderName } from './types';

export type AiProviderErrorKind = 'http' | 'network' | 'timeout' | 'parse' | 'refusal' | 'empty';

/**
 * Failure raised by a provider adapter. Carries only status/kind information so it is safe to
 * log; the AI client converts it to `AppError('ai_unavailable')` once all attempts are spent.
 */
export class AiProviderError extends Error {
  readonly provider: AiProviderName;
  readonly kind: AiProviderErrorKind;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly retryAfterSec: number | null;

  constructor(
    provider: AiProviderName,
    kind: AiProviderErrorKind,
    message: string,
    opts: {
      status?: number | null;
      retryable?: boolean;
      retryAfterSec?: number | null;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = 'AiProviderError';
    this.provider = provider;
    this.kind = kind;
    this.status = opts.status ?? null;
    this.retryable = opts.retryable ?? defaultRetryable(kind, this.status);
    this.retryAfterSec = opts.retryAfterSec ?? null;
  }

  /** Stable short code for telemetry ("http_429", "timeout", "refusal"). */
  get code(): string {
    return this.kind === 'http' && this.status !== null ? `http_${this.status}` : this.kind;
  }
}

export function isAiProviderError(e: unknown): e is AiProviderError {
  return e instanceof AiProviderError;
}

function defaultRetryable(kind: AiProviderErrorKind, status: number | null): boolean {
  switch (kind) {
    case 'network':
    case 'timeout':
      return true;
    case 'http':
      return (
        status === 408 || status === 409 || status === 429 || (status !== null && status >= 500)
      );
    case 'parse':
    case 'empty':
      return true;
    case 'refusal':
      return false;
  }
}

/** Parse a Retry-After header (seconds or HTTP date) into whole seconds. */
export function parseRetryAfterSec(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}
