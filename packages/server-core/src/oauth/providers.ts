/** Provider endpoints. Microsoft endpoints depend on the tenant (default: `common`). */
import type { OAuthProvider } from './scopes';

export const DEFAULT_MICROSOFT_TENANT = 'common';
export const MICROSOFT_CONSENT_MANAGE_URL = 'https://account.live.com/consent/Manage';
export const MICROSOFT_WORK_CONSENT_MANAGE_URL = 'https://myapps.microsoft.com';

export interface ProviderEndpoints {
  authorization: string;
  token: string;
  /** Null when the provider offers no server-side revocation. */
  revoke: string | null;
  issuer: string;
}

const TENANT_PATTERN = /^[A-Za-z0-9.-]{1,120}$/;

export function providerEndpoints(
  provider: OAuthProvider,
  tenant: string = DEFAULT_MICROSOFT_TENANT,
): ProviderEndpoints {
  if (provider === 'google') {
    return {
      authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      revoke: 'https://oauth2.googleapis.com/revoke',
      issuer: 'https://accounts.google.com',
    };
  }
  if (!TENANT_PATTERN.test(tenant)) throw new Error('Geçersiz Microsoft tenant');
  const base = `https://login.microsoftonline.com/${tenant}`;
  return {
    authorization: `${base}/oauth2/v2.0/authorize`,
    token: `${base}/oauth2/v2.0/token`,
    revoke: null,
    issuer: `${base}/v2.0`,
  };
}
