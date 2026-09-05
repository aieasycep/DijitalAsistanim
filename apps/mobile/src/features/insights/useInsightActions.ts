/**
 * Maps an InsightAction (the buttons on a priority card) to what actually happens: navigation,
 * an approval request, a reminder sheet, an internal state change or a hand-off to another app.
 * Every external side effect (mail, calendar, task) goes through an approval — never directly.
 */
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { AiFeedbackKind, Insight, InsightAction } from '@da/domain';
import { haptic, useThemeContext, useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { useEntitlement } from '@/hooks/useEntitlement';
import { track } from '@/lib/analytics';
import { describeError } from '@/lib/errors';
import { openExternal } from '@/lib/openExternal';
import { approvalIdempotencyKey, useApprovalFlow } from '../approvals/useApprovalFlow';
import { useReminderSheet } from '../reminders/useReminderSheet';
import { useOpenSource } from '../source/openSource';

function payloadString(payload: Record<string, unknown> | undefined, key: string): string | null {
  const v = payload?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function useInsightActions() {
  const ds = useDataSource();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const { hapticsEnabled } = useThemeContext();
  const { gate } = useEntitlement();
  const { requestApproval } = useApprovalFlow();
  const { openReminderSheet } = useReminderSheet();
  const { openSource } = useOpenSource();

  const invalidateFeeds = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['today'] }),
      queryClient.invalidateQueries({ queryKey: ['flow'] }),
      queryClient.invalidateQueries({ queryKey: ['waiting'] }),
    ]);
  }, [queryClient]);

  const resolve = useMutation({
    mutationFn: (input: {
      id: string;
      status: 'completed' | 'dismissed' | 'active';
      feedback?: AiFeedbackKind;
    }) => ds.feed.resolveInsight(input.id, input.status, input.feedback),
    onSuccess: async (_insight, variables) => {
      await invalidateFeeds();
      if (variables.status === 'completed')
        toast.show({ message: t('today.completedToast'), icon: 'check' });
      if (variables.status === 'dismissed')
        toast.show({
          message: t('today.dismissedToast'),
          icon: 'auto_awesome',
          iconTone: 'primary',
        });
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'error', iconTone: 'critical' }),
  });

  const snooze = useMutation({
    mutationFn: (input: { id: string; until: string }) =>
      ds.feed.snoozeInsight(input.id, input.until),
    onSuccess: invalidateFeeds,
  });

  const complete = useCallback(
    (insight: Insight) => {
      void haptic('success', hapticsEnabled);
      resolve.mutate({ id: insight.id, status: 'completed' });
    },
    [resolve, hapticsEnabled],
  );

  const dismiss = useCallback(
    (insight: Insight, feedback: AiFeedbackKind = 'not_important') => {
      void haptic('light', hapticsEnabled);
      resolve.mutate({ id: insight.id, status: 'dismissed', feedback });
    },
    [resolve, hapticsEnabled],
  );

  const snoozeUntilTomorrow = useCallback(
    (insight: Insight) => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      snooze.mutate({ id: insight.id, until: d.toISOString() });
      toast.show({ message: t('today.carriedOver'), icon: 'schedule' });
    },
    [snooze, toast, t],
  );

  /** Primary dispatcher for card buttons. Returns true when something happened. */
  const runAction = useCallback(
    async (insight: Insight, action: InsightAction): Promise<boolean> => {
      track('insight_opened', { kind: insight.kind, badge: insight.badge });
      const payload = action.payload;
      switch (action.kind) {
        case 'reply': {
          const threadId =
            payloadString(payload, 'threadId') ??
            (insight.entityType === 'email_thread' ? insight.entityId : null);
          if (!threadId) return false;
          router.push({ pathname: '/email/[id]/reply', params: { id: threadId } });
          return true;
        }
        case 'open_original':
        case 'view_source':
          return openSource(insight.source);
        case 'prepare': {
          if (!gate('meeting_prep', 'meeting_prep')) return false;
          const eventId = payloadString(payload, 'eventId') ?? insight.entityId;
          router.push({ pathname: '/meeting/[id]/prep', params: { id: eventId } });
          return true;
        }
        case 'remind': {
          openReminderSheet({
            targetType:
              insight.entityType === 'suggestion' || insight.entityType === 'conflict'
                ? 'insight'
                : insight.entityType,
            targetId: insight.entityId,
            title: insight.title,
            dueAt: insight.dueAt ?? null,
            sourceLabel: insight.source.label,
          });
          return true;
        }
        case 'create_task':
        case 'plan': {
          const startAt = payloadString(payload, 'scheduledStartAt');
          const endAt = payloadString(payload, 'scheduledEndAt');
          const approval = await requestApproval({
            type: 'task_create',
            what: t('common.createTask'),
            why: insight.reason ?? insight.title,
            changeSummary: [],
            payload: {
              title: payloadString(payload, 'title') ?? insight.title,
              notes: insight.subtitle ?? null,
              dueAt: insight.dueAt ?? null,
              scheduledStartAt: startAt,
              scheduledEndAt: endAt,
              accountId: null,
            },
            source: insight.source,
            requestedBy: action.kind === 'plan' ? 'plan' : 'email_detail',
            insightId: insight.id,
            idempotencyKey: approvalIdempotencyKey(['task', insight.id, startAt]),
          });
          return approval !== null;
        }
        case 'add_to_calendar': {
          const startAt = payloadString(payload, 'startAt') ?? insight.dueAt;
          const calendarAccountId = payloadString(payload, 'accountId');
          if (!startAt || !calendarAccountId) {
            toast.show({ message: t('errors.notFound'), icon: 'error', iconTone: 'critical' });
            return false;
          }
          const endAt =
            payloadString(payload, 'endAt') ??
            new Date(Date.parse(startAt) + 60 * 60_000).toISOString();
          const approval = await requestApproval({
            type: 'calendar_create',
            what: t('common.addToCalendar'),
            why: insight.reason ?? insight.title,
            changeSummary: [],
            payload: {
              accountId: calendarAccountId,
              title: payloadString(payload, 'title') ?? insight.title,
              startAt,
              endAt,
              location: payloadString(payload, 'location'),
              description: insight.subtitle ?? null,
            },
            source: insight.source,
            requestedBy: 'email_detail',
            insightId: insight.id,
            idempotencyKey: approvalIdempotencyKey(['calendar', insight.id, startAt]),
          });
          return approval !== null;
        }
        case 'follow_up': {
          router.push({ pathname: '/followups' });
          return true;
        }
        case 'see_options': {
          const conflictId = payloadString(payload, 'conflictId') ?? insight.entityId;
          router.push({ pathname: '/conflict/[id]', params: { id: conflictId } });
          return true;
        }
        case 'suggest_time': {
          router.push({ pathname: '/(tabs)/plan' });
          return true;
        }
        case 'complete':
          complete(insight);
          return true;
        case 'snooze':
        case 'postpone':
          snoozeUntilTomorrow(insight);
          return true;
        case 'track':
        case 'check_in':
        case 'pay':
        case 'open_link': {
          const url = payloadString(payload, 'url') ?? insight.source.url ?? null;
          if (!url) {
            router.push({ pathname: '/life/[id]', params: { id: insight.entityId } });
            return true;
          }
          const ok = await openExternal(url);
          if (!ok)
            toast.show({ message: t('errors.handoffFailed'), icon: 'error', iconTone: 'critical' });
          return ok;
        }
        case 'wallet':
        case 'alarm':
        case 'ask_in_meeting': {
          router.push({ pathname: '/life/[id]', params: { id: insight.entityId } });
          return true;
        }
      }
    },
    [
      router,
      gate,
      openSource,
      openReminderSheet,
      requestApproval,
      complete,
      snoozeUntilTomorrow,
      toast,
      t,
    ],
  );

  return { runAction, complete, dismiss, snoozeUntilTomorrow, isResolving: resolve.isPending };
}
