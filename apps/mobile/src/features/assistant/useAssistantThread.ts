/**
 * Conversation state for the Asistan tab: the active thread, its messages (server history + the
 * turns exchanged in this session), follow-up chips and the in-flight question. Write intents come
 * back as approvals — the caller decides where to send the user (never executed here).
 */
import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClientApiError, qk } from '@da/api-client';
import type { AssistantAskResponse, AssistantMessage } from '@da/domain';
import { useDataSource } from '@/hooks/useDataSource';
import { track } from '@/lib/analytics';

export interface UseAssistantThreadOptions {
  contactId?: string | null;
  onAnswered?: (response: AssistantAskResponse) => void;
  onQuotaExceeded?: () => void;
}

function localUserMessage(
  content: string,
  inputMode: 'text' | 'voice',
  response: AssistantAskResponse,
): AssistantMessage {
  const now = new Date().toISOString();
  return {
    id: `local-${response.message.id}`,
    userId: response.message.userId,
    threadId: response.threadId,
    role: 'user',
    content,
    inputMode,
    sources: [],
    cards: [],
    approvalIds: [],
    uncertain: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function useAssistantThread({
  contactId = null,
  onAnswered,
  onQuotaExceeded,
}: UseAssistantThreadOptions = {}) {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const askMutation = useMutation({
    mutationFn: (input: { message: string; inputMode: 'text' | 'voice' }) =>
      ds.assistant.ask({ threadId, message: input.message, inputMode: input.inputMode, contactId }),
    onMutate: (input) => {
      setPendingQuestion(input.message);
      setError(null);
      setFollowUps([]);
    },
    onSuccess: async (response, input) => {
      setThreadId(response.threadId);
      setMessages((prev) => [
        ...prev,
        localUserMessage(input.message, input.inputMode, response),
        response.message,
      ]);
      setFollowUps(response.suggestedFollowUps);
      setPendingQuestion(null);
      track('assistant_query', {
        inputMode: input.inputMode,
        hadSources: response.message.sources.length > 0,
        createdApproval: response.approvals.length > 0,
      });
      await queryClient.invalidateQueries({ queryKey: qk.assistantThreads });
      onAnswered?.(response);
    },
    onError: (e) => {
      setPendingQuestion(null);
      if (ClientApiError.from(e).code === 'quota_exceeded') onQuotaExceeded?.();
      setError(e);
    },
  });

  const ask = useCallback(
    (message: string, inputMode: 'text' | 'voice' = 'text') => {
      const trimmed = message.trim();
      if (!trimmed || askMutation.isPending) return;
      askMutation.mutate({ message: trimmed, inputMode });
    },
    [askMutation],
  );

  const retry = useCallback(() => {
    const last = askMutation.variables;
    if (last) askMutation.mutate(last);
  }, [askMutation]);

  const selectThread = useCallback(
    async (id: string) => {
      setLoadingThread(true);
      setError(null);
      try {
        const history = await queryClient.fetchQuery({
          queryKey: qk.assistantMessages(id),
          queryFn: () => ds.assistant.getThreadMessages(id),
          staleTime: 0,
        });
        setThreadId(id);
        setMessages(history);
        setFollowUps([]);
      } catch (e) {
        setError(e);
      } finally {
        setLoadingThread(false);
      }
    },
    [ds, queryClient],
  );

  const reset = useCallback(() => {
    setThreadId(null);
    setMessages([]);
    setFollowUps([]);
    setPendingQuestion(null);
    setError(null);
  }, []);

  return {
    threadId,
    messages,
    followUps,
    pendingQuestion,
    isAsking: askMutation.isPending,
    loadingThread,
    error,
    ask,
    retry,
    selectThread,
    reset,
  };
}
