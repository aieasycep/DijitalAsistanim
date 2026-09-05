/** PlanApi + MeetingApi: plan/meeting functions, tasks, commitments, calendar_conflicts, calendar_events. */
import type { CalendarConflict, CalendarEvent } from '@da/domain';
import type { MeetingApi, PlanApi } from '../datasource';
import { ClientApiError } from '../errors';
import { exec, read, write, type SupabaseContext } from './client';
import {
  commitmentStatusToRow,
  postMeetingNoteToRow,
  taskCompletionToRow,
  toCalendarConflict,
  toCalendarEvent,
  toCommitment,
  toTask,
} from './mappers';
import type {
  CalendarConflictRow,
  CalendarEventRow,
  CommitmentRow,
  PostMeetingNoteRow,
  TaskRow,
} from './rows';

/** Embeds both events through the FK constraint names Postgres generated for `event_a_id` / `event_b_id`. */
export const CONFLICT_SELECT =
  '*, event_a:calendar_events!calendar_conflicts_event_a_id_fkey(*), event_b:calendar_events!calendar_conflicts_event_b_id_fkey(*)';

const DEFAULT_RECENT_HOURS = 3;

export function createPlanApi(ctx: SupabaseContext): PlanApi {
  const tasks = () => ctx.table<TaskRow>('tasks');
  const commitments = () => ctx.table<CommitmentRow>('commitments');
  const conflicts = () => ctx.table<CalendarConflictRow>('calendar_conflicts');
  const events = () => ctx.table<CalendarEventRow>('calendar_events');

  async function loadConflict(userId: string, id: string): Promise<CalendarConflict> {
    const row = await exec(
      conflicts().select(CONFLICT_SELECT).eq('user_id', userId).eq('id', id).single(),
    );
    const conflict = toCalendarConflict(row);
    if (!conflict)
      throw new ClientApiError({
        code: 'not_found',
        message: 'Çakışan etkinlikler artık mevcut değil.',
      });
    return conflict;
  }

  async function updateCommitment(id: string, patch: Partial<CommitmentRow>) {
    const userId = await ctx.requireUserId();
    return toCommitment(
      await exec(
        commitments().update(patch).eq('user_id', userId).eq('id', id).select('*').single(),
      ),
    );
  }

  return {
    getPlan: (input) => ctx.call('plan', input),

    listTasks: (input) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        let query = tasks().select('*').eq('user_id', userId).is('deleted_at', null);
        if (input?.status) query = query.eq('status', input.status);
        const rows = await exec(
          query
            .order('due_at', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false }),
        );
        return rows.map(toTask);
      }),

    completeTask: (id, completed) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        const row = await exec(
          tasks()
            .update(taskCompletionToRow(completed, ctx.now()))
            .eq('user_id', userId)
            .eq('id', id)
            .select('*')
            .single(),
        );
        return toTask(row);
      }),

    listCommitments: (input) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        let query = commitments().select('*').eq('user_id', userId).is('deleted_at', null);
        if (input?.status) query = query.eq('status', input.status);
        const rows = await exec(
          query
            .order('due_at', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false }),
        );
        return rows.map(toCommitment);
      }),

    getCommitment: (id) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        return toCommitment(
          await exec(commitments().select('*').eq('user_id', userId).eq('id', id).single()),
        );
      }),

    completeCommitment: (id) =>
      write(() => updateCommitment(id, commitmentStatusToRow('completed', ctx.now()))),

    postponeCommitment: (id, until) =>
      write(() => updateCommitment(id, commitmentStatusToRow('postponed', ctx.now(), until))),

    confirmCommitment: (id, accept) =>
      write(() =>
        updateCommitment(id, commitmentStatusToRow(accept ? 'open' : 'cancelled', ctx.now())),
      ),

    listConflicts: () =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          conflicts()
            .select(CONFLICT_SELECT)
            .eq('user_id', userId)
            .eq('status', 'open')
            .order('created_at', { ascending: false }),
        );
        return rows.map(toCalendarConflict).filter((c): c is CalendarConflict => c !== null);
      }),

    getConflict: (id) => read(async () => loadConflict(await ctx.requireUserId(), id)),

    ignoreConflict: (id) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await exec(conflicts().update({ status: 'ignored' }).eq('user_id', userId).eq('id', id));
        return loadConflict(userId, id);
      }),

    getEvent: (id) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        return toCalendarEvent(
          await exec(events().select('*').eq('user_id', userId).eq('id', id).single()),
        );
      }),

    /** Events overlapping [from, to). */
    listEvents: (input) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          events()
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .neq('status', 'cancelled')
            .lt('start_at', input.to)
            .gt('end_at', input.from)
            .order('start_at', { ascending: true }),
        );
        return rows.map(toCalendarEvent);
      }),
  };
}

export function createMeetingApi(ctx: SupabaseContext): MeetingApi {
  const events = () => ctx.table<CalendarEventRow>('calendar_events');
  const notes = () => ctx.table<PostMeetingNoteRow>('post_meeting_notes');

  return {
    getMeetingPrep: (eventId, opts) =>
      ctx.call('meeting-prep', { eventId, regenerate: opts?.regenerate }),

    submitPostMeeting: (input) => ctx.call('post-meeting', input),

    /**
     * "Handled, nothing to follow up." calendar_events rows synced from Google/Microsoft are server-owned (RLS only
     * lets clients update device-calendar rows) and there is no function for a no-op post-meeting. post_meeting_notes
     * IS client-writable, so an empty note (text '', no extracted commitments) records the decision: the server treats
     * an empty note as handled and listRecentlyEndedMeetings() excludes any event that has a note. The
     * post_meeting_handled_at update below is best effort — it only affects device-calendar rows and matches
     * zero rows for provider-synced events.
     */
    markPostMeetingHandled: (eventId) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await exec(
          notes().insert(postMeetingNoteToRow(userId, { eventId, text: '', inputMode: 'text' })),
        );
        await exec(
          events()
            .update({ post_meeting_handled_at: ctx.now().toISOString() })
            .eq('user_id', userId)
            .eq('id', eventId)
            .is('post_meeting_handled_at', null)
            .in('source', ['apple_calendar', 'device_calendar']),
        );
      }),

    /** Timed (non all-day) meetings that ended in the last N hours without a post-meeting note. */
    listRecentlyEndedMeetings: (input) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const now = ctx.now();
        const from = new Date(
          now.getTime() - (input?.hours ?? DEFAULT_RECENT_HOURS) * 60 * 60 * 1000,
        );
        const rows = await exec(
          events()
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .neq('status', 'cancelled')
            .eq('all_day', false)
            .is('post_meeting_handled_at', null)
            .gte('end_at', from.toISOString())
            .lte('end_at', now.toISOString())
            .order('end_at', { ascending: false }),
        );
        if (rows.length === 0) return [];
        const noted = await exec(
          ctx
            .table<Pick<PostMeetingNoteRow, 'event_id'>>('post_meeting_notes')
            .select('event_id')
            .eq('user_id', userId)
            .in(
              'event_id',
              rows.map((r) => r.id),
            ),
        );
        const handled = new Set(noted.map((n) => n.event_id));
        return rows.filter((r) => !handled.has(r.id)).map<CalendarEvent>(toCalendarEvent);
      }),
  };
}
