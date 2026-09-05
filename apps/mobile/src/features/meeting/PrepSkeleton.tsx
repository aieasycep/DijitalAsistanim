import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, Skeleton, Text, useTheme } from '@da/ui';

/** Person row + dark "3 şey" shell + evidence groups, with the "hazırlanıyor" line. */
export function PrepSkeleton() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.stack} testID="prep-loading">
      <View style={styles.person}>
        <Skeleton width={56} height={56} radius={28} />
        <View style={styles.texts}>
          <Skeleton width="55%" height={20} />
          <Skeleton width="80%" height={12} />
        </View>
      </View>
      <Card variant="inverse" radius={theme.radius.modal}>
        <Text variant="aiLabel" color={theme.colors.primaryGlow}>
          {t('meeting.preparing')}
        </Text>
        <View style={styles.rows}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.row}>
              <Skeleton width={26} height={26} radius={13} />
              <View style={styles.texts}>
                <Skeleton width="45%" height={14} />
                <Skeleton width="90%" height={12} />
              </View>
            </View>
          ))}
        </View>
      </Card>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={64} radius={theme.radius.xl} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  texts: { flex: 1, gap: 6 },
  rows: { marginTop: 14, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
