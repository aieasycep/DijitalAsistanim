import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { motion } from '@da/design-tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Pressable, type PressableProps } from './Pressable';

export type CardVariant =
  | 'default'
  | 'listGroup'
  | 'hero'
  | 'aiInsight'
  | 'inverse'
  | 'suggested'
  | 'selected'
  | 'paper'
  | 'flat';

export interface CardProps extends ViewProps {
  variant?: CardVariant;
  /** Padding override. Default: 16 (card) · 4/16 (list group) · 22 (hero). */
  padding?: number | { horizontal?: number; vertical?: number; top?: number; bottom?: number };
  radius?: number;
  onPress?: PressableProps['onPress'];
  onLongPress?: PressableProps['onLongPress'];
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Card patterns: shadow-2, no border in light; #1F1E1B + 6% white hairline in dark.
 * Dashed border only means "suggested / not yet real". Selected = 2px indigo ring.
 */
export function Card({
  variant = 'default',
  padding,
  radius,
  onPress,
  onLongPress,
  accessibilityLabel,
  style,
  children,
  testID,
  ...rest
}: CardProps) {
  const theme = useTheme();
  const c = theme.colors;
  const r =
    radius ??
    (variant === 'hero'
      ? theme.radius.hero
      : variant === 'listGroup'
        ? theme.radius.xl
        : theme.radius.xxl);

  const base: ViewStyle = {
    borderRadius: r,
    overflow: variant === 'hero' || variant === 'aiInsight' ? 'hidden' : undefined,
  };
  const pad: ViewStyle = (() => {
    if (typeof padding === 'number') return { padding };
    if (padding)
      return {
        paddingHorizontal: padding.horizontal,
        paddingVertical: padding.vertical,
        paddingTop: padding.top,
        paddingBottom: padding.bottom,
      };
    if (variant === 'listGroup') return { paddingVertical: 4, paddingHorizontal: 16 };
    if (variant === 'hero') return { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 20 };
    if (variant === 'inverse') return { padding: 22 };
    return { padding: theme.layout.cardPadding };
  })();

  const surface: ViewStyle = (() => {
    switch (variant) {
      case 'inverse':
        return { backgroundColor: c.inverseSurface };
      case 'suggested':
        return {
          backgroundColor: c.suggestedSurface,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: c.suggestedBorder,
        };
      case 'selected':
        return { backgroundColor: c.surface, borderWidth: 2, borderColor: c.focusRing };
      case 'paper':
        return { backgroundColor: c.paper };
      case 'flat':
        return { backgroundColor: c.surface2 };
      default:
        return theme.isDark
          ? {
              backgroundColor: c.surface,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.cardRing,
            }
          : { backgroundColor: c.surface };
    }
  })();

  const shadow =
    variant === 'suggested' || variant === 'flat' || variant === 'paper'
      ? null
      : variant === 'hero'
        ? theme.shadows.brand
        : theme.shadows.s2;

  const content =
    variant === 'hero' || variant === 'aiInsight' ? (
      <View style={[base, surface, shadow, style]} testID={testID} {...rest}>
        <LinearGradient
          colors={theme.isDark ? ['rgba(133,134,242,0.28)', c.surface] : ['#E4E4FA', '#FFFFFF']}
          start={variant === 'hero' ? { x: 1, y: 0 } : { x: 0, y: 0 }}
          end={variant === 'hero' ? { x: 0.2, y: 1 } : { x: 0.7, y: 0.8 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={pad}>{children}</View>
      </View>
    ) : (
      <View style={[base, surface, shadow, pad, style]} testID={testID} {...rest}>
        {children}
      </View>
    );

  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        pressScale={motion.scale.cardPressed}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        ensureTouchTarget={false}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}
