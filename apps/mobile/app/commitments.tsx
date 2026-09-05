import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { Commitment } from '@da/domain';
import { formatRelativeLabel } from '@da/i18n';
import { EmptyState, Screen, ScreenHeader, SectionKicker, useToast } from '@da/ui';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { CommitmentCard, commitmentStatus } from '@/features/plan/CommitmentCard';
import { PostponeSheet, type PostponeOption } from '@/features/plan/PostponeSheet';
import { useOpenSource } from '@/features/source/openSource';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';

const INVALIDATE = [['commitments'], ['plan'], ['today'], ['flow'], ['person']];

export default function CommitmentsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const ds = useDataSource();
  const ctx = useFormatCtx();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { openSource } = useOpenSource();
  const [postponing, setPostponing] = useState<Commitment | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useQuery({ queryKey: qk.commitments, queryFn: () => ds.plan.listCommitments() });

  const invalidate = async () => {
    await Promise.all(INVALIDATE.map((key) => queryClient.invalidateQueries({ queryKey: key })));
  };
  const onError = (e: unknown) =>
    toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' });

  const complete = useMutation({
    mutationFn: (c: Commitment) => ds.plan.completeCommitment(c.id),
    onMutate: (c) => setBusyId(c.id),
    onSettled: () => setBusyId(null),
    onSuccess: async () => {
      await invalidate();
      toast.show({ message: t('commitments.completedToast'), icon: 'check' });
    },
    onError,
  });
  const postpone = useMutation({
    mutationFn: (input: { c: Commitment; until: string }) =>
      ds.plan.postponeCommitment(input.c.id, input.until),
    onMutate: ({ c }) => setBusyId(c.id),
    onSettled: () => setBusyId(null),
    onSuccess: async (_, { until }) => {
      await invalidate();
      toast.show({
        message: t('commitments.postponed', { date: formatRelativeLabel(until, ctx) }),
        icon: 'schedule',
      });
    },
    onError,
  });
  const confirm = useMutation({
    mutationFn: (input: { c: Commitment; accept: boolean }) =>
      ds.plan.confirmCommitment(input.c.id, input.accept),
    onMutate: ({ c }) => setBusyId(c.id),
    onSettled: () => setBusyId(null),
    onSuccess: async (_, { accept }) => {
      await invalidate();
      toast.show({
        message: accept ? t('meeting.post.saved') : t('today.dismissedToast'),
        icon: accept ? 'check' : 'learning',
      });
    },
    onError,
  });

  const { mine, theirs, openCount, lateCount } = useMemo(() => {
    const now = ctx.now ?? new Date();
    const live = (query.data ?? []).filter(
      (c) => c.status !== 'cancelled' && c.status !== 'completed',
    );
    const sortByDue = (a: Commitment, b: Commitment) =>
      (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9');
    return {
      mine: live.filter((c) => c.direction === 'user_owes').sort(sortByDue),
      theirs: live.filter((c) => c.direction === 'other_owes').sort(sortByDue),
      openCount: live.length,
      lateCount: live.filter((c) => commitmentStatus(c, now).key === 'overdue').length,
    };
  }, [query.data, ctx.now]);

  const onPick = (option: PostponeOption) => {
    if (!postponing) return;
    const target = postponing;
    setPostponing(null);
    postpone.mutate({ c: target, until: option.until });
  };

  const section = (label: string, list: Commitment[], testID: string) =>
    list.length === 0 ? null : (
      <View style={styles.section} testID={testID}>
        <SectionKicker label={label} meta={t('today.prioritiesCount', { count: list.length })} />
        {list.map((c) => (
          <CommitmentCard
            key={c.id}
            commitment={c}
            busy={busyId === c.id}
            onDone={(x) => complete.mutate(x)}
            onPostpone={setPostponing}
            onSource={(x) => void openSource(x.source)}
            onConfirm={(x, accept) => confirm.mutate({ c: x, accept })}
          />
        ))}
      </View>
    );

  return (
    <Screen
      scroll
      topGap={6}
      testID="commitments-screen"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      header={
        <ScreenHeader
          variant="sub"
          title={t('commitments.title')}
          subtitle={
            query.data ? t('commitments.subtitle', { open: openCount, late: lateCount }) : undefined
          }
          onBack={() => router.back()}
          backLabel={t('common.back')}
        />
      }
    >
      <OfflineNotice onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      {query.isLoading ? (
        <ListSkeleton count={4} testID="commitments-loading" />
      ) : query.isError ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : openCount === 0 ? (
        <EmptyState icon="commitment" title={t('commitments.empty')} testID="commitments-empty" />
      ) : (
        <View style={styles.stack}>
          {section(t('commitments.userOwes'), mine, 'commitments-mine')}
          {section(t('commitments.otherOwes'), theirs, 'commitments-theirs')}
        </View>
      )}
      <PostponeSheet
        visible={Boolean(postponing)}
        title={t('commitments.postponeTitle')}
        subtitle={postponing?.text}
        onClose={() => setPostponing(null)}
        onPick={onPick}
        testIDPrefix="commitment-postpone"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 20 },
  section: { gap: 12 },
});
