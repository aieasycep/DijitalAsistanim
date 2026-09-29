import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Profile } from '@da/domain';
import { Button, Card, Icon, Screen, Text, useTheme, useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { captureError } from '@/lib/monitoring';
import { writeCache } from '@/lib/storage';
import { registerPushToken, requestPermission } from '@/services/notifications';
import { useSessionStore } from '@/store/session';

const PROFILE_CACHE_KEY = 'session.profile.v1';

/** "Sadece önemli olduğunda haber verelim." — system prompt only after the value moment; both paths complete onboarding. */
export default function NotificationsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const ds = useDataSource();
  const toast = useToast();
  const session = useSessionStore((s) => s.session);
  const setProfile = useSessionStore((s) => s.setProfile);
  const c = theme.colors;

  const finish = useMutation({
    mutationFn: async (enable: boolean): Promise<Profile> => {
      if (enable) {
        const permission = await requestPermission();
        if (permission === 'granted') {
          const result = await registerPushToken(ds, {
            userId: session?.user.id ?? null,
            force: true,
          });
          if (result.status === 'failed')
            captureError(new Error(result.reason), { where: 'notifications.registerPushToken' });
          toast.show({
            message: t('onboarding.notifications.enabledToast'),
            icon: 'reminder',
            iconTone: 'success',
          });
        } else if (permission === 'denied') {
          toast.show({ message: t('onboarding.notifications.deniedToast'), icon: 'info' });
        }
      }
      return ds.profile.completeOnboarding();
    },
    onSuccess: (profile) => {
      setProfile(profile);
      writeCache(PROFILE_CACHE_KEY, profile);
      router.replace('/(tabs)/today');
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' }),
  });

  const examples = t('onboarding.notifications.examples', { returnObjects: true });
  const times = t('onboarding.notifications.exampleTimes', { returnObjects: true });
  const exampleTexts: string[] = Array.isArray(examples) ? examples.map(String) : [];
  const exampleTimes: string[] = Array.isArray(times) ? times.map(String) : [];
  const finishMutate = finish.mutate;
  const enable = useCallback(() => finishMutate(true), [finishMutate]);
  const later = useCallback(() => finishMutate(false), [finishMutate]);

  return (
    <Screen
      scroll
      footer={
        <View
          style={[
            styles.footer,
            { paddingHorizontal: theme.layout.screenPaddingH, backgroundColor: c.background },
          ]}
        >
          <Button
            label={t('onboarding.notifications.cta')}
            size="lg"
            fullWidth
            icon="reminder"
            loading={finish.isPending && finish.variables === true}
            disabled={finish.isPending}
            onPress={enable}
            testID="notif-enable"
          />
          <Button
            label={t('onboarding.notifications.later')}
            variant="ghostSecondary"
            size="ghost"
            loading={finish.isPending && finish.variables === false}
            disabled={finish.isPending}
            onPress={later}
            style={styles.center}
            testID="notif-later"
          />
        </View>
      }
      testID="notif-screen"
    >
      <View style={styles.previews}>
        {exampleTexts.map((text, i) => (
          <Card
            key={text}
            radius={theme.radius.xxl}
            padding={14}
            style={{ transform: [{ translateX: i === 0 ? -8 : i === 1 ? 8 : -4 }] }}
          >
            <View style={styles.preview}>
              <View style={[styles.appIcon, { backgroundColor: c.primary }]}>
                <Icon name="ai" size={22} color={c.onPrimary} filled />
              </View>
              <View style={styles.previewTexts}>
                <View style={styles.previewHeader}>
                  <Text variant="chip" numberOfLines={1}>
                    {t('app.name')}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {exampleTimes[i] ?? ''}
                  </Text>
                </View>
                <Text variant="secondary" style={styles.previewBody}>
                  {text}
                </Text>
              </View>
            </View>
          </Card>
        ))}
      </View>
      <Text variant="display" align="center" style={styles.title} accessibilityRole="header">
        {t('onboarding.notifications.title')}
      </Text>
      <Text variant="body" tone="secondary" align="center" style={styles.subtitle}>
        {t('onboarding.notifications.subtitle')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  previews: { gap: 10, marginTop: 24, paddingHorizontal: 8 },
  preview: { flexDirection: 'row', gap: 12 },
  appIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTexts: { flex: 1, minWidth: 0 },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  previewBody: { marginTop: 2 },
  title: { marginTop: 32 },
  subtitle: { marginTop: 8, alignSelf: 'center', maxWidth: 320 },
  footer: { paddingTop: 10, paddingBottom: 12, gap: 8 },
  center: { alignSelf: 'center' },
});
