import { useCallback, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { BriefingSchedule } from '@da/domain';
import type { IconName } from '@da/design-tokens';
import {
  BottomSheet,
  Button,
  Card,
  Icon,
  Pressable,
  Screen,
  ScreenHeader,
  Text,
  Toggle,
  useTheme,
  useToast,
} from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { CacheKeys, writeCache } from '@/lib/storage';
import { useSessionStore } from '@/store/session';

type TimeKey = 'morning' | 'midday' | 'evening';

const DEFAULT_SCHEDULE: BriefingSchedule = {
  morningTime: '08:00',
  middayEnabled: true,
  middayTime: '13:00',
  eveningEnabled: true,
  eveningTime: '19:00',
  weeklyEnabled: true,
  weeklyDay: 0,
  weeklyTime: '18:00',
  weekendEnabled: false,
  quietDays: [],
};

const TIME_FIELD: Record<TimeKey, 'morningTime' | 'middayTime' | 'eveningTime'> = {
  morning: 'morningTime',
  midday: 'middayTime',
  evening: 'eveningTime',
};
const ROW_ICON: Record<TimeKey | 'weekend', IconName> = {
  morning: 'today',
  midday: 'schedule',
  evening: 'bedtime',
  weekend: 'event',
};

export function toDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map((v) => Number.parseInt(v, 10));
  const d = new Date();
  d.setHours(Number.isFinite(h) ? (h as number) : 8, Number.isFinite(m) ? (m as number) : 0, 0, 0);
  return d;
}

