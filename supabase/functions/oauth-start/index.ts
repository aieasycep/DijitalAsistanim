/**
 * POST /oauth-start — begin a Google/Microsoft data-source connection (or a progressive scope upgrade).
 * Returns the provider authorization URL; the PKCE verifier is stored encrypted under the state nonce.
 */
import { oauthStartRequestSchema } from '@da/validation';
import { AppError } from '@da/server-core/errors';
import { planOAuthStart, scopeGroupFor } from '@da/server-core/oauth';
import {
  assertMethod,
  audit,
  enforceRateLimit,
  getEnv,
  handler,
  hasOAuthClient,
  json,
  parseInput,
  requireUser,
} from '../_shared/mod.ts';
import {
  getCipher,
  oauthStateSecret,
  providerClientConfig,
  redirectUriFor,
} from '../_shared/credentials.ts';

function assertRedirectAllowed(redirectTo: string): void {
  const env = getEnv();
  const ok =
    redirectTo.startsWith(`${env.appScheme}://`) ||
    redirectTo.startsWith(`${env.webUrl.replace(/\/$/, '')}/app/`) ||
    /^exp(o)?:\/\//.test(redirectTo);
  if (!ok) throw new AppError('validation', 'Geçersiz yönlendirme adresi.');
}

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user, db } = await requireUser(req);
    const input = await parseInput(req, oauthStartRequestSchema);
    assertRedirectAllowed(input.redirectTo);
    await enforceRateLimit('oauth_start', user.id);

    if (!hasOAuthClient(input.provider)) {
      throw new AppError(
        'provider_unavailable',
        `${input.provider === 'google' ? 'Google' : 'Microsoft'} bağlantısı bu ortamda yapılandırılmamış.`,
        {
          status: 503,
        },
      );
    }
    const client = providerClientConfig(input.provider);

    let existingGrantedScopes: string[] = [];
    let existingGroups: ('mail_send' | 'calendar_write' | 'tasks_write')[] = [];
    let loginHint: string | null = null;
    if (input.accountId) {
      const { data: account, error } = await db
        .from('connected_accounts')
        .select('id, email, granted_scopes, provider')
        .eq('id', input.accountId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error || !account) throw new AppError('not_found', 'Hesap bulunamadı.');
      const row = account as { email: string | null; granted_scopes: string[]; provider: string };
      if (row.provider !== input.provider)
        throw new AppError('validation', 'Hesap sağlayıcısı uyuşmuyor.');
      existingGrantedScopes = row.granted_scopes ?? [];
      loginHint = row.email;
      existingGroups = (['email_send', 'calendar_create', 'task_create'] as const)
        .map((t) => scopeGroupFor(t))
        .filter((g): g is 'mail_send' | 'calendar_write' | 'tasks_write' => g !== null)
        .filter((g) =>
          existingGrantedScopes.some(
            (s) =>
              s
                .toLowerCase()
                .includes(
                  g === 'mail_send' ? 'send' : g === 'calendar_write' ? 'calendar' : 'tasks',
                ) &&
              !s.toLowerCase().includes('readonly') &&
              !s.toLowerCase().endsWith('.read'),
          ),
        );
    }

    const plan = await planOAuthStart({
      request: input,
      userId: user.id,
      clientId: client.clientId,
      redirectUri: redirectUriFor(input.provider),
      stateSecret: await oauthStateSecret(),
      existingGrantedScopes,
      existingGroups,
      loginHint,
      tenant: client.tenant,
      prompt: input.scopeGroup && input.scopeGroup !== 'read' ? 'consent' : undefined,
    });

    const { error: insErr } = await db.from('oauth_states').insert({
      state: plan.nonce,
      user_id: user.id,
      provider: input.provider,
      kinds: input.kinds,
      scope_group: input.scopeGroup ?? 'read',
      account_id: input.accountId ?? null,
      code_verifier_enc: await getCipher().encrypt(plan.codeVerifier, { aad: user.id }),
      redirect_to: input.redirectTo,
      expires_at: plan.expiresAt,
    });
    if (insErr) throw new AppError('internal', `OAuth durumu kaydedilemedi: ${insErr.message}`);

    await audit(db, {
      userId: user.id,
      action: input.accountId ? 'oauth.scope_upgrade' : 'oauth.connect',
      actor: 'user',
      targetType: 'oauth_state',
      targetId: plan.nonce,
      metadata: {
        provider: input.provider,
        kinds: input.kinds.join(','),
        scopeGroup: input.scopeGroup ?? 'read',
        newScopes: plan.newScopes.length,
      },
    });

    return json({ authorizationUrl: plan.authorizationUrl, state: plan.state });
  }),
);
