/**
 * Contextual actions on an analysed capture: calendar / task through approvals, remind via the smart
 * reminder sheet, links handed off to the browser. Nothing is written without the user's decision.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Capture, SourceRef, SuggestedAction } from '@da/domain';
import { useToast } from '@da/ui';
import { openExternal } from '@/lib/openExternal';
import { approvalIdempotencyKey, useApprovalFlow } from '../approvals/useApprovalFlow';
import { useResolveCalendarAccount } from '../email/useCalendarAccount';
import { useReminderSheet } from '../reminders/useReminderSheet';

const HOUR_MS = 60 * 60_000;

export const SUPPORTED_CAPTURE_ACTIONS: SuggestedAction['kind'][] = [
  'add_to_calendar',
  'create_task',
  'remind',
  'open_link',
  'pay',
  'track',
  'check_in',
];

function payloadString(payload: Record<string, unknown> | undefined, key: string): string | null {
  const v = payload?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function captureSource(capture: Capture, label: string): SourceRef {
  return {
    type: 'capture',
    id: capture.id,
    label,
    timestamp: capture.createdAt,
    url: capture.url ?? undefined,
    excerpt: capture.analysis?.summary?.slice(0, 200),
  };
}

export function useCaptureActions(capture: Capture | null) {
  const { t } = useTranslation();
  const toast = useToast();
  const { requestApproval, isCreating } = useApprovalFlow();
  const { openReminderSheet } = useReminderSheet();
  const resolveCalendarAccount = useResolveCalendarAccount();

  const run = useCallback(
    async (action: SuggestedAction): Promise<boolean> => {
      if (!capture?.analysis) return false;
      const analysis = capture.analysis;
      const source = captureSource(capture, t('capture.sourceLabel'));
      switch (action.kind) {
        case 'add_to_calendar': {
          const calendarAccount = await resolveCalendarAccount();
          if (!calendarAccount) {
            toast.show({
              message: t('email.calendarNeeded'),
              icon: 'conflict',
              iconTone: 'critical',
            });
            return false;
          }
          const startAt =
            payloadString(action.payload, 'startAt') ??
            analysis.event?.startAt ??
            analysis.deadline?.dueAt ??
            analysis.dates.find((d) => d.iso)?.iso ??
            null;
          if (!startAt) {
            toast.show({ message: t('capture.noDate'), icon: 'conflict', iconTone: 'critical' });
            return false;
          }
          const endAt =
            payloadString(action.payload, 'endAt') ??
            analysis.event?.endAt ??
            new Date(Date.parse(startAt) + HOUR_MS).toISOString();
          const title =
            payloadString(action.payload, 'title') ?? analysis.event?.title ?? analysis.title;
          const approval = await requestApproval({
            type: 'calendar_create',
            what: t('approvals.types.calendar_create'),
            why: analysis.summary,
            changeSummary: [
              title,
              analysis.event?.dateText ?? analysis.event?.location ?? '',
            ].filter(Boolean),
            payload: {
              accountId: calendarAccount.id,
              title,
              startAt,
              endAt,
              location: analysis.event?.location ?? null,
              description: analysis.summary,
            },
            source,
            requestedBy: 'capture',
            idempotencyKey: approvalIdempotencyKey(['capture', 'calendar', capture.id, startAt]),
          });
          return approval !== null;
        }
        case 'create_task': {
          const title =
            payloadString(action.payload, 'title') ??
            analysis.task?.title ??
            analysis.deadline?.title ??
            analysis.title;
          const dueAt =
            payloadString(action.payload, 'dueAt') ??
            analysis.task?.dueAt ??
            analysis.deadline?.dueAt ??
            null;
          const approval = await requestApproval({
            type: 'task_create',
            what: t('approvals.types.task_create'),
            why: analysis.summary,
            changeSummary: [title, analysis.deadline?.dueText ?? ''].filter(Boolean),
            payload: { title, notes: analysis.summary, dueAt, accountId: null },
            source,
            requestedBy: 'capture',
            idempotencyKey: approvalIdempotencyKey(['capture', 'task', capture.id]),
          });
          return approval !== null;
        }
        case 'remind': {
          openReminderSheet({
            targetType: 'insight',
            targetId: capture.id,
            title: analysis.title,
            dueAt:
              analysis.deadline?.dueAt ??
              analysis.payment?.dueAt ??
              analysis.event?.startAt ??
              null,
            sourceLabel: t('capture.sourceLabel'),
          });
          return true;
        }
        case 'open_link':
        case 'pay':
        case 'track':
        case 'check_in': {
          const url = payloadString(action.payload, 'url') ?? capture.url ?? null;
          if (!url) {
            toast.show({ message: t('errors.invalidUrl'), icon: 'conflict', iconTone: 'critical' });
            return false;
          }
          const ok = await openExternal(url);
          if (!ok)
            toast.show({
              message: t('errors.handoffFailed'),
              icon: 'conflict',
              iconTone: 'critical',
            });
          return ok;
        }
        default:
          return false;
      }
    },
    [capture, resolveCalendarAccount, openReminderSheet, requestApproval, t, toast],
  );

  return { run, busy: isCreating };
}
