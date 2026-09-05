import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { IconName } from '@da/design-tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { Text } from './Text';

export interface FilterChipProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
}

/** Filter chip: 34 high, selected = ink background. */
export function FilterChip({ label, selected = false, disabled = false, onPress, testID }: FilterChipProps) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hapticOnPress="selection"
      testID={testID}
      style={[
        styles.filter,
        { height: theme.sizes.filterChip, backgroundColor: selected ? c.inverseSurface : theme.isDark ? c.surface2 : c.background, opacity: disabled ? 0.4 : 1 },
      ]}
    >
      <Text variant="chip" color={selected ? c.inkInverse : c.inkSecondary}>
        {label}
      </Text>
    </Pressable>
  );
}

export interface MetaChipProps {
  label: string;
  icon?: IconName;
  iconFilled?: boolean;
  tone?: 'neutral' | 'primary' | 'warning' | 'success' | 'onGradient';
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Meta chip: 30 high, icon 15 — e.g. "Yarın", "VIP", "18 dk". */
export function MetaChip({ label, icon, iconFilled, tone = 'neutral', onPress, accessibilityLabel, style }: MetaChipProps) {
  const theme = useTheme();
  const c = theme.colors;
  const tones = {
    neutral: { bg: c.surface2, fg: c.inkSecondary },
    primary: { bg: c.primarySoft, fg: c.primaryText },
    warning: { bg: c.warningSoft, fg: c.warningText },
    success: { bg: c.successSoft, fg: c.successText },
    onGradient: { bg: c.onGradientChip, fg: c.onGradientText },
  } as const;
  const t = tones[tone];
  const inner = (
    <View style={[styles.meta, { height: theme.sizes.metaChip, backgroundColor: t.bg }, style]}>
      {icon ? <Icon name={icon} size={15} color={t.fg} filled={iconFilled} /> : null}
      <Text variant="caption" color={t.fg} style={styles.metaText}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}>
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filter: { paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  meta: { paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  metaText: { fontWeight: '600' },
});
