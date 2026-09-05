import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ListGroup, ListGroupTitle, Text } from '@da/ui';

export interface SettingsSectionProps {
  /** Section kicker ("Asistan" → rendered uppercase by the kicker style). */
  title?: string;
  meta?: string | null;
  /** Caption under the group. */
  note?: string | null;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Kicker + grouped list card + optional helper note — the iOS grouped-list pattern of the design. */
export function SettingsSection({
  title,
  meta,
  note,
  children,
  style,
  testID,
}: SettingsSectionProps) {
  return (
    <View style={style} testID={testID}>
      {title ? <ListGroupTitle label={title} meta={meta} /> : null}
      <ListGroup>{children}</ListGroup>
      {note ? (
        <Text variant="caption" tone="tertiary" style={styles.note}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: 8, paddingHorizontal: 4, lineHeight: 17 },
});
