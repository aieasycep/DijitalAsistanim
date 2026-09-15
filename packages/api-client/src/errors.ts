import type { ApiError } from '@da/domain';

/** Client-side error with the same shape as the server contract. UI maps `code` to friendly copy (i18n `errors.*`). */
export class ClientApiError extends Error {
  readonly code: ApiError['code'];
  readonly details?: Record<string, unknown>;
  readonly retryAfterSec?: number;
  readonly requiredScope?: string;
  readonly status?: number;

  constructor(error: ApiError, status?: number) {
    super(error.message);
    this.name = 'ClientApiError';
    this.code = error.code;
    this.details = error.details;
    this.retryAfterSec = error.retryAfterSec;
    this.requiredScope = error.requiredScope;
    this.status = status;
  }

  static from(e: unknown): ClientApiError {
    if (e instanceof ClientApiError) return e;
    if (typeof e === 'object' && e !== null && 'code' in e && 'message' in e) {
      const err = e as { code: unknown; message: unknown; status?: number };
      if (typeof err.code === 'string' && typeof err.message === 'string') {
        return new ClientApiError(
          { code: normalizeCode(err.code), message: err.message },
          err.status,
        );
      }
    }
    if (e instanceof TypeError && /network|fetch/i.test(e.message)) {
      return new ClientApiError({ code: 'offline', message: 'Çevrimdışısın.' });
    }
    if (e instanceof Error) return new ClientApiError({ code: 'internal', message: e.message });
    return new ClientApiError({ code: 'internal', message: 'Bir şeyler ters gitti.' });
  }

  get isOffline(): boolean {
    return this.code === 'offline';
  }
  get needsScope(): boolean {
    return this.code === 'scope_required';
  }
  get needsReconnect(): boolean {
    return this.code === 'oauth_expired';
  }
  get isQuota(): boolean {
    return this.code === 'quota_exceeded';
  }
}

const KNOWN: ApiError['code'][] = [
  'unauthorized',
  'forbidden',
  'not_found',
  'validation',
  'rate_limited',
  'quota_exceeded',
  'provider_unavailable',
  'oauth_expired',
  'scope_required',
  'ai_unavailable',
  'conflict',
  'offline',
  'internal',
];

function normalizeCode(code: string): ApiError['code'] {
  return (KNOWN as string[]).includes(code) ? (code as ApiError['code']) : 'internal';
}

/** Map an i18n key for an error code (screens render `t(errorKey(e))`). */
export function errorKey(e: unknown): string {
  const err = ClientApiError.from(e);
  switch (err.code) {
    case 'offline':
      return 'errors.offline';
    case 'oauth_expired':
      return 'errors.oauthExpired';
    case 'scope_required':
      return 'approvals.scopeNeeded';
    case 'rate_limited':
      return 'errors.rateLimited';
    case 'ai_unavailable':
      return 'errors.aiUnavailable';
    case 'provider_unavailable':
      return 'errors.mailUnavailable';
    case 'quota_exceeded':
      return 'assistant.quotaTitle';
    case 'not_found':
      return 'errors.notFound';
    case 'conflict':
      return 'approvals.conflictRemote';
    default:
      return 'common.genericError';
  }
}
