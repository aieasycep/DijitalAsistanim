import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Card, Text, useTheme, useThemeContext } from '@da/ui';

function Dot({ delay, color }: { delay: number; color: string }) {
  const { reducedMotion } = useThemeContext();
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 320, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 320 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, opacity, reducedMotion]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

/** Three pulsing dots + "Bakıyorum…" while the assistant is answering. */
export function TypingIndicator({ question }: { question?: string | null }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel={t('assistant.thinking')}
      testID="assistant-typing"
    >
      {question ? (
        <View style={styles.userRow}>
          <View
            style={[
              styles.userBubble,
              { backgroundColor: theme.colors.primary, borderRadius: theme.radius.xl },
            ]}
          >
            <Text variant="body" color={theme.colors.onPrimary}>
              {question}
            </Text>
          </View>
        </View>
      ) : null}
      <Card
        padding={{ vertical: 10, horizontal: 14 }}
        radius={theme.radius.xl}
        style={styles.bubble}
      >
        <View style={styles.row}>
          <Dot delay={0} color={theme.colors.inkTertiary} />
          <Dot delay={120} color={theme.colors.inkTertiary} />
          <Dot delay={240} color={theme.colors.inkTertiary} />
          <Text variant="small" tone="tertiary" style={styles.label}>
            {t('assistant.thinking')}
          </Text>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: '86%',
    borderBottomRightRadius: 6,
  },
  bubble: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { marginLeft: 6 },
});
