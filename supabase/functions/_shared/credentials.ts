/**
 * Encrypted provider credentials: load (decrypt + refresh when expired), store, revoke.
 * Refresh tokens never leave this module unencrypted except inside the provider request.
 */
import type { ConnectionStatus, Provider } from '@da/domain';
import { AppError } from '@da/server-core/errors';
import { createTokenCipher, sha256Hex, type TokenCipher } from '@da/server-core/crypto';
import {
  exchangeCode,
  isAccessTokenExpired,
  parseScopeString,
  refreshAccessToken,
  revokeToken,
  scopeSatisfies,
  type OAuthClientConfig,
  type OAuthProvider,
  type OAuthTokenSet,
} from '@da/server-core/oauth';
import { audit } from './audit.ts';
import type { Db } from './db.ts';
import { getEnv } from './env.ts';
import { log } from './log.ts';

let cipher: TokenCipher | null = null;

export function getCipher(): TokenCipher {
  if (cipher) return cipher;
  const env = getEnv();
  cipher = createTokenCipher({
    current: env.tokenEncryptionKey,
    previous: env.tokenEncryptionKeyPrevious ?? null,
  });
  return cipher;
}

/** HMAC secret for OAuth state tokens — derived from the encryption key, never reused directly. */
export function oauthStateSecret(): Promise<string> {
  return sha256Hex(`${getEnv().tokenEncryptionKey}:oauth-state:v1`);
}

export function providerClientConfig(provider: OAuthProvider): OAuthClientConfig {
  const env = getEnv();
  if (provider === 'google') {
    if (!env.google.clientId || !env.google.clientSecret) {
      throw new AppError(
        'provider_unavailable',
        'Google bağlantısı bu ortamda yapılandırılmamış.',
        { status: 503 },
      );
    }
    return { provider, clientId: env.google.clientId, clientSecret: env.google.clientSecret };
  }
  if (!env.microsoft.clientId || !env.microsoft.clientSecret) {
    throw new AppError(
      'provider_unavailable',
      'Microsoft bağlantısı bu ortamda yapılandırılmamış.',
      { status: 503 },
    );
  }
  return {
    provider,
    clientId: env.microsoft.clientId,
    clientSecret: env.microsoft.clientSecret,
    tenant: env.microsoft.tenant,
  };
}

export function redirectUriFor(provider: OAuthProvider): string {
  const env = getEnv();
  return provider === 'google'
    ? (env.google.redirectUri as string)
    : (env.microsoft.redirectUri as string);
}

export interface LoadedCredentials {
  accountId: string;
  userId: string;
  provider: OAuthProvider;
  accessToken: string;
  expiresAt: string;
  scope: string[];
}

interface CredentialRow {
  account_id: string;
  user_id: string;
  provider: Provider;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  access_token_expires_at: string | null;
  scope: string[] | null;
  revoked_at: string | null;
}

async function setAccountStatus(
  db: Db,
  accountId: string,
  status: ConnectionStatus,
  lastError?: string | null,
): Promise<void> {
  const { error } = await db
    .from('connected_accounts')
    .update({ status, last_error: lastError ?? null })
    .eq('id', accountId);
  if (error) log.warn('account status update failed', { accountId, status, error: error.message });
}

/**
 * Returns a usable access token for the account, refreshing (and persisting the rotated refresh token)
 * when needed. Throws `oauth_expired` when the grant is gone — the app then shows "Bağlantıyı Yenile".
 */
export async function loadCredentials(
  db: Db,
  accountId: string,
  opts: { actor?: 'system' | 'user' | 'cron' } = {},
): Promise<LoadedCredentials> {
  const { data, error } = await db
    .from('oauth_credentials')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) throw new AppError('internal', `Kimlik bilgileri okunamadı: ${error.message}`);
  const row = data as CredentialRow | null;
  if (!row || row.revoked_at || !row.refresh_token_enc) {
    await setAccountStatus(db, accountId, 'expired', 'Bağlantı yenilenmeli');
    throw new AppError(
      'oauth_expired',
      'Bağlantı süresi doldu. Devam etmek için bağlantıyı yenile.',
    );
  }
  if (row.provider !== 'google' && row.provider !== 'microsoft') {
    throw new AppError('validation', 'Bu hesap türü için sağlayıcı kimlik bilgisi yok.');
  }
  const provider: OAuthProvider = row.provider;
  const c = getCipher();
  const aad = { aad: row.user_id };

  await audit(db, {
    userId: row.user_id,
    action: 'token.decrypt',
    actor: opts.actor ?? 'system',
    targetType: 'connected_account',
    targetId: accountId,
  });

  const accessToken = row.access_token_enc ? await c.decrypt(row.access_token_enc, aad) : null;
  const expiresAt = row.access_token_expires_at ?? new Date(0).toISOString();
  const scope = row.scope ?? [];
  if (accessToken && !isAccessTokenExpired(expiresAt)) {
    return { accountId, userId: row.user_id, provider, accessToken, expiresAt, scope };
  }

  const refreshToken = await c.decrypt(row.refresh_token_enc, aad);
  try {
    const refreshed = await refreshAccessToken(fetch, {
      ...providerClientConfig(provider),
      refreshToken,
      scopes: scope,
    });
    const update: Record<string, unknown> = {
      access_token_enc: await c.encrypt(refreshed.accessToken, aad),
      access_token_expires_at: refreshed.expiresAt,
      last_refreshed_at: new Date().toISOString(),
      scope: refreshed.scope.length ? refreshed.scope : scope,
    };
    if (refreshed.refreshTokenRotated)
      update.refresh_token_enc = await c.encrypt(refreshed.refreshToken, aad);
    const { error: updErr } = await db
      .from('oauth_credentials')
      .update(update)
      .eq('account_id', accountId);
    if (updErr) log.warn('credential update failed', { accountId, error: updErr.message });
    await audit(db, {
      userId: row.user_id,
      action: 'oauth.refresh',
      actor: opts.actor ?? 'system',
      targetType: 'connected_account',
      targetId: accountId,
      metadata: { rotated: refreshed.refreshTokenRotated },
    });
    await setAccountStatus(db, accountId, 'active', null);
    return {
      accountId,
      userId: row.user_id,
      provider,
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
      scope: (update.scope as string[]) ?? scope,
    };
  } catch (e) {
    if (e instanceof AppError && e.code === 'oauth_expired') {
      await setAccountStatus(db, accountId, 'expired', 'Bağlantı yenilenmeli');
    } else if (e instanceof AppError && e.code === 'provider_unavailable') {
      await setAccountStatus(db, accountId, 'error', 'Sağlayıcıya ulaşılamıyor');
    }
    throw e;
  }
}

