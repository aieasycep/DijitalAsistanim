import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { IconName } from '@da/design-tokens';
import { Button, Card, Icon, Screen, ScreenHeader, Text, useTheme, useToast } from '@da/ui';
import { describeError } from '@/lib/errors';
import type { ProviderCardKey } from '@/features/onboarding/ProviderCard';
import { useDeviceCalendar } from '@/features/onboarding/useDeviceCalendar';
import { useOAuthConnect, type OAuthTarget } from '@/features/onboarding/useOAuthConnect';

const PROVIDER_KEYS: ProviderCardKey[] = [
  'gmail',
  'outlook',
  'google_calendar',
  'microsoft_calendar',
  'apple_calendar',
  'device_calendar',
];

function isProviderKey(value: string | undefined): value is ProviderCardKey {
  return Boolean(value) && (PROVIDER_KEYS as string[]).includes(value as string);
}

const REASON_ICONS: IconName[] = ['deadline', 'person', 'schedule'];
const CAL_REASON_ICONS: IconName[] = ['today', 'conflict', 'calendarAdd'];
const ASSURANCE_ICONS: IconName[] = ['assurance', 'block', 'linkOff'];

/** Permission explainer shown right before the provider consent screen: 3 reasons + 3 assurances. */
export default function ExplainerScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ provider?: string }>();
  const provider: ProviderCardKey = isProviderKey(params.provider) ? params.provider : 'gmail';
  const { connect, connecting } = useOAuthConnect();
  const device = useDeviceCalendar();
  const [busy, setBusy] = useState(false);
  const c = theme.colors;

  const isDevice = provider === 'apple_calendar' || provider === 'device_calendar';
  const variant = provider === 'gmail' ? 'gmail' : provider === 'outlook' ? 'outlook' : 'calendar';
  const target: OAuthTarget | null = isDevice ? null : provider;
  const providerName = t(`settings.integrationsScreen.providers.${provider}`);
  const tile =
    variant === 'gmail'
      ? { bg: c.criticalSoft, fg: c.criticalText, icon: 'mail' as IconName }
      : variant === 'outlook'
        ? { bg: c.infoSoft, fg: c.infoText, icon: 'mail' as IconName }
        : { bg: c.successSoft, fg: c.successText, icon: 'event' as IconName };
  const title = t(`onboarding.explainer.${variant}Title`);
  const reasons =
    variant === 'calendar'
      ? [
          t('onboarding.explainer.calPoint1'),
          t('onboarding.explainer.calPoint2'),
          t('onboarding.explainer.calPoint3'),
        ]
      : [
          t('onboarding.explainer.point1'),
          t('onboarding.explainer.point2'),
          t('onboarding.explainer.point3'),
        ];
  const assurances = [
    variant === 'calendar'
      ? t('onboarding.calendarPermission.body')
      : t('onboarding.explainer.assure1'),
    t('onboarding.explainer.assure2'),
    t('onboarding.explainer.assure3'),
  ];
  const ctaLabel =
    provider === 'gmail'
      ? t('onboarding.explainer.ctaGoogle')
      : provider === 'outlook'
        ? t('onboarding.explainer.ctaMicrosoft')
        : t('onboarding.explainer.ctaCalendar', { provider: providerName });
  const footnote = isDevice
    ? t('onboarding.explainer.footnote.device', { provider: providerName })
    : provider === 'gmail' || provider === 'google_calendar'
      ? t('onboarding.explainer.footnote.google')
      : t('onboarding.explainer.footnote.microsoft');

  const onConnect = useCallback(async () => {
    if (busy || connecting) return;
    if (target) {
      const account = await connect(target);
      if (account) router.back();
      return;
    }
    setBusy(true);
    try {
      const result = await device.request();
      if (result.outcome === 'granted') {
        if (result.uploaded > 0)
          toast.show({
            message: t('onboarding.calendarPermission.synced', { count: result.uploaded }),
            icon: 'check',
            iconTone: 'success',
          });
        router.back();
      } else if (result.outcome === 'denied') {
        router.replace('/(onboarding)/calendar-permission');
      }
    } catch (e) {
      toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' });
    } finally {
      setBusy(false);
    }
  }, [busy, connecting, target, connect, router, device, toast, t]);

  const loading = busy || connecting !== null;

  return (
    <Screen
      scroll
      topGap={6}
      header={
        <ScreenHeader
          variant="sub"
          kicker={t(`onboarding.explainer.kicker.${variant}`)}
          onBack={() => router.back()}
          backIcon="close"
          backLabel={t('common.close')}
        />
      }
      footer={
        <View
          style={[
            styles.footer,
            { paddingHorizontal: theme.layout.screenPaddingH, backgroundColor: c.background },
          ]}
        >
          <Button
            label={ctaLabel}
            size="lg"
            fullWidth
            loading={loading}
            loadingLabel={t('onboarding.connect.connecting')}
            onPress={() => void onConnect()}
            testID="explainer-cta"
          />
          <Button
            label={t('common.skip')}
            variant="ghostSecondary"
            size="ghost"
            disabled={loading}
            onPress={() => router.back()}
            style={styles.center}
            testID="explainer-back"
          />
          <Text variant="caption" tone="tertiary" align="center">
            {footnote}
          </Text>
        </View>
      }
      testID="explainer-screen"
    >
      <View style={[styles.tile, { backgroundColor: tile.bg, borderRadius: theme.radius.md }]}>
        <Icon name={tile.icon} size={22} color={tile.fg} />
      </View>
      <Text variant="h2" style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.reasons}>
        {reasons.map((reason, i) => (
          <Card
            key={reason}
            variant="flat"
            radius={theme.radius.lg}
            padding={{ vertical: 11, horizontal: 14 }}
          >
            <View style={styles.row}>
              <Icon
                name={(variant === 'calendar' ? CAL_REASON_ICONS : REASON_ICONS)[i] ?? 'info'}
                size={20}
                color={c.primary}
              />
              <Text variant="bodyMedium" style={styles.rowText}>
                {reason}
              </Text>
            </View>
          </Card>
        ))}
      </View>
      <Card
        variant="flat"
        radius={theme.radius.xl}
        padding={{ vertical: 12, horizontal: 14 }}
        style={[styles.assurances, { backgroundColor: c.successSoft }]}
      >
        {assurances.map((line, i) => (
          <View key={line} style={[styles.row, i > 0 ? styles.rowGap : null]}>
            <Icon name={ASSURANCE_ICONS[i] ?? 'assurance'} size={18} color={c.successText} />
            <Text
              variant="small"
              color={c.successText}
              style={[styles.rowText, i === 0 ? styles.strong : null]}
            >
              {line}
            </Text>
          </View>
        ))}
      </Card>
      <Text variant="caption" tone="tertiary" style={styles.readOnly}>
        {t('onboarding.explainer.readOnly')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tile: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  title: { marginTop: 14 },
  reasons: { marginTop: 18, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowGap: { marginTop: 10 },
  rowText: { flex: 1 },
  strong: { fontWeight: '600' },
  assurances: { marginTop: 18 },
  readOnly: { marginTop: 14, paddingHorizontal: 4 },
  footer: { paddingTop: 10, paddingBottom: 12, gap: 8 },
  center: { alignSelf: 'center' },
});
