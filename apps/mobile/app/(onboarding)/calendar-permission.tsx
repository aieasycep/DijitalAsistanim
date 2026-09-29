import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { IconName } from '@da/design-tokens';
import {
  Button,
  Card,
  EmptyState,
  Icon,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
  useToast,
} from '@da/ui';
import { describeError } from '@/lib/errors';
import { useDeviceCalendar } from '@/features/onboarding/useDeviceCalendar';

const POINT_ICONS: IconName[] = ['today', 'conflict', 'calendarAdd'];

/** Native calendar permission (EventKit / Android) with the denied state ("Ayarları Aç") and skip. */
export default function CalendarPermissionScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { status, request, registerAndSync, check, openSettings } = useDeviceCalendar();
  const [denied, setDenied] = useState(false);
  const c = theme.colors;

  const goNext = useCallback(() => router.replace('/(onboarding)/briefing-prefs'), [router]);

  useEffect(() => {
    let cancelled = false;
    void check().then((outcome) => {
      if (!cancelled) setDenied(outcome === 'denied');
    });
    return () => {
      cancelled = true;
    };
  }, [check]);

  // Back from Settings: if the user enabled access there, register + sync and move on.
  useEffect(() => {
    if (!denied) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void check().then(async (outcome) => {
        if (outcome !== 'granted') return;
        try {
          await registerAndSync();
          goNext();
        } catch (e) {
          toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' });
        }
      });
    });
    return () => sub.remove();
  }, [denied, check, registerAndSync, goNext, toast, t]);

  const onAllow = useCallback(async () => {
    try {
      const result = await request();
      if (result.outcome === 'granted') {
        if (result.uploaded > 0)
          toast.show({
            message: t('onboarding.calendarPermission.synced', { count: result.uploaded }),
            icon: 'check',
            iconTone: 'success',
          });
        goNext();
      } else if (result.outcome === 'denied') {
        setDenied(true);
      }
    } catch (e) {
      toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' });
    }
  }, [request, goNext, toast, t]);

  const busy = status === 'requesting' || status === 'syncing';
  const points = [
    t('onboarding.explainer.calPoint1'),
    t('onboarding.explainer.calPoint2'),
    t('onboarding.explainer.calPoint3'),
  ];

  if (denied) {
    return (
      <Screen
        topGap={6}
        header={<ScreenHeader variant="sub" kicker={t('onboarding.explainer.kicker.calendar')} />}
        testID="calperm-screen"
      >
        <View style={styles.deniedWrap}>
          <EmptyState
            icon="event"
            tone="error"
            title={t('onboarding.calendarPermission.deniedTitle')}
            body={t('onboarding.calendarPermission.deniedBody')}
          />
          <Button
            label={t('onboarding.calendarPermission.openSettings')}
            size="lg"
            fullWidth
            icon="settings"
            onPress={() => void openSettings()}
            testID="calperm-settings"
          />
          <Button
            label={t('onboarding.calendarPermission.skip')}
            variant="ghostSecondary"
            size="ghost"
            onPress={goNext}
            style={styles.center}
            testID="calperm-skip"
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      topGap={6}
      header={<ScreenHeader variant="sub" kicker={t('onboarding.explainer.kicker.calendar')} />}
      footer={
        <View
          style={[
            styles.footer,
            { paddingHorizontal: theme.layout.screenPaddingH, backgroundColor: c.background },
          ]}
        >
          <Button
            label={t('onboarding.calendarPermission.cta')}
            size="lg"
            fullWidth
            loading={busy}
            loadingLabel={
              status === 'syncing' ? t('onboarding.calendarPermission.syncing') : t('common.wait')
            }
            onPress={() => void onAllow()}
            testID="calperm-cta"
          />
          <Button
            label={t('common.skip')}
            variant="ghostSecondary"
            size="ghost"
            disabled={busy}
            onPress={goNext}
            style={styles.center}
            testID="calperm-skip"
          />
        </View>
      }
      testID="calperm-screen"
    >
      <View
        style={[styles.tile, { backgroundColor: c.successSoft, borderRadius: theme.radius.md }]}
      >
        <Icon name="event" size={22} color={c.successText} />
      </View>
      <Text variant="h2" style={styles.title} accessibilityRole="header">
        {t('onboarding.calendarPermission.title')}
      </Text>
      <View style={styles.points}>
        {points.map((point, i) => (
          <Card
            key={point}
            variant="flat"
            radius={theme.radius.lg}
            padding={{ vertical: 11, horizontal: 14 }}
          >
            <View style={styles.row}>
              <Icon name={POINT_ICONS[i] ?? 'check'} size={20} color={c.primary} />
              <Text variant="bodyMedium" style={styles.rowText}>
                {point}
              </Text>
            </View>
          </Card>
        ))}
      </View>
      <View
        style={[styles.trust, { backgroundColor: c.primarySoft, borderRadius: theme.radius.lg }]}
      >
        <Icon name="assurance" size={18} color={c.primaryText} />
        <Text variant="small" color={c.primaryText} style={styles.rowText}>
          {t('onboarding.calendarPermission.body')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tile: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  title: { marginTop: 14 },
  points: { marginTop: 18, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1 },
  trust: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginTop: 18 },
  footer: { paddingTop: 10, paddingBottom: 12, gap: 8 },
  center: { alignSelf: 'center' },
  deniedWrap: { flex: 1, justifyContent: 'center', gap: 8 },
});
