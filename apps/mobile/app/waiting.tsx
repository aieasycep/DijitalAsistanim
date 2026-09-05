import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { Insight } from '@da/domain';
import { isToday } from '@da/i18n';
import { EmptyState, Screen, ScreenHeader, Text, useTheme } from '@da/ui';
import { InsightCard } from '@/features/flow/InsightCard';
import { InsightMenuSheet } from '@/features/flow/InsightMenuSheet';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { useDataSource } from '@/hooks/useDataSource';

type Group = 'urgent' | 'today' | 'soon';
const URGENT_WINDOW_MS = 4 * 60 * 60_000;

export function groupWaiting(
  items: Insight[],
  now: Date,
  ctx: Parameters<typeof isToday>[1],
): Record<Group, Insight[]> {
  const groups: Record<Group, Insight[]> = { urgent: [], today: [], soon: [] };
  for (const insight of items) {
    const due = insight.dueAt ? Date.parse(insight.dueAt) : null;
    if (
      insight.importance === 'critical' ||
      (due !== null && due - now.getTime() <= URGENT_WINDOW_MS)
    )
      groups.urgent.push(insight);
    else if (due !== null && isToday(insight.dueAt ?? now, { ...ctx, now }))
      groups.today.push(insight);
    else groups.soon.push(insight);
  }
  return groups;
}

export default function WaitingScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ds = useDataSource();
  const ctx = useFormatCtx();
  const [menuInsight, setMenuInsight] = useState<Insight | null>(null);
  const query = useQuery({ queryKey: qk.waiting, queryFn: () => ds.feed.listWaitingForUser() });
  const groups = useMemo(
    () => groupWaiting(query.data ?? [], ctx.now ?? new Date(), ctx),
    [query.data, ctx],
  );
  const total = query.data?.length ?? 0;
  const dotColor: Record<Group, string> = {
    urgent: theme.colors.critical,
    today: theme.colors.warning,
    soon: theme.colors.inkDisabled,
  };
  const headerTone: Record<Group, 'critical' | 'warning' | 'secondary'> = {
    urgent: 'critical',
    today: 'warning',
    soon: 'secondary',
  };

  return (
    <Screen
      scroll
      topGap={6}
      testID="waiting-screen"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={
        <ScreenHeader
          variant="sub"
          title={t('email.waiting.title')}
          subtitle={
            query.data
              ? total > 0
                ? t('email.waiting.subtitle', { count: total })
                : t('email.waiting.empty')
              : undefined
          }
          onBack={() => router.back()}
          backLabel={t('common.back')}
        />
      }
    >
      <OfflineNotice onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      {query.isLoading ? (
        <ListSkeleton count={3} testID="waiting-loading" />
      ) : query.isError ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : total === 0 ? (
        <EmptyState icon="person" title={t('email.waiting.empty')} testID="waiting-empty" />
      ) : (
        <View style={styles.stack}>
          {(['urgent', 'today', 'soon'] as const).map((group) =>
            groups[group].length === 0 ? null : (
              <View key={group} style={styles.group} testID={`waiting-group-${group}`}>
                <View style={styles.groupHeader}>
                  <View style={[styles.dot, { backgroundColor: dotColor[group] }]} />
                  <Text variant="kicker" tone={headerTone[group]}>
                    {t(`email.waiting.${group}`)}
                  </Text>
                </View>
                {groups[group].map((insight) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    onMore={setMenuInsight}
                    swipeEnabled={false}
                    testID={`waiting-item-${insight.id}`}
                  />
                ))}
              </View>
            ),
          )}
        </View>
      )}
      <InsightMenuSheet insight={menuInsight} onClose={() => setMenuInsight(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 20 },
  group: { gap: 10 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
