import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { ConnectedAccount } from '@da/domain';
import { Button, ErrorState, Icon, Screen, ScreenHeader, Text, useTheme, useToast } from '@da/ui';
import { isAccountActive } from '@/features/onboarding/useOAuthConnect';
import { useDataSource } from '@/hooks/useDataSource';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/monitoring';
import { useSessionStore } from '@/store/session';

type Phase = 'working' | 'done' | 'error';
type AnalyticsProvider = 'google' | 'microsoft' | 'apple' | 'device';
type AnalyticsKind = 'email' | 'calendar' | 'tasks';

const DONE_DELAY_MS = 700;

/**
 * OAuth return (`/oauth/[provider]?state&status&accountId&error`): completes the connection and goes
 * back to Integrations (or the onboarding connect step). The deep-link handler may already have consumed
 * the callback — in that case the fresh account list confirms the connection instead of failing.
 */
export default function OAuthReturnScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ds = useDataSource();
  const toast = useToast();
  const queryClient = useQueryClient();
  const onboardingCompleted = useSessionStore((s) => s.onboardingCompleted);
  const params = useLocalSearchParams<{
    provider?: string;
    state?: string;
    status?: string;
    accountId?: string;
    error?: string;
  }>();
  const [phase, setPhase] = useState<Phase>('working');
  const [account, setAccount] = useState<ConnectedAccount | null>(null);
  const started = useRef(false);

  const destination: Href = onboardingCompleted
    ? '/settings/integrations'
    : '/(onboarding)/connect';
  const providerLabel =
    params.provider === 'google' || params.provider === 'microsoft'
      ? t(`oauth.providers.${params.provider}`)
      : (params.provider ?? '');

  const leave = useCallback(() => router.replace(destination), [destination, router]);

  const complete = useCallback(async () => {
    setPhase('working');
    const outcome: 'ok' | 'error' = params.status === 'error' ? 'error' : 'ok';
    try {
      let connected: ConnectedAccount | null = null;
      let tracked = false;
      try {
        connected = await ds.accounts.completeOAuth({
          state: params.state ?? '',
          status: outcome,
          accountId: params.accountId,
          error: params.error,
        });
        tracked = connected !== null;
      } catch (e) {
        const fresh = params.accountId
          ? (await ds.accounts.listAccounts()).find(
              (a) => a.id === params.accountId && isAccountActive(a),
            )
          : undefined;
        if (!fresh) throw e;
        connected = fresh;
      }
      await queryClient.invalidateQueries({ queryKey: qk.accounts });
      if (outcome === 'ok' && connected) {
        setAccount(connected);
        setPhase('done');
        toast.show({ message: t('oauth.done'), icon: 'check', iconTone: 'success' });
        if (tracked) {
          const provider: AnalyticsProvider =
            connected.provider === 'demo' ? 'google' : connected.provider;
          const kind =
            connected.kinds.find(
              (k): k is AnalyticsKind => k === 'email' || k === 'calendar' || k === 'tasks',
            ) ?? 'email';
          track('account_connected', { provider, kind });
          if (kind === 'calendar') track('calendar_connected', { provider });
        }
        setTimeout(leave, DONE_DELAY_MS);
        return;
      }
      toast.show({ message: t('errors.oauthCancelled'), icon: 'warning', iconTone: 'critical' });
      leave();
    } catch (e) {
      captureError(e, { where: 'OAuthReturnScreen', provider: params.provider ?? 'unknown' });
      setPhase('error');
    }
  }, [ds, leave, params, queryClient, t, toast]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void complete();
  }, [complete]);

  return (
    <Screen
      topGap={6}
      testID="oauth-screen"
      header={
        <ScreenHeader
          variant="sub"
          kicker={providerLabel}
          title={t('oauth.title')}
          onBack={leave}
          backLabel={t('common.back')}
        />
      }
    >
      <View
        style={styles.body}
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          phase === 'working'
            ? t('oauth.completing')
            : phase === 'done'
              ? t('oauth.done')
              : t('errors.oauthFailed')
        }
        testID="oauth-status"
      >
        {phase === 'working' ? (
          <View style={styles.center} testID="oauth-working">
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text variant="secondary" tone="secondary" align="center" style={styles.text}>
              {t('oauth.completing')}
            </Text>
          </View>
        ) : phase === 'done' ? (
          <View style={styles.center} testID="oauth-done">
            <View style={[styles.tile, { backgroundColor: theme.colors.successSoft }]}>
              <Icon name="complete" size={28} color={theme.colors.successText} filled />
            </View>
            <Text variant="h3" align="center" style={styles.text}>
              {t('oauth.done')}
            </Text>
            {account ? (
              <Text variant="secondary" tone="secondary" align="center">
                {account.displayName}
              </Text>
            ) : null}
            <Button
              label={t('oauth.backToIntegrations')}
              variant="ghost"
              size="sm"
              onPress={leave}
              style={styles.text}
              testID="oauth-continue"
            />
          </View>
        ) : (
          <ErrorState
            variant="full"
            title={t('errors.oauthFailed')}
            message={t('errors.oauthFailedBody')}
            retryLabel={t('common.retry')}
            onRetry={() => void complete()}
            secondaryLabel={t('oauth.backToIntegrations')}
            onSecondary={leave}
            testID="oauth-error"
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center' },
  center: { alignItems: 'center', gap: 6, paddingHorizontal: 24 },
  tile: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  text: { marginTop: 8 },
});
