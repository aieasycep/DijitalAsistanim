/**
 * Post-meeting capture: text or voice → `submitPostMeeting` → commitment proposals, each already
 * backed by an approval. "Kaydet" walks the user through the approval cards one at a time (never a
 * bulk approve); once every proposal is decided the meeting is marked handled.
 */
import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApprovalAction, PostMeetingResponse } from '@da/domain';
import { useDataSource } from '@/hooks/useDataSource';
import { useApprovalFlow } from '../approvals/useApprovalFlow';

export type Proposal = PostMeetingResponse['proposals'][number];

const DECIDED: ApprovalAction['status'][] = [
  'approved',
  'rejected',
  'executing',
  'executed',
  'failed',
  'expired',
];

export function usePostMeeting(eventId: string | undefined) {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const { refreshPending } = useApprovalFlow();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [decided, setDecided] = useState<Record<string, ApprovalAction['status']>>({});
  const [submitted, setSubmitted] = useState(false);

  const submit = useMutation({
    mutationFn: (input: { text: string; inputMode: 'text' | 'voice' }) =>
      ds.meetings.submitPostMeeting({
        eventId: eventId ?? '',
        text: input.text,
        inputMode: input.inputMode,
      }),
    onSuccess: async (response) => {
      setProposals(response.proposals);
      setDecided({});
      setSubmitted(true);
      await refreshPending();
    },
  });

  const markHandled = useMutation({
    mutationFn: () => ds.meetings.markPostMeetingHandled(eventId ?? ''),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['recentlyEnded'] }),
        queryClient.invalidateQueries({ queryKey: ['commitments'] }),
        queryClient.invalidateQueries({ queryKey: ['today'] }),
        queryClient.invalidateQueries({ queryKey: ['plan'] }),
      ]);
    },
  });

  /** Re-reads each proposal's approval status (called when the screen regains focus). */
  const refreshDecisions = useCallback(async () => {
    if (proposals.length === 0) return {};
    const entries = await Promise.all(
      proposals.map(async (p) => {
        try {
          const approval = await ds.approvals.getApproval(p.approvalId);
          return [p.approvalId, approval.status] as const;
        } catch {
          return [p.approvalId, 'pending'] as const;
        }
      }),
    );
    const next = Object.fromEntries(entries.filter(([, status]) => DECIDED.includes(status)));
    setDecided(next);
    return next;
  }, [ds, proposals]);

  const pending = proposals.filter((p) => !decided[p.approvalId]);

  const reset = useCallback(() => {
    setProposals([]);
    setDecided({});
    setSubmitted(false);
  }, []);

  return { submit, markHandled, proposals, pending, decided, submitted, refreshDecisions, reset };
}
