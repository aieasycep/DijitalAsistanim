/**
 * Scheduled reminders ("Hatırlatıcılar"): the list plus complete / cancel through the offline queue. The row
 * leaves the list immediately; online the server confirms, offline the intent is persisted and replayed on
 * reconnect (with the queued toast). Reminders are only ever created through approvals (reminder_create).
 */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { Reminder } from '@da/domain';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { queuedToast, runOrQueue } from '@/lib/offlineMutation';

const INVALIDATE: readonly string[][] = [['reminders'], ['today'], ['plan']];

export type ReminderSettleAction = 'complete' | 'cancel';

export function useReminderList() {
  const ds = useDataSource();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: qk.reminders,
    queryFn: () => ds.reminders.listReminders({ status: 'scheduled' }),
  });

  const settle = useMutation({
    mutationFn: (input: { reminder: Reminder; action: ReminderSettleAction }) =>
      runOrQueue(
        ds,
        input.action === 'complete'
          ? { kind: 'reminder_complete', reminderId: input.reminder.id }
          : { kind: 'reminder_cancel', reminderId: input.reminder.id },
        () =>
          input.action === 'complete'
            ? ds.reminders.completeReminder(input.reminder.id)
            : ds.reminders.cancelReminder(input.reminder.id),
      ),
    onSuccess: async (outcome, { reminder, action }) => {
      qc.setQueryData<Reminder[]>(qk.reminders, (prev) =>
        prev ? prev.filter((r) => r.id !== reminder.id) : prev,
      );
      if (!outcome.queued)
        await Promise.all(INVALIDATE.map((queryKey) => qc.invalidateQueries({ queryKey })));
      toast.show(
        outcome.queued
          ? queuedToast(t)
          : action === 'complete'
            ? { message: t('reminders.completedToast'), icon: 'check' }
            : { message: t('reminder.cancelled'), icon: 'schedule' },
      );
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
  });

  const complete = useCallback(
    (reminder: Reminder) => settle.mutate({ reminder, action: 'complete' }),
    [settle],
  );
  const cancel = useCallback(
    (reminder: Reminder) => settle.mutate({ reminder, action: 'cancel' }),
    [settle],
  );

  return {
    query,
    complete,
    cancel,
    busyId: settle.isPending ? (settle.variables?.reminder.id ?? null) : null,
  };
}

/** Number of scheduled reminders for the Plan entry row (null while loading / on error). */
export function useScheduledReminderCount(): number | null {
  const ds = useDataSource();
  const query = useQuery({
    queryKey: qk.reminders,
    queryFn: () => ds.reminders.listReminders({ status: 'scheduled' }),
  });
  return query.data ? query.data.length : null;
}
