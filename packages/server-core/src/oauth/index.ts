/**
 * oauth — Google & Microsoft data-source connections: least-privilege scope groups,
 * PKCE authorization URLs, token exchange/refresh/revoke, id-token claim reading and
 * HMAC-signed state tokens.
 */
export type { OAuthKind, OAuthProvider, OAuthScopeGroup, ScopesForInput } from './scopes';
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
} from './scopes';
export type { ProviderEndpoints } from './providers';
export {
  DEFAULT_MICROSOFT_TENANT,
  MICROSOFT_CONSENT_MANAGE_URL,
  MICROSOFT_WORK_CONSENT_MANAGE_URL,
  providerEndpoints,
} from './providers';
export type { AuthorizationUrlParams, OAuthPrompt } from './authorize';
export { buildAuthorizationUrl } from './authorize';
export type { OAuthErrorBody } from './errors';
export { mapOAuthError, parseOAuthErrorBody, providerUnreachableError } from './errors';
export type {
  ExchangeCodeInput,
  OAuthClientConfig,
  OAuthFetch,
  OAuthTokenSet,
  RefreshResult,
  RefreshTokenInput,
  RevokeResult,
  RevokeTokenInput,
} from './tokens';
export {
  TOKEN_EXPIRY_SAFETY_SEC,
  exchangeCode,
  isAccessTokenExpired,
  refreshAccessToken,
  revokeToken,
} from './tokens';
export type { IdTokenClaims } from './idToken';
export { externalAccountIdFrom, isIdTokenExpired, parseIdToken } from './idToken';
export type {
  CreateOAuthStateInput,
  CreatedOAuthState,
  OAuthStatePayload,
  OAuthStateVerification,
} from './state';
export { DEFAULT_OAUTH_STATE_TTL_SEC, createOAuthState, verifyOAuthState } from './state';
export type { OAuthCallbackParams, OAuthStartPlan, OAuthStartPlanInput } from './plan';
export { parseOAuthCallback, planOAuthStart } from './plan';
