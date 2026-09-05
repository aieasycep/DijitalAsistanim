/**
 * POST /webhook-microsoft — Microsoft Graph change notifications (mail + calendar subscriptions).
 *  - Validation handshake: `?validationToken=…` must be echoed back as text/plain within 10 s.
 *  - Notifications: each item carries our `clientState`; matching subscriptions are marked due and the
 *    poller is woken. Graph expects 202 quickly, so no provider calls happen here.
 */
import { AppError } from '@da/server-core/errors';
import { timingSafeEqual } from '@da/server-core/crypto';
import { adminClient, assertMethod, CORS_HEADERS, getEnv, handler, json } from '../_shared/mod.ts';
import { kickJob, markSyncDue } from '../_shared/internal.ts';
import { log } from '../_shared/log.ts';

interface GraphNotification {
  subscriptionId?: string;
  clientState?: string;
  changeType?: string;
  resource?: string;
  subscriptionExpirationDateTime?: string;
  lifecycleEvent?: 'subscriptionRemoved' | 'missed' | 'reauthorizationRequired';
}

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const url = new URL(req.url);
    const validationToken = url.searchParams.get('validationToken');
    if (validationToken) {
      return new Response(validationToken, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS_HEADERS },
      });
    }
    const env = getEnv();
    const expected = env.microsoft.webhookClientState;
    if (!expected)
      throw new AppError('provider_unavailable', 'Microsoft webhook yapılandırılmamış.', {
        status: 503,
      });

    let items: GraphNotification[] = [];
    try {
      const body = (await req.json()) as { value?: GraphNotification[] };
      items = Array.isArray(body.value) ? body.value : [];
    } catch {
      return new Response(null, { status: 202, headers: CORS_HEADERS });
    }

    const admin = adminClient();
    let due = 0;
    const touchedUsers = new Set<string>();
    for (const n of items) {
      if (!n.subscriptionId || !n.clientState || !timingSafeEqual(n.clientState, expected))
        continue;
      const { data: state } = await admin
        .from('sync_states')
        .select('id, user_id, account_id, resource')
        .eq('subscription_id', n.subscriptionId)
        .maybeSingle();
      const s = state as {
        id: string;
        user_id: string;
        account_id: string;
        resource: string;
      } | null;
      if (!s) continue;
      if (
        n.lifecycleEvent === 'subscriptionRemoved' ||
        n.lifecycleEvent === 'reauthorizationRequired'
      ) {
        // Fall back to polling; renew-subscriptions re-creates the subscription on its next pass.
        await admin
          .from('sync_states')
          .update({
            mode: 'polling',
            subscription_id: null,
            subscription_expires_at: null,
            last_run_at: null,
          })
          .eq('id', s.id);
        due += 1;
      } else {
        due += await markSyncDue(admin, { subscriptionId: n.subscriptionId });
      }
      touchedUsers.add(s.user_id);
    }
    for (const userId of touchedUsers) kickJob('sync-poll', { userId });
    log.info('graph notifications received', {
      items: items.length,
      due,
      users: touchedUsers.size,
    });
    return json({ ok: true as const }, { status: 202 });
  }),
);
