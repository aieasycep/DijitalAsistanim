import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { IconName } from '@da/design-tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Pressable, type PressableProps } from './Pressable';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'tonal' | 'dark' | 'surface' | 'destructive' | 'ghost' | 'ghostSecondary' | 'onGradient';
export type ButtonSize = 'lg' | 'md' | 'sm' | 'inline' | 'ghost';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconFilled?: boolean;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  /** Text shown while loading (design: "Gönderiliyor…"). Falls back to label. */
  loadingLabel?: string;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * 5 variants × states from the design system. Heights: 52 (page CTA), 48 (card), 40–42 (inline), 36 (ghost).
 * Pressed: scale .97 + darker tone (120 ms). Loading: spinner left, label with ellipsis, button locked.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  iconFilled,
  iconPosition = 'left',
  loading = false,
  loadingLabel,
  fullWidth = false,
  disabled,
  style,
  testID,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const c = theme.colors;
  const isGhost = variant === 'ghost' || variant === 'ghostSecondary';
  const height =
    size === 'lg' ? theme.sizes.buttonLarge : size === 'md' ? theme.sizes.buttonMedium : size === 'sm' ? theme.sizes.buttonSmall : size === 'inline' ? theme.sizes.buttonInline : theme.sizes.buttonGhost;
  const radius = size === 'lg' ? theme.radius.lg : size === 'sm' || size === 'inline' ? theme.radius.sm : isGhost ? theme.radius.xs : theme.radius.md;

  const palette: Record<ButtonVariant, { bg: string; fg: string; shadow?: boolean; ring?: string }> = {
    primary: { bg: c.primary, fg: c.onPrimary },
    tonal: { bg: c.primarySoft, fg: c.primaryText },
    dark: { bg: c.inverseSurface, fg: c.inkInverse },
    surface: { bg: c.surface, fg: c.ink, shadow: true, ring: theme.cardRing },
    destructive: { bg: c.destructive, fg: '#FFFFFF' },
    ghost: { bg: 'transparent', fg: c.primaryText },
    ghostSecondary: { bg: 'transparent', fg: c.inkSecondary },
    onGradient: { bg: c.onGradientChip, fg: c.onGradientText },
  };
  const p = palette[variant];
  const isDisabled = Boolean(disabled) || loading;
  const text = loading ? (loadingLabel ?? label) : label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      testID={testID}
      hapticOnPress={variant === 'destructive' ? 'warning' : variant === 'primary' && size === 'lg' ? 'light' : null}
      style={[
        styles.base,
        {
          height,
          borderRadius: radius,
          backgroundColor: p.bg,
          paddingHorizontal: isGhost ? 10 : size === 'sm' || size === 'inline' ? 14 : 18,
          opacity: isDisabled && !loading ? 0.4 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          borderWidth: p.ring && p.ring !== 'transparent' ? StyleSheet.hairlineWidth : 0,
          borderColor: p.ring,
        },
        p.shadow && !theme.isDark ? theme.shadows.s1 : null,
        style,
      ]}
      {...rest}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={p.fg} style={styles.iconLeft} />
        ) : icon && iconPosition === 'left' ? (
          <Icon name={icon} size={size === 'lg' || size === 'md' ? 20 : 18} color={p.fg} filled={iconFilled} style={styles.iconLeft} />
        ) : null}
        <Text variant={isGhost || size === 'sm' || size === 'inline' ? 'action' : 'button'} color={p.fg} numberOfLines={1}>
          {text}
        </Text>
        {!loading && icon && iconPosition === 'right' ? (
          <Icon name={icon} size={18} color={p.fg} filled={iconFilled} style={styles.iconRight} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  iconLeft: { marginRight: 0 },
  iconRight: { marginLeft: 0 },
});
