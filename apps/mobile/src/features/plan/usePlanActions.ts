/**
 * Plan write actions routed through the offline queue. Completing a task flips it in every cached week
 * immediately (optimistic); the write is sent when online and queued — with the "Bağlantı gelince
 * gönderilecek." toast — when not, then replayed on reconnect. Invalidation covers every feed listing the item.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PlanResponse, TaskItem } from '@da/domain';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { queuedToast, runOrQueue } from '@/lib/offlineMutation';
import { useFormatCtx } from '../flow/useFormatCtx';

const TASK_PREFIXES: readonly string[][] = [['plan'], ['tasks'], ['today']];
const COMMITMENT_PREFIXES: readonly string[][] = [
  ['commitments'],
  ['plan'],
  ['today'],
  ['flow'],
  ['person'],
];

async function invalidate(qc: QueryClient, prefixes: readonly string[][]): Promise<void> {
  await Promise.all(prefixes.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

/** Flips the task in every cached week so the checkbox reflects the intent before the server answers. */
function setTaskStatus(qc: QueryClient, id: string, completed: boolean, at: string): void {
  qc.setQueriesData<PlanResponse>({ queryKey: ['plan'] }, (prev) =>
    prev
      ? {
          ...prev,
          days: prev.days.map((day) => ({
            ...day,
            tasks: day.tasks.map((task): TaskItem =>
              task.id === id
                ? {
                    ...task,
                    status: completed ? 'completed' : 'open',
                    completedAt: completed ? at : null,
                  }
                : task,
            ),
          })),
        }
      : prev,
  );
}

export interface CompleteTaskInput {
  id: string;
  completed: boolean;
}

export function useCompleteTask() {
  const ds = useDataSource();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const ctx = useFormatCtx();

  return useMutation({
    mutationFn: (input: CompleteTaskInput) =>
      runOrQueue(ds, { kind: 'task_complete', taskId: input.id, completed: input.completed }, () =>
        ds.plan.completeTask(input.id, input.completed),
      ),
    onMutate: (input) =>
      setTaskStatus(qc, input.id, input.completed, (ctx.now ?? new Date()).toISOString()),
    onSuccess: async (outcome) => {
      if (outcome.queued) toast.show(queuedToast(t));
      await invalidate(qc, TASK_PREFIXES);
    },
    onError: async (e) => {
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' });
      // Roll the optimistic flip back to the server's truth.
      await invalidate(qc, TASK_PREFIXES);
    },
  });
}

/** "Tamamlandı" on a commitment (verdiğin sözler); mirrors the commitments screen's success copy. */
export function useCompleteCommitment() {
  const ds = useDataSource();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (commitmentId: string) =>
      runOrQueue(ds, { kind: 'commitment_complete', commitmentId }, () =>
        ds.plan.completeCommitment(commitmentId),
      ),
    onSuccess: async (outcome) => {
      await invalidate(qc, COMMITMENT_PREFIXES);
      toast.show(
        outcome.queued
          ? queuedToast(t)
          : { message: t('commitments.completedToast'), icon: 'check' },
      );
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
  });
}
