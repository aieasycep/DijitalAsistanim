import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LOCK_SCREEN_PRIVACY, type LockScreenPrivacy, type NotificationCategory } from '@da/domain';
import { SegmentedControl, Text } from '@da/ui';
import { QueryErrorState } from '@/features/flow/ScreenStates';
import { SettingsRowLink } from '@/features/settings/SettingsRowLink';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { SettingsSection } from '@/features/settings/SettingsSection';
import { SettingsSkeleton } from '@/features/settings/SettingsSkeleton';
import { TimePickerRow } from '@/features/settings/TimePickerRow';
import { ToggleRow } from '@/features/settings/ToggleRow';
import { useNotificationPreferences } from '@/features/settings/useNotificationPreferences';
import { useDataSource } from '@/hooks/useDataSource';
import {
  getPermissionStatus,
  registerPushToken,
  requestPermission,
  type NotificationPermission,
} from '@/services/notifications';
import { useSessionStore } from '@/store/session';

type GroupKey = 'briefings' | 'important' | 'other';
const GROUPS: { key: GroupKey; categories: NotificationCategory[] }[] = [
  { key: 'briefings', categories: ['morning', 'midday', 'evening', 'weekly'] },
  { key: 'important', categories: ['critical_email', 'deadline', 'meeting', 'follow_up'] },
  { key: 'other', categories: ['life_event', 'approval', 'reminder'] },
];
const LEAD_OPTIONS = ['5', '10', '15', '20', '30'] as const;
type LeadOption = (typeof LEAD_OPTIONS)[number];

