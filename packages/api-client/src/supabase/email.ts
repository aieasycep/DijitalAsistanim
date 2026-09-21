/** EmailApi: email-thread / draft functions, email_threads read flag, follow_ups (snooze/close). */
import type { EmailApi } from '../datasource';
import { exec, read, write, type SupabaseContext } from './client';
import { followUpCloseToRow, followUpSnoozeToRow, toFollowUp } from './mappers';
import type { EmailThreadRow, FollowUpRow } from './rows';

export function createEmailApi(ctx: SupabaseContext): EmailApi {
  const followUps = () => ctx.table<FollowUpRow>('follow_ups');

  return {
    getThread: (id) => ctx.call('email-thread', { id }),

    markRead: (id, isRead) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await exec(
          ctx
            .table<EmailThreadRow>('email_threads')
            .update({ is_read: isRead })
            .eq('user_id', userId)
            .eq('id', id),
        );
      }),

    draftReply: (req) => ctx.call('email-draft-reply', req),

    /** Everything still being tracked (closed ones are history and are not shown in the list). */
    listFollowUps: () =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          followUps()
            .select('*')
            .eq('user_id', userId)
            .neq('status', 'closed')
            .order('sent_at', { ascending: false }),
        );
        return rows.map(toFollowUp);
      }),

    getFollowUp: (id) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        return toFollowUp(
          await exec(followUps().select('*').eq('user_id', userId).eq('id', id).single()),
        );
      }),

    snoozeFollowUp: (id, until) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        return toFollowUp(
          await exec(
            followUps()
              .update(followUpSnoozeToRow(until))
              .eq('user_id', userId)
              .eq('id', id)
              .select('*')
              .single(),
          ),
        );
      }),

    closeFollowUp: (id) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        return toFollowUp(
          await exec(
            followUps()
              .update(followUpCloseToRow(ctx.now()))
              .eq('user_id', userId)
              .eq('id', id)
              .select('*')
              .single(),
          ),
        );
      }),

    draftFollowUpMessage: (followUpId) => ctx.call('followups-draft', { followUpId }),
  };
}
