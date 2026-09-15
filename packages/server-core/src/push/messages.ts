/**
 * NotificationPayload → Expo push message. Data carries ids and routes only (never content);
 * time-sensitive categories go out with high priority and a short TTL so a stale meeting alert
 * is dropped rather than delivered late.
 */
import type { NotificationCategory } from '@da/domain';
import type { NotificationPayload } from '../notifications';
import type { ExpoInterruptionLevel, ExpoPushMessage, ExpoPushPriority } from './expo';

/** Seconds a message stays deliverable when the device is offline. */
export const PUSH_TTL_SECONDS: Record<NotificationCategory, number> = {
  meeting: 15 * 60,
  reminder: 30 * 60,
  critical_email: 2 * 60 * 60,
  deadline: 2 * 60 * 60,
  approval: 6 * 60 * 60,
  life_event: 6 * 60 * 60,
  follow_up: 12 * 60 * 60,
  morning: 4 * 60 * 60,
  midday: 4 * 60 * 60,
  evening: 4 * 60 * 60,
  weekly: 24 * 60 * 60,
};

export const HIGH_PRIORITY_PUSH_CATEGORIES: readonly NotificationCategory[] = [
  'critical_email',
  'meeting',
  'deadline',
  'reminder',
  'approval',
];

export interface ToExpoMessageOptions {
  channelId?: string;
  interruptionLevel?: ExpoInterruptionLevel;
  badge?: number;
  collapseId?: string;
  /** Deliver to a notification service extension on iOS (default false — none is bundled). */
  mutableContent?: boolean;
  ttlSeconds?: number;
  sound?: 'default' | null;
}

export function pushPriorityFor(category: NotificationCategory): ExpoPushPriority {
  return HIGH_PRIORITY_PUSH_CATEGORIES.includes(category) ? 'high' : 'normal';
}

/** Build the Expo message for one device token. */
export function toExpoMessage(
  token: string,
  payload: NotificationPayload,
  opts: ToExpoMessageOptions = {},
): ExpoPushMessage {
  const collapseId = opts.collapseId ?? payload.collapseId;
  return {
    to: token,
    title: payload.title,
    body: payload.body,
    data: {
      ...payload.data,
      category: payload.category,
      deepLink: payload.deepLink,
      dedupeKey: payload.dedupeKey,
      collapseId,
      threadId: payload.ios.threadId,
    },
    ttl: opts.ttlSeconds ?? PUSH_TTL_SECONDS[payload.category],
    priority: payload.android.priority === 'high' ? 'high' : pushPriorityFor(payload.category),
    sound: opts.sound === undefined ? 'default' : opts.sound,
    channelId: opts.channelId ?? payload.android.channelId,
    categoryId: payload.category,
    interruptionLevel: opts.interruptionLevel ?? payload.ios.interruptionLevel,
    mutableContent: opts.mutableContent ?? false,
    ...(opts.badge !== undefined ? { badge: Math.max(0, Math.round(opts.badge)) } : {}),
  };
}
