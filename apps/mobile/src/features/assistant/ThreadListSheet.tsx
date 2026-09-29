import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import { formatRelativeLabel } from '@da/i18n';
import {
  BottomSheet,
  EmptyState,
  IconButton,
  ListGroup,
  ListRow,
  Skeleton,
  useTheme,
  useToast,
} from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { useFormatCtx } from '../flow/useFormatCtx';

export interface ThreadListSheetProps {
  visible: boolean;
  activeThreadId: string | null;
  onClose: () => void;
  onSelect: (threadId: string) => void;
  onNew: () => void;
}

/** "SON SOHBETLER" as a sheet: pick a thread, delete one, or start a new chat. */
export function ThreadListSheet({
  visible,
  activeThreadId,
  onClose,
  onSelect,
  onNew,
}: ThreadListSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const ds = useDataSource();
  const ctx = useFormatCtx();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: qk.assistantThreads,
    queryFn: () => ds.assistant.listThreads(),
    enabled: visible,
  });

  const remove = useMutation({
    mutationFn: (id: string) => ds.assistant.deleteThread(id),
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({ queryKey: qk.assistantThreads });
      if (id === activeThreadId) onNew();
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
  });

  const threads = query.data ?? [];

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('assistant.threads')}
      closeLabel={t('common.close')}
      testID="assistant-thread-sheet"
    >
      <ListGroup
        padding={{ vertical: 0, horizontal: 0 }}
        style={{ shadowOpacity: 0, elevation: 0 }}
      >
        <ListRow
          icon="add"
          iconColor={theme.colors.primaryText}
          title={t('assistant.newChat')}
          onPress={() => {
            onClose();
            onNew();
          }}
          testID="assistant-new-thread"
        />
        {query.isLoading ? (
          <Skeleton height={50} radius={theme.radius.sm} />
        ) : threads.length === 0 ? (
          <EmptyState icon="ai" title={t('assistant.noThreads')} compact />
        ) : (
          threads.map((thread, i) => (
            <ListRow
              key={thread.id}
              title={thread.title}
              meta={formatRelativeLabel(thread.lastMessageAt, ctx)}
              trailing={
                <IconButton
                  icon="delete"
                  variant="plain"
                  size={36}
                  iconSize={18}
                  color={theme.colors.inkTertiary}
                  accessibilityLabel={t('common.delete')}
                  onPress={() => remove.mutate(thread.id)}
                  disabled={remove.isPending}
                  testID={`assistant-thread-delete-${i}`}
                />
              }
              onPress={() => {
                onClose();
                onSelect(thread.id);
              }}
              accessibilityLabel={`${thread.title}${thread.id === activeThreadId ? ` · ${t('common.now')}` : ''}`}
              testID={`assistant-thread-${i}`}
            />
          ))
        )}
      </ListGroup>
    </BottomSheet>
  );
}
