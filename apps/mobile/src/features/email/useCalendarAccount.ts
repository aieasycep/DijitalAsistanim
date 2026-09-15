import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@da/api-client';
import type { ConnectedAccount } from '@da/domain';
import { useDataSource } from '@/hooks/useDataSource';

const ACCOUNTS_STALE_MS = 5 * 60_000;

/** The calendar an approval should target: the first active calendar account, else any calendar account. */
export function pickCalendarAccount(accounts: ConnectedAccount[]): ConnectedAccount | undefined {
  return (
    accounts.find((a) => a.kinds.includes('calendar') && a.status === 'active') ??
    accounts.find((a) => a.kinds.includes('calendar'))
  );
}

/**
 * Resolves the calendar account at action time (awaiting the accounts query when it has not loaded
 * yet) so a fast tap never hits "no calendar" just because the list was still in flight.
 */
export function useResolveCalendarAccount() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  return useCallback(async (): Promise<ConnectedAccount | undefined> => {
    const accounts = await queryClient.ensureQueryData({
      queryKey: qk.accounts,
      queryFn: () => ds.accounts.listAccounts(),
      staleTime: ACCOUNTS_STALE_MS,
    });
    return pickCalendarAccount(accounts);
  }, [ds, queryClient]);
}
