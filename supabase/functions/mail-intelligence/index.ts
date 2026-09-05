/**
 * GET /mail-intelligence — Mail Summary: today's total, how many need attention, and the six buckets
 * (important, waiting for you, waiting for others, has deadline, information, low priority).
 */
import type { EmailThread, MailIntelligenceResponse } from '@da/domain';
import { AppError } from '@da/server-core/errors';
import { mailIntelligenceBuckets } from '@da/server-core/insights';
import { loadUserContext } from '../_shared/context.ts';
import { assertMethod, handler, json, requireUser } from '../_shared/mod.ts';
import { camelize } from '../_shared/rows.ts';

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'GET');
    const { user, db } = await requireUser(req);
    const ctx = await loadUserContext(db, user.id);
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data, error } = await db
      .from('email_threads')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .gte('last_message_at', since)
      .order('priority_score', { ascending: false })
      .limit(400);
    if (error) throw new AppError('internal', `Mailler okunamadı: ${error.message}`);
    const threads = camelize<EmailThread[]>(data ?? []);
    const response: MailIntelligenceResponse = mailIntelligenceBuckets(threads, {
      now: new Date().toISOString(),
      timezone: ctx.timezone,
    });
    return json(response);
  }),
);
