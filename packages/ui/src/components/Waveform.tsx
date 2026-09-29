import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme, useThemeContext } from '../theme/ThemeProvider';
import { clamp01 } from '../utils/time';

const DEFAULT_BARS = 34;
const BAR_WIDTH = 4;
const BAR_GAP = 5;
const BAR_RADIUS = 2;
const CONTAINER_HEIGHT = 72;

/** Design pattern for the resting bar heights: 14 + ((i·13) mod 7)·8. */
export function waveformBarHeight(index: number): number {
  return 14 + ((index * 13) % 7) * 8;
}

export interface WaveformProps {
  /** Number of bars (design: 34). */
  bars?: number;
  /** Playback fraction 0..1 — bars before it are filled white. */
  progress?: number;
  /** Animate bar heights (audio playback). */
  playing?: boolean;
  /** Drive bar heights from a live input `level` (0..1) instead of the playback loop. */
  live?: boolean;
  level?: SharedValue<number>;
  height?: number;
  barWidth?: number;
  gap?: number;
  activeColor?: string;
  inactiveColor?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** 34 bars (4 wide, gap 5, radius 2) on a 72px stage; alternating 0.7–1.2 s scaleY loop while playing. */
export function Waveform({
  bars = DEFAULT_BARS,
  progress = 0,
  playing = false,
  live = false,
  level,
  height = CONTAINER_HEIGHT,
  barWidth = BAR_WIDTH,
  gap = BAR_GAP,
  activeColor,
  inactiveColor = 'rgba(255,255,255,0.35)',
  accessibilityLabel,
  style,
  testID,
}: WaveformProps) {
  const theme = useTheme();
  const { reducedMotion } = useThemeContext();
  const fraction = clamp01(progress);
  const active = activeColor ?? theme.colors.onGradientText;
  const count = Math.max(1, Math.floor(bars));
  const indices = Array.from({ length: count }, (_, i) => i);

  return (
    <View
      style={[styles.stage, { height, gap }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      testID={testID}
    >
      {indices.map((index) => (
        <WaveBar
          key={index}
          index={index}
          animate={playing && !live && !reducedMotion}
          live={live && !reducedMotion}
          level={level}
          color={index / count < fraction ? active : inactiveColor}
          width={barWidth}
        />
      ))}
    </View>
  );
}

interface WaveBarProps {
  index: number;
  animate: boolean;
  live: boolean;
  level?: SharedValue<number>;
  color: string;
  width: number;
}

function WaveBar({ index, animate, live, level, color, width }: WaveBarProps) {
  const scale = useSharedValue(1);
  const emphasis = 0.6 + ((index * 5) % 4) * 0.13;

  useEffect(() => {
    cancelAnimation(scale);
    if (!animate) {
      scale.value = withTiming(1, { duration: 160 });
      return;
    }
    const duration = 700 + ((index * 7) % 5) * 120;
    scale.value = withDelay(
      index * 60,
      withRepeat(
        withSequence(
          withTiming(0.25, { duration, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(scale);
  }, [animate, index, scale]);

  const animatedStyle = useAnimatedStyle(() => {
    const value =
      live && level ? 0.25 + 0.75 * Math.min(1, Math.max(0, level.value)) * emphasis : scale.value;
    return { transform: [{ scaleY: value }] };
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height: waveformBarHeight(index),
          borderRadius: BAR_RADIUS,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  stage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
