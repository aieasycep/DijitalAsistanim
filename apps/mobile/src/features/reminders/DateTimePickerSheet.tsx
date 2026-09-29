/**
 * Date-time picking shared by the smart reminder sheet ("Kendin seç") and approval editing.
 * iOS: inline spinner (`datetime`). Android: the native date then time dialogs, launched from two chips.
 */
import { useCallback, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { formatShortDate, formatTime } from '@da/i18n';
import { BottomSheet, Button, Icon, Pressable, Text, useTheme } from '@da/ui';
import { useFormatCtx } from '../flow/useFormatCtx';

const MINUTE_INTERVAL = 5;

/** Rounds up to the next 5-minute mark so the spinner starts on a clean value. */
export function roundToInterval(date: Date, minutes = MINUTE_INTERVAL): Date {
  const ms = minutes * 60_000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

function combine(day: Date, time: Date): Date {
  const out = new Date(day);
  out.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return out;
}

export interface DateTimePickerPanelProps {
  value: Date;
  minimumDate?: Date;
  onChange: (date: Date) => void;
  testID?: string;
}

/** Inline picker body (no sheet chrome). */
export function DateTimePickerPanel({
  value,
  minimumDate,
  onChange,
  testID,
}: DateTimePickerPanelProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const ctx = useFormatCtx();

  const openAndroid = useCallback(
    (mode: 'date' | 'time') => {
      DateTimePickerAndroid.open({
        mode,
        is24Hour: true,
        value,
        minimumDate: mode === 'date' ? minimumDate : undefined,
        onChange: (event: DateTimePickerEvent, picked?: Date) => {
          if (event.type !== 'set' || !picked) return;
          onChange(mode === 'date' ? combine(picked, value) : combine(value, picked));
        },
      });
    },
    [minimumDate, onChange, value],
  );

  if (Platform.OS === 'android') {
    const chip = (mode: 'date' | 'time', label: string) => (
      <Pressable
        onPress={() => openAndroid(mode)}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.timePicker', { label })}
        style={[
          styles.chip,
          {
            backgroundColor: theme.colors.surface2,
            borderRadius: theme.radius.md,
            minHeight: theme.layout.touchTargetMin,
          },
        ]}
        testID={testID ? `${testID}-${mode}` : undefined}
      >
        <Icon
          name={mode === 'date' ? 'plan' : 'schedule'}
          size={18}
          color={theme.colors.inkSecondary}
        />
        <Text variant="bodyMedium" tabular>
          {label}
        </Text>
      </Pressable>
    );
    return (
      <View style={styles.androidRow} testID={testID}>
        {chip('date', formatShortDate(value, ctx))}
        {chip('time', formatTime(value, ctx))}
      </View>
    );
  }

  return (
    <DateTimePicker
      mode="datetime"
      display="spinner"
      value={value}
      minimumDate={minimumDate}
      minuteInterval={MINUTE_INTERVAL}
      locale={i18n.language?.startsWith('en') ? 'en-GB' : 'tr-TR'}
      onChange={(_event: DateTimePickerEvent, picked?: Date) => {
        if (picked) onChange(picked);
      }}
      style={styles.picker}
      testID={testID}
    />
  );
}

export interface DateTimePickerSheetProps {
  visible: boolean;
  value: Date;
  minimumDate?: Date;
  title: string;
  onConfirm: (date: Date) => void;
  onClose: () => void;
  testID?: string;
}

interface SheetBodyProps {
  initial: Date;
  minimumDate?: Date;
  onConfirm: (date: Date) => void;
  testID?: string;
}

/** Owns the draft so a fresh `key` per opening resets it to the incoming value. */
function SheetBody({ initial, minimumDate, onConfirm, testID }: SheetBodyProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Date>(initial);
  return (
    <>
      <DateTimePickerPanel
        value={draft}
        minimumDate={minimumDate}
        onChange={setDraft}
        testID={testID}
      />
      <Button
        label={t('common.ok')}
        size="md"
        fullWidth
        onPress={() => onConfirm(draft)}
        style={styles.confirm}
        testID={testID ? `${testID}-confirm` : undefined}
      />
    </>
  );
}

/** Bottom sheet around the panel with a confirm button; the draft resets every time it opens. */
export function DateTimePickerSheet({
  visible,
  value,
  minimumDate,
  title,
  onConfirm,
  onClose,
  testID,
}: DateTimePickerSheetProps) {
  const { t } = useTranslation();
  // Each opening gets a new session key so the body remounts with the incoming value.
  const [session, setSession] = useState(0);
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setSession((s) => s + 1);
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      closeLabel={t('common.close')}
      testID={testID ? `${testID}-sheet` : undefined}
    >
      <SheetBody
        key={session}
        initial={value}
        minimumDate={minimumDate}
        onConfirm={onConfirm}
        testID={testID}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  picker: { alignSelf: 'stretch' },
  androidRow: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  confirm: { marginTop: 8 },
});
