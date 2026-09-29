import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { sansWeight } from '../utils/typography';

export interface TimeTileProps {
  /** "14" */
  hour: string;
  /** "30" */
  minute: string;
  size?: 48 | 44;
  /** inverse: white 10% tile on gradient / dark surfaces (evening "first event"). */
  variant?: 'default' | 'inverse';
  /** Dim the tile for completed rows. */
  done?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** 48×48 (or 44) radius-14 tile: hour 16/600 ink over minute 11/600 secondary. */
export function TimeTile({
  hour,
  minute,
  size = 48,
  variant = 'default',
  done = false,
  accessibilityLabel,
  style,
  testID,
}: TimeTileProps) {
  const theme = useTheme();
  const c = theme.colors;
  const inverse = variant === 'inverse';
  const background = inverse ? 'rgba(255,255,255,0.10)' : theme.isDark ? c.surface2 : c.background;
  const hourColor = inverse ? c.onGradientText : c.ink;
  const minuteColor = inverse ? c.onGradientMuted : c.inkSecondary;
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: theme.radius.md,
          backgroundColor: background,
          opacity: done ? 0.55 : 1,
        },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? `${hour}:${minute}`}
      testID={testID}
    >
      <Text variant="h4" color={hourColor} style={styles.hour} tabular>
        {hour}
      </Text>
      <Text variant="badge" color={minuteColor} style={[styles.minute, sansWeight('600')]} tabular>
        {minute}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  hour: { lineHeight: 18 },
  minute: { lineHeight: 12, letterSpacing: 0 },
});
