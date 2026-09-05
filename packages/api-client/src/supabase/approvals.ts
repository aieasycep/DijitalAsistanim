/** ApprovalsApi + RemindersApi: approval_actions (read + functions, realtime pending count), reminders. */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { REMINDER_OPTIONS, type ApprovalActionType, type DecideApprovalRequest } from '@da/domain';
import type { ApprovalsApi, RemindersApi } from '../datasource';
import { count, exec, read, write, type SupabaseContext } from './client';
import { reminderStatusToRow, toApprovalAction, toReminder } from './mappers';
import type { ApprovalActionRow, ReminderRow } from './rows';

export function createApprovalsApi(ctx: SupabaseContext): ApprovalsApi {
  const approvals = () => ctx.table<ApprovalActionRow>('approval_actions');

  async function loadApproval<T extends ApprovalActionType>(userId: string, id: string) {
    return toApprovalAction<T>(
      await exec(approvals().select('*').eq('user_id', userId).eq('id', id).single()),
    );
  }

  const pendingCount = () =>
    read(async () => {
      const userId = await ctx.requireUserId();
      return count(
        approvals()
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'pending'),
      );
    });

  return {
    listApprovals: (input) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        let query = approvals().select('*').eq('user_id', userId);
        if (input?.status && input.status.length > 0) query = query.in('status', input.status);
        const rows = await exec(query.order('created_at', { ascending: false }));
        return rows.map((row) => toApprovalAction(row));
      }),

    getApproval: (id) => read(async () => loadApproval(await ctx.requireUserId(), id)),

    /** Creation is server-side (validation, idempotency, audit); the row is then read back through RLS. */
    createApproval: (req) =>
      write(async () => {
        const { approvalId } = await ctx.call('approvals-create', req);
        const userId = await ctx.requireUserId();
        return loadApproval<typeof req.type>(userId, approvalId);
      }),

    decideApproval: (input) =>
      ctx.call('approvals-decide', {
        approvalId: input.approvalId,
        decision: input.decision,
        editedPayload: input.editedPayload as unknown as DecideApprovalRequest['editedPayload'],
      }),

    retryApproval: (id) => ctx.call('approvals-retry', { approvalId: id }),

    pendingCount,

    /**
     * Realtime `postgres_changes` on the user's approval_actions rows; every change re-reads the pending count.
     * When realtime is unavailable (offline, no session, channel error) this degrades to a silent no-op and the
     * UI keeps using `pendingCount()` on focus / interval.
     */
    onPendingChange(cb) {
      let active = true;
      let channel: RealtimeChannel | null = null;

      const refresh = async (): Promise<void> => {
        try {
          const n = await pendingCount();
          if (active) cb(n);
        } catch {
          // Transient read failure; the next change event triggers another refresh.
        }
      };

      void (async () => {
        try {
          const userId = await ctx.requireUserId();
          if (!active) return;
          channel = ctx.client
            .channel(`approvals:${userId}`)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'approval_actions',
                filter: `user_id=eq.${userId}`,
              },
              () => {
                void refresh();
              },
            )
            .subscribe();
        } catch {
          // Realtime not available right now — nothing to tear down, pendingCount() still works.
        }
      })();

      return () => {
        active = false;
        if (channel) {
          void ctx.client.removeChannel(channel);
          channel = null;
        }
      };
    },
  };
}

export function createRemindersApi(ctx: SupabaseContext): RemindersApi {
  const reminders = () => ctx.table<ReminderRow>('reminders');

  async function setStatus(id: string, status: 'cancelled' | 'completed'): Promise<void> {
    const userId = await ctx.requireUserId();
    await exec(reminders().update(reminderStatusToRow(status)).eq('user_id', userId).eq('id', id));
  }

  return {
    suggestReminder: (req) => ctx.call('reminders-suggest', req),

    listReminders: (input) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        let query = reminders().select('*').eq('user_id', userId);
        if (input?.status) query = query.eq('status', input.status);
        const rows = await exec(query.order('remind_at', { ascending: true }));
        return rows.map(toReminder);
      }),

    cancelReminder: (id) => write(() => setStatus(id, 'cancelled')),

    completeReminder: (id) => write(() => setStatus(id, 'completed')),

    reminderOptionLabels: () => [...REMINDER_OPTIONS],
  };
}
