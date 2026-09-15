/**
 * POST /webhook-revenuecat — RevenueCat server notifications (INITIAL_PURCHASE, RENEWAL, CANCELLATION, …).
 * Authenticated with the shared secret configured in the RevenueCat dashboard; idempotent by event id.
 * Entitlement truth lives in public.subscriptions; the app's paywall/gating reads `entitlement`.
 */
import type { Subscription } from '@da/domain';
import { revenueCatWebhookSchema } from '@da/validation';
import { applyRevenueCatEvent, verifyRevenueCatAuth } from '@da/server-core/entitlements';
import { AppError } from '@da/server-core/errors';
import {
  adminClient,
  assertMethod,
  audit,
  getEnv,
  handler,
  json,
  parseInput,
} from '../_shared/mod.ts';
import { camelize } from '../_shared/rows.ts';

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const env = getEnv();
    if (!env.revenuecat.webhookSecret)
      throw new AppError('provider_unavailable', 'RevenueCat webhook secret yapılandırılmamış.', {
        status: 503,
      });
    if (!verifyRevenueCatAuth(req.headers.get('authorization'), env.revenuecat.webhookSecret)) {
      throw new AppError('unauthorized', 'Webhook doğrulanamadı.');
    }
    const { event } = await parseInput(req, revenueCatWebhookSchema);
    const admin = adminClient();

    const eventKey = `revenuecat:${event.id}`;
    const { error: dupErr } = await admin
      .from('webhook_events')
      .insert({ id: eventKey, source: 'revenuecat' });
    if (dupErr?.code === '23505') return json({ ok: true as const, duplicate: true });

    const candidates = [event.app_user_id, event.original_app_user_id].filter((v): v is string =>
      Boolean(v),
    );
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .or(candidates.map((c) => `revenuecat_app_user_id.eq.${c},id.eq.${c}`).join(','))
      .limit(1)
      .maybeSingle();
    const userId = (profile as { id: string } | null)?.id ?? null;
    if (!userId) {
      // Unknown app user (e.g. purchase before login): acknowledge so RevenueCat stops retrying; link happens via billing-link-revenuecat.
      await admin
        .from('webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', eventKey);
      return json({ ok: true as const, linked: false });
    }

    const { data: existingRow } = await admin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('source', 'revenuecat')
      .maybeSingle();
    const existing = existingRow ? camelize<Subscription>(existingRow) : null;
    const now = new Date().toISOString();
    const result = applyRevenueCatEvent(existing, event, { now, userId });

    if (result.changed) {
      const s = result.subscription;
      const { error } = await admin.from('subscriptions').upsert(
        {
          user_id: userId,
          source: s.source,
          status: s.status,
          plan: s.plan,
          product_id: s.productId ?? null,
          entitlement_id: s.entitlementId,
          starts_at: s.startsAt,
          expires_at: s.expiresAt ?? null,
          is_trial: s.isTrial,
          will_renew: s.willRenew,
          store: s.store ?? null,
          revenuecat_app_user_id: s.revenuecatAppUserId ?? null,
          last_event_id: s.lastEventId ?? null,
          environment: result.sandbox ? 'SANDBOX' : 'PRODUCTION',
        },
        { onConflict: 'user_id,source' },
      );
      if (error) throw new AppError('internal', `Abonelik güncellenemedi: ${error.message}`);
      const grantsPro =
        (s.status === 'active' || s.status === 'trial' || s.status === 'grace') &&
        (!s.expiresAt || Date.parse(s.expiresAt) > Date.now());
      await admin
        .from('profiles')
        .update({ plan: grantsPro ? 'pro' : 'free', revenuecat_app_user_id: event.app_user_id })
        .eq('id', userId);
      await audit(admin, {
        userId,
        action: 'subscription.change',
        actor: 'webhook',
        targetType: 'subscription',
        metadata: {
          eventType: result.eventType,
          status: s.status,
          sandbox: result.sandbox,
          transferred: result.transferred,
        },
      });
    }
    await admin
      .from('webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', eventKey);
    return json({ ok: true as const, changed: result.changed });
  }),
);
