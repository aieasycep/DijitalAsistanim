/**
 * POST /cron-dispatch { job, userId?, accountId?, resource?, date? } — internal entry point for pg_cron
 * (every 5 min) and for function-to-function kicks (webhooks, sync-now, onboarding). Authenticated with
 * the internal secret; never callable with a user JWT.
 */
import { z } from 'zod';
import { AppError } from '@da/server-core/errors';
import { runPipeline } from '../_shared/jobs/pipeline.ts';
import {
  runBackfillJob,
  runBriefingsJob,
  runExportsJob,
  runFollowUpsJob,
  runRemindersJob,
  runRenewSubscriptionsJob,
  runRetentionJob,
  runSyncPollJob,
} from '../_shared/jobs/scheduled.ts';
import {
  adminClient,
  assertMethod,
  handler,
  json,
  parseInput,
  requireInternal,
  uuidParam,
} from '../_shared/mod.ts';
import { log } from '../_shared/log.ts';

const schema = z.object({
  job: z.enum([
    'briefings',
    'sync-poll',
    'reminders',
    'followups',
    'renew-subscriptions',
    'retention',
    'exports',
    'backfill',
    'pipeline',
  ]),
  userId: uuidParam.optional(),
  accountId: uuidParam.optional(),
  resource: z.enum(['mail', 'calendar', 'tasks']).optional(),
  date: z.string().optional(),
});

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    requireInternal(req);
    const input = await parseInput(req, schema);
    const admin = adminClient();
    const now = new Date().toISOString();
    const started = Date.now();
    let result: { processed: number; details?: Record<string, number | string> };
    switch (input.job) {
      case 'briefings':
        result = await runBriefingsJob(admin, now);
        break;
      case 'sync-poll':
        result = await runSyncPollJob(admin, now, {
          userId: input.userId,
          accountId: input.accountId,
          resource: input.resource,
        });
        break;
      case 'reminders':
        result = await runRemindersJob(admin, now);
        break;
      case 'followups':
        result = await runFollowUpsJob(admin, now);
        break;
      case 'renew-subscriptions':
        result = await runRenewSubscriptionsJob(admin, now);
        break;
      case 'retention':
        result = await runRetentionJob(admin, now);
        break;
      case 'exports':
        result = await runExportsJob(admin, now);
        break;
      case 'backfill':
        result = await runBackfillJob(admin, now, { userId: input.userId });
        break;
      case 'pipeline': {
        if (!input.userId) throw new AppError('validation', 'pipeline için userId gerekli.');
        const outcome = await runPipeline(admin, input.userId, { now, reason: 'manual' });
        result = {
          processed: outcome.threadsTriaged,
          details: {
            insights: outcome.insights,
            aiDeep: outcome.aiDeep,
            aiClassified: outcome.aiClassified,
          },
        };
        break;
      }
    }
    log.info('cron job finished', {
      job: input.job,
      processed: result.processed,
      ms: Date.now() - started,
      ...(result.details ?? {}),
    });
    return json({ ok: true as const, processed: result.processed, ...(result.details ?? {}) });
  }),
);
