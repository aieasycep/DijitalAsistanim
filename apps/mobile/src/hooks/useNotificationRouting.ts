/**
 * Notification plumbing for the running app (called once in RootNavigator):
 *  - installs the foreground handler and Android channels,
 *  - keeps a cached copy of NotificationPreferences (shared query key with the settings screen),
 *  - routes notification taps (live + cold start, exactly once) through the deep-link dispatcher,
 *  - keeps the badge equal to the pending-approval count and re-syncs it on foreground,
 *  - (re)registers the push token per signed-in user and cleans up on sign-out.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@da/api-client';
import { useDataSource } from '@/hooks/useDataSource';
import { useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/monitoring';
import { deepLinkKind, openDeepLink, parseDeepLink } from '@/services/deeplinks';
import {
  cacheNotificationPreferences,
  cancelAllLocalNotifications,
  clearBadge,
  configureNotificationHandler,
  readNotificationMeta,
  registerPushToken,
  setupNotificationChannels,
  syncBadgeCount,
} from '@/services/notifications';

let coldStartChecked = false;
const handledResponses = new Set<string>();

function responseKey(response: Notifications.NotificationResponse): string {
  return `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
}

/** Routes a notification response; returns false when it carried no usable deep link. */
export function routeNotificationResponse(response: Notifications.NotificationResponse): boolean {
  const key = responseKey(response);
  if (handledResponses.has(key)) return false;
  handledResponses.add(key);
  if (handledResponses.size > 50) {
    const first = handledResponses.values().next().value;
    if (first !== undefined) handledResponses.delete(first);
  }
  const meta = readNotificationMeta(response.notification.request.content.data);
  if (!meta.deepLink) return false;
  const link = parseDeepLink(meta.deepLink);
  if (!link) return false;
  if (deepLinkKind(link) === 'email' || meta.insightKind) {
    track('insight_opened', {
      kind: meta.insightKind ?? 'email',
      badge: meta.badge ?? meta.category ?? 'unknown',
    });
  }
  openDeepLink(meta.deepLink);
  return true;
}

export function useNotificationRouting(): void {
  const ds = useDataSource();
  const status = useSessionStore((s) => s.status);
  const userId = useSessionStore((s) => s.session?.user.id ?? null);
  const pendingApprovals = useUiStore((s) => s.pendingApprovals);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    configureNotificationHandler();
    void setupNotificationChannels();
  }, []);

  const prefsQuery = useQuery({
    queryKey: qk.notificationPreferences,
    queryFn: () => ds.profile.getNotificationPreferences(),
    enabled: signedIn,
    staleTime: 5 * 60_000,
    notifyOnChangeProps: ['data'],
  });
  useEffect(() => {
    if (prefsQuery.data) cacheNotificationPreferences(prefsQuery.data);
  }, [prefsQuery.data]);

  // Taps: live listener + the response that launched the app (checked once per process).
  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    try {
      subscription =
        Notifications.addNotificationResponseReceivedListener(routeNotificationResponse);
    } catch (e) {
      captureError(e, { where: 'useNotificationRouting.listener' });
    }
    if (!coldStartChecked) {
      coldStartChecked = true;
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (!response) return;
          routeNotificationResponse(response);
          return Notifications.clearLastNotificationResponseAsync();
        })
        .catch((e: unknown) => captureError(e, { where: 'useNotificationRouting.coldStart' }));
    }
    return () => subscription?.remove();
  }, []);

  // Badge = pending approvals; re-synced whenever the count changes or the app returns to the foreground.
  useEffect(() => {
    void syncBadgeCount(signedIn ? pendingApprovals : 0);
  }, [pendingApprovals, signedIn]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const isSignedIn = useSessionStore.getState().status === 'signedIn';
      void syncBadgeCount(isSignedIn ? useUiStore.getState().pendingApprovals : 0);
    });
    return () => sub.remove();
  }, []);

  // Push token per user (skips when unchanged); local notifications and badge are dropped on sign-out.
  useEffect(() => {
    if (!signedIn || !userId) return;
    void registerPushToken(ds, { userId });
  }, [signedIn, userId, ds]);

  const previousStatus = useRef(status);
  useEffect(() => {
    if (previousStatus.current === 'signedIn' && status === 'signedOut') {
      void cancelAllLocalNotifications();
      void clearBadge();
      cacheNotificationPreferences(null);
    }
    previousStatus.current = status;
  }, [status]);
}
