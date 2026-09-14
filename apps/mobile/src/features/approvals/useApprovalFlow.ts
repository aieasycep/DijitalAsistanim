/**
 * Every write action in the app goes through here: create the approval server-side, refresh the
 * pending badge, then open the approval card so the user decides. Nothing is executed before that.
 *
 * Offline, both the proposal and the decision are persisted in the write queue (`runOrQueue`) and replayed
 * on reconnect — the proposal keeps its client idempotency key, so a replay never creates a duplicate.
 */
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ClientApiError, qk } from '@da/api-client';
import type {
  ApprovalAction,
  ApprovalActionType,
  CreateApprovalRequest,
  DecideApprovalResponse,
} from '@da/domain';
import { useToast } from '@da/ui';
import { useTranslation } from 'react-i18next';
import { useDataSource } from '@/hooks/useDataSource';
import { track } from '@/lib/analytics';
import { queuedToast, runOrQueue } from '@/lib/offlineMutation';
import { remove as removeQueued } from '@/lib/offlineQueue';
import { useUiStore } from '@/store/ui';
import { describeError } from '@/lib/errors';

const APPROVAL_QUERY_PREFIX = ['approvals'] as const;

/** Query keys whose data changes when an approval is executed (threads, plan, tasks, reminders, commitments, insights). */
const SIDE_EFFECT_PREFIXES = [
  ['today'],
  ['flow'],
  ['plan'],
  ['tasks'],
  ['reminders'],
  ['commitments'],
  ['thread'],
  ['followUps'],
  ['events'],
  ['waiting'],
  ['conflicts'],
];

export interface DecideInput {
  approvalId: string;
  decision: 'approve' | 'reject';
  editedPayload?: Record<string, unknown>;
}

/** The server's answer — or, offline, the still-pending approval with `queued: true` (applied on reconnect). */
export type DecideOutcome = DecideApprovalResponse & { queued?: boolean };

export function useApprovalFlow() {
  const ds = useDataSource();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const setPendingApprovals = useUiStore((s) => s.setPendingApprovals);

  const refreshPending = useCallback(async () => {
    try {
      const n = await ds.approvals.pendingCount();
      setPendingApprovals(n);
      queryClient.setQueryData(qk.approvalsPending, n);
    } catch {
      // Badge refresh is best-effort; the list screen re-reads on focus.
    }
    await queryClient.invalidateQueries({ queryKey: APPROVAL_QUERY_PREFIX });
  }, [ds, queryClient, setPendingApprovals]);

  const invalidateSideEffects = useCallback(async () => {
    await Promise.all(
      SIDE_EFFECT_PREFIXES.map((key) => queryClient.invalidateQueries({ queryKey: key })),
    );
  }, [queryClient]);

  const create = useMutation({
    mutationFn: (req: CreateApprovalRequest) =>
      runOrQueue(ds, { kind: 'approval_create', request: req }, () =>
        ds.approvals.createApproval(req as CreateApprovalRequest<ApprovalActionType>),
      ),
    onSuccess: (outcome) => {
      if (!outcome.queued) void refreshPending();
    },
  });

  /**
   * Creates the approval and opens its card. Returns the approval, or null when nothing can be opened yet:
   * creation failed (error toast) or the proposal was queued offline (queued toast).
   */
  const requestApproval = useCallback(
    async <T extends ApprovalActionType>(
      req: CreateApprovalRequest<T>,
      opts: { navigate?: boolean } = {},
    ): Promise<ApprovalAction<T> | null> => {
      try {
        const outcome = await create.mutateAsync(req as CreateApprovalRequest);
        if (outcome.queued) {
          toast.show(queuedToast(t));
          return null;
        }
        const approval = outcome.value;
        if (opts.navigate !== false)
          router.push({ pathname: '/approvals/[id]', params: { id: approval.id } });
        return approval as ApprovalAction<T>;
      } catch (e) {
        toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' });
        return null;
      }
    },
    [create, router, toast, t],
  );

  const decide = useMutation({
    mutationFn: async (input: DecideInput): Promise<DecideOutcome> => {
      const outcome = await runOrQueue(
        ds,
        {
          kind: 'approval_decide',
          approvalId: input.approvalId,
          decision: input.decision,
          editedPayload: input.editedPayload,
        },
        () => ds.approvals.decideApproval(input),
      );
      if (!outcome.queued) return outcome.value;
      // Offline: the decision waits in the queue and the card stays pending until it replays.
      const current = queryClient.getQueryData<ApprovalAction>(qk.approval(input.approvalId));
      if (!current) {
        removeQueued(outcome.entry.id);
        throw new ClientApiError({ code: 'offline', message: 'offline' });
      }
      return { approval: current, status: current.status, requiredScope: null, queued: true };
    },
    onSuccess: async (result, variables) => {
      if (result.queued) {
        toast.show(queuedToast(t));
        return;
      }
      queryClient.setQueryData(qk.approval(variables.approvalId), result.approval);
      if (variables.decision === 'approve')
        track('action_approved', {
          actionType: result.approval.type,
          edited: result.approval.editedByUser,
        });
      await refreshPending();
      if (result.status === 'executed') await invalidateSideEffects();
    },
  });

  const retry = useMutation({
    mutationFn: (approvalId: string) => ds.approvals.retryApproval(approvalId),
    onSuccess: async (result: DecideApprovalResponse, approvalId) => {
      queryClient.setQueryData(qk.approval(approvalId), result.approval);
      await refreshPending();
      if (result.status === 'executed') await invalidateSideEffects();
    },
  });

  return { requestApproval, decide, retry, refreshPending, isCreating: create.isPending };
}

/** Builds a stable idempotency key for client-initiated proposals (same intent → same approval). */
export function approvalIdempotencyKey(parts: (string | number | null | undefined)[]): string {
  const raw = parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `client-${hash.toString(16).padStart(8, '0')}-${raw.length}`;
}
