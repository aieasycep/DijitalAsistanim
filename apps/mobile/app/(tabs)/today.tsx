import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import { formatDayKicker, formatTime, greetingFor, type FormatCtx } from '@da/i18n';
import type { Insight, InsightAction, LifeEvent, UserPreferences } from '@da/domain';
import {
  ApprovalBadge,
  Avatar,
  CalendarRowCard,
  EmptyState,
  ErrorState,
  IconButton,
  LifeCard,
  OfflineBanner,
  Pressable,
  Screen,
  ScreenHeader,
  SectionKicker,
  useBottomSheet,
  useTheme,
  useToast,
} from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { useEntitlement } from '@/hooks/useEntitlement';
import { describeError } from '@/lib/errors';
import { formatCtx } from '@/lib/i18n';
import { selectFirstName, useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';
import { useInsightActions } from '@/features/insights/useInsightActions';
import { useOpenSource } from '@/features/source/openSource';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { HeroBriefingCard } from '@/features/today/HeroBriefingCard';
import { InsightMenuSheet } from '@/features/today/InsightMenuSheet';
import { MAX_PRIORITIES, PrioritySection } from '@/features/today/PrioritySection';
import { TodaySkeleton } from '@/features/today/TodaySkeleton';

function upper(value: string, locale: FormatCtx['locale']): string {
  return value.toLocaleUpperCase(locale === 'tr' ? 'tr-TR' : 'en-GB');
}

/** Formatting context from the user's saved locale / timezone (device values otherwise). */
function ctxFromPreferences(preferences: UserPreferences | null): FormatCtx {
  return formatCtx({
    ...(preferences?.locale ? { locale: preferences.locale } : {}),
    ...(preferences?.timezone ? { timezone: preferences.timezone } : {}),
  });
}

/** Today (tab root): hero briefing, ÖNCELİKLERİN, meetings, deadlines, personal updates; evening variant after 18:00. */
export default function TodayScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const offline = useUiStore((s) => s.offline);
  const setPendingApprovals = useUiStore((s) => s.setPendingApprovals);
  const profile = useSessionStore((s) => s.profile);
  const preferences = useSessionStore((s) => s.preferences);
  const firstName = useSessionStore(selectFirstName);
  const { gate } = useEntitlement();
  const { runAction, complete, snoozeUntilTomorrow } = useInsightActions();
  const { openSource } = useOpenSource();
  const menu = useBottomSheet();
  const [menuInsight, setMenuInsight] = useState<Insight | null>(null);
  const player = useAudioPlayer();

  const ctx = ctxFromPreferences(preferences);

  const feedQuery = useQuery({ queryKey: qk.today(), queryFn: () => ds.feed.getToday() });
  const accountsQuery = useQuery({
    queryKey: qk.accounts,
    queryFn: () => ds.accounts.listAccounts(),
  });
  const pendingQuery = useQuery({
    queryKey: qk.approvalsPending,
    queryFn: () => ds.approvals.pendingCount(),
  });
  const feed = feedQuery.data;
  const lifeQuery = useQuery({
    queryKey: qk.lifeEvents,
    queryFn: () => ds.feed.listLifeEvents(),
    enabled: (feed?.lifeEvents.length ?? 0) > 0,
  });

  useEffect(() => {
    const unsubscribe = ds.approvals.onPendingChange?.((count) => {
      queryClient.setQueryData(qk.approvalsPending, count);
      setPendingApprovals(count);
    });
    return () => unsubscribe?.();
  }, [ds, queryClient, setPendingApprovals]);

  useEffect(() => {
    if (typeof pendingQuery.data === 'number') setPendingApprovals(pendingQuery.data);
  }, [pendingQuery.data, setPendingApprovals]);

  const pendingCount = Math.max(pendingQuery.data ?? 0, feed?.pendingApprovals ?? 0);
  const noAccounts =
    accountsQuery.isSuccess &&
    accountsQuery.data.filter((a) => !a.deletedAt && a.status !== 'disconnected').length === 0;

  const refetchFeed = feedQuery.refetch;
  const refetchPending = pendingQuery.refetch;
  const refetchAccounts = accountsQuery.refetch;
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchFeed(), refetchPending(), refetchAccounts()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchFeed, refetchPending, refetchAccounts]);

  const openBriefing = useCallback(() => {
    if (!feed) return;
    const evening = feed.isEvening && feed.briefing?.kind === 'evening';
    if (evening && !gate('evening_close', 'evening')) return;
    const kind = evening ? 'evening' : 'morning';
    router.push({
      pathname: '/briefing/[kind]',
      params: feed.briefing ? { kind, id: feed.briefing.id } : { kind },
    });
  }, [feed, gate, router]);

  const loadAudio = player.load;
  const listen = useCallback(async () => {
    const briefing = feed?.briefing;
    if (!briefing || player.loading) return;
    if (!gate('voice_briefing', 'voice')) return;
    const ok = await loadAudio(briefing.id, {
      title: t(`briefing.audio.${briefing.kind}Title`),
      autoplay: true,
    });
    if (!ok) {
      toast.show({
        message: t('briefing.audio.unavailable'),
        icon: 'warning',
        iconTone: 'critical',
      });
      return;
    }
    router.push({ pathname: '/briefing/audio', params: { id: briefing.id } });
  }, [feed?.briefing, player.loading, gate, loadAudio, t, router, toast]);

  const onMore = useCallback(
    (insight: Insight) => {
      setMenuInsight(insight);
      menu.open();
    },
    [menu],
  );
  const onAction = useCallback(
    (action: InsightAction, insight: Insight) => void runAction(insight, action),
    [runAction],
  );
  const onCardPress = useCallback(
    (insight: Insight) => void openSource(insight.source),
    [openSource],
  );
  const prepare = useCallback(
    (insight: Insight) => {
      const action = insight.actions.find((a) => a.kind === 'prepare') ?? {
        id: 'prepare',
        kind: 'prepare' as const,
        label: t('common.prepare'),
        primary: true,
      };
      void runAction(insight, action);
    },
    [runAction, t],
  );

  const priorityIds = useMemo(
    () => new Set((feed?.priorities ?? []).slice(0, MAX_PRIORITIES).map((i) => i.id)),
    [feed?.priorities],
  );
  const deadlines = useMemo(
    () => (feed?.deadlines ?? []).filter((i) => !priorityIds.has(i.id)),
    [feed?.deadlines, priorityIds],
  );
  const lifeById = useMemo(
    () => new Map((lifeQuery.data ?? []).map((l) => [l.id, l] as const)),
    [lifeQuery.data],
  );
  const lifeInsights = feed?.lifeEvents ?? [];
  const meetings = feed?.meetings ?? [];
  const priorities = feed?.priorities ?? [];
  const isEmpty =
    priorities.length === 0 &&
    meetings.length === 0 &&
    deadlines.length === 0 &&
    lifeInsights.length === 0;

  const greeting = feed?.greeting ?? t(`greeting.${greetingFor(ctx)}`, { name: firstName });
  const dateKicker = feed?.dateLabel
    ? upper(feed.dateLabel, ctx.locale)
    : formatDayKicker(new Date(), ctx);
  const displayName = profile?.displayName || firstName || t('app.name');

  const header = (
    <ScreenHeader
      variant="root"
      kicker={dateKicker}
      title={greeting}
      right={
        <View style={styles.headerRight}>
          <IconButton
            icon="search"
            accessibilityLabel={t('a11y.search')}
            onPress={() => router.push('/search')}
            testID="today-search"
          />
          <IconButton
            icon="add"
            accessibilityLabel={t('a11y.capture')}
            onPress={() => router.push('/capture')}
            testID="today-capture"
          />
          <ApprovalBadge
            count={pendingCount}
            label={
              pendingCount === 1
                ? t('today.approvalsOne')
                : t('today.approvals', { count: pendingCount })
            }
            accessibilityLabel={t('a11y.approvalBadge', { count: pendingCount })}
            onPress={() => router.push('/approvals')}
            testID="today-approvals"
          />
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.avatar')}
            style={styles.avatar}
            testID="today-avatar"
          >
            <Avatar name={displayName} imageUrl={profile?.avatarUrl} size={40} variant="ink" />
          </Pressable>
        </View>
      }
      testID="today-header"
    />
  );

  const lastAnalyzed = feed?.lastAnalyzedAt ? formatTime(feed.lastAnalyzedAt, ctx) : null;
  const offlineBanner = offline ? (
    <OfflineBanner
      text={
        lastAnalyzed ? t('common.offlineLastAnalysis', { time: lastAnalyzed }) : t('common.offline')
      }
      retryLabel={t('common.refresh')}
      retrying={refreshing}
      onRetry={() => void onRefresh()}
      style={styles.banner}
      testID="today-offline"
    />
  ) : null;

  let body: React.ReactNode;
  if (!feed && feedQuery.isPending) {
    body = <TodaySkeleton />;
  } else if (!feed) {
    body = (
      <ErrorState
        variant="full"
        title={describeError(feedQuery.error, t).title}
        message={describeError(feedQuery.error, t).body ?? t('errors.cardFailed')}
        retryLabel={t('common.retry')}
        onRetry={() => void refetchFeed()}
        testID="today-error"
      />
    );
  } else if (noAccounts) {
    body = (
      <EmptyState
        icon="mail"
        title={t('today.noConnectionTitle')}
        body={t('today.connectBody')}
        actionLabel={t('today.connectNow')}
        onAction={() => router.push('/settings/integrations')}
        testID="today-empty"
      />
    );
  } else {
    body = (
      <View style={[styles.sections, { gap: theme.layout.sectionGap }]}>
        <HeroBriefingCard
          briefing={feed.briefing}
          isEvening={feed.isEvening}
          readyTimeLabel={feed.briefing ? formatTime(feed.briefing.generatedAt, ctx) : null}
          onOpen={openBriefing}
          onListen={() => void listen()}
          listenLoading={player.loading}
          onRefresh={() => void onRefresh()}
          refreshing={refreshing || feedQuery.isFetching}
        />
        {isEmpty ? (
          <EmptyState
            icon="check"
            title={t('today.emptyTitle')}
            body={t('today.emptyBody')}
            testID="today-empty"
          />
        ) : (
          <>
            <PrioritySection
              insights={priorities}
              title={feed.isEvening ? t('today.carriedOver') : t('today.priorities')}
              ctx={ctx}
              onPress={onCardPress}
              onComplete={complete}
              onSnooze={snoozeUntilTomorrow}
              onMore={onMore}
              onAction={onAction}
              onSource={(source) => void openSource(source)}
            />
            {meetings.length > 0 ? (
              <View style={[styles.section, { gap: theme.layout.cardGap }]}>
                <SectionKicker
                  label={t('today.meetings')}
                  meta={t('today.prioritiesCount', { count: meetings.length })}
                />
                {meetings.map((insight, index) => {
                  const [hour = '', minute = ''] = formatTime(
                    insight.dueAt ?? insight.source.timestamp,
                    ctx,
                  ).split(':');
                  return (
                    <CalendarRowCard
                      key={insight.id}
                      hour={hour}
                      minute={minute}
                      title={insight.title}
                      meta={insight.subtitle ?? insight.source.person ?? null}
                      actionLabel={t('common.prepare')}
                      onAction={() => prepare(insight)}
                      onPress={() => prepare(insight)}
                      done={insight.status === 'completed'}
                      testID={`today-meeting-${index}`}
                    />
                  );
                })}
              </View>
            ) : null}
            {deadlines.length > 0 ? (
              <PrioritySection
                insights={deadlines}
                title={t('today.deadlines')}
                ctx={ctx}
                onPress={onCardPress}
                onComplete={complete}
                onSnooze={snoozeUntilTomorrow}
                onMore={onMore}
                onAction={onAction}
                onSource={(source) => void openSource(source)}
                testIDPrefix="deadline-card"
              />
            ) : null}
            {lifeInsights.length > 0 ? (
              <View style={[styles.section, { gap: theme.layout.cardGap }]}>
                <SectionKicker label={t('today.personal')} />
                {lifeInsights.map((insight) => {
                  const event: LifeEvent | undefined = lifeById.get(insight.entityId);
                  const primary = insight.actions.find((a) => a.primary) ?? insight.actions[0];
                  const secondary = insight.actions.find((a) => a !== primary);
                  if (!event) {
                    return (
                      <PrioritySection
                        key={insight.id}
                        insights={[insight]}
                        title={t(`badges.${insight.badge}`)}
                        meta={null}
                        ctx={ctx}
                        onPress={onCardPress}
                        onComplete={complete}
                        onSnooze={snoozeUntilTomorrow}
                        onMore={onMore}
                        onAction={onAction}
                        onSource={(source) => void openSource(source)}
                        testIDPrefix="life-card"
                      />
                    );
                  }
                  return (
                    <LifeCard
                      key={insight.id}
                      event={event}
                      kicker={t(`badges.${event.type}`)}
                      timeLabel={insight.timeLabel ?? null}
                      title={insight.title}
                      meta={insight.subtitle ?? null}
                      primaryAction={
                        primary ? { kind: primary.id, label: primary.label } : undefined
                      }
                      secondaryAction={
                        secondary ? { kind: secondary.id, label: secondary.label } : undefined
                      }
                      onAction={(kind) => {
                        const action = insight.actions.find((a) => a.id === kind);
                        if (action) void runAction(insight, action);
                      }}
                      onPress={() =>
                        router.push({ pathname: '/life/[id]', params: { id: event.id } })
                      }
                      testID={`life-card-${event.id}`}
                    />
                  );
                })}
              </View>
            ) : null}
          </>
        )}
      </View>
    );
  }

  return (
    <>
      <Screen
        scroll
        header={header}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
        bottomInset={theme.layout.tabBarHeight}
        contentContainerStyle={styles.content}
        testID="today-screen"
      >
        {offlineBanner}
        {body}
      </Screen>
      <InsightMenuSheet insight={menuInsight} visible={menu.visible} onClose={menu.close} />
    </>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { borderRadius: 999 },
  banner: { marginBottom: 12 },
  content: { paddingTop: 16 },
  sections: { width: '100%' },
  section: { width: '100%' },
});
