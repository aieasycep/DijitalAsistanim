/** Authorization URL construction (Authorization Code + PKCE S256). */
import { providerEndpoints } from './providers';
import { uniqueScopes, type OAuthProvider } from './scopes';

export type OAuthPrompt = 'consent' | 'select_account' | 'login' | 'none';

export interface AuthorizationUrlParams {
  provider: OAuthProvider;
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  state: string;
  codeChallenge: string;
  loginHint?: string | null;
  /**
   * Google: `include_granted_scopes=true` so a scope upgrade keeps everything already granted.
   * Ignored for Microsoft (incremental consent is automatic there).
   */
  includeGrantedScopes?: boolean;
  /**
   * Defaults: Google `consent` (required for a refresh token on re-authorization and when new
   * scopes are requested); Microsoft `select_account` for first connections, `consent` for upgrades.
   */
  prompt?: OAuthPrompt;
  /** True when adding scopes to an existing connection. */
  isScopeUpgrade?: boolean;
  /** Microsoft only. */
  tenant?: string;
}

function assertNonEmpty(value: string, label: string): void {
  if (!value || !value.trim()) throw new Error(`${label} boş olamaz`);
}

export function buildAuthorizationUrl(params: AuthorizationUrlParams): string {
  assertNonEmpty(params.clientId, 'clientId');
  assertNonEmpty(params.redirectUri, 'redirectUri');
  assertNonEmpty(params.state, 'state');
  assertNonEmpty(params.codeChallenge, 'codeChallenge');
  const scopes = uniqueScopes(params.scopes);
  if (scopes.length === 0) throw new Error('En az bir scope gerekli');

  const endpoints = providerEndpoints(params.provider, params.tenant);
  const url = new URL(endpoints.authorization);
  const q = url.searchParams;
  q.set('client_id', params.clientId);
  q.set('redirect_uri', params.redirectUri);
  q.set('response_type', 'code');
  q.set('scope', scopes.join(' '));
  q.set('state', params.state);
  q.set('code_challenge', params.codeChallenge);
  q.set('code_challenge_method', 'S256');
  if (params.loginHint) q.set('login_hint', params.loginHint);

  if (params.provider === 'google') {
    q.set('access_type', 'offline');
    if (params.includeGrantedScopes ?? true) q.set('include_granted_scopes', 'true');
    q.set('prompt', params.prompt ?? 'consent');
  } else {
    q.set('response_mode', 'query');
    const prompt = params.prompt ?? (params.isScopeUpgrade ? 'consent' : 'select_account');
    q.set('prompt', prompt);
  }
  return url.toString();
}
