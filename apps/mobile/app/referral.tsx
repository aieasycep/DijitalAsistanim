import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { REFERRAL_BONUS_DAYS } from '@da/domain';
import { formatShortDate } from '@da/i18n';
import {
  Button,
  Card,
  Icon,
  ListGroup,
  ListGroupTitle,
  ListRow,
  Screen,
  ScreenHeader,
  Text,
  TextField,
  haptic,
  useTheme,
  useThemeContext,
  useToast,
} from '@da/ui';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { isReferralCodeShape, rejectionCopy } from '@/features/referral/referralCopy';
import { useReferral } from '@/features/referral/useReferral';
import { readPendingReferral } from '@/hooks/useDeepLinks';
import { describeError } from '@/lib/errors';
import { useUiStore } from '@/store/ui';

/** Arkadaşını Davet Et: code + link, copy / WhatsApp / share, status counts and the redeem field. */
export default function ReferralScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const c = theme.colors;
  const { hapticsEnabled } = useThemeContext();
  const router = useRouter();
  const toast = useToast();
  const ctx = useFormatCtx();
  const offline = useUiStore((s) => s.offline);
  const { code: codeParam } = useLocalSearchParams<{ code?: string }>();
  const { status, redeem, copyLink, shareWhatsApp, shareSystem } = useReferral();
  // Pre-filled from the `?code=` param or a referral link opened before sign-in.
  const [code, setCode] = useState(() => codeParam ?? readPendingReferral()?.code ?? '');
  const [rejection, setRejection] = useState<string | null>(null);

  const data = status.data;

  const onCopy = async () => {
    if (!data) return;
    const ok = await copyLink(data);
    if (ok) {
      void haptic('success', hapticsEnabled);
      toast.show({ message: t('common.copied'), icon: 'copy' });
    } else
      toast.show({ message: t('common.genericError'), icon: 'conflict', iconTone: 'critical' });
  };

  const onWhatsApp = async () => {
    if (!data) return;
    const ok = await shareWhatsApp(data);
    if (!ok)
      toast.show({ message: t('errors.handoffFailed'), icon: 'conflict', iconTone: 'critical' });
  };

  const onShare = async () => {
    if (!data) return;
    const ok = await shareSystem(data);
    if (!ok)
      toast.show({ message: t('errors.handoffFailed'), icon: 'conflict', iconTone: 'critical' });
  };

  const onRedeem = async () => {
    if (!isReferralCodeShape(code)) {
      setRejection(t('referral.invalid'));
      return;
    }
    setRejection(null);
    try {
      const response = await redeem.mutateAsync(code);
      if (response.ok) {
        void haptic('success', hapticsEnabled);
        setCode('');
        toast.show({
          message: t('referral.redeemed_ok', { days: response.bonusDays ?? REFERRAL_BONUS_DAYS }),
          icon: 'gift',
          iconTone: 'success',
        });
      } else {
        setRejection(rejectionCopy(response, t));
      }
    } catch (e) {
      setRejection(describeError(e, t).title);
    }
  };

  return (
    <Screen
      scroll
      topGap={6}
      keyboardAvoiding
      testID="referral-screen"
      refreshing={status.isRefetching}
      onRefresh={() => void status.refetch()}
      header={
        <ScreenHeader
          variant="sub"
          title={t('referral.title')}
          onBack={() => router.back()}
          backLabel={t('common.back')}
          testID="referral-header"
        />
      }
    >
      <OfflineNotice onRetry={() => void status.refetch()} retrying={status.isRefetching} />
      {status.isLoading ? (
        <ListSkeleton count={2} testID="referral-loading" />
      ) : status.isError || !data ? (
        <QueryErrorState error={status.error} onRetry={() => void status.refetch()} />
      ) : (
        <View style={styles.stack}>
          <Card variant="hero" testID="referral-hero">
            <View style={styles.heroIcons}>
              <View style={[styles.heroTile, { backgroundColor: c.primarySoft }]}>
                <Icon name="gift" size={22} color={c.primaryText} />
              </View>
            </View>
            <Text variant="h2" style={styles.heroTitle}>
              {t('referral.subtitle')}
            </Text>
            <Text variant="secondary" tone="secondary" style={styles.heroBody}>
              {t('referral.heroBody')}
            </Text>
          </Card>

          <Card padding={16} testID="referral-code-card">
            <Text variant="chip" tone="tertiary">
              {t('referral.code')}
            </Text>
            <Text
              variant="h2"
              tabular
              accessibilityLabel={`${t('referral.code')}: ${data.code}`}
              style={styles.codeText}
              testID="referral-code"
            >
              {data.code}
            </Text>
            <Text variant="chip" tone="tertiary" style={styles.linkLabel}>
              {t('referral.link')}
            </Text>
            <Text variant="caption" tone="secondary" numberOfLines={1} testID="referral-link">
              {data.inviteUrl}
            </Text>
            <View style={styles.shareRow}>
              <Button
                label={t('referral.copyLink')}
                variant="surface"
                size="sm"
                icon="copy"
                onPress={() => void onCopy()}
                style={styles.shareButton}
                testID="referral-copy"
              />
              <Button
                label={t('referral.whatsapp')}
                variant="tonal"
                size="sm"
                icon="whatsapp"
                onPress={() => void onWhatsApp()}
                style={styles.shareButton}
                testID="referral-whatsapp"
              />
            </View>
            <Button
              label={t('referral.system')}
              size="md"
              fullWidth
              icon="share"
              onPress={() => void onShare()}
              style={styles.shareMain}
              testID="referral-share"
            />
          </Card>

          <View>
            <ListGroupTitle label={t('referral.status')} />
            <ListGroup testID="referral-status">
              <ListRow icon="person" title={t('referral.invited', { count: data.invitedCount })} />
              <ListRow
                icon="verified"
                title={t('referral.redeemed', { count: data.redeemedCount })}
              />
              <ListRow
                icon="crown"
                title={t('referral.earned', { days: data.bonusDaysEarned })}
                meta={
                  data.activeBonusUntil
                    ? t('referral.bonusUntil', {
                        date: formatShortDate(data.activeBonusUntil, ctx),
                      })
                    : t('referral.noBonus')
                }
              />
            </ListGroup>
          </View>

          <View style={styles.redeem}>
            <Text variant="h3" accessibilityRole="header">
              {t('referral.enterCode')}
            </Text>
            <TextField
              value={code}
              onChangeText={(text) => {
                setCode(text.toUpperCase());
                if (rejection) setRejection(null);
              }}
              placeholder={t('referral.codePlaceholder')}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              error={rejection}
              accessibilityLabel={t('referral.enterCode')}
              disabled={redeem.isPending}
              testID="referral-input"
            />
            <Button
              label={t('referral.redeem')}
              variant="tonal"
              size="md"
              fullWidth
              icon="gift"
              loading={redeem.isPending}
              loadingLabel={t('referral.redeeming')}
              disabled={code.trim().length === 0 || offline}
              onPress={() => void onRedeem()}
              testID="referral-redeem"
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 18 },
  heroIcons: { flexDirection: 'row' },
  heroTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { marginTop: 14 },
  heroBody: { marginTop: 6 },
  codeText: { marginTop: 4, letterSpacing: 2 },
  linkLabel: { marginTop: 12 },
  shareRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  shareButton: { flex: 1 },
  shareMain: { marginTop: 8 },
  redeem: { gap: 10 },
});
