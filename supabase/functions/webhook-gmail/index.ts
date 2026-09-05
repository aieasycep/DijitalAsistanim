/**
 * POST /webhook-gmail?token=… — Google Pub/Sub push endpoint for Gmail `users.watch` notifications.
 * The message only says "mailbox X changed up to historyId N"; no mail content arrives here. We mark the
 * account's mail sync as due and wake the poller. Always 200 (Pub/Sub retries on non-2xx).
 */
import { AppError } from '@da/server-core/errors';
import { timingSafeEqual } from '@da/server-core/crypto';
import { adminClient, assertMethod, getEnv, handler, json } from '../_shared/mod.ts';
import { kickJob, markSyncDue } from '../_shared/internal.ts';
import { log } from '../_shared/log.ts';

interface PubSubPush {
  message?: { data?: string; messageId?: string; publishTime?: string };
  subscription?: string;
}

function decodeData(data: string | undefined): {
  emailAddress?: string;
  historyId?: string | number;
} {
  if (!data) return {};
  try {
    const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as {
      emailAddress?: string;
      historyId?: string | number;
    };
  } catch {
    return {};
  }
}

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const env = getEnv();
    const expected = env.google.pubsubVerificationToken;
    if (!expected)
      throw new AppError('provider_unavailable', 'Gmail push yapılandırılmamış.', { status: 503 });
    const token = new URL(req.url).searchParams.get('token') ?? '';
    if (!token || !timingSafeEqual(token, expected))
      throw new AppError('unauthorized', 'Webhook doğrulanamadı.');

    let body: PubSubPush = {};
    try {
      body = (await req.json()) as PubSubPush;
    } catch {
      return json({ ok: true as const });
    }
    const payload = decodeData(body.message?.data);
    const email = payload.emailAddress?.toLowerCase();
    if (!email) return json({ ok: true as const });

    const admin = adminClient();
    const messageId = body.message?.messageId;
    if (messageId) {
      const { error } = await admin
        .from('webhook_events')
        .insert({
          id: `gmail:${messageId}`,
          source: 'gmail',
          processed_at: new Date().toISOString(),
        });
      if (error?.code === '23505') return json({ ok: true as const, duplicate: true });
    }

    const { data: accounts } = await admin
      .from('connected_accounts')
      .select('id, user_id')
      .eq('provider', 'google')
      .eq('email', email)
      .is('deleted_at', null);
    const list = (accounts ?? []) as { id: string; user_id: string }[];
    let due = 0;
    for (const a of list) {
      due += await markSyncDue(admin, { accountId: a.id, resource: 'mail' });
      kickJob('sync-poll', { userId: a.user_id, accountId: a.id, resource: 'mail' });
    }
    log.info('gmail push received', {
      accounts: list.length,
      due,
      historyId: String(payload.historyId ?? ''),
    });
    return json({ ok: true as const });
  }),
);
