/**
 * "Yarına Hazırım" — closes the evening briefing through the offline queue. Online, the server's closed
 * briefing replaces the cached one; offline, the cached briefing is marked closed locally, the intent is
 * queued (replayed on reconnect) and the queued toast is shown. Screens add their own navigation and
 * success copy via `mutate(input, { onSuccess })`.
 */
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Briefing } from '@da/domain';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { queuedToast, runOrQueue } from '@/lib/offlineMutation';
import { useFormatCtx } from '../flow/useFormatCtx';

export interface CloseDayInput {
  briefingId: string;
  carryOverInsightIds: string[];
}

export interface CloseDayResult {
  /** The closed briefing (server copy online, local copy with `closedAt` when queued); null when unknown. */
  briefing: Briefing | null;
  queued: boolean;
}

export function useCloseDay(queryKey: QueryKey) {
  const ds = useDataSource();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const ctx = useFormatCtx();

  return useMutation({
    mutationFn: async (input: CloseDayInput): Promise<CloseDayResult> => {
      const outcome = await runOrQueue(
        ds,
        {
          kind: 'close_day',
          briefingId: input.briefingId,
          carryOverInsightIds: input.carryOverInsightIds,
        },
        () => ds.briefings.closeDay(input),
      );
      if (!outcome.queued) return { briefing: outcome.value, queued: false };
      const current = qc.getQueryData<Briefing | null>(queryKey);
      return {
        briefing: current ? { ...current, closedAt: (ctx.now ?? new Date()).toISOString() } : null,
        queued: true,
      };
    },
    onSuccess: async ({ briefing, queued }) => {
      if (briefing) qc.setQueryData(queryKey, briefing);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['today'] }),
        qc.invalidateQueries({ queryKey: ['briefing'] }),
      ]);
      if (queued) toast.show(queuedToast(t));
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' }),
  });
}
