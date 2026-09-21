/**
 * Learned preferences (`ds.rules.*LearnedPreference*`): what the AI inferred over time, grouped for the
 * "Dijital Asistan beni nasıl tanıyor?" screen. Enable/disable is optimistic; delete is permanent and the
 * backend keeps a tombstone so the preference is never re-inferred.
 */
import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { IconName } from '@da/design-tokens';
import type { LearnedPreference, LearnedPreferenceKind } from '@da/domain';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';

export type LearnedGroup = 'people' | 'topics' | 'preferences';

export const LEARNED_GROUPS: readonly LearnedGroup[] = ['people', 'topics', 'preferences'];

export function groupForKind(kind: LearnedPreferenceKind): LearnedGroup {
  switch (kind) {
    case 'person_priority':
      return 'people';
    case 'category_priority':
    case 'dismiss_pattern':
    case 'briefing_focus':
      return 'topics';
    default:
      return 'preferences';
  }
}

export function iconForKind(kind: LearnedPreferenceKind): IconName {
  switch (kind) {
    case 'person_priority':
      return 'person';
    case 'category_priority':
      return 'filter';
    case 'dismiss_pattern':
      return 'thumbDown';
    case 'briefing_focus':
      return 'today';
    case 'reminder_lead_time':
      return 'schedule';
    default:
      return 'followUp';
  }
}

export type GroupedLearned = Record<LearnedGroup, LearnedPreference[]>;

function groupPreferences(list: readonly LearnedPreference[]): GroupedLearned {
  const grouped: GroupedLearned = { people: [], topics: [], preferences: [] };
  for (const pref of list) grouped[groupForKind(pref.kind)].push(pref);
  for (const group of LEARNED_GROUPS)
    grouped[group].sort((a, b) => Date.parse(b.lastReinforcedAt) - Date.parse(a.lastReinforcedAt));
  return grouped;
}

export function useLearnedPreferences() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: qk.learned,
    queryFn: () => ds.rules.listLearnedPreferences(),
  });
  const grouped = useMemo(() => groupPreferences(query.data ?? []), [query.data]);
  const count = query.data?.length ?? 0;

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.learned }),
      queryClient.invalidateQueries({ queryKey: ['today'] }),
      queryClient.invalidateQueries({ queryKey: ['flow'] }),
    ]);
  }, [queryClient]);

  const onError = useCallback(
    (e: unknown) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
    [toast, t],
  );

  const toggle = useMutation({
    mutationFn: (pref: LearnedPreference) =>
      ds.rules.setLearnedPreferenceEnabled(pref.id, !pref.enabled),
    onMutate: async (pref) => {
      setBusyId(pref.id);
      await queryClient.cancelQueries({ queryKey: qk.learned });
      const previous = queryClient.getQueryData<LearnedPreference[]>(qk.learned);
      queryClient.setQueryData<LearnedPreference[]>(qk.learned, (old) =>
        (old ?? []).map((p) => (p.id === pref.id ? { ...p, enabled: !p.enabled } : p)),
      );
      return { previous };
    },
    onError: (e, _pref, context) => {
      if (context?.previous) queryClient.setQueryData(qk.learned, context.previous);
      onError(e);
    },
    onSettled: async () => {
      setBusyId(null);
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (pref: LearnedPreference) => ds.rules.deleteLearnedPreference(pref.id),
    onMutate: (pref) => setBusyId(pref.id),
    onSettled: () => setBusyId(null),
    onSuccess: async () => {
      await invalidate();
      toast.show({ message: t('settings.aiScreen.deleted'), icon: 'check' });
    },
    onError,
  });

  return { query, grouped, count, busyId, toggle, remove };
}
