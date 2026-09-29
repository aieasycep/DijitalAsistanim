/**
 * GET/POST /briefing { kind, date?, regenerate? } — returns the briefing for a day (generating it on
 * first request). Midday / evening / weekly are Pro features: free users get `not_found` for those kinds
 * unless a briefing was already produced while they were Pro. Regeneration is rate-limited per day.
 */
import { briefingRequestSchema } from '@da/validation';
import { AppError } from '@da/server-core/errors';
import { generateBriefing, latestBriefing } from '../_shared/briefing.ts';
import { loadUserContext } from '../_shared/context.ts';
import {
  adminClient,
  assertMethod,
  audit,
  enforceRateLimit,
  handler,
  json,
  parseInput,
  requireUser,
} from '../_shared/mod.ts';
import { resolvePlan } from '../_shared/plan.ts';
import { localDateKey } from '../_shared/rows.ts';

const PRO_KINDS = new Set(['midday', 'evening', 'weekly']);
const MAX_VERSIONS_PER_DAY = 4;

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'GET', 'POST');
    const { user } = await requireUser(req);
    const input = await parseInput(req, briefingRequestSchema);
    const admin = adminClient();
    const ctx = await loadUserContext(admin, user.id);
    const date = input.date ?? localDateKey(new Date(), ctx.timezone);

    if (PRO_KINDS.has(input.kind)) {
      const plan = await resolvePlan(admin, user.id);
      if (plan.plan !== 'pro') {
        const existing = await latestBriefing(admin, user.id, input.kind, date);
        if (existing) return json(existing);
        throw new AppError('forbidden', 'Bu brifing Pro planına dahil.', {
          details: {
            feature: input.kind === 'weekly' ? 'weekly_review' : `${input.kind}_briefing`,
          },
        });
      }
    }
    if (input.regenerate) {
      await enforceRateLimit('ai_call', `briefing:${user.id}`);
      const existing = await latestBriefing(admin, user.id, input.kind, date);
      if (existing && existing.version >= MAX_VERSIONS_PER_DAY)
        throw new AppError('rate_limited', 'Bu brifing bugün yeterince yenilendi.', {
          retryAfterSec: 3600,
        });
    }
    const briefing = await generateBriefing(admin, ctx, input.kind, date, {
      regenerate: Boolean(input.regenerate),
    });
    if (input.regenerate) {
      await audit(admin, {
        userId: user.id,
        action: 'ai.call',
        actor: 'user',
        targetType: 'briefing',
        targetId: briefing.id,
        metadata: { kind: input.kind, version: briefing.version },
      });
    }
    return json(briefing);
  }),
);
