import { StyleSheet, View } from 'react-native';
import { ListGroup, Skeleton, useTheme } from '@da/ui';

export interface SettingsSkeletonProps {
  /** Rows per group (design: 3 groups × 4 rows on the hub). */
  rows?: number;
  groups?: number;
  testID?: string;
}

/** Grouped-list skeleton at real row heights; no shimmer under reduced motion (Skeleton handles it). */
export function SettingsSkeleton({ rows = 4, groups = 1, testID }: SettingsSkeletonProps) {
  const theme = useTheme();
  return (
    <View style={[styles.wrap, { gap: theme.layout.sectionGap }]} testID={testID}>
      {Array.from({ length: groups }, (_, g) => (
        <ListGroup key={g} dividers={false}>
          {Array.from({ length: rows }, (_, r) => (
            <View
              key={r}
              style={[styles.row, { minHeight: theme.layout.listRowMinHeight }]}
              accessibilityElementsHidden={r > 0}
            >
              <Skeleton width={30} height={30} radius={10} />
              <Skeleton width={`${55 + ((r * 13) % 30)}%`} height={12} />
            </View>
          ))}
        </ListGroup>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
});
