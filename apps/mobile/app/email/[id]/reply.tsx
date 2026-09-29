import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatRelativeLabel } from '@da/i18n';
import {
  Avatar,
  Button,
  ConfirmModal,
  ErrorState,
  Icon,
  MetaChip,
  Pressable,
  SOURCE_ICON,
  Screen,
  ScreenHeader,
  Skeleton,
  Text,
  TextField,
  useTheme,
  useToast,
} from '@da/ui';
import { approvalIdempotencyKey, useApprovalFlow } from '@/features/approvals/useApprovalFlow';
import { ToneChips } from '@/features/email/ToneChips';
import { providerLabel, threadSourceRef, useEmailThread } from '@/features/email/useEmailThread';
import { useReplyDraft } from '@/features/email/useReplyDraft';
import { OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { useOpenSource } from '@/features/source/openSource';
import { describeError } from '@/lib/errors';
import { openExternal, providerMailUrl } from '@/lib/openExternal';
import { useUiStore } from '@/store/ui';

export default function ReplyScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ctx = useFormatCtx();
  const toast = useToast();
  const offline = useUiStore((s) => s.offline);
  const { id, followUpId } = useLocalSearchParams<{ id: string; followUpId?: string }>();
  const followUp = followUpId && followUpId.length > 0 ? followUpId : undefined;
  const thread = useEmailThread(id);
  const draft = useReplyDraft(id, followUp);
  const { requestApproval, isCreating } = useApprovalFlow();
  const { openSource } = useOpenSource();
  const [confirmLeave, setConfirmLeave] = useState(false);

  const recipients = useMemo(
    () => (draft.draft?.to ?? []).map((p) => p.name ?? p.email),
    [draft.draft],
  );
  const toneLabel = followUp ? t('email.reply.followUpTone') : t(`email.reply.tones.${draft.tone}`);
  const canSend =
    Boolean(draft.draft && thread.detail && draft.text.trim().length > 0) &&
    !isCreating &&
    !offline;

  const approve = async () => {
    const detail = thread.detail;
    const current = draft.draft;
    if (!detail || !current) return;
    const bodyText = draft.text.trim();
    const approval = await requestApproval({
      type: 'email_send',
      what: t('approvals.types.email_send'),
      why: followUp
        ? t('email.followUp.noReply')
        : (detail.thread.analysis?.reasonImportant ??
          detail.thread.analysis?.summary ??
          detail.thread.subject),
      changeSummary: [
        t('email.reply.toLine', { to: recipients.join(', ') }),
        current.subject,
        t('email.reply.toneLine', { tone: toneLabel }),
      ],
      payload: {
        accountId: detail.thread.accountId,
        threadId: detail.thread.id,
        inReplyToExternalId: null,
        to: current.to.map((p) => ({ name: p.name ?? null, email: p.email })),
        subject: current.subject,
        bodyText,
        tone: followUp ? null : draft.tone,
      },
      source: threadSourceRef(detail, thread.provider),
      requestedBy: followUp ? 'follow_up' : 'email_detail',
      insightId: detail.relatedInsight?.id ?? null,
      idempotencyKey: approvalIdempotencyKey([
        'email_send',
        detail.thread.id,
        followUp ?? draft.tone,
        bodyText.length,
        bodyText.slice(0, 64),
      ]),
    });
    if (approval)
      toast.show({
        message: t('assistant.approvalCreated'),
        icon: 'approval',
        iconTone: 'primary',
      });
  };

  const openProvider = async () => {
    const detail = thread.detail;
    const last = detail ? [...detail.messages].reverse().find((m) => m.webUrl) : undefined;
    const ok = await openExternal(providerMailUrl(last?.webUrl, thread.provider));
    if (!ok)
      toast.show({ message: t('errors.handoffFailed'), icon: 'conflict', iconTone: 'critical' });
  };

  const goBack = () => {
    if (draft.edited) setConfirmLeave(true);
    else router.back();
  };

  return (
    <Screen
      scroll
      keyboardAvoiding
      topGap={6}
      testID="reply-screen"
      header={
        <ScreenHeader
          variant="sub"
          kicker={t('email.reply.kicker')}
          onBack={goBack}
          backLabel={t('common.back')}
        />
      }
      footer={
        <View
          style={[
            styles.footer,
            {
              paddingHorizontal: theme.layout.screenPaddingH,
              backgroundColor: theme.colors.background,
            },
          ]}
        >
          <View style={styles.assurance}>
            <Icon name="assurance" size={18} color={theme.colors.successText} />
            <Text variant="small" tone="secondary" style={styles.assuranceText}>
              {t('email.reply.aiNotice')}
            </Text>
          </View>
          <View style={styles.ctaRow}>
            <Button
              label={t('email.reply.approveSend')}
              size="lg"
              style={styles.cta}
              disabled={!canSend}
              loading={isCreating}
              loadingLabel={t('common.preparing')}
              onPress={() => void approve()}
              testID="reply-approve"
            />
            <Button
              label={t('email.reply.regenerate')}
              icon="refresh"
              variant="surface"
              size="lg"
              disabled={draft.isFetching || offline}
              onPress={() => void draft.regenerate()}
              testID="reply-regenerate"
            />
          </View>
        </View>
      }
    >
      <OfflineNotice />
      {thread.isError ? (
        <QueryErrorState error={thread.error} onRetry={() => void thread.refetch()} />
      ) : (
        <View style={styles.stack}>
          <View style={styles.recipientRow}>
            <Text variant="secondary" tone="secondary">
              {t('email.reply.recipient')}
            </Text>
            {recipients.length > 0 ? (
              <View style={styles.chips}>
                {recipients.map((name) => (
                  <View
                    key={name}
                    style={[
                      styles.personChip,
                      { backgroundColor: theme.colors.surface },
                      theme.isDark
                        ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.cardRing }
                        : theme.shadows.s1,
                    ]}
                  >
                    <Avatar name={name} size={28} />
                    <Text variant="chip" numberOfLines={1}>
                      {name}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Skeleton width={140} height={28} />
            )}
          </View>
          {draft.draft?.subject ? (
            <Text variant="caption" tone="tertiary" numberOfLines={1} testID="reply-subject">
              {draft.draft.subject}
            </Text>
          ) : null}
          {!followUp ? (
            <ToneChips value={draft.tone} onChange={draft.changeTone} disabled={draft.isFetching} />
          ) : null}
          <View style={styles.editorHeader}>
            <View style={styles.kicker}>
              <Icon name="ai" size={16} color={theme.colors.primary} filled />
              <Text variant="aiLabel" tone="primary">
                {t('email.reply.draftKicker', { tone: toneLabel })}
              </Text>
            </View>
            <Text variant="caption" tone="tertiary">
              {draft.isFetching
                ? t('email.reply.generating')
                : draft.edited
                  ? t('common.edit')
                  : t('email.reply.editable')}
            </Text>
          </View>
          {draft.isLoading ? (
            <View style={styles.stack} testID="reply-loading">
              <Skeleton width="95%" height={16} />
              <Skeleton width="88%" height={16} />
              <Skeleton width="60%" height={16} />
            </View>
          ) : draft.isError ? (
            <ErrorState
              message={describeError(draft.error, t).title}
              onRetry={() => void draft.regenerate()}
              retryLabel={t('common.retry')}
              testID="reply-error"
            />
          ) : (
            <TextField
              value={draft.text}
              onChangeText={draft.changeText}
              multiline
              maxLines={14}
              placeholder={t('email.reply.placeholder')}
              accessibilityLabel={t('email.reply.title')}
              disabled={draft.isFetching}
              testID="reply-editor"
            />
          )}
          {draft.draft && draft.draft.basedOn.length > 0 ? (
            <View style={styles.section}>
              <Text variant="kicker" tone="tertiary">
                {t('email.reply.basedOn')}
              </Text>
              <View style={styles.chips}>
                {draft.draft.basedOn.map((source, i) => (
                  <Pressable
                    key={`${source.type}-${source.id}-${i}`}
                    onPress={() => void openSource(source)}
                    accessibilityRole="link"
                    accessibilityLabel={t('a11y.source', { label: source.label })}
                    testID={`reply-source-${i}`}
                  >
                    <MetaChip
                      icon={SOURCE_ICON[source.type]}
                      label={[
                        source.label,
                        source.person,
                        formatRelativeLabel(source.timestamp, ctx),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <Button
            label={t('email.reply.openInProvider', { provider: providerLabel(thread.provider) })}
            icon="mail"
            variant="ghostSecondary"
            size="sm"
            onPress={() => void openProvider()}
            testID="reply-open-provider"
          />
        </View>
      )}
      <ConfirmModal
        visible={confirmLeave}
        title={t('email.reply.discardTitle')}
        body={t('email.reply.discardBody')}
        confirmLabel={t('email.reply.discard')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => {
          setConfirmLeave(false);
          router.back();
        }}
        onCancel={() => setConfirmLeave(false)}
        testID="reply-discard"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  section: { gap: 8 },
  recipientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingLeft: 3,
    paddingRight: 10,
    borderRadius: 999,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footer: { paddingTop: 10, paddingBottom: 24, gap: 10 },
  assurance: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  assuranceText: { flex: 1 },
  ctaRow: { flexDirection: 'row', gap: 10 },
  cta: { flex: 1 },
});
