import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { FormatCtx } from '@da/i18n';
import { Badge, Button, Card, ListRow, Text, useTheme, useToast } from '@da/ui';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { SettingsRowLink } from '@/features/settings/SettingsRowLink';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { SettingsSection } from '@/features/settings/SettingsSection';
import { SettingsSkeleton } from '@/features/settings/SettingsSkeleton';
import { useEntitlement } from '@/hooks/useEntitlement';
import { track } from '@/lib/analytics';
import { openManageSubscriptions, restorePro } from '@/services/purchases';

const PAYWALL_CONTEXT = 'subscription';

/** "5 Eylül 2027" — renewal dates need the year, unlike card time labels. */
function formatLongDate(iso: string, ctx: FormatCtx): string {
  try {
    return new Intl.DateTimeFormat(ctx.locale === 'tr' ? 'tr-TR' : 'en-GB', {
      timeZone: ctx.timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Subscription (design 7.1 "Abonelik"): current plan card, expiry / source, usage against the Free
 * quotas, upgrade → paywall, manage / restore through the store, invite link.
 */
export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const ctx = useFormatCtx();
  const { entitlement, isPro, isLoading, refetch } = useEntitlement();
  const [restoring, setRestoring] = useState(false);

  const upgrade = () => {
    track('paywall_viewed', { context: PAYWALL_CONTEXT });
    router.push({ pathname: '/paywall', params: { context: PAYWALL_CONTEXT } });
  };

  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const result = await restorePro();
      if (result.outcome === 'restored') {
        await qc.invalidateQueries({ queryKey: qk.entitlement });
        await refetch();
        toast.show({ message: t('paywall.restored'), icon: 'check', iconTone: 'success' });
      } else if (result.outcome === 'nothing') {
        toast.show({ message: t('paywall.nothingToRestore'), icon: 'info' });
      } else if (result.outcome === 'unavailable') {
        toast.show({ message: t('paywall.unavailable'), icon: 'info' });
      } else {
        toast.show({
          message: t('settings.subscriptionScreen.restoreFailed'),
          icon: 'conflict',
          iconTone: 'critical',
        });
      }
    } finally {
      setRestoring(false);
    }
  };

  const manage = async () => {
    const ok = await openManageSubscriptions();
    if (!ok) toast.show({ message: t('paywall.unavailable'), icon: 'info' });
  };

  const benefitsRaw = t('paywall.benefits', { returnObjects: true });
  const benefits: string[] = Array.isArray(benefitsRaw) ? benefitsRaw.map(String) : [];
  const expiry = entitlement.expiresAt ? formatLongDate(entitlement.expiresAt, ctx) : null;
  const renews = entitlement.source === 'revenuecat' && !entitlement.isTrial;
  const sourceKey = entitlement.source;

  return (
    <SettingsScreen
      title={t('settings.subscription')}
      onRefresh={() => void refetch()}
      refreshing={isLoading}
      testID="subscription-screen"
    >
      {isLoading ? (
        <SettingsSkeleton rows={3} testID="subscription-loading" />
      ) : (
        <>
          <Card
            variant={isPro ? 'hero' : 'default'}
            radius={theme.radius.hero}
            padding={22}
            testID="subscription-plan"
          >
            <View style={styles.badges}>
              <Badge
                label={isPro ? t('common.pro') : t('common.free')}
                tone={isPro ? 'pro' : 'neutral'}
              />
              {entitlement.isTrial ? (
                <Badge label={t('settings.values.trial')} tone="approved" />
              ) : null}
            </View>
            <Text variant="h2" style={styles.planTitle} accessibilityRole="header">
              {isPro ? t('paywall.proActive') : t('settings.subscriptionScreen.freeTitle')}
            </Text>
            <Text variant="secondary" tone="secondary" style={styles.planBody}>
              {isPro
                ? entitlement.isTrial
                  ? t('settings.subscriptionScreen.trialBody')
                  : t('settings.subscriptionScreen.proBody')
                : t('settings.subscriptionScreen.freeBody')}
            </Text>
            {!isPro ? (
              <Button
                label={t('paywall.ctaNoTrial')}
                size="md"
                fullWidth
                icon="crown"
                onPress={upgrade}
                style={styles.cta}
                testID="subscription-upgrade"
              />
            ) : null}
          </Card>

          {isPro ? (
            <SettingsSection title={t('settings.subscriptionScreen.details')}>
              <SettingsRowLink
                icon="crown"
                title={t('settings.subscriptionScreen.plan')}
                value={entitlement.isTrial ? t('settings.values.trial') : t('common.pro')}
                testID="subscription-plan-row"
              />
              {expiry ? (
                <SettingsRowLink
                  icon="schedule"
                  title={
                    renews
                      ? t('settings.subscriptionScreen.renews')
                      : t('settings.subscriptionScreen.expires')
                  }
                  value={expiry}
                  testID="subscription-expiry"
                />
              ) : null}
              <SettingsRowLink
                icon="verified"
                title={t('settings.subscriptionScreen.source')}
                value={t(`settings.subscriptionScreen.sources.${sourceKey}`)}
                testID="subscription-source"
              />
            </SettingsSection>
          ) : (
            <SettingsSection title={t('settings.subscriptionScreen.usage')}>
              <SettingsRowLink
                icon="ai"
                title={t('settings.subscriptionScreen.assistantUsage')}
                value={t('settings.subscriptionScreen.perDay', {
                  used: entitlement.usage.assistantQueriesToday,
                  limit: entitlement.quotas.assistantQueriesPerDay,
                })}
                testID="subscription-usage-assistant"
              />
              <SettingsRowLink
                icon="capture"
                title={t('settings.subscriptionScreen.captureUsage')}
                value={t('settings.subscriptionScreen.perDay', {
                  used: entitlement.usage.capturesToday,
                  limit: entitlement.quotas.capturesPerDay,
                })}
                testID="subscription-usage-capture"
              />
              <SettingsRowLink
                icon="mail"
                title={t('settings.subscriptionScreen.emailAccounts')}
                value={t('settings.subscriptionScreen.ofLimit', {
                  used: entitlement.usage.emailAccounts,
                  limit: entitlement.quotas.maxEmailAccounts,
                })}
                testID="subscription-usage-email"
              />
              <SettingsRowLink
                icon="event"
                title={t('settings.subscriptionScreen.calendarAccounts')}
                value={t('settings.subscriptionScreen.ofLimit', {
                  used: entitlement.usage.calendarAccounts,
                  limit: entitlement.quotas.maxCalendarAccounts,
                })}
                testID="subscription-usage-calendar"
              />
            </SettingsSection>
          )}

          {!isPro && benefits.length > 0 ? (
            <SettingsSection title={t('settings.subscriptionScreen.benefitsTitle')}>
              {benefits.map((benefit) => (
                <ListRow key={benefit} icon="check" title={benefit} minHeight={44} />
              ))}
            </SettingsSection>
          ) : null}

          <SettingsSection>
            {isPro ? (
              <SettingsRowLink
                icon="settings"
                title={t('paywall.manage')}
                onPress={() => void manage()}
                testID="subscription-manage"
              />
            ) : null}
            <SettingsRowLink
              icon="refresh"
              title={t('paywall.restore')}
              value={restoring ? t('settings.subscriptionScreen.restoring') : null}
              onPress={() => void restore()}
              disabled={restoring}
              testID="subscription-restore"
            />
            <SettingsRowLink
              icon="gift"
              title={t('settings.subscriptionScreen.inviteFriends')}
              href="/referral"
              testID="subscription-referral"
            />
          </SettingsSection>
        </>
      )}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planTitle: { marginTop: 10 },
  planBody: { marginTop: 6 },
  cta: { marginTop: 16 },
});
