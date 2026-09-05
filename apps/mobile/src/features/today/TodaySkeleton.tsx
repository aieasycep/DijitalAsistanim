import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CardSkeleton, Skeleton, useTheme } from '@da/ui';

/** Loading state of Today at real card dimensions: header lines, hero card, three priority cards. */
export function TodaySkeleton({ testID = 'today-skeleton' }: { testID?: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  return (
    <View
      style={[styles.wrap, { gap: theme.layout.cardGap }]}
      testID={testID}
      accessibilityLabel={t('common.loading')}
    >
      <View style={styles.header}>
        <Skeleton width="38%" height={10} />
        <Skeleton width="62%" height={24} radius={8} style={styles.gap} />
      </View>
      <View
        style={[
          styles.hero,
          {
            backgroundColor: c.surface,
            borderRadius: theme.radius.hero,
            borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
            borderColor: theme.cardRing,
          },
          theme.shadows.s2,
        ]}
      >
        <Skeleton width="40%" height={10} />
        <Skeleton width="90%" height={22} radius={8} style={styles.gap} />
        <Skeleton width="60%" height={22} radius={8} />
        <Skeleton width="70%" height={12} style={styles.gap} />
        <View style={styles.heroButtons}>
          <Skeleton width="55%" height={44} radius={14} />
          <Skeleton width="35%" height={44} radius={14} />
        </View>
      </View>
      <Skeleton width="34%" height={10} style={styles.kicker} />
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  header: { marginBottom: 6 },
  gap: { marginTop: 8 },
  hero: { padding: 22 },
  heroButtons: { flexDirection: 'row', gap: 10, marginTop: 18 },
  kicker: { marginTop: 8, marginLeft: 4 },
});
