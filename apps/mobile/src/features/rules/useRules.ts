/**
 * Explicit priority rules (`ds.rules.*`): ordered list, create/edit, enable toggle, delete and up/down
 * reordering. Toggle and reorder are optimistic with rollback; every write invalidates Today / Flow so the
 * priority engine's new verdicts show up. Rules are internal preferences — no approval step.
 */
import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { PriorityRule, PriorityRuleType } from '@da/domain';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';

export interface RuleInput {
  id?: string;
  type: PriorityRuleType;
  value: string;
  label: string;
  enabled: boolean;
  position?: number;
}

export type RuleBusyAction = 'save' | 'toggle' | 'delete' | 'move';

const RELATED_KEYS = [['today'], ['flow'], ['mailIntelligence']] as const;

function sortByPosition(rules: readonly PriorityRule[]): PriorityRule[] {
  return [...rules].sort((a, b) => a.position - b.position);
}

export function useRules() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const [busy, setBusy] = useState<{ id: string; action: RuleBusyAction } | null>(null);

  const query = useQuery({ queryKey: qk.rules, queryFn: () => ds.rules.listRules() });
  const rules = useMemo(() => sortByPosition(query.data ?? []), [query.data]);

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.rules }),
      ...RELATED_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [...key] })),
    ]);
  }, [queryClient]);

  const onError = useCallback(
    (e: unknown) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
    [toast, t],
  );

  const save = useMutation({
    mutationFn: (input: RuleInput) =>
      ds.rules.upsertRule({
        id: input.id,
        type: input.type,
        value: input.value,
        label: input.label,
        enabled: input.enabled,
        position: input.position ?? rules.length,
      }),
    onMutate: (input) => {
      if (input.id) setBusy({ id: input.id, action: 'save' });
    },
    onSettled: () => setBusy(null),
    onSuccess: async () => {
      await invalidate();
      toast.show({ message: t('settings.rules.saved'), icon: 'check' });
    },
    onError,
  });

  const toggle = useMutation({
    mutationFn: (rule: PriorityRule) =>
      ds.rules.upsertRule({
        id: rule.id,
        type: rule.type,
        value: rule.value,
        label: rule.label,
        enabled: !rule.enabled,
        position: rule.position,
      }),
    onMutate: async (rule) => {
      setBusy({ id: rule.id, action: 'toggle' });
      await queryClient.cancelQueries({ queryKey: qk.rules });
      const previous = queryClient.getQueryData<PriorityRule[]>(qk.rules);
      queryClient.setQueryData<PriorityRule[]>(qk.rules, (old) =>
        (old ?? []).map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)),
      );
      return { previous };
    },
    onError: (e, _rule, context) => {
      if (context?.previous) queryClient.setQueryData(qk.rules, context.previous);
      onError(e);
    },
    onSettled: async () => {
      setBusy(null);
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (rule: PriorityRule) => ds.rules.deleteRule(rule.id),
    onMutate: (rule) => setBusy({ id: rule.id, action: 'delete' }),
    onSettled: () => setBusy(null),
    onSuccess: async () => {
      await invalidate();
      toast.show({ message: t('settings.rules.deleted'), icon: 'check' });
    },
    onError,
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => ds.rules.reorderRules(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: qk.rules });
      const previous = queryClient.getQueryData<PriorityRule[]>(qk.rules);
      queryClient.setQueryData<PriorityRule[]>(qk.rules, (old) =>
        (old ?? []).map((r) => {
          const index = ids.indexOf(r.id);
          return index >= 0 ? { ...r, position: index } : r;
        }),
      );
      return { previous };
    },
    onError: (e, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(qk.rules, context.previous);
      onError(e);
    },
    onSettled: async () => {
      setBusy(null);
      await invalidate();
    },
  });

  /** Moves a rule one step up (-1) or down (+1); no-op at the edges. */
  const move = useCallback(
    (rule: PriorityRule, direction: -1 | 1) => {
      const index = rules.findIndex((r) => r.id === rule.id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= rules.length) return;
      const ids = rules.map((r) => r.id);
      const swapped = ids[target];
      if (swapped === undefined) return;
      ids[target] = rule.id;
      ids[index] = swapped;
      setBusy({ id: rule.id, action: 'move' });
      reorder.mutate(ids);
    },
    [rules, reorder],
  );

  return {
    query,
    rules,
    busy,
    save,
    toggle,
    remove,
    move,
    isReordering: reorder.isPending,
  };
}
