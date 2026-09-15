import { useCallback } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ANDROID_NOTIFICATION_SCOPES } from '@da/domain';
import { formatRelativeLabel, formatTime } from '@da/i18n';
import {
  Button,
  EmptyState,
  FilterChip,
  Icon,
  ListGroup,
  ListGroupTitle,
  ListRow,
  ProGate,
  Screen,
  ScreenHeader,
  Skeleton,
  Text,
  Toggle,
  useTheme,
  useToast,
} from '@da/ui';
import { OfflineNotice } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { useAndroidNotifications } from '@/hooks/useAndroidNotifications';
import { useEntitlement } from '@/hooks/useEntitlement';
import { describeError } from '@/lib/errors';
import { useUiStore } from '@/store/ui';

/** Telefon Bildirimleri (Android only) — notification-listener access, scope, per-app allow-list, consent. */
export default function AndroidNotificationsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const ctx = useFormatCtx();
  const offline = useUiStore((s) => s.offline);
  const { isPro, gate } = useEntitlement();
  const an = useAndroidNotifications();
  const c = theme.colors;

  const showError = useCallback(
    (e: unknown) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
    [toast, t],
  );

  const run = useCallback(
    async (action: () => Promise<unknown>, successMessage?: string) => {
      try {
        await action();
        if (successMessage) toast.show({ message: successMessage, icon: 'check' });
      } catch (e) {
        showError(e);
      }
    },
    [toast, showError],
  );

  const header = (
    <ScreenHeader
      variant="sub"
      title={t('settings.android.title')}
      subtitle={t('settings.android.subtitle')}
      onBack={() => router.back()}
      backLabel={t('common.back')}
    />
  );

  if (Platform.OS !== 'android') {
    return (
      <Screen topGap={6} header={header} testID="anotif-screen">
        <EmptyState
          icon="android"
          title={t('settings.android.iosOnly')}
          body={t('settings.android.iosOnlyBody')}
          actionLabel={t('common.back')}
          onAction={() => router.back()}
          testID="anotif-unsupported"
        />
      </Screen>
    );
  }

  if (!an.supported) {
    return (
      <Screen topGap={6} header={header} testID="anotif-screen">
        <EmptyState
          icon="android"
          tone="error"
          title={t('settings.android.unavailable')}
          body={t('settings.android.unavailableBody')}
          testID="anotif-unavailable"
        />
      </Screen>
    );
  }

  const saving = an.isSaving || offline;

  return (
    <Screen scroll topGap={6} header={header} testID="anotif-screen">
      <OfflineNotice />
      <Text variant="body" tone="secondary" style={styles.explainer}>
        {t('settings.android.body')}
      </Text>

      <ProGate
        isPro={isPro}
        kicker={t('settings.android.title')}
        title={t('settings.android.proTitle')}
        body={t('settings.android.proBody')}
        badgeLabel={t('common.pro')}
        ctaLabel={t('settings.android.proCta')}
        onUpgrade={() => gate('android_notification_intelligence', 'android_notifications')}
        style={styles.section}
        testID="anotif-pro-gate"
      >
        <View style={styles.section}>
          <ListGroupTitle label={t('settings.android.permissionKicker')} />
          <ListGroup>
            <ListRow
              icon="notificationsActive"
              iconColor={an.permissionGranted ? c.successText : c.inkSecondary}
              title={
                an.permissionGranted
                  ? t('settings.android.granted')
                  : t('settings.android.notGranted')
              }
              meta={an.permissionGranted ? null : t('settings.android.grantHint')}
              trailing={
                <Icon
                  name={an.permissionGranted ? 'complete' : 'uncheck'}
                  size={22}
                  color={an.permissionGranted ? c.successText : c.warningText}
                  filled={an.permissionGranted}
                />
              }
            />
          </ListGroup>
          <View style={styles.actions}>
            <Button
              label={t('settings.android.grant')}
              variant={an.permissionGranted ? 'surface' : 'primary'}
              size="sm"
              icon="settings"
              onPress={() => void run(() => an.openSettings())}
              testID="anotif-grant"
            />
            <Button
              label={t('settings.android.refresh')}
              variant="ghostSecondary"
              size="sm"
              icon="refresh"
              onPress={() => void run(() => an.refresh())}
              testID="anotif-refresh"
            />
          </View>
        </View>

        <View style={styles.section}>
          <ListGroupTitle label={t('settings.android.scopeKicker')} />
          <View style={styles.chips}>
            {ANDROID_NOTIFICATION_SCOPES.map((scope) => (
              <FilterChip
                key={scope}
                label={t(`settings.android.scope.${scope}`)}
                selected={an.config.scope === scope}
                disabled={saving}
                onPress={() => void run(() => an.setScope(scope), t('settings.android.saved'))}
                testID={`anotif-scope-${scope}`}
              />
            ))}
          </View>
          <Text variant="caption" tone="tertiary" style={styles.note}>
            {t('settings.android.appsHint')}
          </Text>
        </View>

        <View style={styles.section}>
          <ListGroupTitle
            label={t('settings.android.apps')}
            meta={an.apps.length > 0 ? String(an.apps.length) : null}
          />
          {an.isLoadingApps ? (
            <ListGroup>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.skeletonRow}>
                  <Skeleton width="50%" height={12} />
                </View>
              ))}
            </ListGroup>
          ) : an.apps.length === 0 ? (
            <Text variant="small" tone="tertiary" style={styles.note} testID="anotif-no-apps">
              {t('settings.android.noApps')}
            </Text>
          ) : (
            <ListGroup>
              {an.apps.map((app) => {
                const allowed = an.config.allowedPackages.includes(app.packageName);
                return (
                  <ListRow
                    key={app.packageName}
                    title={app.appName}
                    meta={
                      app.isDefaultExcluded
                        ? t('settings.android.excludedDefault')
                        : app.isMessaging
                          ? t('settings.android.messaging')
                          : app.packageName
                    }
                    disabled={app.isDefaultExcluded}
                    trailing={
                      <Toggle
                        value={allowed && !app.isDefaultExcluded}
                        onValueChange={() => void run(() => an.toggleApp(app.packageName))}
                        disabled={saving || app.isDefaultExcluded}
                        accessibilityLabel={app.appName}
                        testID={`anotif-app-${app.packageName}`}
                      />
                    }
                  />
                );
              })}
            </ListGroup>
          )}
        </View>

        <View style={styles.section}>
          <ListGroupTitle label={t('settings.android.consentKicker')} />
          <ListGroup>
            <ListRow
              icon="cloud"
              title={t('settings.android.uploadConsent')}
              meta={t('settings.android.uploadNote')}
              trailing={
                <Toggle
                  value={an.config.uploadConsent}
                  onValueChange={(next) =>
                    void run(() => an.setUploadConsent(next), t('settings.android.saved'))
                  }
                  disabled={saving}
                  accessibilityLabel={t('settings.android.uploadConsent')}
                  testID="anotif-consent"
                />
              }
            />
          </ListGroup>
        </View>

        <View style={styles.section}>
          <ListGroupTitle
            label={t('settings.android.recentKicker')}
            meta={
              an.config.uploadConsent
                ? null
                : an.recent.length > 0
                  ? t('settings.android.recentDevice')
                  : null
            }
          />
          {an.isLoadingRecent ? (
            <ListGroup>
              {[0, 1].map((i) => (
                <View key={i} style={styles.skeletonRow}>
                  <Skeleton width="70%" height={12} />
                </View>
              ))}
            </ListGroup>
          ) : an.recent.length === 0 ? (
            <Text variant="small" tone="tertiary" style={styles.note} testID="anotif-recent-empty">
              {t('settings.android.recentEmpty')}
            </Text>
          ) : (
            <>
              <ListGroup>
                {an.recent.map((item, index) => (
                  <View key={item.id} testID={`anotif-recent-${index}`}>
                    <ListRow
                      icon="reminder"
                      title={item.title || item.appName}
                      meta={`${item.appName} · ${formatRelativeLabel(item.postedAt, ctx)} ${formatTime(item.postedAt, ctx)}`}
                      trailingText={
                        item.hasInsight
                          ? t('settings.android.recentInsight')
                          : item.origin === 'device'
                            ? t('settings.android.recentDevice')
                            : null
                      }
                      trailingTone={item.hasInsight ? 'primary' : 'tertiary'}
                    />
                  </View>
                ))}
              </ListGroup>
              <Button
                label={t('settings.android.clearAll')}
                variant="ghostSecondary"
                size="sm"
                icon="delete"
                disabled={offline}
                onPress={() => void run(() => an.clearRecent(), t('settings.android.cleared'))}
                style={styles.clear}
                testID="anotif-clear"
              />
            </>
          )}
        </View>
      </ProGate>

      <View style={styles.privacy}>
        <Icon name="security" size={18} color={c.successText} />
        <Text variant="small" tone="secondary" style={styles.privacyText}>
          {t('settings.android.privacy')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  explainer: { marginTop: 4 },
  section: { marginTop: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { marginTop: 10, paddingHorizontal: 4 },
  skeletonRow: { paddingVertical: 16 },
  clear: { marginTop: 8 },
  privacy: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 22,
  },
  privacyText: { flex: 1 },
});
