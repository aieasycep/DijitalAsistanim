import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion } from '@da/design-tokens';
import { useTheme, useThemeContext } from '../theme/ThemeProvider';
import { Pressable } from './Pressable';

export interface ToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
}

/** 50×30 switch, 26 knob, indigo when on (design: "açık / kapalı / disabled"). */
export function Toggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  testID,
}: ToggleProps) {
  const theme = useTheme();
  const { reducedMotion } = useThemeContext();
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.value = reducedMotion
      ? value
        ? 1
        : 0
      : withTiming(value ? 1 : 0, { duration: motion.duration.fast });
  }, [value, reducedMotion, x]);
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value * (theme.sizes.toggleWidth - theme.sizes.toggleKnob - 4) }],
  }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hapticOnPress="selection"
      pressScale={1}
      testID={testID}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <View
        style={[
          styles.track,
          {
            width: theme.sizes.toggleWidth,
            height: theme.sizes.toggleHeight,
            borderRadius: theme.sizes.toggleHeight / 2,
            backgroundColor: value ? theme.colors.toggleOn : theme.colors.toggleOff,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.knob,
            {
              width: theme.sizes.toggleKnob,
              height: theme.sizes.toggleKnob,
              borderRadius: theme.sizes.toggleKnob / 2,
            },
            knob,
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { justifyContent: 'center', padding: 2 },
  knob: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
