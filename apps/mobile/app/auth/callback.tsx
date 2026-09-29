import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorState, Screen, ScreenHeader, Text, useTheme } from '@da/ui';
import { completeAuthCallback } from '@/features/auth/authCallback';
import { AUTH_CALLBACK_URL } from '@/features/auth/useNativeSignIn';
import { useDataSource } from '@/hooks/useDataSource';
import { captureError } from '@/lib/monitoring';

type CallbackParams = {
  code?: string;
  provider?: string;
  error?: string;
  error_description?: string;
};

const CALLBACK_KEYS = ['code', 'provider', 'error', 'error_description'] as const;

/** Rebuilds the return URL from the params expo-router parsed, so the shared exchange sees the same code. */
export function callbackUrlFromParams(params: CallbackParams): string {
  const parts: string[] = [];
  for (const key of CALLBACK_KEYS) {
    const value = params[key];
    if (typeof value === 'string' && value.length > 0)
      parts.push(`${key}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `${AUTH_CALLBACK_URL}?${parts.join('&')}` : AUTH_CALLBACK_URL;
}

/**
 * Supabase PKCE return on Android (`dijitalasistan://auth/callback?code=…`). expo-router opens this screen for the
 * URL while the auth session that started the sign-in (and the deep-link handler) receive the same URL; the
 * exchange itself is shared through `completeAuthCallback`, so this screen shows progress and, when the exchange
 * fails, the way back to sign-in. Once the session exists the root layout redirects (the `auth` segment counts as
 * the sign-in flow), exactly as after an e-mail code sign-in.
 */
export default function AuthCallbackScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ds = useDataSource();
  const params = useLocalSearchParams<CallbackParams>();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const backToSignIn = useCallback(() => router.replace('/(auth)/sign-in'), [router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeAuthCallback(ds, callbackUrlFromParams(params)).catch((e: unknown) => {
      captureError(e, { where: 'AuthCallbackScreen' });
      setFailed(true);
    });
  }, [ds, params]);

  return (
    <Screen
      topGap={6}
      testID="auth-callback-screen"
      header={
        <ScreenHeader
          variant="sub"
          title={t('onboarding.auth.callbackTitle')}
          onBack={backToSignIn}
          backLabel={t('common.back')}
        />
      }
    >
      <View
        style={styles.body}
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          failed ? t('onboarding.auth.callbackFailed') : t('onboarding.auth.callbackWorking')
        }
        testID="auth-callback-status"
      >
        {failed ? (
          <ErrorState
            variant="full"
            title={t('onboarding.auth.callbackFailed')}
            message={t('onboarding.auth.callbackFailedBody')}
            retryLabel={t('onboarding.auth.backToSignIn')}
            onRetry={backToSignIn}
            testID="auth-callback-error"
          />
        ) : (
          <View style={styles.center} testID="auth-callback-working">
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text variant="secondary" tone="secondary" align="center" style={styles.text}>
              {t('onboarding.auth.callbackWorking')}
            </Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center' },
  center: { alignItems: 'center', gap: 6, paddingHorizontal: 24 },
  text: { marginTop: 8 },
});
