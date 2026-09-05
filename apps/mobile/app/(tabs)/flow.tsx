import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { FlowFilter, Insight } from '@da/domain';
import {
  Button,
  EmptyState,
  ListGroup,
  ListRow,
  Screen,
  ScreenHeader,
  Text,
  useScreenPadding,
  useTheme,
} from '@da/ui';
import { FlowFilters } from '@/features/flow/FlowFilters';
import { InsightCard } from '@/features/flow/InsightCard';
import { InsightMenuSheet } from '@/features/flow/InsightMenuSheet';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { isFlowFilter, useFlowFeed } from '@/features/flow/useFlowFeed';
import { trackScreen } from '@/lib/analytics';
import { useUiStore } from '@/store/ui';

const TAB_BAR_SPACE = 84;

export default function FlowScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<FlowFilter>(
    isFlowFilter(params.filter) ? params.filter : 'all',
  );
  const [menuInsight, setMenuInsight] = useState<Insight | null>(null);
  const offline = useUiStore((s) => s.offline);
  const feed = useFlowFeed(filter);
  const padding = useScreenPadding({ bottomInset: TAB_BAR_SPACE, topInset: false, topGap: 0 });

  useEffect(() => {
    trackScreen('flow');
  }, []);

  // A `?filter=` deep link selects that chip (state adjusted during render, not in an effect).
  const [seenFilter, setSeenFilter] = useState(params.filter);
  if (params.filter !== seenFilter) {
    setSeenFilter(params.filter);
    if (isFlowFilter(params.filter)) setFilter(params.filter);
  }

  const importantCount = useMemo(
    () => feed.items.filter((i) => i.tags.includes('important')).length,
    [feed.items],
  );

  const onEndReached = useCallback(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
  }, [feed]);

  const renderItem = useCallback(
    ({ item, index }: { item: Insight; index: number }) => (
      <View style={styles.item}>
        <InsightCard insight={item} onMore={setMenuInsight} testID={`flow-item-${index}`} />
      </View>
    ),
    [],
  );

  const header = (
    <View style={styles.listHeader}>
      <OfflineNotice onRetry={() => void feed.refetch()} retrying={feed.isRefetching} />
      <ListGroup>
        <ListRow
          icon="mail"
          title={t('flow.mailIntelligence')}
          meta={t('flow.mailNeedsAttentionHint')}
          onPress={() => router.push('/mail-intelligence')}
          testID="flow-mail-intelligence"
        />
      </ListGroup>
      {feed.items.length > 0 ? (
        <Text variant="small" tone="secondary" style={styles.meta}>
          {t('flow.meta', { count: feed.items.length, important: importantCount })}
        </Text>
      ) : null}
    </View>
  );

  const empty = feed.isLoading ? (
    <ListSkeleton count={5} testID="flow-loading" />
  ) : feed.isError ? (
    <QueryErrorState error={feed.error} onRetry={() => void feed.refetch()} testID="flow-error" />
  ) : (
    <EmptyState
      icon="flow"
      title={filter === 'all' ? t('flow.emptyTitle') : t('flow.emptyFilter')}
      body={filter === 'all' ? t('flow.emptyBody') : undefined}
      testID="flow-empty"
    />
  );

  const footer = feed.isFetchingNextPage ? (
    <ListSkeleton count={1} />
  ) : feed.items.length > 0 && !feed.hasNextPage ? (
    <Text variant="caption" tone="tertiary" align="center" style={styles.end}>
      {t('flow.endOfFeed')}
    </Text>
  ) : null;

  return (
    <Screen
      testID="flow-screen"
      header={
        <View style={[styles.header, { paddingHorizontal: theme.layout.screenPaddingH }]}>
          <ScreenHeader
            title={t('flow.title')}
            right={
              <Button
                label={t('flow.capture')}
                icon="capture"
                variant="surface"
                size="sm"
                onPress={() => router.push('/capture')}
                testID="flow-capture"
              />
            }
          />
          <FlowFilters value={filter} onChange={setFilter} />
        </View>
      }
      padded={false}
    >
      <FlashList
        data={feed.items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ ...padding, paddingHorizontal: theme.layout.screenPaddingH }}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            onRefresh={() => void feed.refetch()}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surface}
            enabled={!offline}
          />
        }
        keyboardShouldPersistTaps="handled"
        testID="flow-list"
      />
      <InsightMenuSheet insight={menuInsight} onClose={() => setMenuInsight(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 14, paddingBottom: 12 },
  listHeader: { gap: 12, paddingBottom: 12 },
  meta: { paddingHorizontal: 4 },
  item: { marginBottom: 12 },
  end: { paddingVertical: 16 },
});
