/**
 * Approval Center data: the full approval list split into pending (pending / approved / executing) and
 * history, kept fresh by the realtime pending-count subscription and by re-reading on focus.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { qk } from '@da/api-client';
import { useDataSource } from '@/hooks/useDataSource';
import { useUiStore } from '@/store/ui';
import { splitApprovals } from './approvalMeta';

const APPROVALS_PREFIX = ['approvals'] as const;

export function useApprovalCenter() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const setPendingApprovals = useUiStore((s) => s.setPendingApprovals);
  const query = useQuery({
    queryKey: qk.approvals(),
    queryFn: () => ds.approvals.listApprovals(),
  });
  const refetch = query.refetch;

  // Realtime badge: every pending-count change refreshes the pill and re-reads the list.
  useEffect(() => {
    const unsubscribe = ds.approvals.onPendingChange?.((count) => {
      queryClient.setQueryData(qk.approvalsPending, count);
      setPendingApprovals(count);
      void queryClient.invalidateQueries({ queryKey: APPROVALS_PREFIX });
    });
    return () => unsubscribe?.();
  }, [ds, queryClient, setPendingApprovals]);

  // Coming back from a card re-reads (the mount fetch already covers the first focus).
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void refetch();
      focusedOnce.current = true;
    }, [refetch]),
  );

  const { pending, history } = useMemo(() => splitApprovals(query.data ?? []), [query.data]);

  useEffect(() => {
    if (query.data) setPendingApprovals(pending.filter((a) => a.status === 'pending').length);
  }, [query.data, pending, setPendingApprovals]);

  return { query, pending, history };
}
