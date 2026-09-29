import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import { REFERRAL_BONUS_DAYS } from '@da/domain';
import { formatShortDate } from '@da/i18n';
import { Avatar, Badge, Card, ConfirmModal, Icon, Pressable, Text, useTheme } from '@da/ui';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { appVersionLabel, webLinks } from '@/features/settings/links';
import { SettingsRowLink } from '@/features/settings/SettingsRowLink';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { SettingsSection } from '@/features/settings/SettingsSection';
import { useNotificationPreferences } from '@/features/settings/useNotificationPreferences';
import { usePreferences } from '@/features/settings/usePreferences';
import { useSignOut } from '@/features/settings/useSignOut';
import { useDataSource } from '@/hooks/useDataSource';
import { useEntitlement } from '@/hooks/useEntitlement';
import { openExternal } from '@/lib/openExternal';
import { useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';

/** Settings hub (design 7.1): identity, approval centre, three grouped lists, sign-out, version. */
export default function SettingsIndexScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const c = theme.colors;
  const ds = useDataSource();
  const ctx = useFormatCtx();
  const profile = useSessionStore((s) => s.profile);
  const pendingFromStore = useUiStore((s) => s.pendingApprovals);
  const { preferences } = usePreferences();
  const { preferences: notificationPrefs } = useNotificationPreferences();
  const { entitlement, isPro } = useEntitlement();
  const { signOut, busy } = useSignOut();
  const [confirmVisible, setConfirmVisible] = useState(false);

  const pendingQuery = useQuery({
    queryKey: qk.approvalsPending,
    queryFn: () => ds.approvals.pendingCount(),
    staleTime: 30_000,
  });
  const accountsQuery = useQuery({
    queryKey: qk.accounts,
    queryFn: () => ds.accounts.listAccounts(),
    staleTime: 60_000,
  });
  const rulesQuery = useQuery({
    queryKey: qk.rules,
    queryFn: () => ds.rules.listRules(),
    staleTime: 60_000,
  });
  const vipsQuery = useQuery({
    queryKey: qk.vips,
    queryFn: () => ds.people.listVips(),
    staleTime: 60_000,
  });

  const pending = pendingQuery.data ?? pendingFromStore;
  const displayName = profile?.displayName || t('app.name');
  const isAndroid = Platform.OS === 'android';
  const onOff = (value: boolean) => (value ? t('settings.values.on') : t('settings.values.off'));

  const briefingValue = preferences
    ? [
        preferences.briefing.morningTime,
        preferences.briefing.middayEnabled ? preferences.briefing.middayTime : null,
        preferences.briefing.eveningEnabled ? preferences.briefing.eveningTime : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  const notificationsValue = notificationPrefs
    ? notificationPrefs.onlyWhenImportant
      ? t('settings.values.onlyImportant')
      : onOff(Object.values(notificationPrefs.categories).some(Boolean))
    : null;
  const subscriptionValue = isPro
    ? entitlement.isTrial
      ? t('settings.values.trial')
      : t('paywall.proActive')
    : t('common.free');
  const accountsValue = accountsQuery.data
    ? accountsQuery.data.length > 0
      ? t('settings.values.accounts', { count: accountsQuery.data.length })
      : t('settings.values.noAccounts')
    : null;
  const planLine = isPro
    ? entitlement.expiresAt
      ? t(entitlement.isTrial ? 'paywall.trialUntil' : 'paywall.proUntil', {
          date: formatShortDate(entitlement.expiresAt, ctx),
        })
      : t('paywall.proActive')
    : t('settings.subscriptionScreen.freeTitle');

  const confirmSignOut = async () => {
    const ok = await signOut();
    if (ok) setConfirmVisible(false);
  };

  return (
    <SettingsScreen title={t('settings.title')} testID="settings-screen">
      <Card
        radius={theme.radius.xxl}
        padding={16}
        onPress={() => router.push('/settings/profile')}
        accessibilityLabel={`${t('settings.editProfile')} · ${displayName}`}
        testID="settings-row-profile"
      >
        <View style={styles.profileRow}>
          <Avatar name={displayName} imageUrl={profile?.avatarUrl} size={56} variant="ink" />
          <View style={styles.profileTexts}>
            <Text variant="h3" numberOfLines={1}>
              {displayName}
            </Text>
            <View style={styles.planRow}>
              {isPro ? <Badge label={t('common.pro')} tone="pro" /> : null}
              <Text variant="small" tone="secondary" numberOfLines={1} style={styles.planText}>
                {planLine}
              </Text>
            </View>
            {profile?.email ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {profile.email}
              </Text>
            ) : null}
          </View>
          <Icon name="edit" size={22} color={c.inkDisabled} />
        </View>
      </Card>

      <Card
        variant="inverse"
        radius={theme.radius.xl}
        padding={{ vertical: 14, horizontal: 16 }}
        onPress={() => router.push('/approvals')}
        accessibilityLabel={`${t('settings.approvalCenter')}, ${
          pending > 0
            ? t('settings.approvalsPending', { count: pending })
            : t('settings.approvalsNone')
        }`}
        testID="settings-row-approvals"
      >
        <View style={styles.approvalRow}>
          <Icon name="approval" size={22} color={c.primaryGlow} />
          <View style={styles.profileTexts}>
            <Text variant="button" tone="inverse">
              {t('settings.approvalCenter')}
            </Text>
            <Text variant="caption" color={c.inverseSecondary}>
              {pending > 0
                ? t('settings.approvalsPending', { count: pending })
                : t('settings.approvalsNone')}
            </Text>
          </View>
          <Icon name="forward" size={20} color={c.inverseSecondary} />
        </View>
      </Card>

      <SettingsSection title={t('settings.groups.assistant')}>
        <SettingsRowLink
          icon="today"
          title={t('settings.briefing')}
          value={briefingValue}
          href="/settings/briefing"
          testID="settings-row-briefing"
        />
        <SettingsRowLink
          icon="reminder"
          title={t('settings.notifications')}
          value={notificationsValue}
          href="/settings/notifications"
          testID="settings-row-notifications"
        />
        <SettingsRowLink
          icon="filter"
          title={t('settings.priorityRules')}
          value={
            rulesQuery.data ? t('settings.values.rules', { count: rulesQuery.data.length }) : null
          }
          href="/settings/priority-rules"
          testID="settings-row-priority-rules"
        />
        <SettingsRowLink
          icon="vip"
          title={t('settings.vip')}
          value={
            vipsQuery.data ? t('settings.values.people', { count: vipsQuery.data.length }) : null
          }
          href="/settings/vip"
          testID="settings-row-vip"
        />
        <SettingsRowLink
          icon="learning"
          title={t('settings.aiPersonalization')}
          value={preferences ? onOff(preferences.learnFromInteractions) : null}
          href="/settings/ai-personalization"
          testID="settings-row-ai-personalization"
        />
      </SettingsSection>

      <SettingsSection title={t('settings.groups.account')}>
        <SettingsRowLink
          icon="crown"
          title={t('settings.subscription')}
          value={subscriptionValue}
          valueTone={isPro ? 'primary' : 'tertiary'}
          href="/settings/subscription"
          testID="settings-row-subscription"
        />
        <SettingsRowLink
          icon="link"
          title={t('settings.integrations')}
          value={accountsValue}
          href="/settings/integrations"
          testID="settings-row-integrations"
        />
        <SettingsRowLink
          icon="eye"
          title={t('settings.dataSources')}
          href="/settings/data-sources"
          testID="settings-row-data-sources"
        />
        <SettingsRowLink
          icon="security"
          title={t('settings.privacy')}
          href="/settings/privacy"
          testID="settings-row-privacy"
        />
        <SettingsRowLink
          icon="gift"
          title={t('settings.referral')}
          value={t('settings.values.referralBonus', { days: REFERRAL_BONUS_DAYS })}
          valueTone="success"
          href="/referral"
          testID="settings-row-referral"
        />
      </SettingsSection>

      <SettingsSection title={t('settings.groups.app')}>
        <SettingsRowLink
          icon="palette"
          title={t('settings.appearance')}
          value={preferences ? t(`settings.appearanceScreen.${preferences.theme}`) : null}
          href="/settings/appearance"
          testID="settings-row-appearance"
        />
        <SettingsRowLink
          icon="language"
          title={t('settings.language')}
          value={preferences ? t(`settings.languageScreen.${preferences.locale}`) : null}
          href="/settings/language"
          testID="settings-row-language"
        />
        {isAndroid ? (
          <SettingsRowLink
            icon="android"
            title={t('settings.androidNotifications')}
            value={preferences ? onOff(preferences.androidNotificationUploadConsent) : null}
            href="/settings/android-notifications"
            testID="settings-row-android-notifications"
          />
        ) : null}
        <SettingsRowLink
          icon="help"
          title={t('settings.help.title')}
          href="/settings/help"
          testID="settings-row-help"
        />
        <SettingsRowLink
          icon="feedback"
          title={t('settings.feedback')}
          href="/settings/feedback"
          testID="settings-row-feedback"
        />
      </SettingsSection>

      <View style={styles.footer}>
        <Pressable
          onPress={() => setConfirmVisible(true)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('settings.signOut')}
          style={styles.signOut}
          testID="settings-signout"
        >
          <Icon name="logout" size={20} color={c.criticalText} />
          <Text variant="button" tone="critical">
            {busy ? t('settings.signingOut') : t('settings.signOut')}
          </Text>
        </Pressable>
        <View style={styles.versionRow} testID="settings-version">
          <Text variant="caption" tone="tertiary">
            {`${t('app.name')} ${appVersionLabel()} · `}
          </Text>
          <Pressable
            onPress={() => void openExternal(webLinks.releaseNotes)}
            accessibilityRole="link"
            accessibilityLabel={t('settings.releaseNotes')}
            hitSlop={8}
            testID="settings-release-notes"
          >
            <Text variant="caption" tone="primary">
              {t('settings.releaseNotes')}
            </Text>
          </Pressable>
        </View>
      </View>

      <ConfirmModal
        visible={confirmVisible}
        icon="logout"
        title={t('settings.signOutConfirm')}
        body={t('settings.signOutBody')}
        confirmLabel={t('settings.signOut')}
        cancelLabel={t('common.cancel')}
        loading={busy}
        onConfirm={() => void confirmSignOut()}
        onCancel={() => setConfirmVisible(false)}
        testID="settings-signout-modal"
        confirmTestID="settings-signout-confirm"
      />
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileTexts: { flex: 1, minWidth: 0, gap: 2 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planText: { flexShrink: 1 },
  approvalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footer: { alignItems: 'center', gap: 10, paddingTop: 6 },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  versionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
});
