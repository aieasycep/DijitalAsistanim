/** Mapping of provider OAuth errors to the API error contract. */
import type { Locale } from '@da/domain';
import { AppError } from '../errors';

export interface OAuthErrorBody {
  error?: string;
  error_description?: string;
  error_codes?: number[];
}

const MESSAGES = {
  expired: {
    tr: 'Hesap bağlantısının süresi dolmuş. Yeniden bağlaman gerekiyor.',
    en: 'The account connection has expired. Please reconnect it.',
  },
  denied: {
    tr: 'İzin verilmedi. İstersen daha sonra tekrar deneyebilirsin.',
    en: 'Permission was not granted. You can try again later.',
  },
  unavailable: {
    tr: 'Sağlayıcıya şu an ulaşılamıyor. Biraz sonra tekrar deneyelim.',
    en: 'The provider is not reachable right now. Let’s try again shortly.',
  },
  invalid: {
    tr: 'Bağlantı isteği geçersiz. Lütfen yeniden dene.',
    en: 'The connection request was invalid. Please try again.',
  },
  config: {
    tr: 'Bağlantı kurulamadı.',
    en: 'The connection could not be set up.',
  },
} as const;

/** Errors that mean "the grant is gone — user must reconnect". */
const EXPIRED_ERRORS = new Set([
  'invalid_grant',
  'interaction_required',
  'consent_required',
  'login_required',
  'invalid_token',
]);
const DENIED_ERRORS = new Set(['access_denied', 'user_cancelled_authorize', 'user_cancelled']);
const UNAVAILABLE_ERRORS = new Set(['temporarily_unavailable', 'server_error']);
const CONFIG_ERRORS = new Set([
  'invalid_client',
  'unauthorized_client',
  'invalid_scope',
  'unsupported_grant_type',
  'invalid_resource',
]);

export function parseOAuthErrorBody(text: string): OAuthErrorBody {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const record = parsed as Record<string, unknown>;
    return {
      ...(typeof record.error === 'string' ? { error: record.error } : {}),
      ...(typeof record.error_description === 'string'
        ? { error_description: record.error_description }
        : {}),
      ...(Array.isArray(record.error_codes)
        ? { error_codes: record.error_codes.filter((c): c is number => typeof c === 'number') }
        : {}),
    };
  } catch {
    return {};
  }
}

/** Map a provider error (token endpoint response or callback query) to an AppError. */
export function mapOAuthError(input: {
  status?: number;
  body?: OAuthErrorBody;
  locale?: Locale;
}): AppError {
  const locale = input.locale ?? 'tr';
  const error = input.body?.error?.toLowerCase();
  const details: Record<string, unknown> = {
    ...(error ? { oauthError: error } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.body?.error_codes?.length ? { errorCodes: input.body.error_codes } : {}),
  };

  if (error && EXPIRED_ERRORS.has(error))
    return new AppError('oauth_expired', MESSAGES.expired[locale], { details });
  if (error && DENIED_ERRORS.has(error))
    return new AppError('forbidden', MESSAGES.denied[locale], { details });
  if (error && UNAVAILABLE_ERRORS.has(error))
    return new AppError('provider_unavailable', MESSAGES.unavailable[locale], { details });
  if (error && CONFIG_ERRORS.has(error))
    return new AppError('internal', MESSAGES.config[locale], { details });
  if (error === 'invalid_request')
    return new AppError('validation', MESSAGES.invalid[locale], { details });
  if (input.status !== undefined && input.status >= 500)
    return new AppError('provider_unavailable', MESSAGES.unavailable[locale], { details });
  if (input.status === 429)
    return new AppError('provider_unavailable', MESSAGES.unavailable[locale], {
      details,
      retryAfterSec: 30,
    });
  if (input.status !== undefined && input.status >= 400)
    return new AppError('validation', MESSAGES.invalid[locale], { details });
  return new AppError('provider_unavailable', MESSAGES.unavailable[locale], { details });
}

export function providerUnreachableError(locale: Locale = 'tr', cause?: unknown): AppError {
  return new AppError('provider_unavailable', MESSAGES.unavailable[locale], {
    details: { reason: 'network' },
    cause,
  });
}
