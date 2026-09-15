/**
 * `planOAuthStart` — everything an edge function needs to answer `OAuthStartRequest`:
 * scopes, PKCE pair, signed state and the authorization URL. The edge function persists
 * `codeVerifier` under `nonce` and returns `{ authorizationUrl, state }` to the client.
 */
import type { Locale, OAuthStartRequest, OAuthStartResponse } from '@da/domain';
import { AppError } from '../errors';
import { createPkcePair } from '../crypto';
import { buildAuthorizationUrl, type OAuthPrompt } from './authorize';
import { missingScopes, scopesFor, type OAuthScopeGroup } from './scopes';
import { createOAuthState } from './state';
import { mapOAuthError } from './errors';

export interface OAuthStartPlanInput {
  request: OAuthStartRequest;
  userId: string;
  clientId: string;
  redirectUri: string;
  stateSecret: string | Uint8Array;
  /** Scopes the existing account already holds (scope upgrade flow). */
  existingGrantedScopes?: readonly string[];
  /** Write groups the account already uses, so an upgrade keeps them in the requested set. */
  existingGroups?: readonly OAuthScopeGroup[];
  loginHint?: string | null;
  tenant?: string;
  prompt?: OAuthPrompt;
  stateTtlSec?: number;
  now?: Date;
}

export interface OAuthStartPlan extends OAuthStartResponse {
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  scopes: string[];
  isScopeUpgrade: boolean;
  /** Scopes not yet granted (empty when nothing new is being requested). */
  newScopes: string[];
  expiresAt: string;
}

export async function planOAuthStart(input: OAuthStartPlanInput): Promise<OAuthStartPlan> {
  const { request } = input;
  const scopeGroup = request.scopeGroup ?? 'read';
  const isScopeUpgrade = Boolean(request.accountId) && scopeGroup !== 'read';
  const groups = new Set<OAuthScopeGroup>([...(input.existingGroups ?? []), scopeGroup]);
  const scopes = scopesFor({
    provider: request.provider,
    kinds: request.kinds,
    groups: [...groups],
  });
  const newScopes = missingScopes(input.existingGrantedScopes ?? [], scopes);

  const pkce = await createPkcePair();
  const state = await createOAuthState({
    secret: input.stateSecret,
    userId: input.userId,
    provider: request.provider,
    kinds: request.kinds,
    redirectTo: request.redirectTo,
    accountId: request.accountId ?? null,
    scopeGroup,
    ttlSec: input.stateTtlSec,
    now: input.now,
  });

  const authorizationUrl = buildAuthorizationUrl({
    provider: request.provider,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    scopes,
    state: state.state,
    codeChallenge: pkce.codeChallenge,
    loginHint: input.loginHint ?? null,
    includeGrantedScopes: true,
    isScopeUpgrade,
    prompt: input.prompt,
    tenant: input.tenant,
  });

  return {
    authorizationUrl,
    state: state.state,
    nonce: state.payload.nonce,
    codeVerifier: pkce.codeVerifier,
    codeChallenge: pkce.codeChallenge,
    scopes,
    isScopeUpgrade,
    newScopes,
    expiresAt: state.expiresAt,
  };
}

export interface OAuthCallbackParams {
  code: string;
  state: string;
}

/** Read `code`/`state` from the provider redirect, turning `error=` into an AppError. */
export function parseOAuthCallback(
  query: URLSearchParams | Record<string, string | undefined>,
  locale: Locale = 'tr',
): OAuthCallbackParams {
  const get = (key: string): string | undefined =>
    query instanceof URLSearchParams ? (query.get(key) ?? undefined) : query[key];
  const error = get('error');
  if (error) {
    const description = get('error_description');
    throw mapOAuthError({
      body: { error, ...(description ? { error_description: description } : {}) },
      locale,
    });
  }
  const code = get('code');
  const state = get('state');
  if (!code || !state) {
    throw new AppError(
      'validation',
      locale === 'tr' ? 'Bağlantı yanıtı eksik.' : 'The connection response is incomplete.',
      {
        details: { missing: [!code ? 'code' : null, !state ? 'state' : null].filter(Boolean) },
      },
    );
  }
  return { code, state };
}
