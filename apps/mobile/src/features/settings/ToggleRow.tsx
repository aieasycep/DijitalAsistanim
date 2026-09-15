import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { IconName } from '@da/design-tokens';
import { Badge, ListRow, Toggle } from '@da/ui';

export interface ToggleRowProps {
  title: string;
  meta?: string | null;
  icon?: IconName;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  /** PRO badge shown before the switch (feature gated for Free users). */
  badge?: string | null;
  divider?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/** List row with a trailing switch (min-height 56 per the design's toggle rows). */
export function ToggleRow({
  title,
  meta,
  icon,
  value,
  onValueChange,
  disabled = false,
  badge,
  divider,
  accessibilityLabel,
  testID,
}: ToggleRowProps) {
  const { t } = useTranslation();
  return (
    <ListRow
      title={title}
      meta={meta}
      icon={icon}
      divider={divider}
      minHeight={56}
      trailing={
        <View style={styles.trailing}>
          {badge ? <Badge label={badge} tone="pro" /> : null}
          <Toggle
            value={value}
            onValueChange={onValueChange}
            disabled={disabled}
            accessibilityLabel={accessibilityLabel ?? t('a11y.toggle', { label: title })}
            testID={testID}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
