import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PlanDay } from '@da/domain';
import { Pressable, Text, useTheme } from '@da/ui';
import { useFormatCtx } from '../flow/useFormatCtx';
import { dayHeader, dayNumber, weekdayShort } from './dates';

export interface DateStripProps {
  days: PlanDay[];
  selected: string;
  today: string;
  onSelect: (key: string) => void;
}

/** Seven 42×60 chips: weekday · day number · activity dot (today inverted, upcoming primary). */
export function DateStrip({ days, selected, today, onSelect }: DateStripProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const ctx = useFormatCtx();
  const c = theme.colors;
  return (
    <View style={styles.row} accessibilityRole="tablist" testID="plan-date-strip">
      {days.map((day) => {
        const isSelected = day.date === selected;
        const isToday = day.date === today;
        const hasEvents = day.events.length + day.tasks.length + day.commitments.length > 0;
        const bg = isSelected ? c.inverseSurface : c.surface;
        const fg = isSelected ? c.inkInverse : c.ink;
        const dot = !hasEvents
          ? 'transparent'
          : isSelected
            ? c.primaryGlow
            : day.date < today
              ? c.divider
              : c.primary;
        return (
          <Pressable
            key={day.date}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={t('a11y.selectDay', { date: dayHeader(day.date, ctx.locale) })}
            onPress={() => onSelect(day.date)}
            hapticOnPress="selection"
            ensureTouchTarget={false}
            style={[
              styles.chip,
              {
                backgroundColor: bg,
                borderRadius: theme.radius.md,
                borderWidth: isToday && !isSelected ? 1 : 0,
                borderColor: c.primary,
              },
              !theme.isDark && !isSelected ? theme.shadows.s1 : null,
            ]}
            testID={`plan-day-${day.date}`}
          >
            <Text variant="tab" color={fg} style={styles.weekday}>
              {weekdayShort(day.date, ctx.locale)}
            </Text>
            <Text variant="h3" color={fg} tabular>
              {dayNumber(day.date)}
            </Text>
            <View style={[styles.dot, { backgroundColor: dot }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  chip: { width: 42, height: 60, alignItems: 'center', justifyContent: 'center', gap: 2 },
  weekday: { opacity: 0.8 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
