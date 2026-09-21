import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { IconName } from '@da/design-tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';

export interface AiInsightCardProps {
  /** AI kicker ("TAKVİM ZEKÂSI", "AI ÖZETİ") — rendered in caps. */
  label: string;
  title: string;
  body?: string | null;
  primaryLabel?: string;
  primaryIcon?: IconName;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Primary button shows a spinner and locks. */
  loading?: boolean;
  loadingLabel?: string;
  /** light: indigo wash (top-left) · dark: ink card with glow kicker (meeting prep "3 şey"). */
  variant?: 'light' | 'dark';
  onPress?: () => void;
  /** Custom content between body and actions (numbered talking points, chips…). */
  children?: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** card/ai-insight — auto_awesome kicker 12/600 +6%, title 16/23, body 14 secondary, primary 40 + ghost actions. */
export function AiInsightCard({
  label,
  title,
  body,
  primaryLabel,
  primaryIcon,
  onPrimary,
  secondaryLabel,
  onSecondary,
  loading = false,
  loadingLabel,
  variant = 'light',
  onPress,
  children,
  accessibilityLabel,
  style,
  testID,
}: AiInsightCardProps) {
  const theme = useTheme();
  const c = theme.colors;
  const dark = variant === 'dark';
  const kickerColor = dark ? c.primaryGlow : c.primary;
  const hasActions = Boolean((primaryLabel && onPrimary) || (secondaryLabel && onSecondary));

  return (
    <Card
      variant={dark ? 'inverse' : 'aiInsight'}
      radius={dark ? theme.radius.modal : theme.radius.xxl}
      padding={dark ? 20 : theme.layout.cardPadding}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? `${label} · ${title}`}
      style={style}
      testID={testID}
    >
      <View style={styles.kicker} accessibilityRole="header">
        <Icon name="ai" size={16} color={kickerColor} filled />
        <Text variant="aiLabel" color={kickerColor} numberOfLines={1} style={styles.kickerText}>
          {label}
        </Text>
      </View>
      <Text variant="h4" tone={dark ? 'inverse' : 'ink'} style={styles.title}>
        {title}
      </Text>
      {body ? (
        <Text
          variant="secondary"
          color={dark ? c.inverseSecondary : c.inkSecondary}
          style={styles.body}
        >
          {body}
        </Text>
      ) : null}
      {children ? <View style={styles.children}>{children}</View> : null}
      {hasActions ? (
        <View style={styles.actions}>
          {primaryLabel && onPrimary ? (
            <Button
              label={primaryLabel}
              icon={primaryIcon}
              variant={dark ? 'onGradient' : 'primary'}
              size="sm"
              loading={loading}
              loadingLabel={loadingLabel}
              onPress={onPrimary}
              style={styles.primary}
            />
          ) : null}
          {secondaryLabel && onSecondary ? (
            <Button
              label={secondaryLabel}
              variant={dark ? 'onGradient' : 'ghostSecondary'}
              size="sm"
              onPress={onSecondary}
              disabled={loading}
              style={styles.secondary}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kickerText: { flexShrink: 1 },
  title: { marginTop: 8 },
  body: { marginTop: 4 },
  children: { marginTop: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  primary: { borderRadius: 12, paddingHorizontal: 16 },
  secondary: { borderRadius: 12, paddingHorizontal: 14 },
});
