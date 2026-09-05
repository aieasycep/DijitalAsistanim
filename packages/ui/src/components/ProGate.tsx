import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';

export interface ProGateProps {
  isPro: boolean;
  /** "Sabahından beri 2 gelişme oldu." */
  title: string;
  /** "Öğle nabzı Pro'da. Sabah brifingin her zaman ücretsiz." */
  body?: string;
  /** Kicker next to the PRO badge ("ÖĞLE NABZI"). */
  kicker?: string;
  badgeLabel?: string;
  ctaLabel?: string;
  onUpgrade: () => void;
  /** "Şimdi değil" — snoozes the gate. */
  dismissLabel?: string;
  onDismiss?: () => void;
  /** Blurred placeholder rows hinting at the locked content (default 2, 0 to hide). */
  placeholderRows?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Renders `children` for Pro users; otherwise a compact locked card (PRO badge · title · body ·
 * blurred placeholder rows · tonal "Pro'ya Geç"). Free features are never locked — gate only Pro content.
 */
export function ProGate({
  isPro,
  title,
  body,
  kicker,
  badgeLabel = 'PRO',
  ctaLabel = "Pro'ya Geç",
  onUpgrade,
  dismissLabel = 'Şimdi değil',
  onDismiss,
  placeholderRows = 2,
  children,
  style,
  testID,
}: ProGateProps) {
  const theme = useTheme();
  const c = theme.colors;
  if (isPro) return <>{children}</>;
  const rows = Array.from({ length: Math.max(0, placeholderRows) }, (_, i) => i);

  return (
    <Card
      radius={theme.radius.hero}
      padding={22}
      style={style}
      testID={testID}
      accessibilityLabel={`${badgeLabel} · ${title}`}
    >
      <View style={styles.kickerRow}>
        <Icon name="lock" size={16} color={c.inkTertiary} />
        {kicker ? (
          <Text variant="aiLabel" tone="tertiary" numberOfLines={1} style={styles.kicker}>
            {kicker}
          </Text>
        ) : null}
        <Badge label={badgeLabel} tone="pro" />
      </View>
      <Text variant="h2" style={styles.title}>
        {title}
      </Text>
      {body ? (
        <Text variant="secondary" tone="secondary" style={styles.body}>
          {body}
        </Text>
      ) : null}
      {rows.length > 0 ? (
        <View
          style={styles.placeholders}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {rows.map((i) => (
            <View
              key={i}
              style={[
                styles.placeholder,
                {
                  backgroundColor: theme.isDark ? c.surface2 : c.background,
                  borderRadius: theme.radius.sm,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={ctaLabel}
          variant="tonal"
          size="sm"
          icon="crown"
          onPress={onUpgrade}
          style={styles.cta}
        />
        {onDismiss ? (
          <Button label={dismissLabel} variant="ghostSecondary" size="sm" onPress={onDismiss} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { flexShrink: 1 },
  title: { marginTop: 10 },
  body: { marginTop: 6 },
  placeholders: { marginTop: 14, gap: 8, opacity: 0.6 },
  placeholder: { height: 44 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  cta: { flex: 1 },
});
