import type { ApiError } from '@da/domain';

/** Typed application error that maps 1:1 to the API error contract. */
export class AppError extends Error {
  readonly code: ApiError['code'];
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly retryAfterSec?: number;
  readonly requiredScope?: string;

  constructor(
    code: ApiError['code'],
    message: string,
    opts: { status?: number; details?: Record<string, unknown>; retryAfterSec?: number; requiredScope?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = opts.status ?? defaultStatus(code);
    this.details = opts.details;
    this.retryAfterSec = opts.retryAfterSec;
    this.requiredScope = opts.requiredScope;
  }

  toApiError(): ApiError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
      ...(this.retryAfterSec ? { retryAfterSec: this.retryAfterSec } : {}),
      ...(this.requiredScope ? { requiredScope: this.requiredScope } : {}),
    };
  }
}

export function defaultStatus(code: ApiError['code']): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    case 'validation':
      return 400;
    case 'rate_limited':
      return 429;
    case 'quota_exceeded':
      return 402;
    case 'provider_unavailable':
    case 'ai_unavailable':
      return 503;
    case 'oauth_expired':
    case 'scope_required':
      return 403;
    case 'conflict':
      return 409;
    case 'offline':
      return 503;
    case 'internal':
    default:
      return 500;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Convert any thrown value to an AppError without leaking internals. */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  if (e instanceof Error) return new AppError('internal', 'Bir şeyler ters gitti.', { cause: e });
  return new AppError('internal', 'Bir şeyler ters gitti.');
}
