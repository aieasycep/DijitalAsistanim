import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { NotificationPreferences } from '@da/domain';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import {
  cacheNotificationPreferences,
  getCachedNotificationPreferences,
} from '@/services/notifications';
import { useSessionStore } from '@/store/session';

export type NotificationPatch = Partial<
  Omit<NotificationPreferences, 'userId' | 'createdAt' | 'updatedAt'>
>;

export function applyNotificationPatch(
  prev: NotificationPreferences,
  patch: NotificationPatch,
): NotificationPreferences {
  return {
    ...prev,
    ...patch,
    categories: { ...prev.categories, ...(patch.categories ?? {}) },
  };
}

export interface UseNotificationPreferencesResult {
  preferences: NotificationPreferences | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  isRefetching: boolean;
  update: (patch: NotificationPatch) => Promise<NotificationPreferences | undefined>;
  isSaving: boolean;
}

/**
 * Notification preferences with optimistic updates. The cached copy (used by the foreground handler and
 * local scheduling in `services/notifications`) is refreshed on every successful write.
 */
export function useNotificationPreferences(): UseNotificationPreferencesResult {
  const ds = useDataSource();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const status = useSessionStore((s) => s.status);

  const query = useQuery({
    queryKey: qk.notificationPreferences,
    queryFn: async () => {
      const prefs = await ds.profile.getNotificationPreferences();
      if (useSessionStore.getState().status === 'signedIn') cacheNotificationPreferences(prefs);
      return prefs;
    },
    initialData: () => getCachedNotificationPreferences() ?? undefined,
    initialDataUpdatedAt: 0,
    enabled: status === 'signedIn',
  });

  const mutation = useMutation({
    mutationFn: (patch: NotificationPatch) => ds.profile.updateNotificationPreferences(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.notificationPreferences });
      const prev = qc.getQueryData<NotificationPreferences>(qk.notificationPreferences);
      if (prev) qc.setQueryData(qk.notificationPreferences, applyNotificationPatch(prev, patch));
      return { prev };
    },
    onSuccess: (updated) => {
      qc.setQueryData(qk.notificationPreferences, updated);
      cacheNotificationPreferences(updated);
    },
    onError: (e, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.notificationPreferences, ctx.prev);
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' });
    },
  });
  const { mutateAsync } = mutation;

  const update = useCallback(
    (patch: NotificationPatch) => mutateAsync(patch).catch(() => undefined),
    [mutateAsync],
  );

  return {
    preferences: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError && !query.data,
    error: query.error,
    refetch: () => void query.refetch(),
    isRefetching: query.isRefetching,
    update,
    isSaving: mutation.isPending,
  };
}
