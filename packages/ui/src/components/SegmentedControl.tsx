import { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion, palette } from '@da/design-tokens';
import { useTheme, useThemeContext } from '../theme/ThemeProvider';
import { haptic } from '../theme/haptics';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { standardEasing } from '../utils/motion';

const TRACK_PADDING = 3;

export interface SegmentedOption<K extends string = string> {
  key: K;
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<K extends string = string> {
  options: SegmentedOption<K>[];
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Pill track (3px padding) with 32px segments; the selected segment is a white sliding thumb with a soft shadow. */
export function SegmentedControl<K extends string = string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
  style,
  testID,
}: SegmentedControlProps<K>) {
  const theme = useTheme();
  const { reducedMotion, hapticsEnabled } = useThemeContext();
  const c = theme.colors;
  const [trackWidth, setTrackWidth] = useState(0);
  const count = Math.max(1, options.length);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.key === value),
  );
  const segmentWidth = trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / count : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    const target = selectedIndex * segmentWidth;
    x.value =
      reducedMotion || trackWidth === 0
        ? target
        : withTiming(target, { duration: motion.duration.fast, easing: standardEasing });
  }, [selectedIndex, segmentWidth, reducedMotion, trackWidth, x]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
      style={[
        styles.track,
        {
          backgroundColor: theme.isDark ? c.surface2 : palette.warm200,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
      testID={testID}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              width: segmentWidth,
              height: theme.sizes.segmentHeight,
              backgroundColor: theme.isDark ? c.surfaceElevated : c.surface,
            },
            theme.isDark ? null : styles.thumbShadow,
            thumbStyle,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.key === value;
        const isDisabled = disabled || Boolean(option.disabled);
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled: isDisabled }}
            accessibilityLabel={option.label}
            disabled={isDisabled}
            onPress={() => {
              if (selected) return;
              void haptic('selection', hapticsEnabled);
              onChange(option.key);
            }}
            pressScale={1}
            ensureTouchTarget={false}
            style={[styles.segment, { height: theme.sizes.segmentHeight }]}
          >
            <Text variant="chip" color={selected ? c.ink : c.inkSecondary} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 999, padding: TRACK_PADDING, position: 'relative' },
  thumb: { position: 'absolute', top: TRACK_PADDING, left: TRACK_PADDING, borderRadius: 999 },
  thumbShadow: {
    shadowColor: '#1B1917',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
  },
});
