import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Avatar } from '../primitives/Avatar';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { sansWeight } from '../utils/typography';

export type PersonCardStatusTone = 'warning' | 'critical' | 'success' | 'neutral';

export interface PersonCardProps {
  name: string;
  imageUrl?: string | null;
  vip?: boolean;
  /** Right caption ("3 gün", "2 saat"). */
  timeLabel?: string | null;
  /** Second line 13 secondary ("Teklif v2 · PDF"). */
  topic?: string | null;
  /** Body 14 ("Henüz yanıt gelmedi."). */
  body?: string | null;
  /** Bottom-left 12/600 status ("3 gündür bekliyor"). */
  statusLabel?: string | null;
  statusTone?: PersonCardStatusTone;
  /** Bottom-right 13/600 primary action ("Takip Et"). */
  actionLabel?: string;
  onAction?: () => void;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** card/person — avatar 40 · name 15/600 (+ VIP star) · topic 13 · body 14 · status 12/600 + action 13/600. */
export function PersonCard({
  name,
  imageUrl,
  vip = false,
  timeLabel,
  topic,
  body,
  statusLabel,
  statusTone = 'warning',
  actionLabel,
  onAction,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: PersonCardProps) {
  const theme = useTheme();
  const c = theme.colors;
  const statusColor = {
    warning: c.warningText,
    critical: c.criticalText,
    success: c.successText,
    neutral: c.inkTertiary,
  }[statusTone];
  const parts = [vip ? `${name} · VIP` : name, topic, body, statusLabel].filter((p): p is string =>
    Boolean(p),
  );

  return (
    <Card
      radius={theme.radius.xl}
      padding={{ vertical: 14, horizontal: 16 }}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? parts.join(' · ')}
      style={style}
      testID={testID}
    >
      <View style={styles.row}>
        <Avatar name={name} imageUrl={imageUrl} size={theme.sizes.avatarMd} />
        <View style={styles.content}>
          <View style={styles.nameRow}>
            <View style={styles.name}>
              <Text variant="button" numberOfLines={1} style={styles.nameText}>
                {name}
              </Text>
              {vip ? (
                <Icon name="vip" size={15} color={c.primary} filled accessibilityLabel="VIP" />
              ) : null}
            </View>
            {timeLabel ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {timeLabel}
              </Text>
            ) : null}
          </View>
          {topic ? (
            <Text variant="small" tone="secondary" numberOfLines={1}>
              {topic}
            </Text>
          ) : null}
          {body ? (
            <Text variant="secondary" style={styles.body}>
              {body}
            </Text>
          ) : null}
          {statusLabel || (actionLabel && onAction) ? (
            <View style={styles.bottom}>
              {statusLabel ? (
                <Text
                  variant="caption"
                  color={statusColor}
                  style={[sansWeight('600'), styles.status]}
                  numberOfLines={1}
                >
                  {statusLabel}
                </Text>
              ) : (
                <View />
              )}
              {actionLabel && onAction ? (
                <Pressable
                  onPress={onAction}
                  accessibilityRole="button"
                  accessibilityLabel={actionLabel}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  style={styles.action}
                >
                  <Text variant="chip" color={c.primaryText}>
                    {actionLabel}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  content: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  nameText: { letterSpacing: -0.15, flexShrink: 1 },
  body: { marginTop: 6 },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  status: { flexShrink: 1 },
  action: { minHeight: 24, justifyContent: 'center' },
});
