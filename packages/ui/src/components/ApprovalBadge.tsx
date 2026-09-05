import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../primitives/Icon';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { sansWeight } from '../utils/typography';

export interface ApprovalBadgeProps {
  count: number;
  /** Formatted label ("2 onay"). Defaults to `${count} onay`. */
  label?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** 34px white pill with task_alt 18 + "2 onay" 12/600. Renders nothing when the count is 0. */
export function ApprovalBadge({
  count,
  label,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: ApprovalBadgeProps) {
  const theme = useTheme();
  const c = theme.colors;
  if (count <= 0) return null;
  const text = label ?? `${count} onay`;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${text} · Onay Merkezi`}
      testID={testID}
      style={[
        styles.pill,
        {
          height: theme.sizes.filterChip,
          backgroundColor: c.surface,
          borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.cardRing,
        },
        theme.isDark ? null : theme.shadows.s1,
        style,
      ]}
    >
      <Icon name="approval" size={18} color={c.primaryText} />
      <Text variant="caption" color={c.primaryText} style={sansWeight('600')} tabular>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 9,
    paddingRight: 12,
    borderRadius: 999,
  },
});
