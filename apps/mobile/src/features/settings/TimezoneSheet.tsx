import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet, SheetRow, Text, TextField } from '@da/ui';
import { deviceTimezone } from '@/lib/datasource';
import { timezoneOptions } from './timezones';

export interface TimezoneSheetProps {
  visible: boolean;
  current: string;
  onClose: () => void;
  onSelect: (timezone: string) => void;
  testID?: string;
}

/** Searchable IANA zone picker: current zone first, device zone second, then by offset. */
export function TimezoneSheet({ visible, current, onClose, onSelect, testID }: TimezoneSheetProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [openedAt] = useState(() => new Date());
  const device = deviceTimezone();

  const options = useMemo(
    () => (visible ? timezoneOptions({ current, device, query, at: openedAt }) : []),
    [current, device, openedAt, query, visible],
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('settings.profileScreen.pickTimezone')}
      closeLabel={t('common.close')}
      testID={testID}
    >
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={t('settings.profileScreen.searchTimezone')}
        leftIcon="search"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        testID={testID ? `${testID}-search` : undefined}
      />
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {options.length === 0 ? (
          <Text variant="secondary" tone="secondary" style={styles.empty}>
            {t('settings.profileScreen.noTimezoneMatch')}
          </Text>
        ) : (
          <View>
            {options.map((option, index) => (
              <SheetRow
                key={option.id}
                icon={option.isDevice ? 'location' : undefined}
                label={
                  option.isDevice
                    ? `${option.city} · ${t('settings.profileScreen.deviceTimezone')}`
                    : option.city
                }
                value={
                  option.region ? `${option.region} · ${option.offsetLabel}` : option.offsetLabel
                }
                selected={option.isCurrent}
                divider={index > 0}
                onPress={() => onSelect(option.id)}
                accessibilityLabel={`${option.city} · ${option.offsetLabel}`}
                testID={testID ? `${testID}-option-${option.id}` : undefined}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 10, maxHeight: 380 },
  empty: { paddingVertical: 20, textAlign: 'center' },
});
