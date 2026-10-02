/**
 * Function-to-function calls (fire-and-forget) authenticated with the internal secret.
 * Used by webhooks and accounts-sync-now to wake the poller without waiting for the next cron tick.
 */
import { getEnv } from './env.ts';
import { log } from './log.ts';

export type CronJob =
  | 'briefings'
  | 'sync-poll'
  | 'reminders'
  | 'followups'
  | 'renew-subscriptions'
  | 'retention'
  | 'exports'
  | 'backfill'
  | 'pipeline';

/**
 * Keep a fire-and-forget promise alive after the response is returned. The Edge Runtime may tear the
 * worker down right after `Response` is sent; `EdgeRuntime.waitUntil` holds it until the task settles.
 */
export function inBackground(task: Promise<unknown>): void {
  const settled = task.catch(() => undefined);
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  runtime?.waitUntil?.(settled);
}

export function kickJob(job: CronJob, payload: Record<string, unknown> = {}): void {
  const env = getEnv();
  if (!env.internalSecret) {
    log.debug('kickJob skipped: INTERNAL_FUNCTION_SECRET not configured', { job });
    return;
  }
  inBackground(
    fetch(`${env.supabaseUrl}/functions/v1/cron-dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': env.internalSecret,
        apikey: env.supabaseAnonKey,
      },
      body: JSON.stringify({ job, ...payload }),
      signal: AbortSignal.timeout(60_000),
    })
      .then((res) => {
        if (!res.ok) log.warn('kickJob rejected', { job, status: res.status });
        return res.body?.cancel();
      })
      .catch((e: unknown) =>
        log.warn('kickJob failed', { job, error: e instanceof Error ? e.message : 'unknown' }),
      ),
  );
}

/** Mark sync states due now so the poller picks them up on its next pass. */
export async function markSyncDue(
  admin: { from: (table: string) => ReturnType<import('./db.ts').Db['from']> },
  filter: {
    accountId?: string;
    userId?: string;
    subscriptionId?: string;
    resource?: 'mail' | 'calendar' | 'tasks';
  },
): Promise<number> {
  let q = admin.from('sync_states').update({ last_run_at: null });
  if (filter.accountId) q = q.eq('account_id', filter.accountId);
  if (filter.userId) q = q.eq('user_id', filter.userId);
  if (filter.subscriptionId) q = q.eq('subscription_id', filter.subscriptionId);
  if (filter.resource) q = q.eq('resource', filter.resource);
  const { data, error } = await q.select('id');
  if (error) {
    log.warn('markSyncDue failed', { error: error.message });
    return 0;
  }
  return Array.isArray(data) ? data.length : 0;
}
