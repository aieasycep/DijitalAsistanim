/**
 * GET /flow?filter&cursor&limit — the Flow feed: every live card, filtered by tag (Tümü / Önemli / Mail /
 * Takvim / Takip / Kişisel), highest priority first, paginated with an opaque offset cursor.
 */
import type { FlowResponse } from '@da/domain';
import { flowRequestSchema } from '@da/validation';
import { flowFilter } from '@da/server-core/insights';
import { loadLiveInsights } from '../_shared/context.ts';
import { assertMethod, handler, json, parseInput, requireUser } from '../_shared/mod.ts';

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = Number.parseInt(cursor, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'GET');
    const { user, db } = await requireUser(req);
    const input = await parseInput(req, flowRequestSchema);
    const insights = await loadLiveInsights(db, user.id, { limit: 600 });
    const sorted = flowFilter(insights, input.filter, { now: new Date().toISOString() });
    const offset = decodeCursor(input.cursor);
    const page = sorted.slice(offset, offset + input.limit);
    const response: FlowResponse = {
      items: page,
      nextCursor: offset + input.limit < sorted.length ? String(offset + input.limit) : null,
    };
    return json(response);
  }),
);
