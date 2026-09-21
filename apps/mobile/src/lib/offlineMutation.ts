/**
 * Online-first write with an offline fallback.
 *
 * `runOrQueue` tries the real data-source call. When the device is offline (TanStack's `onlineManager`, fed by
 * NetInfo in `setupQueryClientListeners`) or the call fails with the `offline` error code, the intent is
 * persisted in the offline queue instead and replayed by `startOfflineQueue` as soon as connectivity returns.
 * Callers keep their optimistic UI and show `queuedToast` so the user knows the change lands later. Any other
 * failure is rethrown untouched so the usual error copy applies.
 */
import { onlineManager } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import type { DataSource } from '@da/api-client';
import type { ToastOptions } from '@da/ui';
import {
  applyMutation,
  enqueue,
  isOfflineError,
  type OfflineMutation,
  type OfflineQueueEntry,
} from './offlineQueue';

export type MutationOutcome<T> =
  { queued: false; value: T } | { queued: true; entry: OfflineQueueEntry };

/** Offline as far as TanStack Query knows (NetInfo → `onlineManager`). */
export function isDeviceOffline(): boolean {
  return !onlineManager.isOnline();
}

/**
 * Runs `run` (or the queue's own `applyMutation` mapping when omitted) and resolves with its value; offline,
 * the mutation is queued and `{ queued: true }` is returned instead of throwing.
 */
export function runOrQueue(
  ds: DataSource,
  mutation: OfflineMutation,
): Promise<MutationOutcome<void>>;
export function runOrQueue<T>(
  ds: DataSource,
  mutation: OfflineMutation,
  run: () => Promise<T>,
): Promise<MutationOutcome<T>>;
export async function runOrQueue<T>(
  ds: DataSource,
  mutation: OfflineMutation,
  run?: () => Promise<T>,
): Promise<MutationOutcome<T | void>> {
  if (isDeviceOffline()) return { queued: true, entry: enqueue(mutation) };
  try {
    const value = run ? await run() : await applyMutation(ds, mutation);
    return { queued: false, value };
  } catch (e) {
    if (!isOfflineError(e)) throw e;
    return { queued: true, entry: enqueue(mutation) };
  }
}

/** Toast for a write that was queued instead of sent ("Bağlantı gelince gönderilecek."). */
export function queuedToast(t: TFunction): ToastOptions {
  return { message: t('common.queuedOffline'), icon: 'offline' };
}
