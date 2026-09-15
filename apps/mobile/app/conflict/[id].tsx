import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { CalendarConflict, CalendarEvent, ScheduleSuggestion } from '@da/domain';
import { formatDayKicker, formatDuration, formatTime } from '@da/i18n';
import {
  BottomSheet,
  Button,
  CalendarRowCard,
  Icon,
  ListGroup,
  Screen,
  ScreenHeader,
  SheetRow,
  Text,
  useBottomSheet,
  useTheme,
  useToast,
} from '@da/ui';
import { approvalIdempotencyKey, useApprovalFlow } from '@/features/approvals/useApprovalFlow';
import { ListSkeleton, OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { minutesBetween } from '@/features/plan/dates';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';

function targetEvent(conflict: CalendarConflict, suggestion: ScheduleSuggestion): CalendarEvent {
  if (suggestion.targetEventId === conflict.eventB.id) return conflict.eventB;
  if (suggestion.targetEventId === conflict.eventA.id) return conflict.eventA;
  return conflict.eventB;
}

export default function ConflictScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ds = useDataSource();
  const ctx = useFormatCtx();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sheet = useBottomSheet(false);
  const { requestApproval, isCreating } = useApprovalFlow();
  const autoOpened = useRef(false);

  const query = useQuery({
    queryKey: qk.conflict(id ?? ''),
    queryFn: () => ds.plan.getConflict(id ?? ''),
    enabled: Boolean(id),
  });
  const conflict = query.data;

  // The resolution sheet is the default state of this screen: open it once the conflict arrives.
  useEffect(() => {
    if (!conflict || conflict.status !== 'open' || conflict.suggestions.length === 0) return;
    if (autoOpened.current) return;
    autoOpened.current = true;
    sheet.open();
  }, [conflict, sheet]);

  const ignore = useMutation({
    mutationFn: () => ds.plan.ignoreConflict(id ?? ''),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['plan'] }),
        queryClient.invalidateQueries({ queryKey: ['conflicts'] }),
        queryClient.invalidateQueries({ queryKey: ['today'] }),
        queryClient.invalidateQueries({ queryKey: ['flow'] }),
      ]);
      toast.show({ message: t('plan.conflict.ignored'), icon: 'check' });
      router.back();
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
  });

  const choose = async (suggestion: ScheduleSuggestion) => {
    if (!conflict) return;
    sheet.close();
    const event = targetEvent(conflict, suggestion);
    await requestApproval({
      type: 'calendar_update',
      what: t('approvals.types.calendar_update'),
      why: suggestion.reason || suggestion.title,
      changeSummary: [
        `${event.title} · ${formatTime(event.startAt, ctx)} → ${formatTime(suggestion.proposedStartAt, ctx)}`,
        suggestion.detail,
      ],
      payload: {
        accountId: event.accountId,
        eventId: event.id,
        externalEventId: event.externalEventId,
        expectedProviderUpdatedAt: event.providerUpdatedAt ?? null,
        changes: { startAt: suggestion.proposedStartAt, endAt: suggestion.proposedEndAt },
      },
      requestedBy: 'conflict',
      idempotencyKey: approvalIdempotencyKey([
        'conflict',
        conflict.id,
        suggestion.id,
        suggestion.proposedStartAt,
      ]),
    });
  };

  const row = (event: CalendarEvent, conflictStripe: boolean, testID: string) => {
    const [hour = '00', minute = '00'] = formatTime(event.startAt, ctx).split(':');
    const meta = [
      formatDuration(minutesBetween(event.startAt, event.endAt), ctx.locale),
      event.location ?? (event.meetingUrl ? t('plan.online') : null),
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <CalendarRowCard
        hour={hour}
        minute={minute}
        title={event.title}
        meta={meta}
        conflict={conflictStripe}
        testID={testID}
      />
    );
  };

  return (
    <Screen
      scroll
      topGap={6}
      testID="conflict-screen"
      header={
        <ScreenHeader
          variant="sub"
          kicker={
            conflict ? formatDayKicker(conflict.eventA.startAt, ctx) : t('plan.conflict.title')
          }
          onBack={() => router.back()}
          backLabel={t('common.back')}
        />
      }
    >
      <OfflineNotice onRetry={() => void query.refetch()} retrying={query.isRefetching} />
      {query.isLoading ? (
        <ListSkeleton count={2} testID="conflict-loading" />
      ) : query.isError || !conflict ? (
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <View style={styles.stack}>
          <View style={styles.kicker}>
            <Icon name="conflict" size={16} color={theme.colors.criticalText} />
            <Text variant="aiLabel" tone="critical">
              {t('plan.conflict.kicker')}
            </Text>
          </View>
          <Text variant="h2">{t('plan.conflict.headline')}</Text>
          {row(conflict.eventA, false, 'conflict-event-a')}
          <View style={styles.offset}>{row(conflict.eventB, true, 'conflict-event-b')}</View>
          <Text variant="secondary" tone="secondary">
            {t('plan.conflict.body', { a: conflict.eventA.title, b: conflict.eventB.title })}{' '}
            {t('plan.conflict.overlap', { minutes: conflict.overlapMinutes })}.
          </Text>
          <Text variant="caption" tone="tertiary">
            {t('plan.conflict.noSilentMove')}
          </Text>
          {conflict.status === 'open' ? (
            <View style={styles.actions}>
              <Button
                label={t('plan.conflict.seeOptions')}
                size="md"
                fullWidth
                onPress={sheet.open}
                disabled={conflict.suggestions.length === 0}
                testID="conflict-see-options"
              />
              <Button
                label={t('plan.conflict.ignore')}
                variant="ghostSecondary"
                size="sm"
                fullWidth
                loading={ignore.isPending}
                onPress={() => ignore.mutate()}
                testID="conflict-ignore"
              />
            </View>
          ) : (
            <Text variant="small" tone="secondary" testID="conflict-status">
              {conflict.status === 'ignored'
                ? t('plan.conflict.ignored')
                : t('plan.conflict.resolved')}
            </Text>
          )}
        </View>
      )}
      <BottomSheet
        visible={sheet.visible}
        onClose={sheet.close}
        title={t('plan.conflict.howToResolve')}
        subtitle={t('plan.conflict.noSilentMove')}
        closeLabel={t('common.close')}
        testID="conflict-options"
      >
        <ListGroup padding={{ vertical: 0, horizontal: 0 }} style={styles.sheetGroup}>
          {(conflict?.suggestions ?? []).map((s, i) => (
            <SheetRow
              key={s.id}
              icon={i === 0 ? 'ai' : s.kind === 'move_event' ? 'move' : 'schedule'}
              iconTone={i === 0 ? 'primary' : 'secondary'}
              label={s.title}
              value={formatTime(s.proposedStartAt, ctx)}
              valueTone={i === 0 ? 'primary' : 'tertiary'}
              disabled={isCreating}
              onPress={() => void choose(s)}
              testID={`conflict-option-${i}`}
            />
          ))}
        </ListGroup>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  offset: { marginLeft: 24 },
  actions: { gap: 6, marginTop: 6 },
  sheetGroup: { shadowOpacity: 0, elevation: 0 },
});
