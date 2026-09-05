import { ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FLOW_FILTERS, type FlowFilter } from '@da/domain';
import { FilterChip } from '@da/ui';

export interface FlowFiltersProps {
  value: FlowFilter;
  onChange: (next: FlowFilter) => void;
}

/** Tümü · Önemli · Mail · Takvim · Takip · Kişisel — horizontal chip row. */
export function FlowFilters({ value, onChange }: FlowFiltersProps) {
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
      accessibilityRole="tablist"
      testID="flow-filters"
    >
      {FLOW_FILTERS.map((key) => (
        <FilterChip
          key={key}
          label={t(`flow.filters.${key}`)}
          selected={key === value}
          onPress={() => onChange(key)}
          testID={`flow-filter-${key}`}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -20, flexGrow: 0 },
  row: { paddingHorizontal: 20, gap: 8 },
});
