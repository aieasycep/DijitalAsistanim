import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PERSONALIZATION_INTERESTS, type PersonalizationInterest } from '@da/domain';
import { Button, FilterChip, Screen, ScreenHeader, Text, useTheme, useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { CacheKeys, writeCache } from '@/lib/storage';
import { useSessionStore } from '@/store/session';

const SPECIFIC = PERSONALIZATION_INTERESTS.filter((k) => k !== 'all');

/** "Hepsi" selects every specific interest; deselecting one drops "Hepsi"; selecting all of them re-adds it. */
export function toggleInterest(
  selected: PersonalizationInterest[],
  key: PersonalizationInterest,
): PersonalizationInterest[] {
  if (key === 'all') return selected.includes('all') ? [] : [...PERSONALIZATION_INTERESTS];
  const without = selected.filter((k) => k !== 'all');
  const next = without.includes(key) ? without.filter((k) => k !== key) : [...without, key];
  return SPECIFIC.every((k) => next.includes(k)) ? [...next, 'all'] : next;
}

/** "Senin için neler daha önemli?" — multi-select interests stored on preferences. */
export default function PersonalizationScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const ds = useDataSource();
  const toast = useToast();
  const storedPrefs = useSessionStore((s) => s.preferences);
  const setPreferences = useSessionStore((s) => s.setPreferences);
  const [selected, setSelected] = useState<PersonalizationInterest[]>(storedPrefs?.interests ?? []);

  const toggle = useCallback(
    (key: PersonalizationInterest) => setSelected((current) => toggleInterest(current, key)),
    [],
  );

  const save = useMutation({
    mutationFn: () => ds.profile.updatePreferences({ interests: selected }),
    onSuccess: (prefs) => {
      setPreferences(prefs);
      writeCache(CacheKeys.preferences, prefs);
      router.push('/(onboarding)/vip');
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' }),
  });

  const specificCount = selected.filter((k) => k !== 'all').length;

  return (
    <Screen
      scroll
      topGap={6}
      header={
        <ScreenHeader
          variant="sub"
          onBack={() => router.back()}
          backLabel={t('common.back')}
          kicker={t('onboarding.connect.step', { current: 3, total: 4 })}
        />
      }
      footer={
        <View
          style={[
            styles.footer,
            {
              paddingHorizontal: theme.layout.screenPaddingH,
              backgroundColor: theme.colors.background,
            },
          ]}
        >
          <Button
            label={
              specificCount > 0
                ? t('onboarding.personalization.continueCount', { count: specificCount })
                : t('common.continue')
            }
            size="lg"
            fullWidth
            loading={save.isPending}
            onPress={() => save.mutate()}
            testID="personalization-continue"
          />
        </View>
      }
      testID="personalization-screen"
    >
      <Text variant="display" accessibilityRole="header">
        {t('onboarding.personalization.title')}
      </Text>
      <Text variant="body" tone="secondary" style={styles.subtitle}>
        {t('onboarding.personalization.subtitle')}
      </Text>
      <View style={styles.chips}>
        {PERSONALIZATION_INTERESTS.map((key) => (
          <FilterChip
            key={key}
            label={t(`onboarding.personalization.options.${key}`)}
            selected={selected.includes(key)}
            onPress={() => toggle(key)}
            testID={`interest-${key}`}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22 },
  footer: { paddingTop: 10, paddingBottom: 12 },
});