/** Category toggles, only-important, quiet hours, lock-screen privacy, meeting lead, system permission. */
export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const ds = useDataSource();
  const userId = useSessionStore((s) => s.session?.user.id ?? null);
  const { preferences, isLoading, isError, error, refetch, isRefetching, update } =
    useNotificationPreferences();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const syncedPermission = useRef<boolean | null>(null);

  const refreshPermission = useCallback(() => {
    void getPermissionStatus().then(setPermission);
  }, []);

  useEffect(() => {
    refreshPermission();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermission();
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  // Keep the server copy of the OS permission in sync so push delivery can skip silent devices.
  useEffect(() => {
    if (!preferences || permission === null) return;
    const granted = permission === 'granted';
    if ((preferences.systemPermissionGranted ?? null) === granted) return;
    if (syncedPermission.current === granted) return; // already attempted; don't loop on errors
    syncedPermission.current = granted;
    void update({ systemPermissionGranted: granted });
  }, [permission, preferences, update]);

  const onSystemPress = async () => {
    if (permission === 'undetermined') {
      const next = await requestPermission();
      setPermission(next);
      if (next === 'granted') void registerPushToken(ds, { userId, force: true });
      return;
    }
    await Linking.openSettings();
  };

  const systemTitle =
    permission === 'granted'
      ? t('settings.notificationScreen.systemGranted')
      : permission === 'denied'
        ? t('settings.notificationScreen.systemOff')
        : t('settings.notificationScreen.systemUndetermined');
  const systemAction =
    permission === 'undetermined'
      ? t('settings.notificationScreen.systemAllow')
      : t('settings.notificationScreen.openSystemSettings');

  const lockOptions = LOCK_SCREEN_PRIVACY.map((key) => ({
    key,
    label: t(`settings.notificationScreen.lockScreenOptions.${key}`),
  }));
  const leadOptions = LEAD_OPTIONS.map((key) => ({ key, label: key }));
  const leadValue: LeadOption = (LEAD_OPTIONS as readonly string[]).includes(
    String(preferences?.meetingLeadMinutes),
  )
    ? (String(preferences?.meetingLeadMinutes) as LeadOption)
    : '20';

  let body: ReactNode;
  if (!preferences && isLoading) {
    body = <SettingsSkeleton rows={4} groups={2} testID="nset-loading" />;
  } else if (!preferences) {
    body = <QueryErrorState error={error} onRetry={refetch} testID="nset-error" />;
  } else {
    body = (
      <>
        <SettingsSection title={t('settings.notificationScreen.system')}>
          <SettingsRowLink
            icon="reminder"
            title={systemTitle}
            value={permission === null ? null : systemAction}
            valueTone={permission === 'denied' ? 'critical' : 'primary'}
            onPress={() => void onSystemPress()}
            testID="nset-system"
          />
        </SettingsSection>

        <SettingsSection note={t('settings.notificationScreen.onlyImportantNote')}>
          <ToggleRow
            icon="ai"
            title={t('settings.notificationScreen.onlyImportant')}
            value={preferences.onlyWhenImportant}
            onValueChange={(onlyWhenImportant) => void update({ onlyWhenImportant })}
            testID="nset-only-important"
          />
        </SettingsSection>

        {GROUPS.map((group) => (
          <SettingsSection
            key={group.key}
            title={t(`settings.notificationScreen.groups.${group.key}`)}
            testID={`nset-group-${group.key}`}
          >
            {group.categories.map((category) => (
              <ToggleRow
                key={category}
                title={t(`settings.notificationScreen.categories.${category}`)}
                value={preferences.categories[category]}
                onValueChange={(next) =>
                  void update({ categories: { ...preferences.categories, [category]: next } })
                }
                testID={`nset-${category}`}
              />
            ))}
          </SettingsSection>
        ))}

        <SettingsSection
          title={t('settings.notificationScreen.quietHours')}
          note={t('settings.notificationScreen.quietNote')}
        >
          <ToggleRow
            icon="bedtime"
            title={t('settings.notificationScreen.quietHours')}
            value={preferences.quietHoursEnabled}
            onValueChange={(quietHoursEnabled) => void update({ quietHoursEnabled })}
            testID="nset-quiet"
          />
          {preferences.quietHoursEnabled ? (
            <TimePickerRow
              title={t('settings.notificationScreen.quietStart')}
              value={preferences.quietHoursStart}
              onChange={(quietHoursStart) => void update({ quietHoursStart })}
              testID="nset-quiet-start"
            />
          ) : null}
          {preferences.quietHoursEnabled ? (
            <TimePickerRow
              title={t('settings.notificationScreen.quietEnd')}
              value={preferences.quietHoursEnd}
              onChange={(quietHoursEnd) => void update({ quietHoursEnd })}
              testID="nset-quiet-end"
            />
          ) : null}
        </SettingsSection>

        <SettingsSection
          title={t('settings.notificationScreen.lockScreen')}
          note={t('settings.notificationScreen.lockScreenNote')}
        >
          <View style={styles.control}>
            <SegmentedControl<LockScreenPrivacy>
              options={lockOptions}
              value={preferences.lockScreenPrivacy}
              onChange={(lockScreenPrivacy) => void update({ lockScreenPrivacy })}
              accessibilityLabel={t('settings.notificationScreen.lockScreen')}
              testID="nset-lock"
            />
          </View>
        </SettingsSection>

        <SettingsSection title={t('settings.notificationScreen.meetingLead')}>
          <View style={styles.control}>
            <SegmentedControl<LeadOption>
              options={leadOptions}
              value={leadValue}
              onChange={(key) => void update({ meetingLeadMinutes: Number(key) })}
              accessibilityLabel={t('settings.notificationScreen.meetingLead')}
              testID="nset-meeting-lead"
            />
            <Text variant="caption" tone="tertiary" style={styles.leadCaption}>
              {t('settings.notificationScreen.meetingLeadValue', {
                minutes: preferences.meetingLeadMinutes,
              })}
            </Text>
          </View>
        </SettingsSection>
      </>
    );
  }

  return (
    <SettingsScreen
      title={t('settings.notifications')}
      subtitle={t('settings.notificationScreen.subtitle')}
      onRefresh={refetch}
      refreshing={isRefetching}
      testID="nset-screen"
    >
      {isError && preferences ? (
        <QueryErrorState error={error} onRetry={refetch} testID="nset-stale" />
      ) : null}
      {body}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  control: { paddingVertical: 10, gap: 8 },
  leadCaption: { paddingHorizontal: 4 },
});
