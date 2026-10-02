/** POST /accounts-sync-now — request an immediate sync (rate-limited; the poller picks it up within a minute). */
import { syncNowSchema } from '@da/validation';
import {
  adminClient,
  assertMethod,
  enforceRateLimit,
  handler,
  json,
  parseInput,
  requireUser,
} from '../_shared/mod.ts';
import { kickJob } from '../_shared/internal.ts';
import { log } from '../_shared/log.ts';

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const input = await parseInput(req, syncNowSchema);
    await enforceRateLimit('sync_trigger', user.id);
    const admin = adminClient();

    let q = admin
      .from('sync_states')
      .update({ last_run_at: null, error_count: 0, last_error: null })
      .eq('user_id', user.id);
    if (input.accountId) q = q.eq('account_id', input.accountId);
    if (input.resource) q = q.eq('resource', input.resource);
    const { data, error } = await q.select('id');
    if (error) log.warn('sync-now update failed', { error: error.message });
    const queued = Array.isArray(data) ? data.length : 0;

    // Best-effort immediate kick of the poller (kept alive past the response; cron covers the rest).
    kickJob('sync-poll', { userId: user.id });
    return json({ queued });
  }),
);