/** Persist a fresh token set after code exchange (connect or scope upgrade). */
export async function storeCredentials(
  db: Db,
  input: {
    accountId: string;
    userId: string;
    provider: OAuthProvider;
    tokens: OAuthTokenSet;
    keepExistingRefreshToken?: boolean;
  },
): Promise<void> {
  const c = getCipher();
  const aad = { aad: input.userId };
  const row: Record<string, unknown> = {
    account_id: input.accountId,
    user_id: input.userId,
    provider: input.provider,
    access_token_enc: await c.encrypt(input.tokens.accessToken, aad),
    access_token_expires_at: input.tokens.expiresAt,
    scope: input.tokens.scope,
    token_type: input.tokens.tokenType,
    last_refreshed_at: new Date().toISOString(),
    revoked_at: null,
  };
  if (input.tokens.refreshToken) {
    row.refresh_token_enc = await c.encrypt(input.tokens.refreshToken, aad);
  } else if (!input.keepExistingRefreshToken) {
    // Google omits refresh_token on re-consent unless prompt=consent; keep the stored one when present.
    const { data } = await db
      .from('oauth_credentials')
      .select('refresh_token_enc')
      .eq('account_id', input.accountId)
      .maybeSingle();
    if (!(data as { refresh_token_enc?: string | null } | null)?.refresh_token_enc) {
      throw new AppError(
        'oauth_expired',
        'Sağlayıcı yenileme belirteci vermedi; bağlantıyı tekrar kur.',
      );
    }
  }
  const { error } = await db.from('oauth_credentials').upsert(row, { onConflict: 'account_id' });
  if (error) throw new AppError('internal', `Kimlik bilgileri kaydedilemedi: ${error.message}`);
}

/** Revoke at the provider (Google) or mark for manual revocation (Microsoft); always wipe our copy. */
export async function revokeAccountCredentials(
  db: Db,
  accountId: string,
): Promise<{ revoked: boolean; manualUrl?: string }> {
  const { data } = await db
    .from('oauth_credentials')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();
  const row = data as CredentialRow | null;
  let revoked = false;
  let manualUrl: string | undefined;
  if (row && (row.provider === 'google' || row.provider === 'microsoft') && row.refresh_token_enc) {
    try {
      const token = await getCipher().decrypt(row.refresh_token_enc, { aad: row.user_id });
      const result = await revokeToken(fetch, { provider: row.provider, token });
      if (result.supported) revoked = result.revoked;
      else manualUrl = result.manualUrl;
    } catch (e) {
      log.warn('revoke failed', { accountId, error: e instanceof Error ? e.message : 'unknown' });
    }
  }
  await db
    .from('oauth_credentials')
    .update({
      access_token_enc: null,
      refresh_token_enc: null,
      revoked_at: new Date().toISOString(),
    })
    .eq('account_id', accountId);
  if (row) {
    await audit(db, {
      userId: row.user_id,
      action: 'oauth.revoke',
      actor: 'user',
      targetType: 'connected_account',
      targetId: accountId,
      metadata: { revoked, manual: Boolean(manualUrl) },
    });
  }
  return manualUrl ? { revoked, manualUrl } : { revoked };
}

/** Throw `scope_required` (with the scope to request) when the grant lacks a write scope. */
export function ensureScope(creds: LoadedCredentials, requiredScope: string | null): void {
  if (!requiredScope) return;
  if (!scopeSatisfies(creds.scope, [requiredScope])) {
    throw new AppError('scope_required', 'Bu işlem için ek izin gerekiyor.', { requiredScope });
  }
}

export function scopesFromRow(scope: string[] | string | null | undefined): string[] {
  if (Array.isArray(scope)) return scope;
  return parseScopeString(scope ?? '');
}

/** Exchange an authorization code (used by both callbacks). */
export function exchangeAuthorizationCode(
  provider: OAuthProvider,
  code: string,
  codeVerifier: string,
): Promise<OAuthTokenSet> {
  return exchangeCode(fetch, {
    ...providerClientConfig(provider),
    code,
    codeVerifier,
    redirectUri: redirectUriFor(provider),
  });
}
