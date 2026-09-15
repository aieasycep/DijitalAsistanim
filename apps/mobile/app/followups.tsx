import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { FollowUp } from '@da/domain';
import { formatRelativeLabel } from '@da/i18n';
import { EmptyState, Icon, Screen, ScreenHeader, Text, useTheme, useToast } from '@da/ui';
import { FollowUpCard, daysWaiting } from '@/features/email/FollowUpCard';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { PostponeSheet, type PostponeOption } from '@/features/plan/PostponeSheet';
import { useDataSource } from '@/hooks/useDataSource';
import { track } from '@/lib/analytics';
import { describeError } from '@/lib/errors';

const INVALIDATE = [['followUps'], ['today'], ['flow'], ['thread']];

export default function FollowUpsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ds = useDataSource();
  const ctx = useFormatCtx();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [snoozing, setSnoozing] = useState<FollowUp | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useQuery({ queryKey: qk.followUps, queryFn: () => ds.email.listFollowUps() });
  const list = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt)),
    [query.data],
  );
  const oldest = list[0] ? daysWaiting(list[0].sentAt, ctx.now ?? new Date()) : 0;

  const invalidate = async () => {
    await Promise.all(INVALIDATE.map((key) => queryClient.invalidateQueries({ queryKey: key })));
  };
  const onError = (e: unknown) =>
    toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' });

  const snooze = useMutation({
    mutationFn: (input: { f: FollowUp; until: string }) =>
      ds.email.snoozeFollowUp(input.f.id, input.until),
    onMutate: ({ f }) => setBusyId(f.id),
    onSettled: () => setBusyId(null),
    onSuccess: async (_, { until }) => {
      await invalidate();
      toast.show({
        message: t('email.followUp.snoozedUntil', { date: formatRelativeLabel(until, ctx) }),
        icon: 'schedule',
      });
    },
    onError,
  });
  const close = useMutation({
    mutationFn: (f: FollowUp) => ds.email.closeFollowUp(f.id),
    onMutate: (f) => setBusyId(f.id),
    onSettled: () => setBusyId(null),
    onSuccess: async (_, f) => {
      track('followup_completed', { daysWaited: daysWaiting(f.sentAt, ctx.now ?? new Date()) });
      await invalidate();
      toast.show({ message: t('email.followUp.closed'), icon: 'check' });
    },
    onError,
  });

  const onPick = (option: PostponeOption) => {
    if (!snoozing) return;
    const target = snoozing;
    setSnoozing(null);
    snooze.mutate({ f: target, until: option.until });
  };

  return (
    <Screen
      scroll
      topGap={6}
      testID="followups-screen"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={
        <ScreenHeader
          variant="sub"
          title={t('email.followUp.title')}
          subtitle={
            query.data
              ? list.length > 0
                ? t('email.followUp.subtitle', { count: list.length, days: oldest })
                : t('email.followUp.empty')
              : undefined
          }
          onBack={() => router.back()}
          backLabel={t('common.back')}
        />
      }
    >
      <OfflineNotice onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      {query.isLoading ? (
        <ListSkeleton count={3} testID="followups-loading" />
      ) : query.isError ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="followUp"
          title={t('empty.followUps')}
          body={t('email.followUp.allAnswered')}
          testID="followups-empty"
        />
      ) : (
        <View style={styles.stack}>
          {list.map((f) => (
            <FollowUpCard
              key={f.id}
              followUp={f}
              busy={busyId === f.id}
              onDraft={(x) =>
                router.push({
                  pathname: '/email/[id]/reply',
                  params: { id: x.threadId, followUpId: x.id },
                })
              }
              onSnooze={setSnoozing}
              onClose={(x) => close.mutate(x)}
              onOpen={(x) => router.push({ pathname: '/email/[id]', params: { id: x.threadId } })}
            />
          ))}
          <View style={styles.hint}>
            <Icon name="learning" size={18} color={theme.colors.primary} />
            <Text variant="small" tone="secondary" style={styles.hintText}>
              {t('email.followUp.muteHint')}
            </Text>
          </View>
        </View>
      )}
      <PostponeSheet
        visible={Boolean(snoozing)}
        title={t('reminder.title')}
        subtitle={snoozing?.topic}
        onClose={() => setSnoozing(null)}
        onPick={onPick}
        testIDPrefix="followup-snooze"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  hintText: { flex: 1 },
});
