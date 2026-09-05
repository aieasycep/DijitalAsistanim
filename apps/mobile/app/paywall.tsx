import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TRIAL_DAYS } from '@da/domain';
import { formatShortDate } from '@da/i18n';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Icon,
  Pressable,
  Screen,
  ScreenHeader,
  Text,
  haptic,
  useTheme,
  useThemeContext,
  useToast,
} from '@da/ui';
import { OfflineNotice } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { contextTitleKey, planPricing, type PlanKey } from '@/features/paywall/paywallCopy';
import { PlanOption } from '@/features/paywall/PlanOption';
import { usePurchases } from '@/features/paywall/usePurchases';
import { useEntitlement } from '@/hooks/useEntitlement';
import { env } from '@/lib/env';
import { describeError } from '@/lib/errors';
import { openExternal } from '@/lib/openExternal';
import { useUiStore } from '@/store/ui';

const LEGAL_PATHS = { terms: 'terms', privacy: 'privacy' } as const;

/** Paywall: contextual headline, benefits, monthly / annual plans, honest CTA (trial only when the store says so). */
export default function PaywallScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const c = theme.colors;
  const { hapticsEnabled } = useThemeContext();
  const router = useRouter();
  const toast = useToast();
  const ctx = useFormatCtx();
  const offline = useUiStore((s) => s.offline);
  const { context } = useLocalSearchParams<{ context?: string }>();
  const { entitlement, isPro } = useEntitlement();
  const purchases = usePurchases();
  const [plan, setPlan] = useState<PlanKey>('annual');

  const contextKey = contextTitleKey(context);
  const contextTitle = contextKey && i18n.exists(contextKey) ? t(contextKey) : null;
  const title = contextTitle ?? t('paywall.title');
  const subtitle = contextTitle ? t('paywall.title') : t('paywall.subtitle');

  const rawBenefits = t('paywall.benefits', { returnObjects: true });
  const benefits = Array.isArray(rawBenefits)
    ? rawBenefits.filter((b): b is string => typeof b === 'string')
    : [];
  const pricing = planPricing(purchases.offerings, ctx.locale);
  const storeBlocked = !purchases.available && !purchases.demo;
  const pricesLoading = purchases.offeringsLoading;
  const selectedPrice = plan === 'annual' ? pricing.annual : pricing.monthly;
  const ctaLabel = pricing.hasIntroOffer ? t('paywall.cta') : t('paywall.ctaNoTrial');
  const legal = pricing.hasIntroOffer
    ? t('paywall.legalTrial', { days: TRIAL_DAYS, price: selectedPrice })
    : t('paywall.legalNoTrial', { price: selectedPrice });
  const annualMeta = [
    pricing.annualPerMonth ? t('paywall.perMonth', { price: pricing.annualPerMonth }) : null,
    pricing.savingsPercent ? t('paywall.savings', { percent: pricing.savingsPercent }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/today');
  }, [router]);

  const showError = (e: unknown) =>
    toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' });

  const buy = async () => {
    try {
      const outcome = await purchases.purchase.mutateAsync(plan);
      switch (outcome) {
        case 'purchased':
          void haptic('success', hapticsEnabled);
          toast.show({ message: t('paywall.success'), icon: 'crown', iconTone: 'success' });
          break;
        case 'cancelled':
          toast.show({ message: t('paywall.cancelled'), icon: 'info' });
          break;
        case 'pending':
          toast.show({ message: t('paywall.pending'), icon: 'schedule' });
          break;
        case 'unavailable':
          toast.show({ message: t('paywall.unavailable'), icon: 'warning', iconTone: 'critical' });
          break;
        default:
          toast.show({ message: t('paywall.error'), icon: 'conflict', iconTone: 'critical' });
      }
    } catch (e) {
      showError(e);
    }
  };

  const restore = async () => {
    try {
      const outcome = await purchases.restore.mutateAsync();
      switch (outcome) {
        case 'restored':
          void haptic('success', hapticsEnabled);
          toast.show({ message: t('paywall.restored'), icon: 'check', iconTone: 'success' });
          break;
        case 'nothing':
          toast.show({ message: t('paywall.nothingToRestore'), icon: 'info' });
          break;
        case 'unavailable':
          toast.show({ message: t('paywall.unavailable'), icon: 'warning', iconTone: 'critical' });
          break;
        default:
          toast.show({ message: t('paywall.error'), icon: 'conflict', iconTone: 'critical' });
      }
    } catch (e) {
      showError(e);
    }
  };

  const manage = async () => {
    const ok = await purchases.manage();
    if (!ok)
      toast.show({ message: t('errors.handoffFailed'), icon: 'conflict', iconTone: 'critical' });
  };

  const openLegal = async (path: keyof typeof LEGAL_PATHS) => {
    const ok = await openExternal(`${env.webUrl}/${LEGAL_PATHS[path]}`);
    if (!ok)
      toast.show({ message: t('errors.invalidUrl'), icon: 'conflict', iconTone: 'critical' });
  };

  const proStatus = isPro
    ? entitlement.isTrial && entitlement.expiresAt
      ? t('paywall.trialUntil', { date: formatShortDate(entitlement.expiresAt, ctx) })
      : entitlement.expiresAt
        ? t('paywall.proUntil', { date: formatShortDate(entitlement.expiresAt, ctx) })
        : t('paywall.proActive')
    : null;

  return (
    <Screen
      scroll
      topGap={6}
      testID="paywall-screen"
      header={
        <ScreenHeader
          variant="sub"
          backIcon="close"
          onBack={close}
          backLabel={t('common.close')}
          right={
            <Pressable
              onPress={() => void restore()}
              disabled={purchases.restore.isPending || offline}
              accessibilityRole="button"
              accessibilityLabel={t('paywall.restore')}
              style={styles.restore}
              testID="paywall-restore"
            >
              {purchases.restore.isPending ? (
                <ActivityIndicator size="small" color={c.inkSecondary} />
              ) : (
                <Text variant="chip" tone="secondary" numberOfLines={1}>
                  {t('paywall.restore')}
                </Text>
              )}
            </Pressable>
          }
          testID="paywall-header"
        />
      }
    >
      <OfflineNotice />
      <View style={styles.stack}>
        <View style={styles.kickerRow}>
          <Icon name="ai" size={16} color={c.primary} filled />
          <Text variant="aiLabel" tone="primary">
            {t('paywall.kicker')}
          </Text>
        </View>
        <Text variant="h1" accessibilityRole="header" testID="paywall-title">
          {title}
        </Text>
        <Text variant="secondary" tone="secondary">
          {subtitle}
        </Text>

        {proStatus ? (
          <Card padding={{ horizontal: 16, vertical: 14 }} testID="paywall-pro-status">
            <View style={styles.statusRow}>
              <Badge label={t('common.pro')} tone="pro" />
              <Text variant="bodyMedium" style={styles.statusText}>
                {proStatus}
              </Text>
              {entitlement.source === 'referral' ? (
                <Text variant="caption" tone="tertiary">
                  {t('paywall.referralBonus')}
                </Text>
              ) : null}
            </View>
          </Card>
        ) : null}

        <Card padding={{ horizontal: 16, vertical: 6 }} testID="paywall-benefits">
          {benefits.map((benefit, i) => (
            <View
              key={benefit}
              style={[
                styles.benefit,
                i > 0
                  ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline }
                  : null,
              ]}
            >
              <Icon name="complete" size={20} color={c.primary} filled />
              <Text variant="secondary" style={styles.benefitText}>
                {benefit}
              </Text>
            </View>
          ))}
        </Card>
        <Text variant="caption" tone="tertiary" style={styles.freeNote}>
          {t('paywall.freeIncludes')}
        </Text>

        <View style={styles.plans}>
          <PlanOption
            title={t('paywall.annual')}
            price={pricing.annual}
            meta={annualMeta}
            badge={t('paywall.bestValue')}
            selected={plan === 'annual'}
            loading={pricesLoading}
            onSelect={() => setPlan('annual')}
            accessibilityLabel={t('paywall.selectPlan', { plan: t('paywall.annual') })}
            testID="paywall-plan-annual"
          />
          <PlanOption
            title={t('paywall.monthly')}
            price={pricing.monthly}
            selected={plan === 'monthly'}
            loading={pricesLoading}
            onSelect={() => setPlan('monthly')}
            accessibilityLabel={t('paywall.selectPlan', { plan: t('paywall.monthly') })}
            testID="paywall-plan-monthly"
          />
        </View>

        {storeBlocked ? (
          <ErrorState message={t('paywall.storeUnavailableBody')} testID="paywall-unavailable" />
        ) : null}

        <View style={styles.ctaBlock}>
          {isPro ? (
            <Button
              label={t('paywall.manage')}
              variant="tonal"
              size="md"
              fullWidth
              icon="settings"
              onPress={() => void manage()}
              testID="paywall-manage"
            />
          ) : (
            <>
              <Button
                label={ctaLabel}
                size="lg"
                fullWidth
                icon="crown"
                loading={purchases.purchase.isPending}
                loadingLabel={t('common.wait')}
                disabled={storeBlocked || pricesLoading || offline}
                onPress={() => void buy()}
                testID="paywall-cta"
              />
              <Text variant="caption" tone="tertiary" align="center" testID="paywall-legal">
                {pricesLoading ? t('paywall.loadingPrices') : legal}
              </Text>
            </>
          )}
          <Button
            label={isPro ? t('common.done') : t('paywall.continueFree')}
            variant="ghostSecondary"
            size="sm"
            fullWidth
            onPress={close}
            testID="paywall-free"
          />
        </View>

        <View style={styles.links}>
          <Pressable
            onPress={() => void openLegal('terms')}
            accessibilityRole="link"
            accessibilityLabel={t('paywall.terms')}
            testID="paywall-terms"
          >
            <Text variant="caption" tone="tertiary">
              {t('paywall.terms')}
            </Text>
          </Pressable>
          <Text variant="caption" tone="tertiary">
            {' · '}
          </Text>
          <Pressable
            onPress={() => void openLegal('privacy')}
            accessibilityRole="link"
            accessibilityLabel={t('paywall.privacy')}
            testID="paywall-privacy"
          >
            <Text variant="caption" tone="tertiary">
              {t('paywall.privacy')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  restore: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  statusText: { flex: 1, minWidth: 0 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  benefitText: { flex: 1, minWidth: 0 },
  freeNote: { paddingHorizontal: 4, marginTop: -6 },
  plans: { gap: 8 },
  ctaBlock: { gap: 10, marginTop: 4 },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 32 },
});
