import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { motion } from '@da/design-tokens';
import { useTheme, useThemeContext } from '../theme/ThemeProvider';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Shimmer 1.6 s at real card dimensions (design: "gerçek kart ölçülerinde"). */
export function Skeleton({ width = '100%', height = 14, radius, style }: SkeletonProps) {
  const theme = useTheme();
  const { reducedMotion } = useThemeContext();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    p.value = withRepeat(withTiming(1, { duration: motion.duration.shimmer, easing: Easing.linear }), -1, false);
  }, [p, reducedMotion]);
  const anim = useAnimatedStyle(() => ({ opacity: reducedMotion ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(p.value * Math.PI)) }));
  return (
    <Animated.View
      accessibilityLabel="Yükleniyor"
      accessibilityRole="progressbar"
      style={[{ width, height, borderRadius: radius ?? height / 2, backgroundColor: theme.colors.skeletonBase }, anim, style]}
    />
  );
}

/** Priority-card shaped skeleton. */
export function CardSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.xxl, borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0, borderColor: theme.cardRing }, theme.shadows.s2, style]}>
      <Skeleton width="30%" height={10} />
      <Skeleton width="92%" height={16} style={styles.gap} />
      <Skeleton width="70%" height={16} />
      <Skeleton width="55%" height={10} style={styles.gap} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 8 },
  gap: { marginTop: 4 },
});
