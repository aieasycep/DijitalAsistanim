/**
 * oauth — Google & Microsoft data-source connections: least-privilege scope groups,
 * PKCE authorization URLs, token exchange/refresh/revoke, id-token claim reading and
 * HMAC-signed state tokens.
 */
export type { OAuthKind, OAuthProvider, OAuthScopeGroup, ScopesForInput } from './scopes.ts';
export {
  GOOGLE_SCOPES,
  MICROSOFT_SCOPES,
  OAUTH_KINDS,
  OAUTH_PROVIDERS,
  OAUTH_SCOPE_GROUPS,
  missingScopes,
  normalizeScope,
  parseScopeString,
  readScopesFor,
  requiredScopeFor,
  scopeGroupFor,
  scopeSatisfies,
  scopesFor,
  uniqueScopes,
  writeScopeFor,
} from './scopes.ts';
export type { ProviderEndpoints } from './providers.ts';
export {
  DEFAULT_MICROSOFT_TENANT,
  MICROSOFT_CONSENT_MANAGE_URL,
  MICROSOFT_WORK_CONSENT_MANAGE_URL,
  providerEndpoints,
} from './providers.ts';
export type { AuthorizationUrlParams, OAuthPrompt } from './authorize.ts';
export { buildAuthorizationUrl } from './authorize.ts';
export type { OAuthErrorBody } from './errors.ts';
export { mapOAuthError, parseOAuthErrorBody, providerUnreachableError } from './errors.ts';
export type {
  ExchangeCodeInput,
  OAuthClientConfig,
  OAuthFetch,
  OAuthTokenSet,
  RefreshResult,
  RefreshTokenInput,
  RevokeResult,
  RevokeTokenInput,
} from './tokens.ts';
export {
  TOKEN_EXPIRY_SAFETY_SEC,
  exchangeCode,
  isAccessTokenExpired,
  refreshAccessToken,
  revokeToken,
} from './tokens.ts';
export type { IdTokenClaims } from './idToken.ts';
export { externalAccountIdFrom, isIdTokenExpired, parseIdToken } from './idToken.ts';
export type {
  CreateOAuthStateInput,
  CreatedOAuthState,
  OAuthStatePayload,
  OAuthStateVerification,
} from './state.ts';
export { DEFAULT_OAUTH_STATE_TTL_SEC, createOAuthState, verifyOAuthState } from './state.ts';
export type { OAuthCallbackParams, OAuthStartPlan, OAuthStartPlanInput } from './plan.ts';
export { parseOAuthCallback, planOAuthStart } from './plan.ts';
