import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { EmptyState } from '../primitives/EmptyState';
import { Icon } from '../primitives/Icon';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';

interface ErrorStateBaseProps {
  /** Localized error body, formatted by the caller. */
  message: string;
  /** Retry action — rendered only when both `onRetry` and `retryLabel` are given (no default copy). */
  onRetry?: () => void;
  retryLabel?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** inline: card-level row · full: centred EmptyState with the error tile — the full variant needs a headline. */
export type ErrorStateProps = ErrorStateBaseProps &
  ({ variant: 'full'; title: string } | { variant?: 'inline'; title?: string });

/** Readable, single-action error: coral error icon + 13px text + retry link (inline) or a full-screen calm panel. */
export function ErrorState(props: ErrorStateProps) {
  const { message, onRetry, retryLabel, secondaryLabel, onSecondary, style, testID } = props;
  const theme = useTheme();
  const c = theme.colors;
  const retry = onRetry && retryLabel ? { onRetry, retryLabel } : null;

  if (props.variant === 'full') {
    return (
      <EmptyState
        icon="conflict"
        tone="error"
        title={props.title}
        body={message}
        actionLabel={retry?.retryLabel}
        onAction={retry?.onRetry}
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
        {retry ? (
          <Pressable
            onPress={retry.onRetry}
            accessibilityRole="button"
            accessibilityLabel={retry.retryLabel}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            style={styles.retry}
          >
            <Text variant="chip" color={c.primaryText}>
              {retry.retryLabel}
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
