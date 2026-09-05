/**
 * Push delivery: preference gate (category, Pro, only-important, quiet hours) → dedupe → Expo send →
 * receipts bookkeeping. Payloads contain titles/bodies produced by server-core/notifications (never mail
 * content beyond a person name and a short topic) and deep links; push_deliveries keeps one row per
 * user + dedupe key so the same entity is never announced twice in a day.
 */
import type { NotificationCategory, NotificationPreferences, PushToken } from '@da/domain';
import {
  androidChannelId,
  applyLockScreenPrivacy,
  iosInterruptionLevel,
  shouldSend,
  type NotificationPayload,
  type SendDecision,
} from '@da/server-core/notifications';
import { planDeliveries, sendExpoPush, summarizeTickets } from '@da/server-core/push';
import type { Db } from './db.ts';
import { getEnv } from './env.ts';
import { log } from './log.ts';
import { camelize } from './rows.ts';

export interface PushTarget {
  userId: string;
  timezone: string;
  isPro: boolean;
  prefs: NotificationPreferences;
}

export type PushOutcome =
  | { status: 'sent'; devices: number }
  | {
      status: 'suppressed';
      reason: Exclude<SendDecision, { send: true }>['reason'];
      deferUntil?: string;
    }
  | { status: 'deduped' }
  | { status: 'no_devices' }
  | { status: 'failed'; error: string };

export async function loadPushTarget(
  admin: Db,
  userId: string,
  opts: { isPro: boolean; timezone: string },
): Promise<PushTarget | null> {
  const { data } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  return {
    userId,
    timezone: opts.timezone,
    isPro: opts.isPro,
    prefs: camelize<NotificationPreferences>(data),
  };
}

export async function sendPush(
  admin: Db,
  target: PushTarget,
  payload: NotificationPayload,
  opts: {
    importance?: 'critical' | 'high' | 'normal' | 'low' | null;
    isCritical?: boolean;
    badge?: number;
  } = {},
): Promise<PushOutcome> {
  const now = new Date().toISOString();
  const decision = shouldSend({
    category: payload.category,
    prefs: target.prefs,
    importance: opts.importance ?? null,
    entitlement: { isPro: target.isPro },
    now,
    timezone: target.timezone,
    isCritical: opts.isCritical ?? false,
  });
  if (!decision.send) {
    await admin
      .from('push_deliveries')
      .upsert(
        {
          user_id: target.userId,
          category: payload.category,
          dedupe_key: payload.dedupeKey,
          title: payload.title,
          body: payload.body,
          deep_link: payload.deepLink,
          status: 'suppressed',
          error: decision.reason,
        },
        { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
      );
    return {
      status: 'suppressed',
      reason: decision.reason,
      ...(decision.deferUntil ? { deferUntil: decision.deferUntil } : {}),
    };
  }

  const { data: sentRow } = await admin
    .from('push_deliveries')
    .select('status')
    .eq('user_id', target.userId)
    .eq('dedupe_key', payload.dedupeKey)
    .maybeSingle();
  const status = (sentRow as { status: string } | null)?.status;
  if (status === 'sent' || status === 'delivered') return { status: 'deduped' };

  const { data: tokenRows } = await admin
    .from('push_tokens')
    .select('*')
    .eq('user_id', target.userId)
    .eq('is_active', true);
  const tokens = camelize<PushToken[]>(tokenRows ?? []);
  if (tokens.length === 0) return { status: 'no_devices' };

  const privatePayload = applyLockScreenPrivacy(payload, target.prefs.lockScreenPrivacy);
  const plan = planDeliveries({
    tokens,
    payload: privatePayload,
    alreadySent: new Set<string>(),
    options: {
      channelId: androidChannelId(payload.category),
      interruptionLevel: iosInterruptionLevel(payload.category, false),
      ...(opts.badge !== undefined ? { badge: opts.badge } : {}),
    },
  });
  if (plan.messages.length === 0) return { status: 'no_devices' };

  await admin
    .from('push_deliveries')
    .upsert(
      {
        user_id: target.userId,
        category: payload.category,
        dedupe_key: payload.dedupeKey,
        title: privatePayload.title,
        body: privatePayload.body,
        deep_link: payload.deepLink,
        status: 'queued',
        attempt_count: 1,
      },
      { onConflict: 'user_id,dedupe_key' },
    );
  try {
    const env = getEnv();
    const tickets = await sendExpoPush((input, init) => fetch(input, init), {
      messages: plan.messages,
      ...(env.expoAccessToken ? { accessToken: env.expoAccessToken } : {}),
    });
    const summary = summarizeTickets(
      tickets,
      plan.deliveries.map((d) => d.token),
    );
    if (summary.toDisable.length)
      await admin.from('push_tokens').update({ is_active: false }).in('id', summary.toDisable);
    const delivered = summary.delivered.length;
    const receiptId = Object.values(summary.ticketIds)[0] ?? null;
    await admin
      .from('push_deliveries')
      .update({
        status: delivered > 0 ? 'sent' : 'failed',
        sent_at: delivered > 0 ? now : null,
        receipt_id: receiptId,
        error: delivered > 0 ? null : (summary.failed[0]?.message ?? 'no_ticket'),
      })
      .eq('user_id', target.userId)
      .eq('dedupe_key', payload.dedupeKey);
    return delivered > 0
      ? { status: 'sent', devices: delivered }
      : { status: 'failed', error: summary.failed[0]?.outcome ?? 'retry' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    log.warn('push send failed', { category: payload.category, error: message });
    await admin
      .from('push_deliveries')
      .update({ status: 'failed', error: message.slice(0, 200) })
      .eq('user_id', target.userId)
      .eq('dedupe_key', payload.dedupeKey);
    return { status: 'failed', error: message };
  }
}

export function categoryEnabled(
  prefs: NotificationPreferences,
  category: NotificationCategory,
): boolean {
  return prefs.categories[category] !== false;
}
