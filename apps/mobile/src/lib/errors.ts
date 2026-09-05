import type { TFunction } from 'i18next';
import { ClientApiError } from '@da/api-client';

export interface ErrorCopy {
  title: string;
  body?: string;
  /** Suggested recovery the screen can wire to a button. */
  recovery: 'retry' | 'reconnect' | 'grant_scope' | 'upgrade' | 'wait' | 'none';
}

/** Maps any thrown value to calm, i18n'd copy. Never exposes raw provider messages to the user. */
export function describeError(e: unknown, t: TFunction): ErrorCopy {
  const err = ClientApiError.from(e);
  switch (err.code) {
    case 'offline':
      return { title: t('errors.offline'), body: t('errors.offlineBody'), recovery: 'retry' };
    case 'oauth_expired':
      return { title: t('errors.oauthExpired'), body: t('errors.oauthExpiredBody'), recovery: 'reconnect' };
    case 'scope_required':
      return { title: t('approvals.scopeNeeded'), recovery: 'grant_scope' };
    case 'rate_limited':
      return { title: t('errors.rateLimited'), body: t('errors.rateLimitedBody'), recovery: 'wait' };
    case 'quota_exceeded':
      return { title: t('paywall.quotaTitle'), body: t('paywall.quotaBody'), recovery: 'upgrade' };
    case 'ai_unavailable':
      return { title: t('errors.aiUnavailable'), body: t('errors.aiUnavailableBody'), recovery: 'retry' };
    case 'provider_unavailable':
      return { title: t('errors.syncDelayed'), body: t('errors.syncDelayedBody'), recovery: 'retry' };
    case 'not_found':
      return { title: t('errors.notFound'), recovery: 'none' };
    case 'validation':
      return { title: err.message || t('common.genericError'), recovery: 'none' };
    case 'unauthorized':
    case 'forbidden':
      return { title: t('errors.permissionDenied'), recovery: 'none' };
    default:
      return { title: t('common.genericError'), recovery: 'retry' };
  }
}
