import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { IconName } from '@da/design-tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  meta?: string | null;
  /** Leading icon in a 30px tile (briefing rows) */
  icon?: IconName;
  iconFilled?: boolean;
  iconColor?: string;
  /** Leading custom element (avatar, time tile, check) */
  leading?: ReactNode;
  /** Trailing element (chevron default when pressable, or a value/badge) */
  trailing?: ReactNode;
  trailingText?: string | null;
  trailingTone?: 'tertiary' | 'primary' | 'warning' | 'success' | 'critical';
  onPress?: () => void;
  /** Draw a hairline on top (rows after the first in a group) */
  divider?: boolean;
  done?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  minHeight?: number;
}

/** List row: min 50 high, 11 vertical padding, hairline between rows, chevron when navigable. */
export function ListRow({
  title,
  meta,
  icon,
  iconFilled,
  iconColor,
  leading,
  trailing,
  trailingText,
  trailingTone = 'tertiary',
  onPress,
  divider = false,
  done = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
  minHeight,
}: ListRowProps) {
  const theme = useTheme();
  const c = theme.colors;
  const trailingColor = {
    tertiary: c.inkTertiary,
    primary: c.primaryText,
    warning: c.warningText,
    success: c.successText,
    critical: c.criticalText,
  }[trailingTone];

  const body = (
    <View
      style={[
        styles.row,
        { minHeight: minHeight ?? theme.layout.listRowMinHeight, paddingVertical: theme.layout.listRowPaddingV, borderTopWidth: divider ? StyleSheet.hairlineWidth : 0, borderTopColor: c.hairline, opacity: disabled ? 0.4 : 1 },
        style,
      ]}
    >
      {leading ??
        (icon ? (
          <View style={[styles.tile, { backgroundColor: c.surface2 }]}>
            <Icon name={icon} size={17} color={iconColor ?? c.inkSecondary} filled={iconFilled} />
          </View>
        ) : null)}
      <View style={styles.texts}>
        <Text variant="bodyMedium" tone={done ? 'secondary' : 'ink'} numberOfLines={2} style={done ? styles.strike : undefined}>
          {title}
        </Text>
        {meta ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1} style={styles.meta}>
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing ??
        (trailingText ? (
          <Text variant="caption" color={trailingColor} style={trailingTone !== 'tertiary' ? styles.trailingStrong : undefined}>
            {trailingText}
          </Text>
        ) : onPress ? (
          <Icon name="forward" size={18} color={theme.isDark ? c.inkDisabled : '#C9C5BC'} />
        ) : null)}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${title}${meta ? `, ${meta}` : ''}`}
      accessibilityHint={accessibilityHint}
      pressScale={1}
      ensureTouchTarget={false}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0 },
  meta: { marginTop: 1 },
  strike: { textDecorationLine: 'line-through' },
  trailingStrong: { fontWeight: '600' },
});
