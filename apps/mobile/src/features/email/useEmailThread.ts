import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@da/api-client';
import type { ConnectedAccount, EmailDetailResponse, SourceRef } from '@da/domain';
import { useDataSource } from '@/hooks/useDataSource';

export type MailProvider = 'gmail' | 'outlook';

export function providerForAccount(account: ConnectedAccount | undefined): MailProvider {
  return account?.provider === 'microsoft' ? 'outlook' : 'gmail';
}

export function providerLabel(provider: MailProvider): string {
  return provider === 'gmail' ? 'Gmail' : 'Outlook';
}

/** The SourceRef of a thread: the related insight's when present, else built from the thread itself. */
export function threadSourceRef(detail: EmailDetailResponse, provider: MailProvider): SourceRef {
  if (detail.relatedInsight?.source) return detail.relatedInsight.source;
  const other = detail.thread.participants[0];
  return {
    type: provider,
    id: detail.thread.id,
    externalId: detail.thread.externalThreadId,
    label: providerLabel(provider),
    person: other?.name ?? other?.email,
    timestamp: detail.thread.lastMessageAt,
    excerpt: detail.thread.snippet.slice(0, 200),
  };
}

/** Thread detail + connected accounts (provider, calendar target) + mark-as-read on first open. */
export function useEmailThread(threadId: string | undefined) {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: qk.thread(threadId ?? ''),
    queryFn: () => ds.email.getThread(threadId ?? ''),
    enabled: Boolean(threadId),
  });
  const accounts = useQuery({
    queryKey: qk.accounts,
    queryFn: () => ds.accounts.listAccounts(),
    staleTime: 5 * 60_000,
  });

  const account = useMemo(
    () => accounts.data?.find((a) => a.id === query.data?.thread.accountId),
    [accounts.data, query.data],
  );
  const provider = providerForAccount(account);

  const markRead = useMutation({
    mutationFn: (id: string) => ds.email.markRead(id, true),
    onSuccess: async (_, id) => {
      queryClient.setQueryData<EmailDetailResponse>(qk.thread(id), (prev) =>
        prev ? { ...prev, thread: { ...prev.thread, isRead: true } } : prev,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['flow'] }),
        queryClient.invalidateQueries({ queryKey: qk.mailIntelligence }),
      ]);
    },
  });

  const marked = useRef<string | null>(null);
  useEffect(() => {
    const detail = query.data;
    if (!detail || detail.thread.isRead || marked.current === detail.thread.id) return;
    marked.current = detail.thread.id;
    markRead.mutate(detail.thread.id);
  }, [query.data, markRead]);

  return {
    ...query,
    detail: query.data,
    provider,
    account,
    accountsLoading: accounts.isLoading,
  };
}
