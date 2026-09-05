/**
 * GET /today?date — the Today feed: greeting, today's briefing, diversified priority cards (max 5),
 * meetings, deadlines, personal (life events) and the pending approval count. Pure grouping over
 * the insights the pipeline already ranked; nothing is computed by AI at request time.
 */
import type { Briefing, TodayFeed } from '@da/domain';
import { todayRequestSchema } from '@da/validation';
import { groupTodayFeed } from '@da/server-core/insights';
import { loadLiveInsights, loadUserContext, pendingApprovalCount } from '../_shared/context.ts';
import { assertMethod, handler, json, parseInput, requireUser } from '../_shared/mod.ts';
import { camelize, localDateKey } from '../_shared/rows.ts';

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'GET');
    const { user, db } = await requireUser(req);
    const input = await parseInput(req, todayRequestSchema);
    const ctx = await loadUserContext(db, user.id);
    const now = new Date().toISOString();
    const date = input.date ?? localDateKey(now, ctx.timezone);
    const localHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: ctx.timezone,
        hour: '2-digit',
        hour12: false,
      }).format(new Date(now)),
    );
    const evening = localHour >= 18;

    const [insights, pending, { data: briefingRow }, { data: lastSync }] = await Promise.all([
      loadLiveInsights(db, user.id),
      pendingApprovalCount(db, user.id),
      db
        .from('briefings')
        .select('*')
        .eq('user_id', user.id)
        .eq('for_date', date)
        .in('kind', evening ? ['evening', 'morning'] : ['morning'])
        .order('kind', { ascending: evening ? true : false })
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from('connected_accounts')
        .select('last_sync_at')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('last_sync_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);

    let briefing: Briefing | null = null;
    if (briefingRow) {
      const b = camelize<Briefing>(briefingRow);
      const { data: items } = await db
        .from('briefing_items')
        .select('*')
        .eq('briefing_id', b.id)
        .order('position', { ascending: true });
      briefing = { ...b, items: camelize<Briefing['items']>(items ?? []) };
    }

    const feed: TodayFeed = groupTodayFeed(insights, {
      now,
      timezone: ctx.timezone,
      locale: ctx.locale,
      userName: ctx.firstName,
      pendingApprovals: pending,
      briefing,
      lastAnalyzedAt:
        (lastSync as { last_sync_at: string | null } | null)?.last_sync_at ??
        ctx.firstAnalysisCompletedAt,
    });
    return json(feed);
  }),
);
