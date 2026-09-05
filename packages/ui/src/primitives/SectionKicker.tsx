import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';

export interface SectionKickerProps {
  label: string;
  /** Right-side meta: "5 konu" */
  meta?: string | null;
  tone?: 'default' | 'onGradient' | 'primary';
  style?: StyleProp<ViewStyle>;
}

/** Section kicker 12/600 +8% caps, 4px inset, optional count meta (design: "ÖNCELİKLERİN · 5 konu"). */
export function SectionKicker({ label, meta, tone = 'default', style }: SectionKickerProps) {
  const toneMap = { default: 'tertiary', onGradient: 'onGradientMuted', primary: 'primary' } as const;
  return (
    <View style={[styles.row, style]} accessibilityRole="header">
      <Text variant="kicker" tone={toneMap[tone]}>
        {label}
      </Text>
      {meta ? (
        <Text variant="caption" tone={toneMap[tone]}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 4 },
});
