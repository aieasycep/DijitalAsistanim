import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BriefingSchedule, Feature, Locale } from '@da/domain';
import { BottomSheet, FilterChip, SheetRow, Text } from '@da/ui';
import { QueryErrorState } from '@/features/flow/ScreenStates';
import { SettingsRowLink } from '@/features/settings/SettingsRowLink';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { SettingsSection } from '@/features/settings/SettingsSection';
import { SettingsSkeleton } from '@/features/settings/SettingsSkeleton';
import { TimePickerRow } from '@/features/settings/TimePickerRow';
import { TimezoneSheet } from '@/features/settings/TimezoneSheet';
import { ToggleRow } from '@/features/settings/ToggleRow';
import { timezoneLabel } from '@/features/settings/timezones';
import { usePreferences } from '@/features/settings/usePreferences';
import {
  ISO_WEEKDAYS,
  isoToWeeklyDay,
  toggleQuietDay,
  weekdayLabel,
  weeklyDayToIso,
  type IsoWeekday,
} from '@/features/settings/weekdays';
import { useEntitlement } from '@/hooks/useEntitlement';

const GATE_CONTEXT = 'settings_briefing';

type GatedKey = 'middayEnabled' | 'eveningEnabled' | 'weeklyEnabled';
const GATED_FEATURE: Record<GatedKey, Feature> = {
  middayEnabled: 'midday_pulse',
  eveningEnabled: 'evening_close',
  weeklyEnabled: 'weekly_insights',
};

