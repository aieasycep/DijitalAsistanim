import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { EmptyState } from '../primitives/EmptyState';
import { Icon } from '../primitives/Icon';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';

export interface ErrorStateProps {
  /** "Bu kart yüklenemedi." */
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** inline: card-level row · full: centred EmptyState with the error tile. */
  variant?: 'inline' | 'full';
  /** Headline for the full variant. */
  title?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Readable, single-action error: coral error icon + 13px text + "Tekrar dene" link (inline) or a full-screen calm panel. */
export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Tekrar dene',
  variant = 'inline',
  title = 'Bir şeyler ters gitti.',
  secondaryLabel,
  onSecondary,
  style,
  testID,
}: ErrorStateProps) {
  const theme = useTheme();
  const c = theme.colors;

  if (variant === 'full') {
    return (
      <EmptyState
        icon="conflict"
        tone="error"
        title={title}
        body={message}
        actionLabel={onRetry ? retryLabel : undefined}
        onAction={onRetry}
        secondaryLabel={secondaryLabel}
        onSecondary={onSecondary}
        style={style}
        testID={testID}
      />
    );
  }

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.row,
        {
          backgroundColor: c.surface,
          borderRadius: theme.radius.lg,
          borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.cardRing,
        },
        theme.isDark ? null : theme.shadows.s1,
        style,
      ]}
      testID={testID}
    >
      <Icon name="conflict" size={20} color={c.criticalText} />
      <View style={styles.texts}>
        <Text variant="small">{message}</Text>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={retryLabel}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            style={styles.retry}
          >
            <Text variant="chip" color={c.primaryText}>
              {retryLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  texts: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 6,
  },
  retry: { minHeight: 24, justifyContent: 'center' },
});
