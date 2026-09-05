import { useCallback, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { ConnectedAccount } from '@da/domain';
import {
  Button,
  Icon,
  OfflineBanner,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
  useToast,
} from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { isDemoMode } from '@/lib/env';
import { describeError } from '@/lib/errors';
import { useUiStore } from '@/store/ui';
import { ProviderCard, type ProviderCardKey } from '@/features/onboarding/ProviderCard';
import {
  isDeviceCalendarAccount,
  useDeviceCalendar,
} from '@/features/onboarding/useDeviceCalendar';
import {
  isAccountActive,
  matchesTarget,
  useOAuthConnect,
  type OAuthTarget,
} from '@/features/onboarding/useOAuthConnect';

interface CardSpec {
  key: ProviderCardKey;
  testID: string;
  /** OAuth target; absent for the device calendar (EventKit / Android provider). */
  target?: OAuthTarget;
}

const DEVICE_CARD: CardSpec =
  Platform.OS === 'ios'
    ? { key: 'apple_calendar', testID: 'connect-card-apple' }
    : { key: 'device_calendar', testID: 'connect-card-device' };

const CARDS: CardSpec[] = [
  { key: 'gmail', testID: 'connect-card-google', target: 'gmail' },
  { key: 'outlook', testID: 'connect-card-microsoft', target: 'outlook' },
  { key: 'google_calendar', testID: 'connect-card-google-calendar', target: 'google_calendar' },
  {
    key: 'microsoft_calendar',
    testID: 'connect-card-microsoft-calendar',
    target: 'microsoft_calendar',
  },
  DEVICE_CARD,
];

function accountFor(accounts: ConnectedAccount[], spec: CardSpec): ConnectedAccount | undefined {
  if (spec.target) {
    const target = spec.target;
    return accounts.find((a) => matchesTarget(a, target));
  }
  return accounts.find(isDeviceCalendarAccount);
}

/**
 * "Dijital hayatını bağla." — at least one mail + one calendar account unlocks Continue. Tapping a card opens the
 * permission explainer before the provider's own consent screen; in demo mode there is no consent screen, so the
 * card connects the sample account directly.
 */
export default function ConnectScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const ds = useDataSource();
  const toast = useToast();
  const offline = useUiStore((s) => s.offline);
  const { connect, connecting } = useOAuthConnect();
  const device = useDeviceCalendar();
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const accountsQuery = useQuery({
    queryKey: qk.accounts,
    queryFn: () => ds.accounts.listAccounts(),
  });
  const refetchAccounts = accountsQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchAccounts();
    }, [refetchAccounts]),
  );

  const accounts = useMemo(
    () => (accountsQuery.data ?? []).filter(isAccountActive),
    [accountsQuery.data],
  );
  const hasMail = accounts.some((a) => a.kinds.includes('email'));
  const hasCalendar = accounts.some((a) => a.kinds.includes('calendar'));
  const hasDevice = accounts.some(isDeviceCalendarAccount);
  const canContinue = hasMail && hasCalendar;

  const onCard = useCallback(
    async (spec: CardSpec) => {
      if (offline) return;
      if (!isDemoMode) {
        router.push({
          pathname: '/(onboarding)/explainer/[provider]',
          params: { provider: spec.key },
        });
        return;
      }
      if (spec.target) {
        await connect(spec.target);
        return;
      }
      setDeviceBusy(true);
      try {
        await device.registerDemo();
      } catch (e) {
        toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' });
      } finally {
        setDeviceBusy(false);
      }
    },
    [offline, router, connect, device, toast, t],
  );

  const goNext = useCallback(async () => {
    setContinuing(true);
    try {
      const permission = await device.check();
      if (permission === 'granted' && hasDevice) router.replace('/(onboarding)/briefing-prefs');
      else router.push('/(onboarding)/calendar-permission');
    } finally {
      setContinuing(false);
    }
  }, [device, hasDevice, router]);

  const demoConnect = useCallback(async () => {
    setDemoBusy(true);
    try {
      if (!hasMail) await connect('gmail');
      if (!hasCalendar) await device.registerDemo();
      await refetchAccounts();
      router.push('/(onboarding)/calendar-permission');
    } catch (e) {
      toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' });
    } finally {
      setDemoBusy(false);
    }
  }, [hasMail, hasCalendar, connect, device, refetchAccounts, router, toast, t]);

  return (
    <Screen
      scroll
      topGap={6}
      header={
        <ScreenHeader
          variant="sub"
          kicker={t('onboarding.connect.step', { current: 1, total: 4 })}
        />
      }
      footer={
        <View
          style={[
            styles.footer,
            {
              paddingHorizontal: theme.layout.screenPaddingH,
              backgroundColor: theme.colors.background,
            },
          ]}
        >
          <View style={styles.assurance}>
            <Icon name="assurance" size={18} color={theme.colors.successText} />
            <Text variant="small" tone="secondary" style={styles.assuranceText}>
              {t('onboarding.explainer.assure1')}
            </Text>
          </View>
          {isDemoMode ? (
            <Button
              label={t('onboarding.connect.demoHint')}
              variant="tonal"
              size="md"
              fullWidth
              icon="ai"
              loading={demoBusy}
              disabled={offline}
              onPress={() => void demoConnect()}
              testID="connect-demo"
            />
          ) : null}
          <Button
            label={
              canContinue
                ? t('onboarding.connect.continueCount', { count: accounts.length })
                : t('onboarding.connect.requirement')
            }
            size="lg"
            fullWidth
            disabled={!canContinue}
            loading={continuing}
            onPress={() => void goNext()}
            testID="connect-continue"
          />
        </View>
      }
      testID="connect-screen"
    >
      {offline ? <OfflineBanner text={t('errors.offline')} style={styles.banner} /> : null}
      <Text variant="display" accessibilityRole="header">
        {t('onboarding.connect.title')}
      </Text>
      <Text variant="body" tone="secondary" style={styles.subtitle}>
        {t('onboarding.connect.body')}
      </Text>
      <View style={[styles.cards, { gap: 10 }]}>
        {CARDS.map((spec) => {
          const account = accountFor(accounts, spec);
          const busy = spec.target ? connecting === spec.target : deviceBusy;
          return (
            <ProviderCard
              key={spec.key}
              providerKey={spec.key}
              name={t(`settings.integrationsScreen.providers.${spec.key}`)}
              meta={
                account
                  ? (account.email ?? account.displayName)
                  : t(`onboarding.connect.providerMeta.${spec.key}`)
              }
              connected={Boolean(account)}
              connecting={busy}
              disabled={offline || (connecting !== null && !busy)}
              onPress={() => void onCard(spec)}
              testID={spec.testID}
            />
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { marginBottom: 12 },
  subtitle: { marginTop: 8 },
  cards: { marginTop: 22 },
  footer: { paddingTop: 10, paddingBottom: 12, gap: 10 },
  assurance: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  assuranceText: { flex: 1 },
});
