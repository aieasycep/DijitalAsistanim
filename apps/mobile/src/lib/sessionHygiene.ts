/**
 * Everything that must happen when a user leaves this device — explicit sign-out, account deletion, or the
 * auth layer reporting the session gone — lives here so the three paths can never drift apart.
 *
 *  1. `detachDeviceFromAccount(ds)` needs the live session: it unregisters this device's push token. Call it
 *     BEFORE `auth.signOut()` / `privacy.deleteAccount()`.
 *  2. `clearLocalSession(ds, qc)` runs once the session is gone: in-memory store + query cache first (so the
 *     root navigator redirects immediately), then every per-user device state — offline write queue, local
 *     notifications, store identity (RevenueCat), Android capture, adapter caches, the encrypted MMKV cache and
 *     session secrets. Each step is isolated: one failure is reported and never blocks the rest, and concurrent
 *     callers (the auth listener and the screen that triggered the sign-out) share a single run.
 */
import { Platform } from 'react-native';
import type { QueryClient } from '@tanstack/react-query';
import type { DataSource } from '@da/api-client';
import { androidNotifications } from '@/services/androidNotifications';
import {
  cacheNotificationPreferences,
  cancelAllLocalNotifications,
  unregisterPushToken,
} from '@/services/notifications';
import { resetPurchasesUser } from '@/services/purchases';
import { useSessionStore } from '@/store/session';
import { resetAnalytics } from './analytics';
import { captureError, setMonitoringUser } from './monitoring';
import { clear as clearOfflineQueue } from './offlineQueue';
import { wipeLocalData } from './storage';

async function step(name: string, run: () => void | Promise<void>): Promise<void> {
  try {
    await run();
  } catch (e) {
    captureError(e, { where: `sessionHygiene.${name}` });
  }
}

/** Detaches this device from the account (push token). Requires a valid session — call before signing out. */
export async function detachDeviceFromAccount(ds: DataSource): Promise<void> {
  await step('unregisterPushToken', () => unregisterPushToken(ds));
}

let inFlight: Promise<void> | null = null;

async function runClearLocalSession(ds: DataSource, qc: QueryClient): Promise<void> {
  // Synchronous part first: the navigator lands on Welcome and no query can repopulate the store.
  useSessionStore.getState().reset();
  qc.clear();
  await step('resetAnalytics', resetAnalytics);
  await step('setMonitoringUser', () => setMonitoringUser(null));
  // Queued writes belong to the user who left; they must never replay under the next session.
  await step('clearOfflineQueue', clearOfflineQueue);
  await step('cancelAllLocalNotifications', cancelAllLocalNotifications);
  await step('resetPurchasesUser', resetPurchasesUser);
  if (Platform.OS === 'android')
    await step('androidNotifications.reset', () => androidNotifications.reset());
  await step('clearLocalState', () => ds.clearLocalState());
  await step('cacheNotificationPreferences', () => cacheNotificationPreferences(null));
  await step('wipeLocalData', wipeLocalData);
}

/** Drops every local trace of the signed-out user. Idempotent; concurrent calls share one run. */
export function clearLocalSession(ds: DataSource, qc: QueryClient): Promise<void> {
  if (inFlight) return inFlight;
  const run = runClearLocalSession(ds, qc).finally(() => {
    inFlight = null;
  });
  inFlight = run;
  return run;
}
