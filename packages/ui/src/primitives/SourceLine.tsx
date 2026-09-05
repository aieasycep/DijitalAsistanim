import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { IconName } from '@da/design-tokens';
import type { SourceRef, SourceType } from '@da/domain';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { Text } from './Text';

export const SOURCE_ICON: Record<SourceType, IconName> = {
  gmail: 'mail',
  outlook: 'mail',
  google_calendar: 'event',
  microsoft_calendar: 'event',
  apple_calendar: 'event',
  device_calendar: 'event',
  google_tasks: 'taskAdd',
  microsoft_todo: 'taskAdd',
  apple_reminders: 'reminder',
  android_notification: 'notificationsActive',
  capture: 'capture',
  assistant: 'ai',
  meeting_note: 'commitment',
  user: 'person',
};

export interface SourceLineProps {
  source: SourceRef;
  /** Pre-formatted time label ("08:42", "Dün 15:40", "2 Eyl") — formatting lives in the app (timezone aware). */
  timeLabel: string;
  /** Override icon (e.g. schedule_send for follow-ups, package_2 for shipments). */
  icon?: IconName;
  onPress?: (source: SourceRef) => void;
  tone?: 'default' | 'onGradient';
  style?: StyleProp<ViewStyle>;
}

/** "Gmail · Ahmet Yılmaz · 08:42" — tapping opens the source detail. */
export function SourceLine({
  source,
  timeLabel,
  icon,
  onPress,
  tone = 'default',
  style,
}: SourceLineProps) {
  const theme = useTheme();
  const color = tone === 'onGradient' ? theme.colors.onGradientMuted : theme.colors.inkTertiary;
  const parts = [source.label, source.person, timeLabel].filter((p): p is string => Boolean(p));
  const text = parts.join(' · ');
  const content = (
    <View style={[styles.row, style]}>
      <Icon name={icon ?? SOURCE_ICON[source.type]} size={16} color={color} />
      <Text variant="caption" color={color} numberOfLines={1} style={styles.text}>
        {text}
      </Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={() => onPress(source)}
      accessibilityRole="link"
      accessibilityLabel={`Kaynağı aç: ${text}`}
      pressScale={1}
      style={styles.pressable}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { flexShrink: 1 },
  pressable: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
});
