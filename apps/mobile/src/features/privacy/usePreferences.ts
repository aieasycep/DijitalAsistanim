/**
 * User preferences (`UserPreferences`) shared by the AI personalisation and privacy screens:
 * TanStack cache seeded from the session store, optimistic `updatePreferences` with rollback, and the
 * session store / encrypted cache kept in sync so the rest of the app (theme, briefing…) sees the change.
 */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { UserPreferences } from '@da/domain';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { CacheKeys, writeCache } from '@/lib/storage';
import { useSessionStore } from '@/store/session';

export type PreferencePatch = Partial<Omit<UserPreferences, 'userId' | 'createdAt' | 'updatedAt'>>;

export function usePreferences() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const stored = useSessionStore((s) => s.preferences);
  const setPreferences = useSessionStore((s) => s.setPreferences);

  const query = useQuery({
    queryKey: qk.preferences,
    queryFn: () => ds.profile.getPreferences(),
    initialData: stored ?? undefined,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: PreferencePatch) => ds.profile.updatePreferences(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: qk.preferences });
      const previous = queryClient.getQueryData<UserPreferences>(qk.preferences);
      if (previous)
        queryClient.setQueryData<UserPreferences>(qk.preferences, { ...previous, ...patch });
      return { previous };
    },
    onError: (e, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(qk.preferences, context.previous);
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.preferences, updated);
      setPreferences(updated);
      try {
        writeCache(CacheKeys.preferences, updated);
      } catch {
        // The encrypted cache is best-effort; the server copy is authoritative.
      }
    },
  });

  const { mutateAsync } = mutation;
  const update = useCallback(
    async (patch: PreferencePatch): Promise<UserPreferences | null> => {
      try {
        return await mutateAsync(patch);
      } catch {
        return null;
      }
    },
    [mutateAsync],
  );

  return {
    preferences: query.data ?? stored ?? null,
    isLoading: query.isLoading && !stored,
    isError: query.isError && !query.data && !stored,
    error: query.error,
    refetch: query.refetch,
    update,
    isSaving: mutation.isPending,
  };
}
