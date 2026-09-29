/** FeedApi: today/flow/mail-intelligence functions, insights (status/snooze only), ai_feedback, life_events. */
import type { FeedApi } from '../datasource';
import { ClientApiError } from '../errors';
import { exec, read, write, type SupabaseContext } from './client';
import { aiFeedbackToRow, insightSnoozeToRow, toInsight, toLifeEvent } from './mappers';
import type { AiFeedbackRow, InsightRow, LifeEventRow } from './rows';

export function createFeedApi(ctx: SupabaseContext): FeedApi {
  const insights = () => ctx.table<InsightRow>('insights');
  const lifeEvents = () => ctx.table<LifeEventRow>('life_events');

  return {
    getToday: (input) => ctx.call('today', { date: input?.date }),

    getFlow: (input) =>
      ctx.call('flow', { filter: input.filter, cursor: input.cursor, limit: input.limit }),

    getInsight: (id) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        return toInsight(
          await exec(insights().select('*').eq('user_id', userId).eq('id', id).single()),
        );
      }),

    /** `resolve_insight` updates status + timestamps and records the feedback atomically (RLS-scoped RPC). */
    resolveInsight: (id, status, feedback) =>
      write(async () => {
        await ctx.requireUserId();
        const result = await ctx.rpc<InsightRow | InsightRow[] | null>('resolve_insight', {
          p_insight: id,
          p_status: status,
          p_feedback: feedback ?? null,
        });
        const row = Array.isArray(result) ? result[0] : result;
        if (!row) throw new ClientApiError({ code: 'not_found', message: 'Kayıt bulunamadı.' });
        return toInsight(row);
      }),

    snoozeInsight: (id, until) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        return toInsight(
          await exec(
            insights()
              .update(insightSnoozeToRow(until))
              .eq('user_id', userId)
              .eq('id', id)
              .select('*')
              .single(),
          ),
        );
      }),

    sendFeedback: (input) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await exec(ctx.table<AiFeedbackRow>('ai_feedback').insert(aiFeedbackToRow(userId, input)));
      }),

    getMailIntelligence: () => ctx.call('mail-intelligence', {}),

    listWaitingForUser: () =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          insights()
            .select('*')
            .eq('user_id', userId)
            .eq('kind', 'waiting_for_user')
            .eq('status', 'active')
            .is('deleted_at', null)
            .order('priority_score', { ascending: false })
            .order('due_at', { ascending: true, nullsFirst: false }),
        );
        return rows.map(toInsight);
      }),

    listLifeEvents: () =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          lifeEvents()
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('event_at', { ascending: true, nullsFirst: false }),
        );
        return rows.map(toLifeEvent);
      }),

    getLifeEvent: (id) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        return toLifeEvent(
          await exec(lifeEvents().select('*').eq('user_id', userId).eq('id', id).single()),
        );
      }),

    setLifeEventStatus: (id, status) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        return toLifeEvent(
          await exec(
            lifeEvents().update({ status }).eq('user_id', userId).eq('id', id).select('*').single(),
          ),
        );
      }),
  };
}
