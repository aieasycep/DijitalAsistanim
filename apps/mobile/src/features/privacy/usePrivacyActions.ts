/**
 * Destructive privacy actions and the audit trail:
 *  - deleteHistory → `ds.privacy.deleteHistory`, then every cached query is invalidated;
 *  - deleteAccount → this device's push token is detached first (it needs the live session), then
 *    `ds.privacy.deleteAccount({ confirmation })`, then the shared sign-out hygiene (`clearLocalSession`:
 *    store, query cache, offline queue, notifications, store identity, encrypted cache) so the root
 *    navigator lands on Welcome with nothing of the deleted account left on the device;
 *  - audit logs → `ds.privacy.listAuditLogs` (never contains message bodies).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { clearLocalSession, detachDeviceFromAccount } from '@/lib/sessionHygiene';

export type DeleteConfirmation = 'SİL' | 'DELETE';

const AUDIT_LIMIT = 20;

export function useAuditLogs() {
  const ds = useDataSource();
  return useQuery({
    queryKey: qk.auditLogs,
    queryFn: () => ds.privacy.listAuditLogs({ limit: AUDIT_LIMIT }),
    staleTime: 30_000,
  });
}

export function useDeleteHistory() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: () => ds.privacy.deleteHistory(),
    onSuccess: async (counts) => {
      await queryClient.invalidateQueries();
      const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
      toast.show({
        message:
          total > 0
            ? `${t('settings.privacyScreen.deleteHistoryDone')} · ${t('settings.privacyScreen.deleteHistoryCount', { count: total })}`
            : t('settings.privacyScreen.deleteHistoryDone'),
        icon: 'check',
      });
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
  });
}

export function useDeleteAccount() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (confirmation: DeleteConfirmation) => {
      // The push token can only be detached while the account (and its session) still exists.
      await detachDeviceFromAccount(ds);
      await ds.privacy.deleteAccount({ confirmation });
    },
    onSuccess: async () => {
      toast.show({ message: t('settings.privacyScreen.deleteAccountDone'), icon: 'check' });
      await clearLocalSession(ds, queryClient);
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
  });
}
