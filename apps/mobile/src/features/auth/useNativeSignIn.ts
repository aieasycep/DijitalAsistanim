/**
 * Account creation / sign-in for the (auth) screens.
 *  - Apple: native Sign in with Apple (iOS only) with a hashed nonce → `ds.auth.signInWithApple`.
 *  - Google / Microsoft: web OAuth via `ds.auth.getOAuthSignInUrl` + an auth session → `ds.auth.exchangeCodeForSession`.
 *  - Demo mode: every provider signs in through the demo adapter (no native SDK / browser round-trip).
 * The session change itself is picked up by SessionProvider (`onAuthStateChange`), which drives navigation.
 */
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { useToast } from '@da/ui';
import type { AuthSession } from '@da/api-client';
import { useDataSource } from '@/hooks/useDataSource';
import { env, isDemoMode } from '@/lib/env';
import { describeError } from '@/lib/errors';
import { captureError } from '@/lib/monitoring';

export type SignInProvider = 'apple' | 'google' | 'microsoft';

/** Supabase PKCE / OAuth return; `useDeepLinks` also understands this path on Android. */
export const AUTH_CALLBACK_URL = `${env.appScheme}://auth/callback`;

const DEMO_TOKEN = 'demo-identity-token';

function isCancelled(e: unknown): boolean {
  if (typeof e !== 'object' || e === null || !('code' in e)) return false;
  const code = String((e as { code: unknown }).code);
  return code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED';
}

/** Provider order per platform rule: iOS shows Apple first, Android shows Google first (no Apple). */
export function providerOrder(platform: string = Platform.OS): SignInProvider[] {
  return platform === 'ios' ? ['apple', 'google', 'microsoft'] : ['google', 'microsoft'];
}

export function useNativeSignIn() {
  const ds = useDataSource();
  const toast = useToast();
  const { t } = useTranslation();
  const [pending, setPending] = useState<SignInProvider | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(Platform.OS === 'ios');

  useEffect(() => {
    if (Platform.OS !== 'ios' || isDemoMode) return;
    let cancelled = false;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => {
        if (!cancelled) setAppleAvailable(ok);
      })
      .catch(() => {
        if (!cancelled) setAppleAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signInWithApple = useCallback(async (): Promise<AuthSession> => {
    if (isDemoMode) return ds.auth.signInWithApple({ identityToken: DEMO_TOKEN, nonce: 'demo' });
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) throw new Error('apple_identity_token_missing');
    const fullName = credential.fullName
      ? AppleAuthentication.formatFullName(credential.fullName).trim()
      : '';
    return ds.auth.signInWithApple({
      identityToken: credential.identityToken,
      nonce: rawNonce,
      fullName: fullName.length > 0 ? fullName : null,
    });
  }, [ds]);

  const signInWithWebProvider = useCallback(
    async (provider: 'google' | 'microsoft'): Promise<AuthSession | null> => {
      const authProvider = provider === 'google' ? 'google' : 'azure';
      if (isDemoMode)
        return ds.auth.signInWithIdToken({ provider: authProvider, idToken: DEMO_TOKEN });
      const url = await ds.auth.getOAuthSignInUrl({
        provider: authProvider,
        redirectTo: AUTH_CALLBACK_URL,
      });
      const result = await WebBrowser.openAuthSessionAsync(url, AUTH_CALLBACK_URL);
      if (result.type !== 'success') return null;
      return ds.auth.exchangeCodeForSession(result.url);
    },
    [ds],
  );

  /** Runs the provider flow; returns the session, or null when the user backed out. Errors surface as a toast. */
  const signIn = useCallback(
    async (provider: SignInProvider): Promise<AuthSession | null> => {
      if (pending) return null;
      if (provider === 'apple' && !appleAvailable) {
        toast.show({
          message: t('onboarding.auth.appleUnavailable'),
          icon: 'warning',
          iconTone: 'critical',
        });
        return null;
      }
      setPending(provider);
      try {
        return provider === 'apple'
          ? await signInWithApple()
          : await signInWithWebProvider(provider);
      } catch (e) {
        if (isCancelled(e)) return null;
        captureError(e, { where: 'useNativeSignIn', provider });
        toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' });
        return null;
      } finally {
        setPending(null);
      }
    },
    [pending, appleAvailable, signInWithApple, signInWithWebProvider, toast, t],
  );

  return { signIn, pending, appleAvailable, providers: providerOrder() };
}
