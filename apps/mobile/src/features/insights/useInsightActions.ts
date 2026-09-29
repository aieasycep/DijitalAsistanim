/**
 * Maps an InsightAction (the buttons on a priority card) to what actually happens: navigation,
 * an approval request, a reminder sheet, an internal state change or a hand-off to another app.
 * Every external side effect (mail, calendar, task) goes through an approval — never directly.
 *
 * Status writes (complete / dismiss / snooze / feedback) run through `runOrQueue`: offline they are
 * persisted in the write queue, the card leaves the feed immediately and the server catches up on reconnect.
 */
import { useCallback } from 'react';
import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { AiFeedbackKind, FlowResponse, Insight, InsightAction, TodayFeed } from '@da/domain';
import { haptic, useThemeContext, useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { useEntitlement } from '@/hooks/useEntitlement';
import { track } from '@/lib/analytics';
import { describeError } from '@/lib/errors';
import { queuedToast, runOrQueue } from '@/lib/offlineMutation';
import { openExternal } from '@/lib/openExternal';
import { approvalIdempotencyKey, useApprovalFlow } from '../approvals/useApprovalFlow';
import { useFormatCtx } from '../flow/useFormatCtx';
import { isoAtLocal } from '../plan/dates';
import { useReminderSheet } from '../reminders/useReminderSheet';
import { useOpenSource } from '../source/openSource';

export type FeedbackOutcome = 'sent' | 'queued' | 'failed';

function payloadString(payload: Record<string, unknown> | undefined, key: string): string | null {
  const v = payload?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Offline: a resolved / snoozed insight leaves Today and Flow right away; the next fetch is authoritative. */
function removeInsightFromFeeds(queryClient: QueryClient, id: string): void {
  const without = (items: Insight[]) => items.filter((i) => i.id !== id);
  queryClient.setQueriesData<TodayFeed>({ queryKey: ['today'] }, (prev) =>
    prev
      ? {
          ...prev,
          priorities: without(prev.priorities),
          meetings: without(prev.meetings),
          deadlines: without(prev.deadlines),
        }
      : prev,
  );
  queryClient.setQueriesData<InfiniteData<FlowResponse>>({ queryKey: ['flow'] }, (prev) =>
    prev && Array.isArray(prev.pages)
      ? { ...prev, pages: prev.pages.map((page) => ({ ...page, items: without(page.items) })) }
      : prev,
  );
}

export function useInsightActions() {
  const ds = useDataSource();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const ctx = useFormatCtx();
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

  const showError = useCallback(
    (e: unknown) =>
      toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' }),
    [toast, t],
  );

  const resolve = useMutation({
    mutationFn: (input: {
      id: string;
      status: 'completed' | 'dismissed' | 'active';
      feedback?: AiFeedbackKind;
    }) =>
      runOrQueue(
        ds,
        {
          kind: 'insight_resolve',
          insightId: input.id,
          status: input.status,
          feedback: input.feedback,
        },
        () => ds.feed.resolveInsight(input.id, input.status, input.feedback),
      ),
    onSuccess: async (outcome, variables) => {
      if (outcome.queued) {
        if (variables.status !== 'active') removeInsightFromFeeds(queryClient, variables.id);
        toast.show(queuedToast(t));
        return;
      }
      await invalidateFeeds();
      if (variables.status === 'completed')
        toast.show({ message: t('today.completedToast'), icon: 'check' });
      if (variables.status === 'dismissed')
        toast.show({
          message: t('today.dismissedToast'),
          icon: 'sparkle',
          iconTone: 'primary',
        });
    },
    onError: showError,
  });

  const snooze = useMutation({
    mutationFn: (input: { id: string; until: string }) =>
      runOrQueue(ds, { kind: 'insight_snooze', insightId: input.id, until: input.until }, () =>
        ds.feed.snoozeInsight(input.id, input.until),
      ),
    onSuccess: async (outcome, variables) => {
      if (outcome.queued) removeInsightFromFeeds(queryClient, variables.id);
      else await invalidateFeeds();
      toast.show(
        outcome.queued ? queuedToast(t) : { message: t('today.carriedOver'), icon: 'schedule' },
      );
    },
    onError: showError,
  });

  const feedback = useMutation({
    mutationFn: (input: { insight: Insight; kind: AiFeedbackKind }) =>
      runOrQueue(
        ds,
        {
          kind: 'feedback',
          feedbackKind: input.kind,
          entityType: 'insight',
          entityId: input.insight.id,
          contactId: input.insight.source.personId ?? null,
        },
        () =>
          ds.feed.sendFeedback({
            kind: input.kind,
            entityType: 'insight',
            entityId: input.insight.id,
            contactId: input.insight.source.personId ?? null,
          }),
      ),
    onSuccess: async (outcome) => {
      if (outcome.queued) toast.show(queuedToast(t));
      else await invalidateFeeds();
    },
    onError: showError,
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

  /** Tomorrow 09:00 in the user's timezone (not the device clock); the toast follows the server's answer. */
  const snoozeUntilTomorrow = useCallback(
    (insight: Insight) => {
      snooze.mutate({ id: insight.id, until: isoAtLocal(ctx, 1, 9) });
    },
    [snooze, ctx],
  );

  /** Ranking feedback ("Bunun gibi daha fazla" / "Bunu takip etme"); callers add their own success copy. */
  const sendFeedback = useCallback(
    async (insight: Insight, kind: AiFeedbackKind): Promise<FeedbackOutcome> => {
      try {
        const outcome = await feedback.mutateAsync({ insight, kind });
        return outcome.queued ? 'queued' : 'sent';
      } catch {
        return 'failed';
      }
    },
    [feedback],
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
            toast.show({ message: t('errors.notFound'), icon: 'warning', iconTone: 'critical' });
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
            toast.show({
              message: t('errors.handoffFailed'),
              icon: 'warning',
              iconTone: 'critical',
            });
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

  return {
    runAction,
    complete,
    dismiss,
    snoozeUntilTomorrow,
    sendFeedback,
    isResolving: resolve.isPending,
  };
}
