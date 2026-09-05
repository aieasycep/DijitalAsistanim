import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { IconName } from '@da/design-tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Pressable, type PressableProps } from './Pressable';

export interface IconButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  icon: IconName;
  accessibilityLabel: string;
  variant?: 'surface' | 'primary' | 'dark' | 'onGradient' | 'plain';
  size?: 36 | 40 | 44;
  iconSize?: number;
  filled?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** Circular icon button (back 36 · mic 40 primary · overlay chips on gradients). */
export function IconButton({ icon, accessibilityLabel, variant = 'surface', size = 36, iconSize = 20, filled, color, style, ...rest }: IconButtonProps) {
  const theme = useTheme();
  const c = theme.colors;
  const bg =
    variant === 'primary' ? c.primary : variant === 'dark' ? c.inverseSurface : variant === 'onGradient' ? c.onGradientChip : variant === 'plain' ? 'transparent' : c.surface;
  const fg = color ?? (variant === 'primary' ? c.onPrimary : variant === 'dark' ? c.inkInverse : variant === 'onGradient' ? c.onGradientText : c.ink);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        variant === 'surface' && !theme.isDark ? theme.shadows.s1 : null,
        variant === 'surface' && theme.isDark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.cardRing } : null,
        style,
      ]}
      {...rest}
    >
      <Icon name={icon} size={iconSize} color={fg} filled={filled} />
    </Pressable>
  );
}

const styles = StyleSheet.create({ base: { alignItems: 'center', justifyContent: 'center' } });