/** Briefing schedule: times, per-briefing toggles (Pro-gated), weekly day, weekend, quiet days, zone. */
export default function BriefingSettingsScreen() {
  const { t, i18n } = useTranslation();
  const { preferences, isLoading, isError, error, refetch, isRefetching, update } =
    usePreferences();
  const { isPro, gate } = useEntitlement();
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [now] = useState(() => new Date());
  const locale: Locale = i18n.language.startsWith('en') ? 'en' : 'tr';
  const schedule = preferences?.briefing ?? null;
  const proBadge = isPro ? null : t('common.pro');

  const patch = (changes: Partial<BriefingSchedule>) => {
    if (!schedule) return;
    void update({ briefing: { ...schedule, ...changes } });
  };

  const toggleGated = (key: GatedKey, next: boolean) => {
    if (next && !isPro && !gate(GATED_FEATURE[key], GATE_CONTEXT)) return;
    patch({ [key]: next });
  };

  let body: ReactNode;
  if (!schedule && isLoading) {
    body = <SettingsSkeleton rows={4} groups={2} testID="bset-loading" />;
  } else if (!schedule) {
    body = <QueryErrorState error={error} onRetry={refetch} testID="bset-error" />;
  } else {
    const weeklyIso = weeklyDayToIso(schedule.weeklyDay);
    body = (
      <>
        <SettingsSection
          title={t('settings.briefingScreen.schedule')}
          note={isPro ? null : t('settings.briefingScreen.proNote')}
        >
          <TimePickerRow
            icon="today"
            title={t('settings.briefingScreen.morning')}
            value={schedule.morningTime}
            onChange={(morningTime) => patch({ morningTime })}
            testID="bset-morning"
          />
          <ToggleRow
            icon="schedule"
            title={t('settings.briefingScreen.middayEnabled')}
            value={schedule.middayEnabled}
            onValueChange={(next) => toggleGated('middayEnabled', next)}
            badge={proBadge}
            testID="bset-midday"
          />
          {schedule.middayEnabled ? (
            <TimePickerRow
              title={t('settings.briefingScreen.middayTime')}
              value={schedule.middayTime}
              onChange={(middayTime) => patch({ middayTime })}
              testID="bset-midday-time"
            />
          ) : null}
          <ToggleRow
            icon="bedtime"
            title={t('settings.briefingScreen.eveningEnabled')}
            value={schedule.eveningEnabled}
            onValueChange={(next) => toggleGated('eveningEnabled', next)}
            badge={proBadge}
            testID="bset-evening"
          />
          {schedule.eveningEnabled ? (
            <TimePickerRow
              title={t('settings.briefingScreen.eveningTime')}
              value={schedule.eveningTime}
              onChange={(eveningTime) => patch({ eveningTime })}
              testID="bset-evening-time"
            />
          ) : null}
          <ToggleRow
            icon="trendingUp"
            title={t('settings.briefingScreen.weeklyEnabled')}
            value={schedule.weeklyEnabled}
            onValueChange={(next) => toggleGated('weeklyEnabled', next)}
            badge={proBadge}
            testID="bset-weekly"
          />
          {schedule.weeklyEnabled ? (
            <SettingsRowLink
              title={t('settings.briefingScreen.weeklyDay')}
              value={weekdayLabel(weeklyIso, locale, 'long')}
              onPress={() => setDayOpen(true)}
              testID="bset-weekly-day"
            />
          ) : null}
          {schedule.weeklyEnabled ? (
            <TimePickerRow
              title={t('settings.briefingScreen.weeklyTime')}
              value={schedule.weeklyTime}
              onChange={(weeklyTime) => patch({ weeklyTime })}
              testID="bset-weekly-time"
            />
          ) : null}
        </SettingsSection>

        <SettingsSection
          title={t('settings.briefingScreen.days')}
          note={`${t('settings.briefingScreen.weekendNote')} ${t('settings.briefingScreen.quietDaysNote')}`}
        >
          <ToggleRow
            icon="event"
            title={t('settings.briefingScreen.weekend')}
            value={schedule.weekendEnabled}
            onValueChange={(weekendEnabled) => patch({ weekendEnabled })}
            testID="bset-weekend"
          />
          <View style={styles.quiet}>
            <Text variant="bodyMedium">{t('settings.briefingScreen.quietDays')}</Text>
            <View style={styles.chips} accessibilityRole="tablist">
              {ISO_WEEKDAYS.map((iso) => (
                <FilterChip
                  key={iso}
                  label={weekdayLabel(iso, locale)}
                  selected={schedule.quietDays.includes(iso)}
                  onPress={() => patch({ quietDays: toggleQuietDay(schedule.quietDays, iso) })}
                  testID={`bset-quiet-${iso}`}
                />
              ))}
            </View>
          </View>
        </SettingsSection>

        <SettingsSection>
          <SettingsRowLink
            icon="schedule"
            title={t('settings.briefingScreen.timezone')}
            value={timezoneLabel(preferences?.timezone ?? 'UTC', now)}
            onPress={() => setTimezoneOpen(true)}
            testID="bset-timezone"
          />
        </SettingsSection>

        <BottomSheet
          visible={dayOpen}
          onClose={() => setDayOpen(false)}
          title={t('settings.briefingScreen.pickDay')}
          closeLabel={t('common.close')}
          testID="bset-weekly-day-sheet"
        >
          {ISO_WEEKDAYS.map((iso: IsoWeekday, index) => (
            <SheetRow
              key={iso}
              label={weekdayLabel(iso, locale, 'long')}
              value={schedule.weeklyTime}
              selected={iso === weeklyIso}
              divider={index > 0}
              onPress={() => {
                patch({ weeklyDay: isoToWeeklyDay(iso) });
                setDayOpen(false);
              }}
              testID={`bset-weekly-day-${iso}`}
            />
          ))}
        </BottomSheet>

        <TimezoneSheet
          visible={timezoneOpen}
          current={preferences?.timezone ?? 'UTC'}
          onClose={() => setTimezoneOpen(false)}
          onSelect={(timezone) => {
            setTimezoneOpen(false);
            void update({ timezone });
          }}
          testID="bset-tz"
        />
      </>
    );
  }

  return (
    <SettingsScreen
      title={t('settings.briefing')}
      subtitle={t('settings.briefingScreen.subtitle')}
      onRefresh={refetch}
      refreshing={isRefetching}
      testID="bset-screen"
    >
      {isError && schedule ? (
        <QueryErrorState error={error} onRetry={refetch} testID="bset-stale" />
      ) : null}
      {body}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  quiet: { paddingVertical: 12, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
