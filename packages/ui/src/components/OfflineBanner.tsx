import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { palette } from '@da/design-tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../primitives/Icon';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { sansWeight } from '../utils/typography';

export interface OfflineBannerProps {
  /** "Çevrimdışı · Son analiz 09:40" — formatted by the caller. */
  text: string;
  retryLabel?: string;
  onRetry?: () => void;
  /** Shows a spinner in place of the retry label. */
  retrying?: boolean;
  /** ink: dark pill (page top, design 8.2.5) · soft: critical/soft tint (inline). */
  variant?: 'ink' | 'soft';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Thin offline bar with wifi_off 18 + 13px text and an optional "Yenile" action. Not dismissible. */
export function OfflineBanner({
  text,
  retryLabel = 'Yenile',
  onRetry,
  retrying = false,
  variant = 'ink',
  style,
  testID,
}: OfflineBannerProps) {
  const theme = useTheme();
  const c = theme.colors;
  const soft = variant === 'soft';
  const background = soft ? c.criticalSoft : theme.isDark ? c.surfaceElevated : c.inverseSurface;
  const textColor = soft ? c.criticalText : theme.isDark ? c.ink : c.inkInverse;
  const iconColor = soft ? c.criticalText : theme.isDark ? c.criticalText : palette.coral300;
  const actionColor = soft ? c.primaryText : theme.isDark ? c.primaryText : c.primaryGlow;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.bar,
        {
          backgroundColor: background,
          borderRadius: theme.radius.md,
          borderWidth: theme.isDark && !soft ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.cardRing,
        },
        style,
      ]}
      testID={testID}
    >
      <Icon name="offline" size={18} color={iconColor} />
      <Text variant="small" color={textColor} style={styles.text} numberOfLines={2}>
        {text}
      </Text>
      {onRetry ? (
        retrying ? (
          <ActivityIndicator size="small" color={actionColor} accessibilityLabel={retryLabel} />
        ) : (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={retryLabel}
            hitSlop={10}
            style={styles.action}
          >
            <Text variant="small" color={actionColor} style={sansWeight('600')}>
              {retryLabel}
            </Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  text: { flex: 1, minWidth: 0 },
  action: { minHeight: 24, justifyContent: 'center' },
});