export function toHHmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "Günün ne zaman başlıyor?" — morning time, midday / evening toggles with times, weekend toggle. */
export default function BriefingPrefsScreen() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const ds = useDataSource();
  const toast = useToast();
  const storedPrefs = useSessionStore((s) => s.preferences);
  const setPreferences = useSessionStore((s) => s.setPreferences);
  const [draft, setDraft] = useState<BriefingSchedule | null>(null);
  const [picker, setPicker] = useState<TimeKey | null>(null);
  const c = theme.colors;

  const prefsQuery = useQuery({
    queryKey: qk.preferences,
    queryFn: () => ds.profile.getPreferences(),
    initialData: storedPrefs ?? undefined,
  });
  const schedule = useMemo<BriefingSchedule>(
    () => draft ?? prefsQuery.data?.briefing ?? DEFAULT_SCHEDULE,
    [draft, prefsQuery.data],
  );
  const update = useCallback(
    (patch: Partial<BriefingSchedule>) => setDraft({ ...schedule, ...patch }),
    [schedule],
  );

  const openPicker = useCallback(
    (key: TimeKey) => {
      if (Platform.OS === 'android') {
        DateTimePickerAndroid.open({
          mode: 'time',
          is24Hour: true,
          value: toDate(schedule[TIME_FIELD[key]]),
          onChange: (event: DateTimePickerEvent, date?: Date) => {
            if (event.type === 'set' && date) update({ [TIME_FIELD[key]]: toHHmm(date) });
          },
        });
        return;
      }
      setPicker(key);
    },
    [schedule, update],
  );

  const save = useMutation({
    mutationFn: () => ds.profile.updatePreferences({ briefing: schedule }),
    onSuccess: (prefs) => {
      setPreferences(prefs);
      writeCache(CacheKeys.preferences, prefs);
      router.push('/(onboarding)/personalization');
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' }),
  });

  const rows: { key: TimeKey | 'weekend'; title: string; meta: string }[] = [
    {
      key: 'morning',
      title: t('onboarding.briefingPrefs.morning'),
      meta: t('onboarding.briefingPrefs.morningMeta'),
    },
    {
      key: 'midday',
      title: t('onboarding.briefingPrefs.midday'),
      meta: t('onboarding.briefingPrefs.middayMeta'),
    },
    {
      key: 'evening',
      title: t('onboarding.briefingPrefs.evening'),
      meta: t('onboarding.briefingPrefs.eveningMeta'),
    },
    {
      key: 'weekend',
      title: t('onboarding.briefingPrefs.weekend'),
      meta: t('onboarding.briefingPrefs.weekendMeta'),
    },
  ];

  const enabledFor = (key: TimeKey | 'weekend'): boolean =>
    key === 'midday'
      ? schedule.middayEnabled
      : key === 'evening'
        ? schedule.eveningEnabled
        : key === 'weekend'
          ? schedule.weekendEnabled
          : true;

  const pickerRow = picker ? rows.find((r) => r.key === picker) : undefined;

  return (
    <Screen
      scroll
      topGap={6}
      header={
        <ScreenHeader
          variant="sub"
          onBack={() => router.back()}
          backLabel={t('common.back')}
          kicker={t('onboarding.connect.step', { current: 2, total: 4 })}
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
            label={t('common.continue')}
            size="lg"
            fullWidth
            loading={save.isPending}
            onPress={() => save.mutate()}
            testID="bprefs-continue"
          />
        </View>
      }
      testID="bprefs-screen"
    >
      <Text variant="display" accessibilityRole="header">
        {t('onboarding.briefingPrefs.title')}
      </Text>
      <Text variant="body" tone="secondary" style={styles.subtitle}>
        {t('onboarding.briefingPrefs.subtitle')}
      </Text>
      <View style={styles.rows}>
        {rows.map((row) => {
          const enabled = enabledFor(row.key);
          const isTime = row.key !== 'weekend';
          const time = isTime ? schedule[TIME_FIELD[row.key as TimeKey]] : null;
          return (
            <Card key={row.key} radius={theme.radius.xl} padding={{ vertical: 14, horizontal: 16 }}>
              <View style={styles.row}>
                <View
                  style={[
                    styles.tile,
                    {
                      backgroundColor: row.key === 'morning' ? c.primarySoft : c.surface2,
                      borderRadius: theme.radius.md,
                    },
                  ]}
                >
                  <Icon
                    name={ROW_ICON[row.key]}
                    size={22}
                    color={row.key === 'morning' ? c.primary : c.inkSecondary}
                  />
                </View>
                <View style={styles.texts}>
                  <Text variant="button" numberOfLines={1}>
                    {row.title}
                  </Text>
                  <Text variant="caption" tone="tertiary" numberOfLines={1} style={styles.meta}>
                    {row.meta}
                  </Text>
                </View>
                {isTime && enabled && time ? (
                  <Pressable
                    onPress={() => openPicker(row.key as TimeKey)}
                    accessibilityRole="button"
                    accessibilityLabel={t('a11y.timePicker', { label: row.title })}
                    style={[
                      styles.timeChip,
                      { backgroundColor: c.primarySoft, borderRadius: theme.radius.xs },
                    ]}
                    testID={row.key === 'morning' ? 'bprefs-morning' : `bprefs-${row.key}-time`}
                  >
                    <Text variant="button" color={c.primaryText} tabular>
                      {time}
                    </Text>
                  </Pressable>
                ) : null}
                {row.key !== 'morning' ? (
                  <Toggle
                    value={enabled}
                    onValueChange={(next) =>
                      update(
                        row.key === 'midday'
                          ? { middayEnabled: next }
                          : row.key === 'evening'
                            ? { eveningEnabled: next }
                            : { weekendEnabled: next },
                      )
                    }
                    accessibilityLabel={t('a11y.toggle', { label: row.title })}
                    testID={`bprefs-${row.key}`}
                  />
                ) : null}
              </View>
            </Card>
          );
        })}
      </View>

      {Platform.OS !== 'android' ? (
        <BottomSheet
          visible={picker !== null}
          onClose={() => setPicker(null)}
          title={
            pickerRow
              ? t('onboarding.briefingPrefs.pickTime', { label: pickerRow.title })
              : undefined
          }
          closeLabel={t('common.close')}
          footer={
            <Button
              label={t('common.ok')}
              size="md"
              fullWidth
              onPress={() => setPicker(null)}
              style={styles.sheetButton}
              testID="bprefs-time-done"
            />
          }
          testID="bprefs-time-sheet"
        >
          {picker ? (
            <DateTimePicker
              mode="time"
              display="spinner"
              value={toDate(schedule[TIME_FIELD[picker]])}
              minuteInterval={5}
              locale={i18n.language === 'en' ? 'en-GB' : 'tr-TR'}
              onChange={(_event: DateTimePickerEvent, date?: Date) => {
                if (date) update({ [TIME_FIELD[picker]]: toHHmm(date) });
              }}
              style={styles.picker}
              testID="bprefs-time-picker"
            />
          ) : null}
        </BottomSheet>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginTop: 8 },
  rows: { marginTop: 22, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0 },
  meta: { marginTop: 2 },
  timeChip: { paddingHorizontal: 10, paddingVertical: 6 },
  footer: { paddingTop: 10, paddingBottom: 12 },
  sheetButton: { marginTop: 8 },
  picker: { alignSelf: 'stretch' },
});
