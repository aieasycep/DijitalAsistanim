/** ApprovalsApi + RemindersApi: approval_actions (read + functions, realtime pending count), reminders. */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { REMINDER_OPTIONS, type ApprovalActionType, type DecideApprovalRequest } from '@da/domain';
import type { ApprovalsApi, RemindersApi } from '../datasource';
import { count, exec, read, write, type SupabaseContext } from './client';
import { reminderStatusToRow, toApprovalAction, toReminder } from './mappers';
import type { ApprovalActionRow, ReminderRow } from './rows';

type PendingListener = (count: number) => void;

/**
 * One realtime channel per user, shared by every `onPendingChange` subscriber. realtime-js hands back the
 * EXISTING channel for a topic, so a per-subscriber `removeChannel` (e.g. the Approval Center unmounting)
 * would also silence the Today tab's badge. The channel is created for the first listener, fans out to all
 * of them and is removed only when the last one unsubscribes.
 */
interface SharedPendingChannel {
  userId: string;
  channel: RealtimeChannel;
  listeners: Set<PendingListener>;
}

export function createApprovalsApi(ctx: SupabaseContext): ApprovalsApi {
  const approvals = () => ctx.table<ApprovalActionRow>('approval_actions');
  let shared: SharedPendingChannel | null = null;

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

  function teardown(entry: SharedPendingChannel): void {
    if (shared === entry) shared = null;
    void ctx.client.removeChannel(entry.channel);
  }

  /** Re-reads the pending count and fans it out to every listener of the shared channel. */
  async function broadcast(entry: SharedPendingChannel): Promise<void> {
    let n: number;
    try {
      n = await pendingCount();
    } catch {
      return; // Transient read failure; the next change event triggers another refresh.
    }
    if (shared !== entry) return;
    for (const listener of [...entry.listeners]) listener(n);
  }

  function acquire(userId: string): SharedPendingChannel {
    if (shared && shared.userId === userId) return shared;
    if (shared) teardown(shared); // another user signed in on this client
    const entry: SharedPendingChannel = {
      userId,
      listeners: new Set(),
      channel: ctx.client.channel(`approvals:${userId}`),
    };
    entry.channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'approval_actions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void broadcast(entry);
        },
      )
      .subscribe();
    shared = entry;
    return entry;
  }

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
     * All subscribers share one channel per user (see `SharedPendingChannel`). When realtime is unavailable
     * (offline, no session, channel error) this degrades to a silent no-op and the UI keeps using
     * `pendingCount()` on focus / interval.
     */
    onPendingChange(cb) {
      let active = true;
      let entry: SharedPendingChannel | null = null;
      const listener: PendingListener = (n) => {
        if (active) cb(n);
      };

      void (async () => {
        try {
          const userId = await ctx.requireUserId();
          if (!active) return;
          entry = acquire(userId);
          entry.listeners.add(listener);
        } catch {
          // Realtime not available right now — nothing to tear down, pendingCount() still works.
        }
      })();

      return () => {
        active = false;
        if (!entry) return;
        entry.listeners.delete(listener);
        if (entry.listeners.size === 0 && shared === entry) teardown(entry);
        entry = null;
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
