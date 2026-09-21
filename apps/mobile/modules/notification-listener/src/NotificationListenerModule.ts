import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import type {
  InstalledApp,
  NotificationListenerEvents,
  NotificationListenerScope,
} from './NotificationListener.types';

/** Shape of the Kotlin `NotificationListenerModule` (Name("NotificationListener")). */
declare class NativeNotificationListener extends NativeModule<NotificationListenerEvents> {
  isPermissionGranted(): boolean;
  isStarted(): boolean;
  openPermissionSettings(): Promise<boolean>;
  getInstalledApps(): Promise<InstalledApp[]>;
  setAllowedPackages(packages: string[]): Promise<void>;
  setScope(scope: NotificationListenerScope): Promise<void>;
  start(): Promise<boolean>;
  stop(): Promise<void>;
}

export type { NativeNotificationListener };

export const NATIVE_MODULE_NAME = 'NotificationListener';

/** `null` on iOS / web and whenever the native module is not linked (e.g. Expo Go, unit tests). */
export const NotificationListenerNative: NativeNotificationListener | null =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeNotificationListener>(NATIVE_MODULE_NAME)
    : null;
