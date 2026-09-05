/**
 * notification-listener — JS API over the Android NotificationListenerService module.
 *
 * Android only. On iOS / web (and when the native module is unavailable) every call is a safe
 * no-op that reports `{ supported: false }`, so callers never need platform branches.
 *
 * Privacy contract (enforced natively, see android/…/NotificationFilter.kt):
 *  - OTP / 2FA / credential contents are never emitted.
 *  - Authenticator, password-manager and banking apps are never captured.
 *  - Messaging apps are captured only when explicitly allow-listed.
 *  - Nothing is persisted on disk by the service: accepted items live in a bounded in-memory queue
 *    until JS subscribes with `addNotificationListener`.
 */
import type { EventSubscription } from 'expo-modules-core';
import { NotificationListenerNative } from './src/NotificationListenerModule';
import type {
  CapturedNotification,
  InstalledApp,
  ListenerResult,
  NotificationListenerScope,
  NotificationListenerStatus,
  Unsupported,
} from './src/NotificationListener.types';

export type {
  CapturedNotification,
  InstalledApp,
  ListenerResult,
  NotificationListenerEvents,
  NotificationListenerScope,
  NotificationListenerStatus,
  NotificationSubscription,
  Unsupported,
} from './src/NotificationListener.types';

const UNSUPPORTED: Unsupported = { supported: false };
const SUPPORTED: ListenerResult = { supported: true };
const NOOP_SUBSCRIPTION: EventSubscription = { remove: () => undefined };

const native = NotificationListenerNative;

function safeBoolean(read: () => boolean): boolean {
  try {
    return read();
  } catch {
    return false;
  }
}

function normalizePackages(packages: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of packages) {
    const value = raw.trim();
    if (value.length > 0) seen.add(value);
  }
  return [...seen];
}

/** `true` only on Android with the native module linked. */
export function isSupported(): boolean {
  return native !== null;
}

export function getStatus(): NotificationListenerStatus {
  if (!native) return UNSUPPORTED;
  const module = native;
  return {
    supported: true,
    permissionGranted: safeBoolean(() => module.isPermissionGranted()),
    started: safeBoolean(() => module.isStarted()),
  };
}

/** Whether the OS "Notification access" toggle is on for this app. Always `false` off Android. */
export function isPermissionGranted(): boolean {
  if (!native) return false;
  const module = native;
  return safeBoolean(() => module.isPermissionGranted());
}

/** Opens the system notification-access screen (detail page on Android 11+). */
export async function openPermissionSettings(): Promise<ListenerResult<{ opened: boolean }>> {
  if (!native) return UNSUPPORTED;
  return { supported: true, opened: await native.openPermissionSettings() };
}

/** Launchable apps (MAIN/LAUNCHER) with their exclusion flags, sorted by label. */
export async function getInstalledApps(): Promise<ListenerResult<{ apps: InstalledApp[] }>> {
  if (!native) return UNSUPPORTED;
  return { supported: true, apps: await native.getInstalledApps() };
}

/** Persists the allow-list natively (configuration only — never notification content). */
export async function setAllowedPackages(packages: readonly string[]): Promise<ListenerResult> {
  if (!native) return UNSUPPORTED;
  await native.setAllowedPackages(normalizePackages(packages));
  return SUPPORTED;
}

export async function setScope(scope: NotificationListenerScope): Promise<ListenerResult> {
  if (!native) return UNSUPPORTED;
  await native.setScope(scope);
  return SUPPORTED;
}

/**
 * Enables capture. Safe to call before the permission is granted: the service starts delivering as
 * soon as the user switches notification access on.
 */
export async function start(): Promise<ListenerResult<{ permissionGranted: boolean }>> {
  if (!native) return UNSUPPORTED;
  return { supported: true, permissionGranted: await native.start() };
}

/** Disables capture and drops anything queued in memory. */
export async function stop(): Promise<ListenerResult> {
  if (!native) return UNSUPPORTED;
  await native.stop();
  return SUPPORTED;
}

/** Subscribes to accepted notifications. Queued items are delivered as soon as the first listener attaches. */
export function addNotificationListener(
  listener: (item: CapturedNotification) => void,
): EventSubscription {
  if (!native) return NOOP_SUBSCRIPTION;
  return native.addListener('notificationPosted', listener);
}
