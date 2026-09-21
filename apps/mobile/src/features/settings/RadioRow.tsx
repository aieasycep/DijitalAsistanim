import type { ReactNode } from 'react';
import { Icon, ListRow, useTheme } from '@da/ui';

export interface RadioRowProps {
  title: string;
  meta?: string | null;
  selected: boolean;
  onPress: () => void;
  leading?: ReactNode;
  disabled?: boolean;
  divider?: boolean;
  testID?: string;
}

/** Single-select row: filled check_circle (indigo) when selected, hollow radio otherwise. */
export function RadioRow({
  title,
  meta,
  selected,
  onPress,
  leading,
  disabled = false,
  divider,
  testID,
}: RadioRowProps) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <ListRow
      title={title}
      meta={meta}
      leading={leading}
      onPress={onPress}
      disabled={disabled}
      divider={divider}
      minHeight={52}
      accessibilityLabel={title}
      testID={testID}
      trailing={
        <Icon
          name={selected ? 'complete' : 'uncheck'}
          size={22}
          color={selected ? c.primary : c.inkDisabled}
          filled={selected}
        />
      }
    />
  );
}
