import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { badgeColors, type BadgeTone } from '@da/design-tokens';
import type { Insight } from '@da/domain';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
}

/** Pill badge 11/700 +5%, 3×8 padding. Color only when it carries meaning (rule 1). */
export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const theme = useTheme();
  const { bg, fg } = badgeColors(theme.colors, tone);
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]} accessibilityRole="text" accessibilityLabel={label}>
      <Text variant="badge" color={fg}>
        {label}
      </Text>
    </View>
  );
}

/** Insight badge → tone mapping (design: ACİL coral, SON TARİH amber, GÜVENLİK coral, TAKVİM blue, others neutral). */
export function badgeToneFor(badge: Insight['badge']): BadgeTone {
  switch (badge) {
    case 'urgent':
      return 'critical';
    case 'security':
      return 'security';
    case 'deadline':
      return 'deadline';
    case 'waiting':
      return 'waiting';
    case 'calendar':
      return 'calendar';
    default:
      return 'neutral';
  }
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
});
