import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { AssistantAskResponse, AssistantMessage } from '@da/domain';
import {
  Button,
  ErrorState,
  FilterChip,
  Screen,
  ScreenHeader,
  Text,
  useBottomSheet,
  useScreenPadding,
  useTheme,
  useToast,
} from '@da/ui';
import { AskBar } from '@/features/assistant/AskBar';
import { MessageBubble } from '@/features/assistant/MessageBubble';
import { SuggestedQuestions } from '@/features/assistant/SuggestedQuestions';
import { ThreadListSheet } from '@/features/assistant/ThreadListSheet';
import { TypingIndicator } from '@/features/assistant/TypingIndicator';
import { useAssistantThread } from '@/features/assistant/useAssistantThread';
import { OfflineNotice } from '@/features/flow/ScreenStates';
import { useApprovalFlow } from '@/features/approvals/useApprovalFlow';
import { useDataSource } from '@/hooks/useDataSource';
import { useEntitlement } from '@/hooks/useEntitlement';
import { trackScreen } from '@/lib/analytics';
import { describeError } from '@/lib/errors';
import { useUiStore } from '@/store/ui';

const TAB_BAR_SPACE = 84;

interface Offsets {
  source: number;
  card: number;
  approval: number;
}

export default function AssistantScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ds = useDataSource();
  const toast = useToast();
  const { gate } = useEntitlement();
  const { refreshPending } = useApprovalFlow();
  const offline = useUiStore((s) => s.offline);
  const params = useLocalSearchParams<{ contactId?: string; q?: string }>();
  const contactId = params.contactId ?? null;
  const [text, setText] = useState(params.q ?? '');
  const listRef = useRef<FlatList<AssistantMessage>>(null);
  const threadSheet = useBottomSheet(false);
  const padding = useScreenPadding({ topInset: false, topGap: 0, bottomInset: 0 });

  const onAnswered = useCallback(
    (response: AssistantAskResponse) => {
      const first = response.approvals[0];
      if (!first) return;
      void refreshPending();
      toast.show({
        message: t('assistant.approvalCreated'),
        icon: 'approval',
        iconTone: 'primary',
      });
      router.push({ pathname: '/approvals/[id]', params: { id: first.id } });
    },
    [refreshPending, router, toast, t],
  );
  const onQuotaExceeded = useCallback(() => {
    gate('unlimited_assistant', 'assistant');
  }, [gate]);

  const thread = useAssistantThread({ contactId, onAnswered, onQuotaExceeded });
  const person = useQuery({
    queryKey: qk.person(contactId ?? ''),
    queryFn: () => ds.people.getPerson(contactId ?? ''),
    enabled: Boolean(contactId),
    staleTime: 5 * 60_000,
  });
  const personName = person.data?.contact.displayName ?? null;
  const firstName = personName?.split(' ')[0] ?? '';

  useEffect(() => {
    trackScreen('assistant');
  }, []);

  // A new `?q=` deep link replaces the composer text (state adjusted during render, not in an effect).
  const [seenQuery, setSeenQuery] = useState(params.q);
  if (params.q !== seenQuery) {
    setSeenQuery(params.q);
    if (params.q) setText(params.q);
  }

  useEffect(() => {
    if (thread.messages.length > 0 || thread.pendingQuestion) {
      const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [thread.messages.length, thread.pendingQuestion]);

  const send = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setText('');
      thread.ask(trimmed, 'text');
    },
    [thread],
  );

  const offsets = useMemo(() => {
    const out: Offsets[] = [];
    let source = 0;
    let card = 0;
    let approval = 0;
    for (const m of thread.messages) {
      out.push({ source, card, approval });
      source += m.sources.length;
      card += m.cards.length;
      approval += m.approvalIds.length;
    }
    return out;
  }, [thread.messages]);

  const renderItem = useCallback(
    ({ item, index }: { item: AssistantMessage; index: number }) => {
      const o = offsets[index] ?? { source: 0, card: 0, approval: 0 };
      return (
        <View style={styles.message}>
          <MessageBubble
            message={item}
            index={index}
            sourceOffset={o.source}
            cardOffset={o.card}
            approvalOffset={o.approval}
          />
        </View>
      );
    },
    [offsets],
  );

  const conversationEmpty = thread.messages.length === 0 && !thread.pendingQuestion;
  const errorCopy = thread.error ? describeError(thread.error, t) : null;

  const listHeader = (
    <View style={styles.listHeader}>
      <OfflineNotice />
      {contactId ? (
        <Text variant="small" tone="secondary" style={styles.scope} testID="assistant-scope">
          {personName ? t('assistant.personScope', { name: personName }) : t('common.loading')}
        </Text>
      ) : null}
      {conversationEmpty ? (
        <SuggestedQuestions contactId={contactId} onPick={(q) => thread.ask(q, 'text')} />
      ) : null}
    </View>
  );

  const listFooter = (
    <View style={styles.listFooter}>
      {thread.pendingQuestion ? <TypingIndicator question={thread.pendingQuestion} /> : null}
      {thread.loadingThread ? <TypingIndicator /> : null}
      {errorCopy ? (
        <ErrorState
          message={errorCopy.recovery === 'upgrade' ? errorCopy.title : t('assistant.errorRetry')}
          retryLabel={
            errorCopy.recovery === 'upgrade' ? t('paywall.ctaNoTrial') : t('common.retry')
          }
          onRetry={
            errorCopy.recovery === 'upgrade'
              ? () => gate('unlimited_assistant', 'assistant')
              : thread.retry
          }
          testID="assistant-error"
        />
      ) : null}
      {thread.followUps.length > 0 && !thread.isAsking ? (
        <View style={styles.chips} testID="assistant-followups">
          {thread.followUps.map((chip, i) => (
            <FilterChip
              key={chip}
              label={chip}
              onPress={() => thread.ask(chip, 'text')}
              testID={`assistant-followup-${i}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen
      testID="assistant-screen"
      padded={false}
      keyboardAvoiding
      keyboardVerticalOffset={0}
      header={
        <View style={[styles.header, { paddingHorizontal: theme.layout.screenPaddingH }]}>
          <ScreenHeader
            title={t('assistant.title')}
            right={
              <View style={styles.headerActions}>
                {thread.threadId ? (
                  <Button
                    label={t('assistant.newChat')}
                    variant="surface"
                    size="sm"
                    onPress={thread.reset}
                    testID="assistant-new"
                  />
                ) : null}
                <Button
                  label={t('assistant.threads')}
                  icon="history"
                  variant="surface"
                  size="sm"
                  onPress={threadSheet.open}
                  testID="assistant-threads"
                />
              </View>
            }
          />
        </View>
      }
      footer={
        <View
          style={[
            styles.footer,
            { paddingHorizontal: theme.layout.screenPaddingH, paddingBottom: TAB_BAR_SPACE + 8 },
          ]}
        >
          <AskBar
            value={text}
            onChangeText={setText}
            onSend={send}
            onMic={() =>
              router.push({ pathname: '/voice', params: contactId ? { contactId } : {} })
            }
            placeholder={
              contactId && firstName
                ? t('assistant.askAbout', { name: firstName })
                : t('assistant.placeholder')
            }
            sendLabel={t('a11y.send')}
            micLabel={t('a11y.mic')}
            accessibilityLabel={t('assistant.placeholder')}
            loading={thread.isAsking}
            disabled={offline}
            testIDs={{ input: 'assistant-input', send: 'assistant-send', mic: 'assistant-mic' }}
          />
        </View>
      }
    >
      <FlatList
        ref={listRef}
        data={thread.messages}
        renderItem={renderItem}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={[
          padding,
          { paddingHorizontal: theme.layout.screenPaddingH, paddingBottom: 16 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onContentSizeChange={() => {
          if (!conversationEmpty) listRef.current?.scrollToEnd({ animated: false });
        }}
        testID="assistant-list"
      />
      <ThreadListSheet
        visible={threadSheet.visible}
        activeThreadId={thread.threadId}
        onClose={threadSheet.close}
        onSelect={(id) => void thread.selectThread(id)}
        onNew={thread.reset}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 10 },
  headerActions: { flexDirection: 'row', gap: 8 },
  listHeader: { gap: 12, paddingBottom: 12 },
  listFooter: { gap: 12, paddingTop: 4 },
  scope: { paddingHorizontal: 4 },
  message: { marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  footer: { paddingTop: 8 },
});
