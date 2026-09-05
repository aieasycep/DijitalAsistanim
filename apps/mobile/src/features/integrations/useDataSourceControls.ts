/**
 * Per-account `DataSourceControls` toggles → `ds.accounts.updateControls`, optimistic in the accounts
 * cache and rolled back (with a toast) when the server rejects the change.
 */
import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { ConnectedAccount, DataSourceControls } from '@da/domain';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { isLiveAccount } from './scopes';

export interface ControlChange {
  accountId: string;
  key: keyof DataSourceControls;
  value: boolean;
}

function applyChange(
  accounts: ConnectedAccount[] | undefined,
  change: ControlChange,
): ConnectedAccount[] {
  return (accounts ?? []).map((a) =>
    a.id === change.accountId
      ? { ...a, controls: { ...a.controls, [change.key]: change.value } }
      : a,
  );
}

export function useDataSourceControls() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const [pending, setPending] = useState<string | null>(null);

  const query = useQuery({ queryKey: qk.accounts, queryFn: () => ds.accounts.listAccounts() });
  const accounts = useMemo(() => (query.data ?? []).filter(isLiveAccount), [query.data]);

  const mutation = useMutation({
    mutationFn: (change: ControlChange) =>
      ds.accounts.updateControls(change.accountId, { [change.key]: change.value }),
    onMutate: async (change) => {
      setPending(`${change.accountId}:${change.key}`);
      await queryClient.cancelQueries({ queryKey: qk.accounts });
      const previous = queryClient.getQueryData<ConnectedAccount[]>(qk.accounts);
      queryClient.setQueryData<ConnectedAccount[]>(qk.accounts, (old) => applyChange(old, change));
      return { previous };
    },
    onError: (e, _change, context) => {
      if (context?.previous) queryClient.setQueryData(qk.accounts, context.previous);
      const copy = describeError(e, t);
      toast.show({
        message: copy.recovery === 'none' ? copy.title : t('settings.dataSourceScreen.saveFailed'),
        icon: 'conflict',
        iconTone: 'critical',
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<ConnectedAccount[]>(qk.accounts, (old) =>
        (old ?? []).map((a) => (a.id === updated.id ? updated : a)),
      );
    },
    onSettled: async () => {
      setPending(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.accounts }),
        queryClient.invalidateQueries({ queryKey: ['today'] }),
      ]);
    },
  });

  const { mutate } = mutation;
  const setControl = useCallback(
    (accountId: string, key: keyof DataSourceControls, value: boolean) =>
      mutate({ accountId, key, value }),
    [mutate],
  );

  return { query, accounts, pending, setControl, isSaving: mutation.isPending };
}
