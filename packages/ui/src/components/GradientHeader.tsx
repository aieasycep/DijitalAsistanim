import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GradientName } from '@da/design-tokens';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from '../primitives/IconButton';
import { Text } from '../primitives/Text';
import { gradientProps } from '../utils/gradient';

export interface GradientHeaderProps {
  /** dawn = morning briefing · dusk = evening close · night = voice / audio */
  gradient?: GradientName;
  /** "SABAH BRİFİNGİ · 5 EYLÜL" */
  kicker?: string;
  title: string;
  subtitle?: string | null;
  /** lg 32/38 (briefing greeting) · md 30/36 */
  titleSize?: 'lg' | 'md';
  onBack?: () => void;
  backLabel?: string;
  onShare?: () => void;
  shareLabel?: string;
  /** Replaces the share button on the right. */
  rightElement?: ReactNode;
  /** How far the content sheet overlaps the gradient (default 28). */
  overlap?: number;
  /** Rendered in the rounded sheet that overlaps the gradient. */
  children?: ReactNode;
  /** Sheet style (padding, background). */
  contentStyle?: StyleProp<ViewStyle>;
  /** Apply the status-bar safe area on top (default true). */
  topInset?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Full-bleed brand gradient header (status-bar safe) with overlay back/share circles, caps kicker at 72 %,
 * 32/38 title and 16/22 subtitle at 80 % white; children render in a 28-radius sheet overlapping by −28.
 */
export function GradientHeader({
  gradient = 'dawn',
  kicker,
  title,
  subtitle,
  titleSize = 'lg',
  onBack,
  backLabel = 'Geri',
  onShare,
  shareLabel = 'Paylaş',
  rightElement,
  overlap = 28,
  children,
  contentStyle,
  topInset = true,
  style,
  testID,
}: GradientHeaderProps) {
  const theme = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const hasTopRow = Boolean(onBack || onShare || rightElement);
  const hasChildren = children !== undefined && children !== null;
  const titleStyle = titleSize === 'lg' ? styles.titleLg : styles.titleMd;

  return (
    <View style={style} testID={testID}>
      <LinearGradient
        {...gradientProps(theme, gradient)}
        style={[
          styles.gradient,
          {
            paddingTop: (topInset ? insets.top : 0) + 6,
            paddingHorizontal: theme.layout.screenPaddingH,
            paddingBottom: 60 + (hasChildren ? overlap : 0),
          },
        ]}
      >
        {hasTopRow ? (
          <View style={styles.topRow}>
            {onBack ? (
              <IconButton
                icon="back"
                variant="onGradient"
                size={36}
                iconSize={20}
                accessibilityLabel={backLabel}
                onPress={onBack}
              />
            ) : (
              <View style={styles.spacer} />
            )}
            <View style={styles.flex} />
            {rightElement ??
              (onShare ? (
                <IconButton
                  icon="share"
                  variant="onGradient"
                  size={36}
                  iconSize={20}
                  accessibilityLabel={shareLabel}
                  onPress={onShare}
                />
              ) : (
                <View style={styles.spacer} />
              ))}
          </View>
        ) : null}
        {kicker ? (
          <Text variant="kicker" tone="onGradientMuted" style={styles.kicker} numberOfLines={1}>
            {kicker}
          </Text>
        ) : null}
        <Text
          variant="h1"
          tone="onGradient"
          style={[styles.title, titleStyle]}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" color="rgba(255,255,255,0.8)" style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </LinearGradient>
      {hasChildren ? (
        <View
          style={[
            styles.sheet,
            {
              marginTop: -overlap,
              backgroundColor: c.background,
              borderTopLeftRadius: theme.radius.hero,
              borderTopRightRadius: theme.radius.hero,
            },
            contentStyle,
          ]}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: { overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  spacer: { width: 36, height: 36 },
  kicker: { marginTop: 32 },
  title: { marginTop: 8 },
  titleLg: { fontSize: 32, lineHeight: 38, letterSpacing: -0.64 },
  titleMd: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  subtitle: { marginTop: 6, fontSize: 16, lineHeight: 22 },
  sheet: { paddingTop: 26 },
});
