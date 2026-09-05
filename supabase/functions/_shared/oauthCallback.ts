/**
 * Shared OAuth callback handling for Google and Microsoft: verify state, exchange code, persist encrypted
 * credentials, upsert the connected account + sync states, then redirect back into the app.
 */
import { AppError, toAppError } from '@da/server-core/errors';
import {
  externalAccountIdFrom,
  parseIdToken,
  parseOAuthCallback,
  verifyOAuthState,
  type OAuthProvider,
} from '@da/server-core/oauth';
import { audit } from './audit.ts';
import {
  getCipher,
  exchangeAuthorizationCode,
  oauthStateSecret,
  storeCredentials,
} from './credentials.ts';
import { adminClient, type Db } from './db.ts';
import { getEnv } from './env.ts';
import { log } from './log.ts';

interface StateRow {
  state: string;
  user_id: string;
  provider: string;
  kinds: string[];
  scope_group: string;
  account_id: string | null;
  code_verifier_enc: string;
  redirect_to: string;
  expires_at: string;
  consumed_at: string | null;
}

function redirect(to: string, params: Record<string, string>): Response {
  const url = new URL(to.includes('://') ? to : `${getEnv().appScheme}://${to.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString(), 'Cache-Control': 'no-store' },
  });
}

function fallbackRedirect(provider: OAuthProvider): string {
  return `${getEnv().appScheme}://oauth/${provider}`;
}

async function profileFromProvider(
  provider: OAuthProvider,
  accessToken: string,
): Promise<{ email: string | null; sub: string | null; name: string | null }> {
  try {
    const url =
      provider === 'google'
        ? 'https://openidconnect.googleapis.com/v1/userinfo'
        : 'https://graph.microsoft.com/v1.0/me';
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return { email: null, sub: null, name: null };
    const body = (await res.json()) as Record<string, unknown>;
    if (provider === 'google') {
      return {
        email: (body.email as string) ?? null,
        sub: (body.sub as string) ?? null,
        name: (body.name as string) ?? null,
      };
    }
    return {
      email: (body.mail as string) ?? (body.userPrincipalName as string) ?? null,
      sub: (body.id as string) ?? null,
      name: (body.displayName as string) ?? null,
    };
  } catch {
    return { email: null, sub: null, name: null };
  }
}

export async function handleOAuthCallback(
  req: Request,
  provider: OAuthProvider,
): Promise<Response> {
  const db: Db = adminClient();
  const query = new URL(req.url).searchParams;
  const stateParam = query.get('state') ?? '';
  let redirectTo = fallbackRedirect(provider);
  let stateRow: StateRow | null = null;

  try {
    const verification = await verifyOAuthState({
      secret: await oauthStateSecret(),
      state: stateParam,
    });
    if (!verification.ok)
      throw new AppError('validation', 'Bağlantı isteği doğrulanamadı.', {
        details: { reason: verification.reason },
      });
    const payload = verification.payload;
    if (payload.provider !== provider) throw new AppError('validation', 'Sağlayıcı uyuşmuyor.');

    const { data, error } = await db
      .from('oauth_states')
      .select('*')
      .eq('state', payload.nonce)
      .maybeSingle();
    if (error || !data)
      throw new AppError('validation', 'Bağlantı isteği bulunamadı veya süresi doldu.');
    stateRow = data as StateRow;
    redirectTo = stateRow.redirect_to || redirectTo;
    if (stateRow.consumed_at)
      throw new AppError('validation', 'Bu bağlantı isteği zaten kullanıldı.');
    if (Date.parse(stateRow.expires_at) < Date.now())
      throw new AppError('validation', 'Bağlantı isteğinin süresi doldu.');
    if (stateRow.user_id !== payload.userId)
      throw new AppError('forbidden', 'Bağlantı isteği başka bir kullanıcıya ait.');

    const { code } = parseOAuthCallback(query);
    await db
      .from('oauth_states')
      .update({ consumed_at: new Date().toISOString() })
      .eq('state', payload.nonce);

    const codeVerifier = await getCipher().decrypt(stateRow.code_verifier_enc, {
      aad: stateRow.user_id,
    });
    const tokens = await exchangeAuthorizationCode(provider, code, codeVerifier);

    const claims = tokens.idToken ? parseIdToken(tokens.idToken) : null;
    let email = claims?.email ?? null;
    let externalId = claims ? externalAccountIdFrom(claims) : null;
    let displayName = claims?.name ?? null;
    if (!email || !externalId) {
      const p = await profileFromProvider(provider, tokens.accessToken);
      email = email ?? p.email;
      externalId = externalId ?? p.sub ?? email;
      displayName = displayName ?? p.name;
    }
    if (!externalId) throw new AppError('provider_unavailable', 'Hesap kimliği alınamadı.');

    const kinds = stateRow.kinds;
    const label = provider === 'google' ? 'Gmail' : 'Outlook';
    let accountId = stateRow.account_id;

    if (accountId) {
      // scope upgrade on an existing account
      const { data: existing } = await db
        .from('connected_accounts')
        .select('id, granted_scopes')
        .eq('id', accountId)
        .eq('user_id', stateRow.user_id)
        .maybeSingle();
      if (!existing) throw new AppError('not_found', 'Hesap bulunamadı.');
      const merged = Array.from(
        new Set([
          ...((existing as { granted_scopes: string[] }).granted_scopes ?? []),
          ...tokens.scope,
        ]),
      );
      await db
        .from('connected_accounts')
        .update({ granted_scopes: merged, status: 'active', last_error: null, deleted_at: null })
        .eq('id', accountId);
      await storeCredentials(db, {
        accountId,
        userId: stateRow.user_id,
        provider,
        tokens,
        keepExistingRefreshToken: true,
      });
    } else {
      const { data: upserted, error: upErr } = await db
        .from('connected_accounts')
        .upsert(
          {
            user_id: stateRow.user_id,
            provider,
            kinds,
            external_account_id: externalId,
            display_name: email ? `${label} · ${email}` : label,
            email,
            status: 'syncing',
            granted_scopes: tokens.scope,
            deleted_at: null,
            last_error: null,
          },
          { onConflict: 'user_id,provider,external_account_id' },
        )
        .select('id')
        .single();
      if (upErr || !upserted)
        throw new AppError('internal', `Hesap kaydedilemedi: ${upErr?.message ?? 'bilinmeyen'}`);
      accountId = (upserted as { id: string }).id;
      await storeCredentials(db, { accountId, userId: stateRow.user_id, provider, tokens });

      const resources = kinds.map((k) =>
        k === 'email' ? 'mail' : k === 'calendar' ? 'calendar' : 'tasks',
      );
      for (const resource of resources) {
        await db.from('sync_states').upsert(
          {
            user_id: stateRow.user_id,
            account_id: accountId,
            resource,
            mode: 'polling',
            backfill_until: new Date(Date.now() - 90 * 86_400_000).toISOString(),
          },
          { onConflict: 'account_id,resource' },
        );
      }
      const { count } = await db
        .from('connected_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', stateRow.user_id)
        .is('deleted_at', null);
      if ((count ?? 0) <= 1)
        await db.from('connected_accounts').update({ is_primary: true }).eq('id', accountId);
    }

    await audit(db, {
      userId: stateRow.user_id,
      action: stateRow.account_id ? 'oauth.scope_upgrade' : 'oauth.connect',
      actor: 'user',
      targetType: 'connected_account',
      targetId: accountId,
      metadata: {
        provider,
        kinds: kinds.join(','),
        scopes: tokens.scope.length,
        displayName: displayName ? 'set' : 'unset',
      },
    });

    return redirect(redirectTo, { state: stateParam, status: 'ok', accountId });
  } catch (e) {
    const err = toAppError(e);
    log.warn('oauth callback failed', { provider, code: err.code, message: err.message });
    if (stateRow?.account_id === null && err.code !== 'validation') {
      // leave account untouched; nothing was created
    }
    return redirect(redirectTo, { state: stateParam, status: 'error', error: err.code });
  }
}
