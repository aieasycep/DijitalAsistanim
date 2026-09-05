import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { SearchResult } from '@da/domain';
import { formatRelativeLabel } from '@da/i18n';
import {
  EmptyState,
  IconButton,
  ListGroup,
  ListRow,
  Screen,
  SearchBar,
  SectionKicker,
  Text,
  useTheme,
} from '@da/ui';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { RESULT_ICON, routeForResult } from '@/features/search/routeForResult';
import { useSearch } from '@/features/search/useSearch';
import { useOpenSource } from '@/features/source/openSource';
import { useEntitlement } from '@/hooks/useEntitlement';
import { trackScreen } from '@/lib/analytics';

export default function SearchScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ctx = useFormatCtx();
  const { openSource } = useOpenSource();
  const { gate } = useEntitlement();
  const params = useLocalSearchParams<{ q?: string }>();
  const search = useSearch(params.q ?? '');
  const suggestions = t('search.suggestions', { returnObjects: true }) as string[];

  useEffect(() => {
    trackScreen('search');
  }, []);

  useEffect(() => {
    if (params.q) search.setText(params.q);
    // Only when the deep-link query changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  const submit = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      search.setText(trimmed);
      search.remember(trimmed);
    },
    [search],
  );

  const open = useCallback(
    (result: SearchResult) => {
      search.remember(search.text);
      const href = routeForResult(result);
      if (href) {
        if (result.kind === 'event' && !gate('meeting_prep', 'meeting_prep')) return;
        router.push(href);
        return;
      }
      if (!gate('ai_memory', 'memory')) return;
      void openSource(result.source);
    },
    [search, router, gate, openSource],
  );

  let index = 0;

  return (
    <Screen
      topGap={6}
      testID="search-screen"
      scroll
      header={
        <View style={styles.headerRow}>
          <IconButton
            icon="back"
            size={36}
            accessibilityLabel={t('common.back')}
            onPress={() => router.back()}
            testID="search-back"
          />
          <SearchBar
            value={search.text}
            onChangeText={search.setText}
            onSubmit={submit}
            onClear={() => search.setText('')}
            placeholder={t('search.placeholder')}
            clearLabel={t('common.close')}
            accessibilityLabel={t('common.search')}
            autoFocus
            style={styles.searchBar}
            testID="search-input"
          />
        </View>
      }
    >
      <OfflineNotice />
      {!search.active ? (
        <View style={styles.stack} testID="search-idle">
          {search.recent.length > 0 ? (
            <View style={styles.section}>
              <SectionKicker label={t('search.recent')} />
              <ListGroup>
                {search.recent.slice(0, 5).map((q, i) => (
                  <ListRow
                    key={`${i}-${q}`}
                    icon="history"
                    title={q}
                    onPress={() => submit(q)}
                    testID={`search-recent-${i}`}
                  />
                ))}
              </ListGroup>
            </View>
          ) : null}
          <View style={styles.section}>
            <SectionKicker label={t('search.suggestionsKicker')} />
            <ListGroup>
              {suggestions.map((q, i) => (
                <ListRow
                  key={q}
                  icon="search"
                  title={q}
                  onPress={() => submit(q)}
                  testID={`search-suggestion-${i}`}
                />
              ))}
            </ListGroup>
          </View>
          <Text variant="small" tone="tertiary" style={styles.hint}>
            {t('search.hint')}
          </Text>
        </View>
      ) : search.results.isLoading || search.pending ? (
        <ListSkeleton count={3} testID="search-loading" />
      ) : search.results.isError ? (
        <QueryErrorState
          error={search.results.error}
          onRetry={() => void search.results.refetch()}
          testID="search-error"
        />
      ) : search.flat.length === 0 ? (
        <EmptyState
          icon="search"
          title={t('search.empty')}
          body={t('search.emptyHint')}
          testID="search-empty"
        />
      ) : (
        <View style={styles.stack} testID="search-results">
          <Text variant="caption" tone="tertiary" style={styles.meta}>
            {t('search.results', { count: search.flat.length })} ·{' '}
            {t(`search.mode.${search.results.data?.mode ?? 'fts'}`)}
          </Text>
          {search.groups.map((group) => (
            <View key={group.kind} style={styles.section} testID={`search-group-${group.kind}`}>
              <SectionKicker
                label={t(`search.kinds.${group.kind}`)}
                meta={t('today.prioritiesCount', { count: group.results.length })}
              />
              <ListGroup>
                {group.results.map((result) => {
                  const i = index++;
                  return (
                    <ListRow
                      key={result.id}
                      icon={RESULT_ICON[result.kind]}
                      iconColor={theme.colors.inkSecondary}
                      title={result.title}
                      meta={[
                        result.summary,
                        `${result.source.label} · ${formatRelativeLabel(result.date, ctx)}`,
                      ]
                        .filter(Boolean)
                        .join(' — ')}
                      onPress={() => open(result)}
                      testID={`search-result-${i}`}
                    />
                  );
                })}
              </ListGroup>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12 },
  searchBar: { flex: 1 },
  stack: { gap: 16 },
  section: { gap: 8 },
  meta: { paddingHorizontal: 4 },
  hint: { paddingHorizontal: 4 },
});
