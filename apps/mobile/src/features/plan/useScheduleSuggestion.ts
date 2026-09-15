/**
 * Turns a ScheduleSuggestion into the right approval: schedule_task → task_create with a time block,
 * move_event → calendar_update, add_prep_time / add_buffer → calendar_create on the event's account.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent, PlanDay, ScheduleSuggestion, TaskItem } from '@da/domain';
import { formatTime } from '@da/i18n';
import { useToast } from '@da/ui';
import { approvalIdempotencyKey, useApprovalFlow } from '../approvals/useApprovalFlow';
import { useFormatCtx } from '../flow/useFormatCtx';
import { minutesBetween } from './dates';

function findEvent(days: PlanDay[], id: string | null | undefined): CalendarEvent | undefined {
  if (!id) return undefined;
  for (const d of days) {
    const e = d.events.find((x) => x.id === id);
    if (e) return e;
  }
  return undefined;
}

function findTask(days: PlanDay[], id: string | null | undefined): TaskItem | undefined {
  if (!id) return undefined;
  for (const d of days) {
    const t = d.tasks.find((x) => x.id === id);
    if (t) return t;
  }
  return undefined;
}

export function useScheduleSuggestion(days: PlanDay[]) {
  const { t } = useTranslation();
  const ctx = useFormatCtx();
  const toast = useToast();
  const { requestApproval, isCreating } = useApprovalFlow();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const dismiss = useCallback((suggestion: ScheduleSuggestion) => {
    setDismissed((prev) => new Set(prev).add(suggestion.id));
  }, []);

  const accept = useCallback(
    async (suggestion: ScheduleSuggestion): Promise<boolean> => {
      const start = formatTime(suggestion.proposedStartAt, ctx);
      const end = formatTime(suggestion.proposedEndAt, ctx);
      const slot = `${start}–${end}`;
      switch (suggestion.kind) {
        case 'schedule_task': {
          const task = findTask(days, suggestion.targetTaskId);
          const title = task?.title ?? suggestion.detail;
          const approval = await requestApproval({
            type: 'task_create',
            what: t('approvals.types.task_create'),
            why: suggestion.reason || suggestion.title,
            changeSummary: [suggestion.title, `${title} · ${slot}`],
            payload: {
              title,
              notes: task?.notes ?? null,
              dueAt: task?.dueAt ?? null,
              scheduledStartAt: suggestion.proposedStartAt,
              scheduledEndAt: suggestion.proposedEndAt,
              accountId: task?.accountId ?? null,
            },
            source: task?.source ?? null,
            requestedBy: 'plan',
            idempotencyKey: approvalIdempotencyKey([
              'plan',
              'task',
              suggestion.id,
              suggestion.proposedStartAt,
            ]),
          });
          return approval !== null;
        }
        case 'move_event': {
          const event = findEvent(days, suggestion.targetEventId);
          if (!event) {
            toast.show({ message: t('errors.notFound'), icon: 'conflict', iconTone: 'critical' });
            return false;
          }
          const approval = await requestApproval({
            type: 'calendar_update',
            what: t('approvals.types.calendar_update'),
            why: suggestion.reason || suggestion.title,
            changeSummary: [`${event.title} · ${formatTime(event.startAt, ctx)} → ${start}`],
            payload: {
              accountId: event.accountId,
              eventId: event.id,
              externalEventId: event.externalEventId,
              expectedProviderUpdatedAt: event.providerUpdatedAt ?? null,
              changes: { startAt: suggestion.proposedStartAt, endAt: suggestion.proposedEndAt },
            },
            requestedBy: 'plan',
            idempotencyKey: approvalIdempotencyKey([
              'plan',
              'move',
              event.id,
              suggestion.proposedStartAt,
            ]),
          });
          return approval !== null;
        }
        case 'add_prep_time':
        case 'add_buffer': {
          const event = findEvent(days, suggestion.targetEventId);
          if (!event) {
            toast.show({ message: t('errors.notFound'), icon: 'conflict', iconTone: 'critical' });
            return false;
          }
          const minutes = minutesBetween(suggestion.proposedStartAt, suggestion.proposedEndAt);
          const title =
            suggestion.kind === 'add_prep_time'
              ? t('plan.prepBlockTitle', { event: event.title })
              : t('plan.bufferBlockTitle');
          const approval = await requestApproval({
            type: 'calendar_create',
            what: t('approvals.types.calendar_create'),
            why: suggestion.reason || suggestion.title,
            changeSummary: [t('plan.prepTime', { minutes }), slot],
            payload: {
              accountId: event.accountId,
              title,
              startAt: suggestion.proposedStartAt,
              endAt: suggestion.proposedEndAt,
              description: suggestion.detail,
            },
            requestedBy: 'plan',
            idempotencyKey: approvalIdempotencyKey([
              'plan',
              suggestion.kind,
              event.id,
              suggestion.proposedStartAt,
            ]),
          });
          return approval !== null;
        }
      }
    },
    [days, ctx, requestApproval, t, toast],
  );

  return { accept, dismiss, dismissed, isCreating };
}
