import { forwardRef, useCallback } from 'react';
import {
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion } from '@da/design-tokens';
import { useThemeContext } from '../theme/ThemeProvider';
import { haptic, type HapticKind } from '../theme/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

export interface PressableProps extends RNPressableProps {
  /** Pressed scale (buttons .97, cards .98). */
  pressScale?: number;
  hapticOnPress?: HapticKind | null;
  /** Minimum 44pt touch target is enforced by default via hitSlop when the element is small. */
  ensureTouchTarget?: boolean;
}

/**
 * Pressable with the design's 120 ms scale feedback, optional haptic and reduced-motion support.
 * Every interactive element in the app goes through this so behaviour stays consistent.
 */
export const Pressable = forwardRef<View, PressableProps>(function Pressable(
  {
    pressScale = motion.scale.buttonPressed,
    hapticOnPress = null,
    ensureTouchTarget = true,
    onPressIn,
    onPressOut,
    onPress,
    style,
    hitSlop,
    disabled,
    ...rest
  },
  ref,
) {
  const { reducedMotion, hapticsEnabled } = useThemeContext();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handleIn = useCallback<NonNullable<RNPressableProps['onPressIn']>>(
    (e) => {
      if (!reducedMotion) scale.value = withTiming(pressScale, { duration: motion.duration.press });
      onPressIn?.(e);
    },
    [onPressIn, pressScale, reducedMotion, scale],
  );
  const handleOut = useCallback<NonNullable<RNPressableProps['onPressOut']>>(
    (e) => {
      if (!reducedMotion) scale.value = withTiming(1, { duration: motion.duration.press });
      onPressOut?.(e);
    },
    [onPressOut, reducedMotion, scale],
  );
  const handlePress = useCallback<NonNullable<RNPressableProps['onPress']>>(
    (e) => {
      if (hapticOnPress) void haptic(hapticOnPress, hapticsEnabled);
      onPress?.(e);
    },
    [hapticOnPress, hapticsEnabled, onPress],
  );

  return (
    <AnimatedPressable
      ref={ref}
      accessibilityRole={rest.accessibilityRole ?? 'button'}
      accessibilityState={{ disabled: Boolean(disabled), ...(rest.accessibilityState ?? {}) }}
      onPressIn={handleIn}
      onPressOut={handleOut}
      onPress={handlePress}
      disabled={disabled}
      hitSlop={hitSlop ?? (ensureTouchTarget ? 6 : undefined)}
      style={typeof style === 'function' ? style : [animatedStyle, style]}
      {...rest}
    />
  );
});
