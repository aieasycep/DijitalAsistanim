/**
 * Form field for ISO date-times in the approval editor: a labelled row that opens the picker sheet;
 * nullable fields get a clear affordance and show "Tarih yok" when empty.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, IconButton, Pressable, Text, useTheme } from '@da/ui';
import { useFormatCtx } from '../flow/useFormatCtx';
import { DateTimePickerSheet, roundToInterval } from '../reminders/DateTimePickerSheet';
import { formatDateTime } from './approvalMeta';

const HOUR_MS = 60 * 60_000;
const EPOCH = new Date(0);

export interface DateTimeFieldProps {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  nullable?: boolean;
  error?: string | null;
  testID?: string;
}

export function DateTimeField({
  label,
  value,
  onChange,
  nullable = false,
  error,
  testID,
}: DateTimeFieldProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const c = theme.colors;
  const ctx = useFormatCtx();
  const [initial, setInitial] = useState<Date | null>(null);
  const display = value ? formatDateTime(value, ctx, t) : t('approvals.noDate');
  const openPicker = () =>
    setInitial(value ? new Date(value) : roundToInterval(new Date(Date.now() + HOUR_MS)));

  return (
    <View>
      <Text variant="caption" tone="secondary" style={styles.label}>
        {label}
      </Text>
      <View
        style={[
          styles.row,
          {
            minHeight: theme.sizes.input,
            borderRadius: theme.radius.lg,
            backgroundColor: c.surface,
            borderWidth: 2,
            borderColor: error ? c.critical : theme.isDark ? theme.cardRing : 'transparent',
          },
          !error && !theme.isDark ? theme.shadows.s1 : null,
        ]}
      >
        <Pressable
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${display}`}
          accessibilityHint={t('a11y.timePicker', { label })}
          pressScale={1}
          ensureTouchTarget={false}
          style={styles.press}
          testID={testID}
        >
          <Icon name="schedule" size={18} color={c.inkTertiary} />
          <Text variant="body" tone={value ? 'ink' : 'tertiary'} style={styles.value} tabular>
            {display}
          </Text>
        </Pressable>
        {nullable && value ? (
          <IconButton
            icon="close"
            variant="plain"
            size={36}
            iconSize={18}
            color={c.inkTertiary}
            accessibilityLabel={t('approvals.clearDate')}
            onPress={() => onChange(null)}
            testID={testID ? `${testID}-clear` : undefined}
          />
        ) : (
          <Icon name="forward" size={18} color={c.inkDisabled} />
        )}
      </View>
      {error ? (
        <View style={styles.messageRow}>
          <Icon name="conflict" size={14} color={c.criticalText} />
          <Text variant="caption" tone="critical">
            {error}
          </Text>
        </View>
      ) : null}
      <DateTimePickerSheet
        visible={initial !== null}
        value={initial ?? EPOCH}
        title={label}
        onConfirm={(date) => {
          onChange(date.toISOString());
          setInitial(null);
        }}
        onClose={() => setInitial(null)}
        testID={testID ? `${testID}-picker` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6, paddingHorizontal: 4, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 8 },
  press: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  value: { flex: 1, minWidth: 0 },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 4,
  },
});
