import { useCallback, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import type { IconName } from '@da/design-tokens';
import { BottomSheet, Button, ListRow, Pressable, Text, useTheme } from '@da/ui';
import { toDate, toHHmm } from './time';

export interface TimePickerRowProps {
  title: string;
  meta?: string | null;
  icon?: IconName;
  /** "HH:mm" */
  value: string;
  /** Called once with the committed time (Android dialog "OK" / iOS sheet "Tamam"). */
  onChange: (hhmm: string) => void;
  disabled?: boolean;
  divider?: boolean;
  minuteInterval?: 1 | 5 | 10 | 15 | 30;
  testID?: string;
}

/**
 * List row whose trailing time chip opens the native time picker: Android → system dialog,
 * iOS → bottom sheet with the spinner and a confirm button. Times are stored as "HH:mm".
 */
export function TimePickerRow({
  title,
  meta,
  icon,
  value,
  onChange,
  disabled = false,
  divider,
  minuteInterval = 5,
  testID,
}: TimePickerRowProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const c = theme.colors;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const openPicker = useCallback(() => {
    if (disabled) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode: 'time',
        is24Hour: true,
        minuteInterval,
        value: toDate(value),
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'set' && date) onChange(toHHmm(date));
        },
      });
      return;
    }
    setPending(value);
    setOpen(true);
  }, [disabled, minuteInterval, onChange, value]);

  const cancel = useCallback(() => setOpen(false), []);
  const commit = useCallback(() => {
    setOpen(false);
    if (pending && pending !== value) onChange(pending);
  }, [onChange, pending, value]);

  return (
    <>
      <ListRow
        title={title}
        meta={meta}
        icon={icon}
        divider={divider}
        disabled={disabled}
        minHeight={56}
        trailing={
          <Pressable
            onPress={openPicker}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.timePicker', { label: title })}
            accessibilityValue={{ text: value }}
            style={[styles.chip, { backgroundColor: c.primarySoft, borderRadius: theme.radius.xs }]}
            testID={testID}
          >
            <Text variant="button" color={c.primaryText} tabular>
              {value}
            </Text>
          </Pressable>
        }
      />
      {Platform.OS !== 'android' ? (
        <BottomSheet
          visible={open}
          onClose={cancel}
          title={t('settings.briefingScreen.pickTime', { label: title })}
          closeLabel={t('common.close')}
          footer={
            <Button
              label={t('common.ok')}
              size="md"
              fullWidth
              onPress={commit}
              style={styles.sheetButton}
              testID={testID ? `${testID}-done` : undefined}
            />
          }
          testID={testID ? `${testID}-sheet` : undefined}
        >
          {open ? (
            <DateTimePicker
              mode="time"
              display="spinner"
              value={toDate(pending ?? value)}
              minuteInterval={minuteInterval}
              locale={i18n.language.startsWith('en') ? 'en-GB' : 'tr-TR'}
              onChange={(_event: DateTimePickerEvent, date?: Date) => {
                if (date) setPending(toHHmm(date));
              }}
              style={styles.picker}
              testID={testID ? `${testID}-picker` : undefined}
            />
          ) : null}
        </BottomSheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 10, paddingVertical: 6, minWidth: 64, alignItems: 'center' },
  sheetButton: { marginTop: 8 },
  picker: { alignSelf: 'stretch' },
});
