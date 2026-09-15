import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { IconName } from '@da/design-tokens';
import type { LifeEvent, LifeEventType } from '@da/domain';
import { useLocale, useTheme } from '../theme/ThemeProvider';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { localeUpperCase } from '../utils/text';

/** Icon tile glyph per life-event category (design: package_2 · flight · restaurant · receipt_long · autorenew · shield). */
export const LIFE_ICON: Record<LifeEventType, IconName> = {
  shipment: 'shipment',
  flight: 'flight',
  reservation: 'reservation',
  payment: 'payment',
  subscription: 'subscription',
  security: 'security',
};

export interface LifeCardAction {
  /** Action kind reported back through `onAction` ("track", "check_in", "remind", "pay"…). */
  kind: string;
  label: string;
}

export interface LifeCardProps {
  event: LifeEvent;
  /** Localized category kicker (e.g. `t(\`badges.${event.type}\`)`); rendered upper-cased for the UI locale. */
  kicker: string;
  /** Right-aligned time caption ("Bugün", "Yarın", "10 Eyl") — formatted by the caller. */
  timeLabel?: string | null;
  /** Title override (defaults to event.title). */
  title?: string;
  /** "Yurtiçi Kargo · 14:00–18:00 · 2 parça" — formatted by the caller. */
  meta?: string | null;
  primaryAction?: LifeCardAction;
  secondaryAction?: LifeCardAction;
  onAction?: (kind: string, event: LifeEvent) => void;
  onPress?: (event: LifeEvent) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** card/life — 44×44 icon tile · kicker 11/700 + time · title h3 · meta 14 secondary · 13/600 text actions. */
export function LifeCard({
  event,
  kicker,
  timeLabel,
  title,
  meta,
  primaryAction,
  secondaryAction,
  onAction,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: LifeCardProps) {
  const theme = useTheme();
  const locale = useLocale();
  const c = theme.colors;
  const security = event.type === 'security';
  const tileBg = security ? c.criticalSoft : c.surface2;
  const tileFg = security ? c.criticalText : c.inkSecondary;
  // Upper-cased in JS (not via textTransform) so a Turkish "i" becomes "İ" regardless of the device locale.
  const kickerText = localeUpperCase(kicker, locale);
  const titleText = title ?? event.title;
  const done = event.status === 'done';
  const actions = [primaryAction, secondaryAction].filter((a): a is LifeCardAction => Boolean(a));

  return (
    <Card
      onPress={onPress ? () => onPress(event) : undefined}
      accessibilityLabel={
        accessibilityLabel ?? `${kicker} · ${titleText}${meta ? ` · ${meta}` : ''}`
      }
      style={[done ? styles.done : null, style]}
      testID={testID}
    >
      <View style={styles.row}>
        <View
          style={[
            styles.tile,
            {
              width: theme.sizes.iconTile,
              height: theme.sizes.iconTile,
              borderRadius: theme.radius.md,
              backgroundColor: tileBg,
            },
          ]}
        >
          <Icon name={LIFE_ICON[event.type]} size={22} color={tileFg} />
        </View>
        <View style={styles.content}>
          <View style={styles.kickerRow}>
            <Text variant="badge" tone="tertiary" style={styles.kicker} numberOfLines={1}>
              {kickerText}
            </Text>
            {timeLabel ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {timeLabel}
              </Text>
            ) : null}
          </View>
          <Text
            variant="h3"
            tone={done ? 'secondary' : 'ink'}
            style={[styles.title, done ? styles.strike : null]}
          >
            {titleText}
          </Text>
          {meta ? (
            <Text variant="secondary" tone="secondary" style={styles.meta}>
              {meta}
            </Text>
          ) : null}
          {actions.length > 0 && !done ? (
            <View style={styles.actions}>
              {actions.map((action, index) => (
                <Pressable
                  key={action.kind}
                  onPress={() => onAction?.(action.kind, event)}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  style={styles.action}
                >
                  <Text variant="chip" color={index === 0 ? c.primaryText : c.inkSecondary}>
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14 },
  tile: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  content: { flex: 1, minWidth: 0 },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  kicker: { letterSpacing: 0.88, flexShrink: 1 },
  title: { marginTop: 4 },
  meta: { marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  action: { minHeight: 24, justifyContent: 'center' },
  done: { opacity: 0.7 },
  strike: { textDecorationLine: 'line-through' },
});
