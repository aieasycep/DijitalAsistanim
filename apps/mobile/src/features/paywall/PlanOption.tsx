/**
 * Plan picker row (`control/plan-option`): radio + title (+ "En Avantajlı" badge) + price line.
 * Selected = 2px indigo ring; the ring is reserved on unselected rows so nothing shifts on tap.
 */
import { StyleSheet, View } from 'react-native';
import { Badge, Card, Skeleton, Text, useTheme } from '@da/ui';

export interface PlanOptionProps {
  title: string;
  price: string;
  meta?: string | null;
  badge?: string | null;
  selected: boolean;
  loading?: boolean;
  onSelect: () => void;
  accessibilityLabel: string;
  testID?: string;
}

export function PlanOption({
  title,
  price,
  meta,
  badge,
  selected,
  loading = false,
  onSelect,
  accessibilityLabel,
  testID,
}: PlanOptionProps) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Card
      variant={selected ? 'selected' : 'default'}
      radius={theme.radius.lg}
      padding={{ horizontal: 16, vertical: 14 }}
      onPress={onSelect}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      style={
        selected
          ? null
          : { borderWidth: 2, borderColor: theme.isDark ? theme.cardRing : 'transparent' }
      }
      testID={testID}
    >
      <View style={styles.row}>
        <View
          style={[
            styles.radio,
            {
              borderColor: selected ? c.primary : c.divider,
              backgroundColor: selected ? c.primary : c.surface,
            },
          ]}
        >
          {selected ? <View style={[styles.radioInner, { backgroundColor: c.surface }]} /> : null}
        </View>
        <View style={styles.texts}>
          <View style={styles.titleRow}>
            <Text variant="h4">{title}</Text>
            {badge ? <Badge label={badge} tone="approved" /> : null}
          </View>
          {loading ? (
            <Skeleton width="55%" height={12} style={styles.skeleton} />
          ) : (
            <Text variant="small" tone="secondary" style={styles.meta} tabular>
              {[price, meta].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 8, height: 8, borderRadius: 4 },
  texts: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { marginTop: 2 },
  skeleton: { marginTop: 6 },
});
