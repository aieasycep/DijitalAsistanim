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

export type PreferencesPatch = Partial<Omit<UserPreferences, 'userId' | 'createdAt' | 'updatedAt'>>;

export function applyPreferencesPatch(
  prev: UserPreferences,
  patch: PreferencesPatch,
): UserPreferences {
  return { ...prev, ...patch, briefing: { ...prev.briefing, ...(patch.briefing ?? {}) } };
}

export interface UsePreferencesResult {
  /** Session-store copy (optimistically updated) with the query as fallback. */
  preferences: UserPreferences | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  isRefetching: boolean;
  /** Optimistic update: the theme / locale / briefing change applies immediately, reverts on error. */
  update: (patch: PreferencesPatch) => Promise<UserPreferences | undefined>;
  isSaving: boolean;
}

/**
 * Single source of truth for `UserPreferences` on the settings screens: reads through TanStack Query,
 * mirrors into the session store (so ThemeProvider / i18n react instantly) and the encrypted cache.
 */
export function usePreferences(): UsePreferencesResult {
  const ds = useDataSource();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const stored = useSessionStore((s) => s.preferences);
  const status = useSessionStore((s) => s.status);
  const setPreferences = useSessionStore((s) => s.setPreferences);

  const query = useQuery({
    queryKey: qk.preferences,
    queryFn: async () => {
      const prefs = await ds.profile.getPreferences();
      // A sign-out can race an in-flight fetch: never repopulate a signed-out store.
      if (useSessionStore.getState().status === 'signedIn') {
        setPreferences(prefs);
        writeCache(CacheKeys.preferences, prefs);
      }
      return prefs;
    },
    initialData: stored ?? undefined,
    enabled: status === 'signedIn',
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: PreferencesPatch) => ds.profile.updatePreferences(patch),
    onMutate: (patch) => {
      const prev = useSessionStore.getState().preferences;
      if (prev) setPreferences(applyPreferencesPatch(prev, patch));
      return { prev };
    },
    onSuccess: (updated) => {
      setPreferences(updated);
      writeCache(CacheKeys.preferences, updated);
      qc.setQueryData(qk.preferences, updated);
    },
    onError: (e, _patch, ctx) => {
      if (ctx?.prev) setPreferences(ctx.prev);
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' });
    },
  });
  const { mutateAsync } = mutation;

  const update = useCallback(
    (patch: PreferencesPatch) => mutateAsync(patch).catch(() => undefined),
    [mutateAsync],
  );

  return {
    preferences: stored ?? query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError && !stored,
    error: query.error,
    refetch: () => void query.refetch(),
    isRefetching: query.isRefetching,
    update,
    isSaving: mutation.isPending,
  };
}
