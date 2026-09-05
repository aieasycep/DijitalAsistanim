import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Card } from '../primitives/Card';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { TimeTile } from './TimeTile';

export interface CalendarRowCardProps {
  /** "14" */
  hour: string;
  /** "30" */
  minute: string;
  title: string;
  /** "60 dk · Ofis · Son görüşme 4 gün önce" — formatted by the caller. */
  meta?: string | null;
  /** Tonal chip on the right ("Hazırlan"). Hidden when omitted. */
  actionLabel?: string;
  onAction?: () => void;
  onPress?: () => void;
  /** Coral 3px stripe on the left edge. */
  conflict?: boolean;
  done?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** card/calendar — 48×48 time tile · title 16/600 · meta 13 · tonal "Hazırlan" chip (34 high). */
export function CalendarRowCard({
  hour,
  minute,
  title,
  meta,
  actionLabel,
  onAction,
  onPress,
  conflict = false,
  done = false,
  accessibilityLabel,
  style,
  testID,
}: CalendarRowCardProps) {
  const theme = useTheme();
  const c = theme.colors;
  const label =
    accessibilityLabel ??
    `${hour}:${minute} · ${title}${meta ? ` · ${meta}` : ''}${conflict ? ' · Çakışma' : ''}`;
  return (
    <Card
      padding={{ vertical: 14, horizontal: 16 }}
      onPress={onPress}
      accessibilityLabel={label}
      style={style}
      testID={testID}
    >
      {conflict ? (
        <View
          pointerEvents="none"
          style={[
            styles.stripe,
            {
              backgroundColor: c.critical,
              borderTopLeftRadius: theme.radius.xxl,
              borderBottomLeftRadius: theme.radius.xxl,
            },
          ]}
        />
      ) : null}
      <View style={styles.row}>
        <TimeTile hour={hour} minute={minute} done={done} />
        <View style={styles.texts}>
          <Text
            variant="h4"
            tone={done ? 'secondary' : 'ink'}
            numberOfLines={2}
            style={done ? styles.strike : undefined}
          >
            {title}
          </Text>
          {meta ? (
            <Text variant="small" tone="secondary" numberOfLines={1} style={styles.meta}>
              {meta}
            </Text>
          ) : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            style={[
              styles.action,
              { height: theme.sizes.filterChip, backgroundColor: c.primarySoft },
            ]}
          >
            <Text variant="chip" color={c.primaryText} numberOfLines={1}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  texts: { flex: 1, minWidth: 0 },
  meta: { marginTop: 2 },
  strike: { textDecorationLine: 'line-through' },
  action: {
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
});
