import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@da/api-client';
import type {
  AndroidNotificationItem,
  AndroidNotificationScope,
  UserPreferences,
} from '@da/domain';
import type { InstalledApp } from '../../modules/notification-listener';
import { CacheKeys, writeCache } from '@/lib/storage';
import { androidNotifications, type IngestItem } from '@/services/androidNotifications';
import { useSessionStore } from '@/store/session';
import { useDataSource } from './useDataSource';

export interface AndroidNotificationConfig {
  scope: AndroidNotificationScope;
  allowedPackages: string[];
  uploadConsent: boolean;
}

/** Unified row for the settings preview: server rows when consent is on, device-only rows otherwise. */
export interface RecentNotification {
  id: string;
  packageName: string;
  appName: string;
  title: string;
  text: string;
  postedAt: string;
  fingerprint: string;
  origin: 'device' | 'server';
  hasInsight: boolean;
}

export interface UseAndroidNotifications {
  /** `Platform.OS === 'android'` — the feature never appears in the UI elsewhere. */
  supported: boolean;
  permissionGranted: boolean;
  apps: InstalledApp[];
  isLoadingApps: boolean;
  config: AndroidNotificationConfig;
  recent: RecentNotification[];
  isLoadingRecent: boolean;
  isSaving: boolean;
  /** Re-checks the OS toggle and refreshes the app list. Resolves the current permission state. */
  refresh: () => Promise<boolean>;
  /** Opens the system "Notification access" screen. */
  openSettings: () => Promise<boolean>;
  setScope: (scope: AndroidNotificationScope) => Promise<void>;
  setAllowedPackages: (packages: readonly string[]) => Promise<void>;
  toggleApp: (packageName: string) => Promise<void>;
  setUploadConsent: (consent: boolean) => Promise<void>;
  clearRecent: () => Promise<void>;
}

type PreferencePatch = Partial<Omit<UserPreferences, 'userId' | 'createdAt' | 'updatedAt'>>;

const APPS_KEY = [...qk.androidNotifications, 'apps'] as const;
const EMPTY_APPS: InstalledApp[] = [];
const EMPTY_RECENT: RecentNotification[] = [];

function fromServer(item: AndroidNotificationItem): RecentNotification {
  return {
    id: item.id,
    packageName: item.packageName,
    appName: item.appName,
    title: item.title,
    text: item.text,
    postedAt: item.postedAt,
    fingerprint: item.fingerprint,
    origin: 'server',
    hasInsight: Boolean(item.insightId),
  };
}

function fromDevice(item: IngestItem): RecentNotification {
  return { ...item, id: item.fingerprint, origin: 'device', hasInsight: false };
}

/**
 * Drives the "Telefon Bildirimleri" settings screen: permission explainer, scope, app allow-list, upload
 * consent and the recent-notifications preview. Preferences are persisted through
 * `profile.updatePreferences` and mirrored to the native filter.
 */
export function useAndroidNotifications(): UseAndroidNotifications {
  const supported = Platform.OS === 'android' && androidNotifications.isSupported;
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const preferences = useSessionStore((s) => s.preferences);
  const setPreferences = useSessionStore((s) => s.setPreferences);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(() =>
    supported ? androidNotifications.isPermissionGranted() : false,
  );

  const config = useMemo<AndroidNotificationConfig>(
    () => ({
      scope: preferences?.androidNotificationScope ?? 'all_allowed',
      allowedPackages: preferences?.androidAllowedPackages ?? [],
      uploadConsent: preferences?.androidNotificationUploadConsent ?? false,
    }),
    [preferences],
  );

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    const granted = await androidNotifications.refreshPermission();
    setPermissionGranted(granted);
    await queryClient.invalidateQueries({ queryKey: APPS_KEY });
    return granted;
  }, [queryClient, supported]);

  useEffect(() => {
    if (!supported) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh, supported]);

  const appsQuery = useQuery({
    queryKey: APPS_KEY,
    queryFn: () => androidNotifications.installedApps(),
    enabled: supported,
    staleTime: 5 * 60_000,
  });

  const recentQuery = useQuery({
    queryKey: [...qk.androidNotifications, 'recent', config.uploadConsent ? 'server' : 'device'],
    queryFn: async (): Promise<RecentNotification[]> =>
      config.uploadConsent
        ? (await ds.androidNotifications.listRecent({ limit: 50 })).map(fromServer)
        : androidNotifications.listLocal().map(fromDevice),
    enabled: supported,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: PreferencePatch) => ds.profile.updatePreferences(patch),
    onSuccess: async (updated) => {
      setPreferences(updated);
      writeCache(CacheKeys.preferences, updated);
      await androidNotifications.applyPreferences(updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.preferences }),
        queryClient.invalidateQueries({ queryKey: qk.androidNotifications }),
      ]);
    },
  });
  const { mutateAsync } = mutation;

  const save = useCallback(
    async (patch: PreferencePatch): Promise<void> => {
      if (!supported) return;
      await mutateAsync(patch);
    },
    [mutateAsync, supported],
  );

  const setScope = useCallback(
    (scope: AndroidNotificationScope) => save({ androidNotificationScope: scope }),
    [save],
  );

  const setAllowedPackages = useCallback(
    (packages: readonly string[]) =>
      save({ androidAllowedPackages: [...new Set(packages.map((p) => p.trim()).filter(Boolean))] }),
    [save],
  );

  const toggleApp = useCallback(
    (packageName: string) => {
      const current = config.allowedPackages;
      const next = current.includes(packageName)
        ? current.filter((p) => p !== packageName)
        : [...current, packageName];
      return setAllowedPackages(next);
    },
    [config.allowedPackages, setAllowedPackages],
  );

  const setUploadConsent = useCallback(
    (consent: boolean) => save({ androidNotificationUploadConsent: consent }),
    [save],
  );

  const openSettings = useCallback(() => androidNotifications.openSettings(), []);

  const clearRecent = useCallback(async (): Promise<void> => {
    if (!supported) return;
    androidNotifications.clearLocal();
    if (config.uploadConsent) await ds.androidNotifications.clearAll();
    await queryClient.invalidateQueries({ queryKey: qk.androidNotifications });
  }, [config.uploadConsent, ds, queryClient, supported]);

  return {
    supported,
    permissionGranted,
    apps: appsQuery.data ?? EMPTY_APPS,
    isLoadingApps: appsQuery.isLoading,
    config,
    recent: recentQuery.data ?? EMPTY_RECENT,
    isLoadingRecent: recentQuery.isLoading,
    isSaving: mutation.isPending,
    refresh,
    openSettings,
    setScope,
    setAllowedPackages,
    toggleApp,
    setUploadConsent,
    clearRecent,
  };
}
