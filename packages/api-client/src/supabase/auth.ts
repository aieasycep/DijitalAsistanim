/** AuthApi on Supabase Auth: native id-token sign-in, PKCE web OAuth, e-mail OTP. */
import type {
  AuthSession as SupabaseSession,
  AuthUser as SupabaseUser,
} from '@supabase/supabase-js';
import type { AuthApi, AuthSession, AuthUser } from '../datasource';
import { ClientApiError } from '../errors';
import { exec, toClientError, write, type SupabaseContext } from './client';
import type { ProfileRow } from './rows';
import { parseQueryParams } from './url';

export function toAuthUser(user: SupabaseUser): AuthUser {
  const meta: Record<string, unknown> = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? null,
    displayName: readString(meta, 'full_name') ?? readString(meta, 'name') ?? null,
    avatarUrl: readString(meta, 'avatar_url') ?? readString(meta, 'picture') ?? null,
    provider: mapProvider(user.app_metadata?.provider),
  };
}

export function toAuthSession(session: SupabaseSession): AuthSession {
  const expiresAt = session.expires_at
    ? new Date(session.expires_at * 1000)
    : new Date(Date.now() + session.expires_in * 1000);
  return {
    user: toAuthUser(session.user),
    accessToken: session.access_token,
    expiresAt: expiresAt.toISOString(),
  };
}

function mapProvider(provider: string | undefined): AuthUser['provider'] {
  switch (provider) {
    case 'apple':
      return 'apple';
    case 'google':
      return 'google';
    case 'azure':
      return 'microsoft';
    default:
      return 'email';
  }
}

function readString(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function requireSession(session: SupabaseSession | null): SupabaseSession {
  if (!session)
    throw new ClientApiError({
      code: 'unauthorized',
      message: 'Oturum açılamadı. Lütfen tekrar dene.',
    });
  return session;
}

/**
 * Apple only sends the user's name on the very first authorization and never inside the identity token, so the
 * profile row created by the auth trigger has an empty name. Store it once — best effort, never fails sign-in.
 */
async function backfillDisplayName(
  ctx: SupabaseContext,
  userId: string,
  fullName: string,
): Promise<void> {
  const firstName = fullName.split(/\s+/)[0] ?? fullName;
  try {
    await ctx.client.auth.updateUser({ data: { full_name: fullName } });
    await exec(
      ctx
        .table<ProfileRow>('profiles')
        .update({ display_name: fullName, first_name: firstName })
        .eq('id', userId)
        .eq('display_name', ''),
    );
  } catch {
    // The sign-in itself succeeded; the name can be edited later in settings.
  }
}

export function createAuthApi(ctx: SupabaseContext): AuthApi {
  const auth = ctx.client.auth;

  return {
    async getSession() {
      const { data, error } = await auth.getSession();
      if (error) throw toClientError(error);
      return data.session ? toAuthSession(data.session) : null;
    },

    onAuthStateChange(cb) {
      const { data } = auth.onAuthStateChange((_event, session) => {
        cb(session ? toAuthSession(session) : null);
      });
      return () => data.subscription.unsubscribe();
    },

    async signInWithApple(input) {
      const session = await write(async () => {
        const { data, error } = await auth.signInWithIdToken({
          provider: 'apple',
          token: input.identityToken,
          nonce: input.nonce,
        });
        if (error) throw error;
        return requireSession(data.session);
      });
      const fullName = input.fullName?.trim();
      if (fullName) await backfillDisplayName(ctx, session.user.id, fullName);
      return toAuthSession(session);
    },

    async signInWithIdToken(input) {
      const session = await write(async () => {
        const { data, error } = await auth.signInWithIdToken({
          provider: input.provider,
          token: input.idToken,
          access_token: input.accessToken,
          nonce: input.nonce,
        });
        if (error) throw error;
        return requireSession(data.session);
      });
      return toAuthSession(session);
    },

    async getOAuthSignInUrl(input) {
      return write(async () => {
        const { data, error } = await auth.signInWithOAuth({
          provider: input.provider,
          options: {
            redirectTo: input.redirectTo,
            skipBrowserRedirect: true,
            scopes: input.provider === 'azure' ? 'openid email profile' : undefined,
          },
        });
        if (error) throw error;
        if (!data.url)
          throw new ClientApiError({
            code: 'provider_unavailable',
            message: 'Giriş bağlantısı oluşturulamadı.',
          });
        return data.url;
      });
    },

    async exchangeCodeForSession(url) {
      const params = parseQueryParams(url);
      if (params.error) {
        throw new ClientApiError({
          code: 'unauthorized',
          message: params.error_description ?? 'Giriş tamamlanamadı.',
          details: { providerError: params.error },
        });
      }
      const code = params.code;
      if (!code)
        throw new ClientApiError({
          code: 'validation',
          message: 'Geri dönüş bağlantısında yetkilendirme kodu yok.',
        });
      const session = await write(async () => {
        const { data, error } = await auth.exchangeCodeForSession(code);
        if (error) throw error;
        return requireSession(data.session);
      });
      return toAuthSession(session);
    },

    async signInWithEmailOtp(email) {
      await write(async () => {
        const { error } = await auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: { shouldCreateUser: true },
        });
        if (error) throw error;
      });
    },

    async verifyEmailOtp(input) {
      const session = await write(async () => {
        const { data, error } = await auth.verifyOtp({
          email: input.email.trim().toLowerCase(),
          token: input.token.trim(),
          type: 'email',
        });
        if (error) throw error;
        return requireSession(data.session);
      });
      return toAuthSession(session);
    },

    async signOut() {
      await write(async () => {
        const { error } = await auth.signOut({ scope: 'local' });
        if (error) throw error;
      });
    },
  };
}
