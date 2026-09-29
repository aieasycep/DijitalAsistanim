/**
 * "Verilerimi indir": `requestExport` then `getExportStatus` every 3 s until the archive is ready
 * (or failed / expired). The download link opens in the in-app browser through `openExternal`.
 */
import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { DataExportRequest } from '@da/domain';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { openExternal } from '@/lib/openExternal';

export const EXPORT_POLL_MS = 3000;

export type ExportView = 'idle' | 'preparing' | 'ready' | 'failed' | 'expired';

export function isExportPending(exp: DataExportRequest | null | undefined): boolean {
  return exp?.status === 'requested' || exp?.status === 'processing';
}

export function exportView(exp: DataExportRequest | null | undefined, now: Date): ExportView {
  if (!exp) return 'idle';
  if (isExportPending(exp)) return 'preparing';
  if (exp.status === 'failed') return 'failed';
  if (exp.status === 'expired') return 'expired';
  if (exp.urlExpiresAt && Date.parse(exp.urlExpiresAt) < now.getTime()) return 'expired';
  return exp.downloadUrl ? 'ready' : 'expired';
}

export function useDataExport() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string | null>(null);

  const statusKey = [...qk.exportStatus, activeId ?? 'latest'] as const;
  const status = useQuery({
    queryKey: statusKey,
    queryFn: () => ds.privacy.getExportStatus(activeId ?? undefined),
    refetchInterval: (query) => (isExportPending(query.state.data) ? EXPORT_POLL_MS : false),
  });

  const start = useMutation({
    mutationFn: () => ds.privacy.requestExport(),
    onSuccess: async (request) => {
      queryClient.setQueryData([...qk.exportStatus, request.id], request);
      setActiveId(request.id);
      await queryClient.invalidateQueries({ queryKey: qk.auditLogs });
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
  });

  const download = useCallback(async (): Promise<boolean> => {
    const url = status.data?.downloadUrl;
    if (!url) return false;
    const opened = await openExternal(url);
    if (!opened)
      toast.show({ message: t('errors.invalidUrl'), icon: 'warning', iconTone: 'critical' });
    return opened;
  }, [status.data?.downloadUrl, toast, t]);

  return {
    request: status.data ?? null,
    isLoading: status.isLoading,
    isStarting: start.isPending,
    start: start.mutate,
    download,
    refetch: status.refetch,
  };
}
