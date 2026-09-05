import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { palette, type IconName } from '@da/design-tokens';
import { Badge, Icon, ListRow, Text, useTheme } from '@da/ui';

export interface SettingsRowLinkProps {
  icon?: IconName;
  title: string;
  meta?: string | null;
  /** Right-hand value column summarising the current state ("08:00 · 13:00 · 19:00"). */
  value?: string | null;
  valueTone?: 'tertiary' | 'primary' | 'warning' | 'success' | 'critical';
  /** PRO badge shown before the chevron. */
  badge?: string | null;
  href?: Href;
  onPress?: () => void;
  tone?: 'default' | 'critical';
  disabled?: boolean;
  divider?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/** Settings list row: leading icon tile, title, value column, optional badge, chevron when navigable. */
export function SettingsRowLink({
  icon,
  title,
  meta,
  value,
  valueTone = 'tertiary',
  badge,
  href,
  onPress,
  tone = 'default',
  disabled = false,
  divider,
  accessibilityLabel,
  testID,
}: SettingsRowLinkProps) {
  const router = useRouter();
  const theme = useTheme();
  const c = theme.colors;
  const handlePress = onPress ?? (href !== undefined ? () => router.push(href) : undefined);
  const valueColor = {
    tertiary: c.inkTertiary,
    primary: c.primaryText,
    warning: c.warningText,
    success: c.successText,
    critical: c.criticalText,
  }[valueTone];

  const trailing =
    value || badge || handlePress ? (
      <View style={styles.trailing}>
        {badge ? <Badge label={badge} tone="pro" /> : null}
        {value ? (
          <Text variant="caption" color={valueColor} numberOfLines={1} style={styles.value}>
            {value}
          </Text>
        ) : null}
        {handlePress ? (
          <Icon name="forward" size={18} color={theme.isDark ? c.inkDisabled : palette.warm350} />
        ) : null}
      </View>
    ) : undefined;

  return (
    <ListRow
      icon={icon}
      iconColor={tone === 'critical' ? c.criticalText : undefined}
      title={title}
      meta={meta}
      trailing={trailing}
      onPress={handlePress}
      disabled={disabled}
      divider={divider}
      accessibilityLabel={accessibilityLabel ?? (value ? `${title}, ${value}` : title)}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '55%' },
  value: { flexShrink: 1 },
});
