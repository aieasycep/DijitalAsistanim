import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { palette } from '@da/design-tokens';
import { useTheme, useThemeContext } from '../theme/ThemeProvider';
import { Icon } from '../primitives/Icon';
import { IconButton } from '../primitives/IconButton';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { clamp01, formatClock } from '../utils/time';

export interface MiniPlayerProps {
  /** "Sabah Brifingi · Öncelikler" */
  title: string;
  positionSec: number;
  durationSec: number;
  playing: boolean;
  onToggle: () => void;
  onClose?: () => void;
  /** Tap on the title/progress area (open the full player). */
  onPress?: () => void;
  playLabel?: string;
  pauseLabel?: string;
  closeLabel?: string;
  accessibilityLabel?: string;
  /** When set, the player floats absolutely at this distance from the bottom (above the tab bar). */
  bottomOffset?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Sticky mini audio player: night-ink bar, 40px white play circle, 13/600 title, 3px progress, "0:42 / 2:14". */
export function MiniPlayer({
  title,
  positionSec,
  durationSec,
  playing,
  onToggle,
  onClose,
  onPress,
  playLabel = 'Oynat',
  pauseLabel = 'Duraklat',
  closeLabel = 'Kapat',
  accessibilityLabel,
  bottomOffset,
  style,
  testID,
}: MiniPlayerProps) {
  const theme = useTheme();
  const { reducedMotion } = useThemeContext();
  const progress = clamp01(durationSec > 0 ? positionSec / durationSec : 0);
  const p = useSharedValue(progress);

  useEffect(() => {
    p.value = reducedMotion
      ? progress
      : withTiming(progress, { duration: 500, easing: Easing.linear });
  }, [p, progress, reducedMotion]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  const timeText = `${formatClock(positionSec)} / ${formatClock(durationSec)}`;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: palette.dawn0,
          borderRadius: theme.radius.lg,
          minHeight: theme.layout.miniPlayerHeight,
        },
        bottomOffset !== undefined ? [styles.floating, { bottom: bottomOffset }] : null,
        theme.isDark ? null : theme.shadows.s3,
        style,
      ]}
      testID={testID}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? pauseLabel : playLabel}
        accessibilityState={{ selected: playing }}
        hapticOnPress="light"
        style={[styles.play, { backgroundColor: palette.white }]}
      >
        <Icon name={playing ? 'pause' : 'play'} size={24} color={palette.night1} filled />
      </Pressable>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `${title} · ${timeText}`}
        pressScale={1}
        ensureTouchTarget={false}
        style={styles.center}
      >
        <Text variant="chip" color={palette.white} numberOfLines={1}>
          {title}
        </Text>
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
        >
          <Animated.View style={[styles.fill, fillStyle]} />
        </View>
      </Pressable>
      <Text variant="caption" color="rgba(255,255,255,0.7)" tabular>
        {timeText}
      </Text>
      {onClose ? (
        <IconButton
          icon="close"
          variant="plain"
          size={40}
          iconSize={20}
          color="rgba(255,255,255,0.7)"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={styles.close}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 4,
  },
  floating: { position: 'absolute', left: 16, right: 16 },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, minWidth: 0 },
  track: {
    marginTop: 4,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 2, backgroundColor: '#FFFFFF' },
  close: { marginLeft: -4 },
});
