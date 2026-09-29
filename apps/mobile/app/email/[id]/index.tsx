import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatRelativeLabel } from '@da/i18n';
import {
  AiInsightCard,
  Avatar,
  Badge,
  ErrorState,
  Icon,
  ListGroup,
  ListRow,
  PersonCard,
  Screen,
  ScreenHeader,
  SectionKicker,
  Skeleton,
  SourceLine,
  Text,
  useTheme,
} from '@da/ui';
import { EmailActions } from '@/features/email/EmailActions';
import { daysWaiting } from '@/features/email/FollowUpCard';
import { OriginalMessages } from '@/features/email/OriginalMessages';
import { useEmailActions } from '@/features/email/useEmailActions';
import { providerLabel, threadSourceRef, useEmailThread } from '@/features/email/useEmailThread';
import { OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { useOpenSource } from '@/features/source/openSource';
import { track } from '@/lib/analytics';
import { useUiStore } from '@/store/ui';

export default function EmailDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ctx = useFormatCtx();
  const offline = useUiStore((s) => s.offline);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { detail, provider, isLoading, isError, error, refetch, isRefetching } = useEmailThread(id);
  const actions = useEmailActions(detail, provider);
  const { openSource } = useOpenSource();

  useEffect(() => {
    if (detail?.relatedInsight)
      track('insight_opened', {
        kind: detail.relatedInsight.kind,
        badge: detail.relatedInsight.badge,
      });
  }, [detail?.relatedInsight]);

  const thread = detail?.thread;
  const analysis = thread?.analysis ?? null;
  const sender =
    thread?.participants.find((p) => p.email !== thread.participants.find((x) => x.name)?.email) ??
    thread?.participants[0];
  const senderName =
    thread?.participants[0]?.name ?? thread?.participants[0]?.email ?? sender?.email ?? '';
  const badge =
    thread?.importance === 'critical'
      ? { label: t('badges.urgent'), tone: 'critical' as const }
      : analysis?.deadline
        ? { label: t('badges.deadline'), tone: 'deadline' as const }
        : null;

  return (
    <Screen
      scroll
      topGap={6}
      testID="email-screen"
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      header={
        <ScreenHeader
          variant="sub"
          onBack={() => router.back()}
          backLabel={t('common.back')}
          right={badge ? <Badge label={badge.label} tone={badge.tone} /> : undefined}
          testID="email-header"
        />
      }
    >
      <OfflineNotice onRetry={() => void refetch()} retrying={isRefetching} />
      {isLoading ? (
        <View style={styles.stack} testID="email-loading">
          <View style={styles.senderRow}>
            <Skeleton width={44} height={44} radius={22} />
            <View style={styles.senderTexts}>
              <Skeleton width="60%" height={16} />
              <Skeleton width="40%" height={12} />
            </View>
          </View>
          <Skeleton width="90%" height={26} />
          <Skeleton height={140} radius={theme.radius.xxl} />
        </View>
      ) : isError || !detail || !thread ? (
        <QueryErrorState error={error} onRetry={() => void refetch()} testID="email-error" />
      ) : (
        <View style={styles.stack}>
          <View style={styles.senderRow}>
            <Avatar name={senderName} size={56} />
            <View style={styles.senderTexts}>
              <View style={styles.nameRow}>
                <Text variant="h4" numberOfLines={1} style={styles.name}>
                  {senderName}
                </Text>
              </View>
              <Text variant="small" tone="secondary" numberOfLines={1}>
                {formatRelativeLabel(thread.lastMessageAt, ctx)} · {providerLabel(provider)} ·{' '}
                {t('email.toYou')}
              </Text>
            </View>
          </View>
          <Text variant="h2" testID="email-subject">
            {thread.subject}
          </Text>
          {analysis ? (
            <AiInsightCard
              label={t('email.aiSummary')}
              title={analysis.summary}
              testID="email-summary"
            >
              {analysis.keyPoints.length > 0 ? (
                <View style={styles.keyPoints}>
                  <Text variant="aiLabel" tone="tertiary">
                    {t('email.keyPoints')}
                  </Text>
                  {analysis.keyPoints.map((point, i) => (
                    <View key={`${i}-${point}`} style={styles.bullet}>
                      <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} />
                      <Text variant="secondary" style={styles.bulletText}>
                        {point}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {analysis.deadlineText ? (
                <View style={styles.deadline}>
                  <Icon name="deadline" size={16} color={theme.colors.warningText} />
                  <Text variant="small" tone="warning">
                    {analysis.deadlineText}
                  </Text>
                </View>
              ) : null}
            </AiInsightCard>
          ) : (
            <ErrorState
              message={t('email.noSummary')}
              onRetry={() => void refetch()}
              retryLabel={t('common.retry')}
              testID="email-no-summary"
            />
          )}
          <SectionKicker label={t('email.suggestedActions')} />
          <EmailActions
            onReply={actions.reply}
            onTask={() => void actions.createTask()}
            onCalendar={() => void actions.addToCalendar()}
            onRemind={actions.remind}
            onOpen={() => void actions.openOriginal()}
            busy={actions.busy}
            disabled={offline}
          />
          <OriginalMessages messages={detail.messages} initiallyOpen={!analysis} />
          {detail.followUp &&
          detail.followUp.status !== 'closed' &&
          detail.followUp.status !== 'replied' ? (
            <View style={styles.section}>
              <SectionKicker label={t('email.followUpSection')} />
              <PersonCard
                name={detail.followUp.counterpartName}
                topic={detail.followUp.topic}
                body={t('email.followUp.noReply')}
                statusLabel={t('email.followUp.waitingDays', {
                  count: daysWaiting(detail.followUp.sentAt, ctx.now ?? new Date()),
                })}
                actionLabel={t('email.followUp.draft')}
                onAction={() =>
                  router.push({
                    pathname: '/email/[id]/reply',
                    params: { id: thread.id, followUpId: detail.followUp?.id ?? '' },
                  })
                }
                onPress={() => router.push('/followups')}
                testID="email-followup"
              />
            </View>
          ) : null}
          {detail.commitments.length > 0 ? (
            <View style={styles.section}>
              <SectionKicker
                label={t('email.commitmentsSection')}
                meta={t('today.prioritiesCount', { count: detail.commitments.length })}
              />
              <ListGroup>
                {detail.commitments.map((c, i) => (
                  <ListRow
                    key={c.id}
                    icon="commitment"
                    title={c.text}
                    meta={[
                      c.direction === 'user_owes'
                        ? t('commitments.userOwes')
                        : t('commitments.otherOwes'),
                      c.dueText,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    onPress={() => router.push('/commitments')}
                    testID={`email-commitment-${i}`}
                  />
                ))}
              </ListGroup>
            </View>
          ) : null}
          <SourceLine
            source={threadSourceRef(detail, provider)}
            timeLabel={formatRelativeLabel(thread.lastMessageAt, ctx)}
            onPress={(source) => void openSource(source)}
            style={styles.source}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  section: { gap: 8 },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  senderTexts: { flex: 1, minWidth: 0, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1 },
  keyPoints: { gap: 6 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1 },
  deadline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  source: { paddingHorizontal: 4 },
});
