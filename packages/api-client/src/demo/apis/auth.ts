import type { AuthApi, AuthSession, AuthUser } from '../../datasource';
import { ClientApiError } from '../../errors';
import type { DemoContext } from '../context';
import { SESSION_STORAGE_KEY } from '../state';

const SESSION_TTL_DAYS = 7;
const PROVIDERS: AuthUser['provider'][] = ['apple', 'google', 'microsoft', 'email', 'demo'];

export interface DemoAuthApi extends AuthApi {
  /** Signs out without emitting a user-facing error (used by deleteAccount / clearLocalState). */
  clearSession(): Promise<void>;
}

export function createAuthApi(ctx: DemoContext): DemoAuthApi {
  const storage = ctx.config.secureStorage ?? ctx.config.storage;
  let provider: AuthUser['provider'] | null = null;
  let pendingOtpEmail: string | null = null;

  const ready: Promise<void> = (async () => {
    if (!storage) return;
    try {
      const raw = await storage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && 'provider' in parsed) {
        const p = (parsed as { provider: unknown }).provider;
        if (typeof p === 'string' && (PROVIDERS as string[]).includes(p))
          provider = p as AuthUser['provider'];
      }
    } catch {
      // Corrupt session flag → treat as signed out.
    }
  })();

  const persist = async (): Promise<void> => {
    if (!storage) return;
    try {
      if (provider)
        await storage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({ provider, signedInAt: ctx.nowIso() }),
        );
      else await storage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Best effort.
    }
  };

  const buildSession = (): AuthSession | null => {
    if (!provider) return null;
    const profile = ctx.store.state.profile;
    return {
      user: {
        id: ctx.userId,
        email: profile.email ?? null,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? null,
        provider,
      },
      accessToken: `demo-${provider}-access-token`,
      expiresAt: ctx.clock.addMinutes(ctx.clock.now(), SESSION_TTL_DAYS * 24 * 60),
    };
  };

  const signIn = async (p: AuthUser['provider']): Promise<AuthSession> => {
    await ready;
    await ctx.store.ready;
    provider = p;
    await persist();
    const session = buildSession();
    if (!session) throw new ClientApiError({ code: 'internal', message: 'Oturum oluşturulamadı.' });
    ctx.authChanged.emit(session);
    return session;
  };

  const clearSession = async (): Promise<void> => {
    await ready;
    const wasSignedIn = provider !== null;
    provider = null;
    await persist();
    if (wasSignedIn) ctx.authChanged.emit(null);
  };

  return {
    clearSession,
    getSession: async () => {
      await ready;
      await ctx.store.ready;
      return buildSession();
    },
    onAuthStateChange: (cb) => ctx.authChanged.on(cb),
    signInWithApple: (input) =>
      ctx.run(async () => {
        if (!input.identityToken)
          throw new ClientApiError({ code: 'validation', message: 'identityToken gerekli.' });
        return signIn('apple');
      }),
    signInWithIdToken: (input) =>
      ctx.run(async () => {
        if (!input.idToken)
          throw new ClientApiError({ code: 'validation', message: 'idToken gerekli.' });
        return signIn(input.provider === 'azure' ? 'microsoft' : 'google');
      }),
    getOAuthSignInUrl: (input) =>
      ctx.run(() => {
        const separator = input.redirectTo.includes('?') ? '&' : '?';
        return `${input.redirectTo}${separator}provider=${input.provider}&code=demo-${input.provider}-${ctx.latency.token(6)}`;
      }),
    exchangeCodeForSession: (url) =>
      ctx.run(async () => {
        const match = url.match(/[?&#]provider=(google|azure)/);
        const p = match?.[1] === 'azure' ? 'microsoft' : 'google';
        if (!/[?&#]code=/.test(url))
          throw new ClientApiError({ code: 'validation', message: 'Geçersiz oturum bağlantısı.' });
        return signIn(p);
      }),
    signInWithEmailOtp: (email) =>
      ctx.run(() => {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
          throw new ClientApiError({ code: 'validation', message: 'Geçerli bir e-posta gir.' });
        pendingOtpEmail = email.trim().toLowerCase();
      }),
    verifyEmailOtp: (input) =>
      ctx.run(async () => {
        const email = input.email.trim().toLowerCase();
        if (pendingOtpEmail && pendingOtpEmail !== email)
          throw new ClientApiError({
            code: 'validation',
            message: 'Kod bu e-posta için gönderilmedi.',
          });
        if (!/^\d{6}$/.test(input.token.trim()))
          throw new ClientApiError({ code: 'validation', message: 'Kod 6 haneli olmalı.' });
        pendingOtpEmail = null;
        return signIn('email');
      }),
    signOut: () => ctx.run(clearSession),
  };
}
