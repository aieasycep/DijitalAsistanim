/** Token endpoint interactions: code exchange, refresh (rotation-aware) and revocation. */
import type { Locale } from '@da/domain';
import { z } from 'zod';
import { mapOAuthError, parseOAuthErrorBody, providerUnreachableError } from './errors';
import { MICROSOFT_CONSENT_MANAGE_URL, providerEndpoints } from './providers';
import { parseScopeString, type OAuthProvider } from './scopes';

/** Injected fetch so token calls are testable and runtime-agnostic. */
export type OAuthFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** ISO instant; computed from `expires_in` with a small safety margin. */
  expiresAt: string;
  scope: string[];
  idToken: string | null;
  tokenType: string;
}

export interface OAuthClientConfig {
  provider: OAuthProvider;
  clientId: string;
  clientSecret: string;
  /** Microsoft only. */
  tenant?: string;
  locale?: Locale;
  /** Injected clock for deterministic `expiresAt` in tests. */
  now?: () => Date;
  timeoutMs?: number;
}

export interface ExchangeCodeInput extends OAuthClientConfig {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface RefreshTokenInput extends OAuthClientConfig {
  refreshToken: string;
  /** Microsoft: scopes to mint the access token for (defaults to everything consented). */
  scopes?: readonly string[];
}

export interface RefreshResult extends OAuthTokenSet {
  /** Whether the provider handed out a new refresh token (persist it — the old one may stop working). */
  refreshTokenRotated: boolean;
  /** Always the newest usable refresh token. */
  refreshToken: string;
}

export type RevokeResult =
  { supported: true; revoked: boolean; status: number } | { supported: false; manualUrl: string };

/** Seconds subtracted from `expires_in` so a token is refreshed before it actually dies. */
export const TOKEN_EXPIRY_SAFETY_SEC = 60;
const DEFAULT_TIMEOUT_MS = 15_000;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().default('Bearer'),
  expires_in: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).default(3600),
  refresh_token: z.string().min(1).nullish(),
  scope: z.string().nullish(),
  id_token: z.string().min(1).nullish(),
});

function computeExpiresAt(expiresInSec: number, now: Date): string {
  const safeSeconds = Math.max(0, expiresInSec - TOKEN_EXPIRY_SAFETY_SEC);
  return new Date(now.getTime() + safeSeconds * 1000).toISOString();
}

async function postForm(
  fetchImpl: OAuthFetch,
  url: string,
  form: Record<string, string>,
  timeoutMs: number,
  locale: Locale,
): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(form).toString(),
      signal: controller.signal,
    });
    return { status: response.status, text: await response.text() };
  } catch (cause) {
    throw providerUnreachableError(locale, cause);
  } finally {
    clearTimeout(timer);
  }
}

function parseTokenResponse(
  text: string,
  status: number,
  config: OAuthClientConfig,
): OAuthTokenSet {
  const locale = config.locale ?? 'tr';
  if (status < 200 || status >= 300)
    throw mapOAuthError({ status, body: parseOAuthErrorBody(text), locale });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw mapOAuthError({ status, locale });
  }
  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) throw mapOAuthError({ status, body: parseOAuthErrorBody(text), locale });
  const now = (config.now ?? (() => new Date()))();
  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token ?? null,
    expiresAt: computeExpiresAt(parsed.data.expires_in, now),
    scope: parseScopeString(parsed.data.scope),
    idToken: parsed.data.id_token ?? null,
    tokenType: parsed.data.token_type,
  };
}

/** Exchange an authorization code (with PKCE verifier) for tokens. */
export async function exchangeCode(
  fetchImpl: OAuthFetch,
  input: ExchangeCodeInput,
): Promise<OAuthTokenSet> {
  const endpoints = providerEndpoints(input.provider, input.tenant);
  const { status, text } = await postForm(
    fetchImpl,
    endpoints.token,
    {
      grant_type: 'authorization_code',
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    },
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    input.locale ?? 'tr',
  );
  return parseTokenResponse(text, status, input);
}

/**
 * Refresh an access token. Microsoft rotates refresh tokens (a new one is returned on every
 * refresh); Google usually keeps the same one. The result always carries the newest token.
 */
export async function refreshAccessToken(
  fetchImpl: OAuthFetch,
  input: RefreshTokenInput,
): Promise<RefreshResult> {
  const endpoints = providerEndpoints(input.provider, input.tenant);
  const form: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  };
  if (input.provider === 'microsoft' && input.scopes && input.scopes.length > 0)
    form.scope = input.scopes.join(' ');
  const { status, text } = await postForm(
    fetchImpl,
    endpoints.token,
    form,
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    input.locale ?? 'tr',
  );
  const tokens = parseTokenResponse(text, status, input);
  const rotated = tokens.refreshToken !== null && tokens.refreshToken !== input.refreshToken;
  return {
    ...tokens,
    refreshToken: tokens.refreshToken ?? input.refreshToken,
    refreshTokenRotated: rotated,
  };
}

export interface RevokeTokenInput {
  provider: OAuthProvider;
  /** Refresh token preferred (revokes the whole grant); access token also accepted. */
  token: string;
  locale?: Locale;
  timeoutMs?: number;
}

/**
 * Revoke a grant. Google supports it server-side; Microsoft has no revocation endpoint for
 * consumer/work accounts — the user removes access manually at the returned URL.
 */
export async function revokeToken(
  fetchImpl: OAuthFetch,
  input: RevokeTokenInput,
): Promise<RevokeResult> {
  const endpoints = providerEndpoints(input.provider);
  if (!endpoints.revoke) return { supported: false, manualUrl: MICROSOFT_CONSENT_MANAGE_URL };
  const { status } = await postForm(
    fetchImpl,
    endpoints.revoke,
    { token: input.token },
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    input.locale ?? 'tr',
  );
  // Google answers 400 `invalid_token` for an already-revoked/expired token — nothing left to revoke.
  return { supported: true, revoked: status === 200 || status === 400, status };
}

/** True when the access token should be refreshed before use. */
export function isAccessTokenExpired(
  expiresAt: string,
  now: Date = new Date(),
  skewSec = 0,
): boolean {
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) || t - skewSec * 1000 <= now.getTime();
}
