/**
 * Keeps the home/lock-screen widgets in sync with Today (called once in RootNavigator).
 *  - Observes the shared Today query (same key as the Today screen; no extra fetching beyond the
 *    query client's own staleTime / focus refetch) and pushes a snapshot whenever its data changes.
 *  - Re-syncs from the cached feed when the app returns to the foreground.
 *  - Pushes the signed-out snapshot and stops background sync on sign-out; registers it on sign-in.
 *  - Re-renders when lock-screen privacy changes (counts only in `generic`).
 * Every widget call is guarded inside the service — nothing here can crash in Expo Go or tests.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@da/api-client';
import { useDataSource } from '@/hooks/useDataSource';
import { useSessionStore } from '@/store/session';
import { captureError } from '@/lib/monitoring';
import { registerBackgroundSync, unregisterBackgroundSync } from '@/services/background';
import {
  syncWidgetsFromCache,
  syncWidgetsFromToday,
  syncWidgetsSignedOut,
} from '@/services/widgets';

export function useWidgetSync(): void {
  const ds = useDataSource();
  const status = useSessionStore((s) => s.status);
  const signedIn = status === 'signedIn';

  const today = useQuery({
    queryKey: qk.today(),
    queryFn: () => ds.feed.getToday(),
    enabled: signedIn,
    notifyOnChangeProps: ['data'],
  });
  const prefs = useQuery({
    queryKey: qk.notificationPreferences,
    queryFn: () => ds.profile.getNotificationPreferences(),
    enabled: signedIn,
    staleTime: 5 * 60_000,
    notifyOnChangeProps: ['data'],
  });
  const privacy = prefs.data?.lockScreenPrivacy;

  useEffect(() => {
    if (!signedIn || !today.data) return;
    syncWidgetsFromToday(today.data, true, privacy ? { privacy } : {}).catch((e: unknown) =>
      captureError(e, { where: 'useWidgetSync.today' }),
    );
  }, [today.data, signedIn, privacy]);

  const previousStatus = useRef(status);
  useEffect(() => {
    if (status === 'signedIn') void registerBackgroundSync();
    if (previousStatus.current === 'signedIn' && status === 'signedOut') {
      syncWidgetsSignedOut().catch((e: unknown) =>
        captureError(e, { where: 'useWidgetSync.signedOut' }),
      );
      void unregisterBackgroundSync();
    }
    previousStatus.current = status;
  }, [status]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      syncWidgetsFromCache(useSessionStore.getState().status === 'signedIn').catch((e: unknown) =>
        captureError(e, { where: 'useWidgetSync.foreground' }),
      );
    });
    return () => sub.remove();
  }, []);
}
