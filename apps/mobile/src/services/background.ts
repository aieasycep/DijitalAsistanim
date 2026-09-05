/**
 * Periodic background refresh (expo-background-task + expo-task-manager).
 *
 * What it does: when a session exists, fetch Today, refresh the query cache + offline snapshot, and
 * re-render the widgets. Best effort by design:
 *  - iOS: BGTaskScheduler decides *if* and *when* the task runs (typically during charging/idle windows,
 *    often hours apart; `minimumInterval` is only a lower bound). The identifier must be listed under
 *    `BGTaskSchedulerPermittedIdentifiers` (`<bundleId>.sync`, handled by the expo-background-task plugin).
 *  - Android: WorkManager honours Doze/App Standby; the interval is inexact (≥ 15 min).
 * Freshness therefore primarily comes from server push and from foreground syncs; this task only keeps
 * widgets and the offline snapshot from going stale overnight.
 *
 * `defineTask` must run at module scope on app start — this module is imported by `useWidgetSync`.
 */
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { qk, type DataSource } from '@da/api-client';
import { getDataSource } from '@/lib/datasource';
import { queryClient } from '@/lib/queryClient';
import { captureError } from '@/lib/monitoring';
import { CacheKeys, writeCache } from '@/lib/storage';
import { syncWidgetsFromToday } from './widgets';

export const BACKGROUND_SYNC_TASK = 'da-background-sync';
/** Minutes; the OS treats it as a minimum, not a schedule. */
export const BACKGROUND_SYNC_MIN_INTERVAL_MINUTES = 60;

export type BackgroundSyncOutcome = 'synced' | 'skipped' | 'failed';

/** The task body — exported so it can run from a foreground trigger or a test with a fake data source. */
export async function runBackgroundSync(dataSource?: DataSource): Promise<BackgroundSyncOutcome> {
  try {
    const ds = dataSource ?? getDataSource();
    const session = await ds.auth.getSession();
    if (!session) return 'skipped';
    const today = await ds.feed.getToday();
    queryClient.setQueryData(qk.today(), today);
    writeCache(CacheKeys.todaySnapshot, today);
    await syncWidgetsFromToday(today, true);
    return 'synced';
  } catch (e) {
    captureError(e, { where: 'runBackgroundSync' });
    return 'failed';
  }
}

let defined = false;

function defineBackgroundTask(): void {
  if (defined) return;
  try {
    if (TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK)) {
      defined = true;
      return;
    }
    TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
      const outcome = await runBackgroundSync();
      return outcome === 'failed'
        ? BackgroundTask.BackgroundTaskResult.Failed
        : BackgroundTask.BackgroundTaskResult.Success;
    });
    defined = true;
  } catch {
    // TaskManager unavailable (web / Expo Go without the module) — background sync stays off.
  }
}

defineBackgroundTask();

async function backgroundTasksAvailable(): Promise<boolean> {
  try {
    if (!(await TaskManager.isAvailableAsync())) return false;
    return (
      (await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Available
    );
  } catch {
    return false;
  }
}

export async function isBackgroundSyncRegistered(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
  } catch {
    return false;
  }
}

/** Registers the periodic task once (idempotent). Returns whether it is registered afterwards. */
export async function registerBackgroundSync(): Promise<boolean> {
  defineBackgroundTask();
  if (!defined || !(await backgroundTasksAvailable())) return false;
  try {
    if (await isBackgroundSyncRegistered()) return true;
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: BACKGROUND_SYNC_MIN_INTERVAL_MINUTES,
    });
    return true;
  } catch (e) {
    captureError(e, { where: 'registerBackgroundSync' });
    return false;
  }
}

/** Sign-out: stop waking up for a user that is no longer there. */
export async function unregisterBackgroundSync(): Promise<void> {
  try {
    if (await isBackgroundSyncRegistered())
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
  } catch (e) {
    captureError(e, { where: 'unregisterBackgroundSync' });
  }
}
