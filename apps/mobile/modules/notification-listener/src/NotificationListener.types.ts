import type { EventSubscription } from 'expo-modules-core';

/** Mirrors `AndroidNotificationScope` in @da/domain (kept local so the module has no workspace dependency). */
export type NotificationListenerScope = 'all_allowed' | 'selected';

/**
 * A notification accepted by the on-device filter. OTP / 2FA codes, credentials, authenticator,
 * password-manager and banking apps never reach JS, and nothing is written to disk natively.
 */
export interface CapturedNotification {
  packageName: string;
  appName: string;
  title: string;
  text: string;
  /** ISO-8601 UTC, second precision. */
  postedAt: string;
  /** SHA-256 hex of `package|title|text|minuteBucket`. */
  fingerprint: string;
}

export interface InstalledApp {
  packageName: string;
  appName: string;
  /** Authenticator / password manager / banking app: can never be enabled by the user. */
  isDefaultExcluded: boolean;
  /** SMS / instant messaging app: captured only when explicitly allowed. */
  isMessaging: boolean;
}

export interface Unsupported {
  supported: false;
}

/** Every API returns `{ supported: false }` on iOS / web (or when the native module is missing). */
export type ListenerResult<T extends object = Record<never, never>> =
  Unsupported | ({ supported: true } & T);

export type NotificationListenerStatus = ListenerResult<{
  permissionGranted: boolean;
  started: boolean;
}>;

export type NotificationListenerEvents = {
  notificationPosted: (item: CapturedNotification) => void;
};

export type NotificationSubscription = EventSubscription;
