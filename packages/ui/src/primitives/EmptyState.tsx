import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { IconName } from '@da/design-tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  tone?: 'calm' | 'error';
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Calm, positive empty/error states ("Her şey kontrol altında."). Error tone uses the coral icon tile. */
export function EmptyState({ icon = 'check', title, body, actionLabel, onAction, secondaryLabel, onSecondary, tone = 'calm', compact = false, style, testID }: EmptyStateProps) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.wrap, compact ? styles.compact : null, style]} testID={testID} accessibilityRole="summary">
      <View style={[styles.tile, { backgroundColor: tone === 'error' ? c.criticalSoft : c.primarySoft }]}>
        <Icon name={icon} size={24} color={tone === 'error' ? c.criticalText : c.primaryText} />
      </View>
      <Text variant="h3" align="center" style={styles.title}>
        {title}
      </Text>
      {body ? (
        <Text variant="secondary" tone="secondary" align="center" style={styles.body}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} variant={tone === 'error' ? 'tonal' : 'primary'} size="sm" onPress={onAction} style={styles.action} /> : null}
      {secondaryLabel && onSecondary ? <Button label={secondaryLabel} variant="ghostSecondary" size="ghost" onPress={onSecondary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  compact: { paddingVertical: 20 },
  tile: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { maxWidth: 300 },
  body: { marginTop: 6, maxWidth: 300 },
  action: { marginTop: 14 },
});
