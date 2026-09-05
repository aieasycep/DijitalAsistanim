/**
 * Single-column timeline of one PlanDay: events (CalendarRowCard, conflict stripe, back-to-back hint),
 * scheduled/due tasks, commitments and explicit free blocks, all sorted by start time.
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent, Commitment, FreeBlock, PlanDay, TaskItem } from '@da/domain';
import { formatDuration, formatTime } from '@da/i18n';
import {
  CalendarRowCard,
  EmptyState,
  Icon,
  IconButton,
  ListGroup,
  ListRow,
  Text,
  useTheme,
  useToast,
} from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { useEntitlement } from '@/hooks/useEntitlement';
import { describeError } from '@/lib/errors';
import { useFormatCtx } from '../flow/useFormatCtx';
import { minutesBetween } from './dates';

type Row =
  | { kind: 'event'; at: string; event: CalendarEvent }
  | { kind: 'task'; at: string; task: TaskItem }
  | { kind: 'commitment'; at: string; commitment: Commitment }
  | { kind: 'free'; at: string; block: FreeBlock };

export interface PlanTimelineProps {
  day: PlanDay;
  /** Week mode renders compact rows and hides free blocks. */
  compact?: boolean;
}

export function PlanTimeline({ day, compact = false }: PlanTimelineProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ctx = useFormatCtx();
  const ds = useDataSource();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { gate } = useEntitlement();
  const now = (ctx.now ?? new Date()).getTime();

  const completeTask = useMutation({
    mutationFn: (input: { id: string; completed: boolean }) =>
      ds.plan.completeTask(input.id, input.completed),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['plan'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['today'] }),
      ]);
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
  });

  const conflictEventIds = useMemo(
    () => new Set(day.conflicts.flatMap((c) => [c.eventA.id, c.eventB.id])),
    [day.conflicts],
  );
  const backToBackIds = useMemo(
    () => new Set(day.backToBackWarnings.flatMap((w) => [w.fromEventId, w.toEventId])),
    [day.backToBackWarnings],
  );

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [
      ...day.events.map((event): Row => ({ kind: 'event', at: event.startAt, event })),
      ...day.tasks.map((task): Row => ({
        kind: 'task',
        at: task.scheduledStartAt ?? task.dueAt ?? `${day.date}T23:59:00Z`,
        task,
      })),
      ...day.commitments.map((commitment): Row => ({
        kind: 'commitment',
        at: commitment.dueAt ?? `${day.date}T23:59:00Z`,
        commitment,
      })),
      ...(compact
        ? []
        : day.freeBlocks
            .filter((b) => b.minutes >= 45)
            .map((block): Row => ({ kind: 'free', at: block.startAt, block }))),
    ];
    return list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }, [day, compact]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="plan"
        title={t('plan.emptyDay')}
        compact
        testID={`plan-empty-${day.date}`}
      />
    );
  }

  const time = (iso: string) => {
    const [hour = '00', minute = '00'] = formatTime(iso, ctx).split(':');
    return { hour, minute };
  };

  return (
    <View style={styles.list}>
      {rows.map((row) => {
        switch (row.kind) {
          case 'event': {
            const { event } = row;
            const { hour, minute } = time(event.startAt);
            const metaParts = [
              event.allDay
                ? t('plan.allDay')
                : formatDuration(minutesBetween(event.startAt, event.endAt), ctx.locale),
              event.location ?? (event.meetingUrl ? t('plan.online') : null),
              backToBackIds.has(event.id) ? t('plan.backToBack') : null,
            ].filter((p): p is string => Boolean(p));
            const hasPeople = event.attendees.some((a) => !a.isOrganizer || a.contactId);
            const upcoming = Date.parse(event.endAt) > now;
            const openPrep = () => {
              if (!gate('meeting_prep', 'meeting_prep')) return;
              router.push({ pathname: '/meeting/[id]/prep', params: { id: event.id } });
            };
            return (
              <CalendarRowCard
                key={`e-${event.id}`}
                hour={hour}
                minute={minute}
                title={event.title}
                meta={metaParts.join(' · ')}
                conflict={conflictEventIds.has(event.id)}
                done={!upcoming}
                actionLabel={hasPeople && upcoming ? t('common.prepare') : undefined}
                onAction={hasPeople && upcoming ? openPrep : undefined}
                onPress={
                  upcoming
                    ? openPrep
                    : () =>
                        router.push({ pathname: '/meeting/[id]/post', params: { id: event.id } })
                }
                testID={`plan-event-${event.id}`}
              />
            );
          }
          case 'task': {
            const { task } = row;
            const done = task.status === 'completed';
            const meta = task.scheduledStartAt
              ? t('plan.planned', {
                  time: `${formatTime(task.scheduledStartAt, ctx)}${task.scheduledEndAt ? `–${formatTime(task.scheduledEndAt, ctx)}` : ''}`,
                })
              : task.dueAt
                ? t('plan.dueAt', { time: formatTime(task.dueAt, ctx) })
                : null;
            return (
              <ListGroup key={`t-${task.id}`} testID={`plan-task-${task.id}`}>
                <ListRow
                  icon="taskAdd"
                  title={task.title}
                  meta={[t('plan.task'), meta].filter(Boolean).join(' · ')}
                  done={done}
                  trailing={
                    <IconButton
                      icon="complete"
                      variant="plain"
                      filled={done}
                      color={done ? theme.colors.success : theme.colors.inkDisabled}
                      accessibilityLabel={t('a11y.complete')}
                      accessibilityState={{ checked: done }}
                      onPress={() => completeTask.mutate({ id: task.id, completed: !done })}
                      disabled={completeTask.isPending}
                      testID={`plan-task-complete-${task.id}`}
                    />
                  }
                />
              </ListGroup>
            );
          }
          case 'commitment': {
            const { commitment } = row;
            return (
              <ListGroup key={`c-${commitment.id}`}>
                <ListRow
                  icon="commitment"
                  title={commitment.text}
                  meta={[t('plan.commitment'), commitment.counterpartName, commitment.dueText]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={() => router.push('/commitments')}
                  testID={`plan-commitment-${commitment.id}`}
                />
              </ListGroup>
            );
          }
          case 'free': {
            const { block } = row;
            return (
              <View
                key={`f-${block.startAt}`}
                style={[
                  styles.free,
                  { borderColor: theme.colors.divider, borderRadius: theme.radius.md },
                ]}
                accessibilityRole="text"
                testID={`plan-free-${block.startAt}`}
              >
                <Icon name="timer" size={16} color={theme.colors.inkDisabled} />
                <Text variant="small" tone="tertiary">
                  {formatTime(block.startAt, ctx)}–{formatTime(block.endAt, ctx)} ·{' '}
                  {t('plan.freeBlock', { duration: formatDuration(block.minutes, ctx.locale) })}
                </Text>
              </View>
            );
          }
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  free: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
