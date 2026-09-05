import { useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { palette, type IconName } from '@da/design-tokens';
import type { Insight, InsightAction, SourceRef } from '@da/domain';
import { useTheme, useThemeContext } from '../theme/ThemeProvider';
import { haptic } from '../theme/haptics';
import { Badge, badgeToneFor } from '../primitives/Badge';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { IconButton } from '../primitives/IconButton';
import { Pressable } from '../primitives/Pressable';
import { SourceLine } from '../primitives/SourceLine';
import { Text } from '../primitives/Text';
import { standardEasing } from '../utils/motion';

/** Swipe applies once the card travelled 35 % of its width (design contract 8.6). */
const SWIPE_THRESHOLD = 0.35;
/** Revealed action width behind the card. */
const REVEAL_WIDTH = 96;
/** A fast fling in the swipe direction also applies the action. */
const FLING_VELOCITY = 800;

export interface PriorityCardProps {
  insight: Insight;
  /** Localized badge label ("ACİL", "TAKİP"…) — tone is derived from `insight.badge`. */
  badgeLabel: string;
  /** Top-right time label ("08:42", "3 gün", "Bugün") — formatted by the caller. */
  timeLabel: string;
  /** Time shown in the source line when it differs from `timeLabel` ("2 Eyl"). */
  sourceTimeLabel?: string;
  /** Override the source-line icon (schedule_send for follow-ups, package_2 for shipments). */
  sourceIcon?: IconName;
  /** Force the completed look (defaults to `insight.status === 'completed'`). */
  completed?: boolean;
  onPress?: (insight: Insight) => void;
  onComplete?: (insight: Insight) => void;
  onSnooze?: (insight: Insight) => void;
  onMore?: (insight: Insight) => void;
  onAction?: (action: InsightAction, insight: Insight) => void;
  onSource?: (source: SourceRef) => void;
  /** Swipe right = complete · swipe left = snooze. Disabled automatically under reduced motion. */
  swipeEnabled?: boolean;
  completeLabel?: string;
  snoozeLabel?: string;
  completeAccessibilityLabel?: string;
  moreAccessibilityLabel?: string;
  lowConfidenceLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * card/priority — badge + time · check/more 22px icons · title h3 · source line · up to two text actions.
 * Swipe right completes (green), swipe left snoozes (amber); both stay reachable through the buttons.
 */
export function PriorityCard({
  insight,
  badgeLabel,
  timeLabel,
  sourceTimeLabel,
  sourceIcon,
  completed,
  onPress,
  onComplete,
  onSnooze,
  onMore,
  onAction,
  onSource,
  swipeEnabled = true,
  completeLabel = 'Tamamlandı',
  snoozeLabel = 'Ertele',
  completeAccessibilityLabel = 'Tamamlandı olarak işaretle',
  moreAccessibilityLabel = 'Diğer seçenekler',
  lowConfidenceLabel = 'Kaynakta kesinleşmiyor',
  style,
  testID,
}: PriorityCardProps) {
  const theme = useTheme();
  const { reducedMotion, hapticsEnabled } = useThemeContext();
  const c = theme.colors;
  const done = completed ?? insight.status === 'completed';
  const canComplete = Boolean(onComplete) && !done;
  const canSnooze = Boolean(onSnooze) && !done;
  const swipeActive = swipeEnabled && !reducedMotion && (canComplete || canSnooze);
  const successColor = c.success;
  const warningColor = c.warning;

  const width = useSharedValue(0);
  const tx = useSharedValue(0);
  const armed = useSharedValue(false);
  const iconScale = useSharedValue(1);

  const actions = useMemo(() => {
    const primary = insight.actions.filter((a) => a.primary);
    const rest = insight.actions.filter((a) => !a.primary);
    return [...primary, ...rest].slice(0, 2);
  }, [insight.actions]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      width.set(e.nativeEvent.layout.width);
    },
    [width],
  );

  const onThreshold = useCallback(() => {
    void haptic('light', hapticsEnabled);
  }, [hapticsEnabled]);

  const finishSwipe = useCallback(
    (direction: number) => {
      if (direction > 0) {
        void haptic('success', hapticsEnabled);
        onComplete?.(insight);
      } else {
        void haptic('selection', hapticsEnabled);
        onSnooze?.(insight);
      }
      tx.set(withTiming(0, { duration: theme.motion.duration.base, easing: standardEasing }));
    },
    [hapticsEnabled, insight, onComplete, onSnooze, theme.motion.duration.base, tx],
  );

  const pan = Gesture.Pan()
    .enabled(swipeActive)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      const w = width.get();
      if (w <= 0) return;
      let x = e.translationX;
      if (x > 0 && !canComplete) x = 0;
      if (x < 0 && !canSnooze) x = 0;
      const distance = Math.abs(x);
      const eased =
        distance > REVEAL_WIDTH ? REVEAL_WIDTH + (distance - REVEAL_WIDTH) * 0.35 : distance;
      tx.set(x < 0 ? -eased : eased);
      const past = distance >= w * SWIPE_THRESHOLD;
      if (past !== armed.get()) {
        armed.set(past);
        if (past) {
          iconScale.set(
            withSequence(withTiming(1.15, { duration: 80 }), withTiming(1, { duration: 80 })),
          );
          runOnJS(onThreshold)();
        }
      }
    })
    .onEnd((e) => {
      const w = width.get();
      const x = tx.get();
      const distance = Math.abs(x);
      const fling = Math.abs(e.velocityX) > FLING_VELOCITY && e.velocityX > 0 === x > 0;
      armed.set(false);
      if (w > 0 && distance > 0 && (distance >= w * SWIPE_THRESHOLD || fling)) {
        const direction = x > 0 ? 1 : -1;
        tx.set(
          withTiming(direction * w, { duration: 260, easing: standardEasing }, (finished) => {
            if (finished) runOnJS(finishSwipe)(direction);
          }),
        );
      } else {
        tx.set(withSpring(0, { damping: 20, stiffness: 220, mass: 0.8 }));
      }
    });

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const underlayStyle = useAnimatedStyle(() => ({
    backgroundColor: tx.value > 0 ? successColor : tx.value < 0 ? warningColor : 'transparent',
  }));
  const leftRevealStyle = useAnimatedStyle(() => ({ opacity: tx.value > 0 ? 1 : 0 }));
  const rightRevealStyle = useAnimatedStyle(() => ({ opacity: tx.value < 0 ? 1 : 0 }));
  const revealIconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));

  const handleComplete = useCallback(() => {
    void haptic('success', hapticsEnabled);
    onComplete?.(insight);
  }, [hapticsEnabled, insight, onComplete]);

  const card = (
    <Card
      padding={{ top: 14, horizontal: 16, bottom: 10 }}
      onPress={onPress ? () => onPress(insight) : undefined}
      accessibilityLabel={`${badgeLabel} · ${timeLabel} · ${insight.title}`}
      style={done ? styles.doneCard : undefined}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Badge label={badgeLabel} tone={done ? 'approved' : badgeToneFor(insight.badge)} />
          <Text variant="caption" tone="tertiary" numberOfLines={1} tabular>
            {timeLabel}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <IconButton
            icon="complete"
            filled={done}
            variant="plain"
            size={36}
            iconSize={theme.sizes.cardActionIcon}
            color={done ? c.success : c.inkDisabled}
            accessibilityLabel={completeAccessibilityLabel}
            accessibilityState={{ checked: done }}
            onPress={handleComplete}
            disabled={!onComplete}
          />
          <IconButton
            icon="more"
            variant="plain"
            size={36}
            iconSize={theme.sizes.cardActionIcon}
            color={c.inkDisabled}
            accessibilityLabel={moreAccessibilityLabel}
            onPress={onMore ? () => onMore(insight) : undefined}
            disabled={!onMore}
          />
        </View>
      </View>
      <Text
        variant="h3"
        tone={done ? 'secondary' : 'ink'}
        style={[styles.title, done ? styles.strike : null]}
      >
        {insight.title}
      </Text>
      {insight.subtitle ? (
        <Text variant="secondary" tone="secondary" style={styles.subtitle}>
          {insight.subtitle}
        </Text>
      ) : null}
      <SourceLine
        source={insight.source}
        timeLabel={sourceTimeLabel ?? timeLabel}
        icon={sourceIcon}
        onPress={onSource}
        style={styles.source}
      />
      {insight.isLowConfidence ? (
        <View style={styles.lowConfidence}>
          <Icon name="info" size={14} color={c.inkTertiary} />
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {lowConfidenceLabel}
          </Text>
        </View>
      ) : null}
      {actions.length > 0 && !done ? (
        <View style={styles.actions}>
          {actions.map((action, index) => (
            <Pressable
              key={action.id}
              onPress={() => onAction?.(action, insight)}
              disabled={!onAction}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={styles.action}
            >
              <Text
                variant="action"
                color={index === 0 ? c.primaryText : c.inkSecondary}
                numberOfLines={1}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );

  return (
    <View onLayout={onLayout} style={[styles.wrap, style]} testID={testID}>
      {swipeActive ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.underlay, { borderRadius: theme.radius.xxl }, underlayStyle]}
        >
          <Animated.View style={[styles.reveal, styles.revealLeft, leftRevealStyle]}>
            <Animated.View style={revealIconStyle}>
              <Icon name="complete" size={26} color={palette.white} filled />
            </Animated.View>
            <Text
              variant="badge"
              color={palette.white}
              style={styles.revealLabel}
              numberOfLines={1}
            >
              {completeLabel}
            </Text>
          </Animated.View>
          <Animated.View style={[styles.reveal, styles.revealRight, rightRevealStyle]}>
            <Animated.View style={revealIconStyle}>
              <Icon name="schedule" size={26} color={palette.white} />
            </Animated.View>
            <Text
              variant="badge"
              color={palette.white}
              style={styles.revealLabel}
              numberOfLines={1}
            >
              {snoozeLabel}
            </Text>
          </Animated.View>
        </Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={cardStyle}>{card}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  underlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  reveal: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: REVEAL_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  revealLeft: { left: 0 },
  revealRight: { right: 0 },
  revealLabel: { letterSpacing: 0 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', marginRight: -8 },
  title: { marginTop: 6 },
  subtitle: { marginTop: 4 },
  source: { marginTop: 10 },
  lowConfidence: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  action: { paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  doneCard: { opacity: 0.85 },
  strike: { textDecorationLine: 'line-through' },
});
