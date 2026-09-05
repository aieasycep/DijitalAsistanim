import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import {
  MAIL_INTELLIGENCE_CATEGORIES,
  type EmailThread,
  type MailIntelligenceCategory,
} from '@da/domain';
import { formatRelativeLabel } from '@da/i18n';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ListGroup,
  ListRow,
  Screen,
  ScreenHeader,
  SectionKicker,
  Skeleton,
  Text,
  useTheme,
} from '@da/ui';
import type { IconName } from '@da/design-tokens';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { useDataSource } from '@/hooks/useDataSource';

const CATEGORY_ICON: Record<MailIntelligenceCategory, IconName> = {
  important: 'warning',
  waiting_for_user: 'person',
  waiting_for_other: 'followUp',
  has_deadline: 'deadline',
  information: 'info',
  low_priority: 'expandMore',
};

function senderOf(thread: EmailThread): string {
  const p = thread.participants[0];
  return p?.name ?? p?.email ?? thread.subject;
}

export default function MailIntelligenceScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ds = useDataSource();
  const ctx = useFormatCtx();
  const [selected, setSelected] = useState<MailIntelligenceCategory>('important');
  const query = useQuery({
    queryKey: qk.mailIntelligence,
    queryFn: () => ds.feed.getMailIntelligence(),
  });
  const data = query.data;

  const band = useMemo(() => {
    if (!data || data.totalToday === 0) return { attention: 0, info: 0, low: 1 };
    const attention = data.needsAttention / data.totalToday;
    const info = data.categories.information.count / data.totalToday;
    return { attention, info, low: Math.max(0, 1 - attention - info) };
  }, [data]);

  const threads = data?.categories[selected].threads ?? [];

  return (
    <Screen
      scroll
      topGap={6}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      testID="mailintel-screen"
      header={
        <ScreenHeader
          variant="sub"
          kicker={t('flow.mailIntelligenceKicker')}
          onBack={() => router.back()}
          backLabel={t('common.back')}
        />
      }
    >
      <OfflineNotice onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      {query.isLoading ? (
        <View style={styles.stack}>
          <Skeleton width="40%" height={40} />
          <Skeleton width="80%" height={22} />
          <ListSkeleton count={3} />
        </View>
      ) : query.isError || !data ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <View style={styles.stack}>
          <View style={styles.hero}>
            <View style={styles.heroRow}>
              <Text variant="display" tabular>
                {data.totalToday}
              </Text>
              <Text variant="h4" tone="secondary">
                {t('flow.mailArrived')}
              </Text>
            </View>
            <Text variant="h2">
              {data.totalToday === 0 || data.needsAttention === 0
                ? t('flow.mailNone')
                : t('flow.mailNeedsAttention', { count: data.needsAttention })}
            </Text>
            <Text variant="secondary" tone="secondary">
              {t('flow.mailReadForYou', {
                read: Math.max(0, data.totalToday - data.needsAttention),
                low: data.categories.low_priority.count,
                info: data.categories.information.count,
              })}
            </Text>
          </View>
          <View
            style={styles.band}
            accessibilityRole="progressbar"
            accessibilityLabel={t('flow.mailNeedsAttention', { count: data.needsAttention })}
          >
            <View
              style={{
                flex: band.attention,
                backgroundColor: theme.colors.primary,
                borderRadius: 4,
              }}
            />
            <View
              style={{
                flex: band.info,
                backgroundColor: theme.colors.primarySoft,
                borderRadius: 4,
              }}
            />
            <View
              style={{ flex: band.low, backgroundColor: theme.colors.hairline, borderRadius: 4 }}
            />
          </View>
          <ListGroup testID="mailintel-categories">
            {MAIL_INTELLIGENCE_CATEGORIES.map((key) => {
              const hot = key === 'important' || key === 'waiting_for_user';
              return (
                <ListRow
                  key={key}
                  icon={CATEGORY_ICON[key]}
                  iconColor={hot ? theme.colors.primaryText : undefined}
                  title={t(`flow.mailCategories.${key}`)}
                  trailingText={String(data.categories[key].count)}
                  trailingTone={key === selected ? 'primary' : hot ? 'primary' : 'tertiary'}
                  onPress={() => setSelected(key)}
                  accessibilityHint={t('a11y.showCategory')}
                  testID={`mailintel-category-${key}`}
                />
              );
            })}
          </ListGroup>
          <SectionKicker
            label={t(`flow.mailCategories.${selected}`)}
            meta={t('today.prioritiesCount', { count: threads.length })}
          />
          {threads.length === 0 ? (
            <EmptyState
              icon="mail"
              title={t('flow.emptyFilter')}
              compact
              testID="mailintel-empty"
            />
          ) : (
            threads.map((thread, index) => (
              <Card
                key={thread.id}
                padding={{ top: 14, horizontal: 16, bottom: 12 }}
                onPress={() => router.push({ pathname: '/email/[id]', params: { id: thread.id } })}
                accessibilityLabel={`${senderOf(thread)} · ${thread.subject}`}
                testID={`mailintel-thread-${index}`}
              >
                <View style={styles.threadRow}>
                  <Avatar name={senderOf(thread)} size={28} />
                  <Text variant="chip" numberOfLines={1} style={styles.threadName}>
                    {senderOf(thread)}
                  </Text>
                  {thread.importance === 'critical' ? (
                    <Badge label={t('badges.urgent')} tone="critical" />
                  ) : null}
                  {thread.analysis?.deadline ? (
                    <Badge label={t('badges.deadline')} tone="deadline" />
                  ) : null}
                  <Text variant="caption" tone="tertiary">
                    {formatRelativeLabel(thread.lastMessageAt, ctx)}
                  </Text>
                </View>
                <Text variant="body" style={styles.threadBody}>
                  {thread.analysis?.summary ?? thread.snippet}
                </Text>
              </Card>
            ))
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  hero: { gap: 6, paddingVertical: 6 },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  band: { flexDirection: 'row', height: 8, gap: 2 },
  threadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  threadName: { flex: 1 },
  threadBody: { marginTop: 8 },
});
