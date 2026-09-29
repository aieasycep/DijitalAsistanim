/**
 * POST /briefing-close-day { briefingId, carryOverInsightIds } — "Yarına Hazırım": closes the evening
 * briefing (mutes the rest of tonight's evening notifications) and moves the selected open cards to
 * tomorrow's Today feed. Nothing else changes; unselected cards stay where they are.
 */
import { z } from 'zod';
import type { Briefing } from '@da/domain';
import { AppError } from '@da/server-core/errors';
import { eveningCarryOverPlan } from '@da/server-core/briefing';
import { latestBriefing } from '../_shared/briefing.ts';
import { loadUserContext } from '../_shared/context.ts';
import {
  adminClient,
  assertMethod,
  handler,
  json,
  parseInput,
  requireUser,
  uuidParam,
} from '../_shared/mod.ts';
import { camelize, localDateKey } from '../_shared/rows.ts';

const schema = z.object({
  briefingId: uuidParam,
  carryOverInsightIds: z.array(z.string().min(1)).max(50).default([]),
});

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const input = await parseInput(req, schema);
    const admin = adminClient();
    const ctx = await loadUserContext(admin, user.id);
    const { data: row } = await admin
      .from('briefings')
      .select('*')
      .eq('id', input.briefingId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!row) throw new AppError('not_found', 'Brifing bulunamadı.');
    const briefing = camelize<Briefing>(row);
    const { data: itemRows } = await admin
      .from('briefing_items')
      .select('*')
      .eq('briefing_id', briefing.id)
      .order('position', { ascending: true });
    const items = camelize<Briefing['items']>(itemRows ?? []).map((it) => ({
      ...it,
      candidateId: `${it.section}:${it.entityType ?? 'item'}:${it.entityId ?? it.id}`,
    }));

    const now = new Date().toISOString();
    const tomorrow = (() => {
      const d = new Date(`${localDateKey(now, ctx.timezone)}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    })();
    const plan = eveningCarryOverPlan({ items }, input.carryOverInsightIds, {
      tomorrowDateKey: tomorrow,
      now,
    });

    for (const c of plan.carryOver) {
      await admin
        .from('insights')
        .update({ for_date: c.forDate, status: 'active', snoozed_until: null })
        .eq('id', c.insightId)
        .eq('user_id', user.id);
    }
    const { error } = await admin
      .from('briefings')
      .update({ closed_at: plan.closedAt })
      .eq('id', briefing.id);
    if (error) throw new AppError('internal', `Gün kapatılamadı: ${error.message}`);
    // Items that were carried over show as "done for today" in the closed briefing.
    if (plan.carryOver.length) {
      await admin
        .from('briefing_items')
        .update({ status: 'done' })
        .eq('briefing_id', briefing.id)
        .in(
          'insight_id',
          plan.carryOver.map((c) => c.insightId),
        );
    }
    const updated = await latestBriefing(admin, user.id, briefing.kind, briefing.forDate);
    return json(updated ?? { ...briefing, closedAt: plan.closedAt, items });
  }),
);
