import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  EmptyState,
  FilterChip,
  IconButton,
  ListGroup,
  ListRow,
  Screen,
  ScreenHeader,
  SectionKicker,
  Skeleton,
  Text,
  useTheme,
} from '@da/ui';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { ConflictRows } from '@/features/plan/ConflictRows';
import { DateStrip } from '@/features/plan/DateStrip';
import { PlanSuggestionCard } from '@/features/plan/PlanSuggestionCard';
import { PlanTimeline } from '@/features/plan/PlanTimeline';
import { dayHeader, weekRangeLabel } from '@/features/plan/dates';
import { usePlan, type PlanRange } from '@/features/plan/usePlan';
import { useScheduleSuggestion } from '@/features/plan/useScheduleSuggestion';
import { trackScreen } from '@/lib/analytics';

const TAB_BAR_SPACE = 84;

export default function PlanScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ctx = useFormatCtx();
  const params = useLocalSearchParams<{ date?: string }>();
  const plan = usePlan(params.date ?? null);
  const { accept, dismiss, dismissed, isCreating } = useScheduleSuggestion(plan.days);
  const [busySuggestion, setBusySuggestion] = useState<string | null>(null);

  useEffect(() => {
    trackScreen('plan');
  }, []);

  const topSuggestion = useMemo(
    () => plan.suggestions.find((s) => !dismissed.has(s.id)) ?? null,
    [plan.suggestions, dismissed],
  );
  const openCommitments = useMemo(
    () => plan.days.reduce((n, d) => n + d.commitments.length, 0),
    [plan.days],
  );

  const segment = (
    <View style={styles.segment} accessibilityRole="tablist" testID="plan-segment">
      {(['day', 'week'] as const).map((key: PlanRange) => (
        <FilterChip
          key={key}
          label={t(`plan.${key}`)}
          selected={plan.range === key}
          onPress={() => plan.setRange(key)}
          testID={`plan-segment-${key}`}
        />
      ))}
    </View>
  );

  return (
    <Screen
      scroll
      testID="plan-screen"
      bottomInset={TAB_BAR_SPACE}
      refreshing={plan.isRefetching}
      onRefresh={() => void plan.refetch()}
      header={
        <View style={styles.header}>
          <ScreenHeader title={t('plan.title')} right={segment} />
          <View style={styles.weekRow}>
            <IconButton
              icon="back"
              size={36}
              accessibilityLabel={t('plan.previousWeek')}
              onPress={() => plan.shiftWeek(-1)}
              testID="plan-week-prev"
            />
            <Text variant="chip" tone="secondary" style={styles.weekLabel} numberOfLines={1}>
              {weekRangeLabel(plan.weekStart, ctx.locale)}
            </Text>
            <IconButton
              icon="forward"
              size={36}
              accessibilityLabel={t('plan.nextWeek')}
              onPress={() => plan.shiftWeek(1)}
              testID="plan-week-next"
            />
          </View>
          <DateStrip
            days={plan.days}
            selected={plan.date}
            today={plan.today}
            onSelect={plan.setDate}
          />
        </View>
      }
    >
      <View style={styles.stack}>
        <OfflineNotice onRetry={() => void plan.refetch()} retrying={plan.isRefetching} />
        {plan.isLoading ? (
          <View style={styles.stack}>
            <Skeleton height={120} radius={theme.radius.xxl} />
            <ListSkeleton count={4} testID="plan-loading" />
          </View>
        ) : plan.isError ? (
          <QueryErrorState
            error={plan.error}
            onRetry={() => void plan.refetch()}
            testID="plan-error"
          />
        ) : (
          <>
            {topSuggestion ? (
              <PlanSuggestionCard
                suggestion={topSuggestion}
                loading={isCreating && busySuggestion === topSuggestion.id}
                onAccept={(s) => {
                  setBusySuggestion(s.id);
                  void accept(s).finally(() => setBusySuggestion(null));
                }}
                onDismiss={dismiss}
              />
            ) : null}
            {plan.range === 'day' ? (
              <>
                <SectionKicker
                  label={dayHeader(plan.date, ctx.locale)}
                  meta={t('today.prioritiesCount', { count: plan.day?.events.length ?? 0 })}
                />
                {plan.day ? (
                  <PlanTimeline day={plan.day} />
                ) : (
                  <EmptyState icon="plan" title={t('plan.emptyDay')} compact />
                )}
              </>
            ) : (
              plan.days.map((day) => {
                const count = day.events.length + day.tasks.length + day.commitments.length;
                if (count === 0) return null;
                return (
                  <View key={day.date} style={styles.stack} testID={`plan-week-day-${day.date}`}>
                    <SectionKicker
                      label={dayHeader(day.date, ctx.locale)}
                      meta={t('today.prioritiesCount', { count })}
                    />
                    <PlanTimeline day={day} compact />
                  </View>
                );
              })
            )}
            {plan.range === 'week' &&
            plan.days.every(
              (d) => d.events.length + d.tasks.length + d.commitments.length === 0,
            ) ? (
              <EmptyState
                icon="plan"
                title={t('plan.emptyWeek')}
                compact
                testID="plan-empty-week"
              />
            ) : null}
            <ConflictRows conflicts={plan.conflicts} />
            <ListGroup>
              <ListRow
                icon="commitment"
                title={t('plan.commitments')}
                meta={
                  openCommitments > 0
                    ? t('today.prioritiesCount', { count: openCommitments })
                    : t('commitments.empty')
                }
                onPress={() => router.push('/commitments')}
                testID="plan-commitments"
              />
            </ListGroup>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 14, paddingBottom: 12 },
  segment: { flexDirection: 'row', gap: 6 },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  weekLabel: { flex: 1, textAlign: 'center' },
  stack: { gap: 16 },
});
