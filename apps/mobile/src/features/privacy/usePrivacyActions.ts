/**
 * Destructive privacy actions and the audit trail:
 *  - deleteHistory → `ds.privacy.deleteHistory`, then every cached query is invalidated;
 *  - deleteAccount → `ds.privacy.deleteAccount({ confirmation })`, then local state is wiped
 *    (`ds.clearLocalState()`, query cache, analytics) and the session store reset so the root
 *    navigator lands on Welcome;
 *  - audit logs → `ds.privacy.listAuditLogs` (never contains message bodies).
 */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { resetAnalytics } from '@/lib/analytics';
import { describeError } from '@/lib/errors';
import { captureError } from '@/lib/monitoring';
import { useSessionStore } from '@/store/session';

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

  const wipeLocal = useCallback(async () => {
    try {
      await ds.clearLocalState();
    } catch (e) {
      captureError(e, { where: 'useDeleteAccount.clearLocalState' });
    }
    queryClient.clear();
    resetAnalytics();
    useSessionStore.getState().reset();
  }, [ds, queryClient]);

  return useMutation({
    mutationFn: (confirmation: DeleteConfirmation) => ds.privacy.deleteAccount({ confirmation }),
    onSuccess: async () => {
      toast.show({ message: t('settings.privacyScreen.deleteAccountDone'), icon: 'check' });
      await wipeLocal();
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
  });
}
