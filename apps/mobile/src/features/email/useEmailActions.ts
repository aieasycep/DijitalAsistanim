/**
 * The five actions of the mail detail. Task and calendar go through approvals, remind opens the smart
 * reminder sheet, open hands the message to the provider — nothing is written without a decision.
 */
import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { EmailDetailResponse } from '@da/domain';
import { useToast } from '@da/ui';
import { openExternal, providerMailUrl } from '@/lib/openExternal';
import { approvalIdempotencyKey, useApprovalFlow } from '../approvals/useApprovalFlow';
import { useReminderSheet } from '../reminders/useReminderSheet';
import { useResolveCalendarAccount } from './useCalendarAccount';
import { providerLabel, threadSourceRef, type MailProvider } from './useEmailThread';

const HOUR_MS = 60 * 60_000;

function payloadString(payload: Record<string, unknown> | undefined, key: string): string | null {
  const v = payload?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function useEmailActions(detail: EmailDetailResponse | undefined, provider: MailProvider) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { requestApproval, isCreating } = useApprovalFlow();
  const { openReminderSheet } = useReminderSheet();
  const resolveCalendarAccount = useResolveCalendarAccount();

  const reply = useCallback(() => {
    if (!detail) return;
    router.push({ pathname: '/email/[id]/reply', params: { id: detail.thread.id } });
  }, [detail, router]);

  const createTask = useCallback(async () => {
    if (!detail) return false;
    const { thread, relatedInsight } = detail;
    const suggested = thread.analysis?.suggestedActions.find((a) => a.kind === 'create_task');
    const approval = await requestApproval({
      type: 'task_create',
      what: t('approvals.types.task_create'),
      why: thread.analysis?.reasonImportant ?? thread.analysis?.summary ?? thread.subject,
      changeSummary: [
        payloadString(suggested?.payload, 'title') ?? thread.subject,
        ...(thread.analysis?.deadlineText ? [thread.analysis.deadlineText] : []),
      ],
      payload: {
        title: payloadString(suggested?.payload, 'title') ?? thread.subject,
        notes: thread.analysis?.summary ?? thread.snippet,
        dueAt: thread.analysis?.deadline ?? null,
        accountId: null,
      },
      source: threadSourceRef(detail, provider),
      requestedBy: 'email_detail',
      insightId: relatedInsight?.id ?? null,
      idempotencyKey: approvalIdempotencyKey(['email', 'task', thread.id]),
    });
    return approval !== null;
  }, [detail, provider, requestApproval, t]);

  const addToCalendar = useCallback(async () => {
    if (!detail) return false;
    const calendarAccount = await resolveCalendarAccount();
    if (!calendarAccount) {
      toast.show({ message: t('email.calendarNeeded'), icon: 'conflict', iconTone: 'critical' });
      return false;
    }
    const { thread, relatedInsight } = detail;
    const suggested = thread.analysis?.suggestedActions.find((a) => a.kind === 'add_to_calendar');
    const startAt =
      payloadString(suggested?.payload, 'startAt') ??
      thread.analysis?.deadline ??
      new Date(Math.ceil(Date.now() / HOUR_MS) * HOUR_MS + HOUR_MS).toISOString();
    const endAt =
      payloadString(suggested?.payload, 'endAt') ??
      new Date(Date.parse(startAt) + HOUR_MS).toISOString();
    const approval = await requestApproval({
      type: 'calendar_create',
      what: t('approvals.types.calendar_create'),
      why: thread.analysis?.deadlineText ?? thread.analysis?.summary ?? thread.subject,
      changeSummary: [payloadString(suggested?.payload, 'title') ?? thread.subject],
      payload: {
        accountId: calendarAccount.id,
        title: payloadString(suggested?.payload, 'title') ?? thread.subject,
        startAt,
        endAt,
        location: payloadString(suggested?.payload, 'location'),
        description: thread.analysis?.summary ?? null,
      },
      source: threadSourceRef(detail, provider),
      requestedBy: 'email_detail',
      insightId: relatedInsight?.id ?? null,
      idempotencyKey: approvalIdempotencyKey(['email', 'calendar', thread.id, startAt]),
    });
    return approval !== null;
  }, [detail, resolveCalendarAccount, provider, requestApproval, t, toast]);

  const remind = useCallback(() => {
    if (!detail) return;
    const { thread } = detail;
    openReminderSheet({
      targetType: 'email_thread',
      targetId: thread.id,
      title: thread.subject,
      dueAt: thread.analysis?.deadline ?? null,
      sourceLabel: `${providerLabel(provider)} · ${thread.participants[0]?.name ?? thread.participants[0]?.email ?? ''}`,
    });
  }, [detail, provider, openReminderSheet]);

  const openOriginal = useCallback(async () => {
    if (!detail) return false;
    const last =
      [...detail.messages].reverse().find((m) => m.webUrl) ??
      detail.messages[detail.messages.length - 1];
    const ok = await openExternal(providerMailUrl(last?.webUrl, provider));
    if (!ok)
      toast.show({ message: t('errors.handoffFailed'), icon: 'conflict', iconTone: 'critical' });
    return ok;
  }, [detail, provider, toast, t]);

  return { reply, createTask, addToCalendar, remind, openOriginal, busy: isCreating };
}
