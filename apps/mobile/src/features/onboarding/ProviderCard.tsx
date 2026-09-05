import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { IconName } from '@da/design-tokens';
import { Card, Icon, Text, useTheme } from '@da/ui';

export type ProviderCardKey =
  | 'gmail'
  | 'outlook'
  | 'google_calendar'
  | 'microsoft_calendar'
  | 'apple_calendar'
  | 'device_calendar';

export interface ProviderCardProps {
  providerKey: ProviderCardKey;
  name: string;
  meta?: string | null;
  connected: boolean;
  connecting?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
}

const ICON: Record<ProviderCardKey, IconName> = {
  gmail: 'mail',
  outlook: 'mail',
  google_calendar: 'event',
  microsoft_calendar: 'event',
  apple_calendar: 'event',
  device_calendar: 'event',
};

/** card/integration — 44px provider tile · name 15/600 · meta 12 · trailing pill "Bağla" / "Bağlandı" / spinner. */
export function ProviderCard({
  providerKey,
  name,
  meta,
  connected,
  connecting = false,
  disabled = false,
  onPress,
  testID,
}: ProviderCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  const tile = (() => {
    switch (providerKey) {
      case 'gmail':
        return { bg: c.criticalSoft, fg: c.criticalText };
      case 'outlook':
      case 'microsoft_calendar':
        return { bg: c.infoSoft, fg: c.infoText };
      case 'google_calendar':
        return { bg: c.successSoft, fg: c.successText };
      default:
        return { bg: c.surface2, fg: c.inkSecondary };
    }
  })();
  const pill = connected
    ? {
        bg: c.successSoft,
        fg: c.successText,
        icon: 'check' as IconName,
        label: t('onboarding.connect.connected'),
      }
    : {
        bg: c.primarySoft,
        fg: c.primaryText,
        icon: 'add' as IconName,
        label: t('onboarding.connect.connect'),
      };
  const pressable = Boolean(onPress) && !connected && !connecting && !disabled;
  const stateLabel = connecting ? t('onboarding.connect.connecting') : pill.label;

  return (
    <Card
      radius={theme.radius.xl}
      padding={{ vertical: 12, horizontal: 14 }}
      onPress={pressable ? onPress : undefined}
      accessibilityLabel={`${name} · ${stateLabel}`}
      style={disabled ? styles.disabled : undefined}
      testID={testID}
    >
      <View style={styles.row}>
        <View style={[styles.tile, { backgroundColor: tile.bg, borderRadius: theme.radius.md }]}>
          <Icon name={ICON[providerKey]} size={22} color={tile.fg} />
        </View>
        <View style={styles.texts}>
          <Text variant="button" numberOfLines={1}>
            {name}
          </Text>
          {meta ? (
            <Text variant="caption" tone="tertiary" numberOfLines={1} style={styles.meta}>
              {meta}
            </Text>
          ) : null}
        </View>
        <View
          style={[styles.pill, { height: theme.sizes.filterChip, backgroundColor: pill.bg }]}
          accessibilityRole="text"
          accessibilityLabel={stateLabel}
        >
          {connecting ? (
            <ActivityIndicator size="small" color={pill.fg} />
          ) : (
            <Icon name={pill.icon} size={16} color={pill.fg} />
          )}
          <Text variant="chip" color={pill.fg} numberOfLines={1}>
            {stateLabel}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0 },
  meta: { marginTop: 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 999,
  },
  disabled: { opacity: 0.5 },
});
