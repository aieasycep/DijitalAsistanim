import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import { formatRelativeLabel, formatTime } from '@da/i18n';
import {
  AiInsightCard,
  Button,
  Card,
  Icon,
  IconButton,
  ListGroup,
  ListRow,
  Screen,
  ScreenHeader,
  Text,
  TextField,
  Waveform,
  useTheme,
  useToast,
} from '@da/ui';
import { OfflineNotice } from '@/features/flow/ScreenStates';
import { useFormatCtx } from '@/features/flow/useFormatCtx';
import { usePostMeeting } from '@/features/meeting/usePostMeeting';
import { useVoiceRecorder } from '@/features/voice/useVoiceRecorder';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { useUiStore } from '@/store/ui';

export default function PostMeetingScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const ds = useDataSource();
  const ctx = useFormatCtx();
  const toast = useToast();
  const offline = useUiStore((s) => s.offline);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [text, setText] = useState('');
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const recorder = useVoiceRecorder();
  const post = usePostMeeting(id);
  const openedApproval = useRef(false);

  const event = useQuery({
    queryKey: qk.event(id ?? ''),
    queryFn: () => ds.plan.getEvent(id ?? ''),
    enabled: Boolean(id),
  });

  const finishIfDone = useCallback(async () => {
    if (!post.submitted) return;
    const decided = await post.refreshDecisions();
    if (post.proposals.length > 0 && Object.keys(decided).length === post.proposals.length) {
      await post.markHandled.mutateAsync();
      toast.show({ message: t('meeting.post.saved'), icon: 'check' });
      router.back();
    }
  }, [post, toast, t, router]);

  useFocusEffect(
    useCallback(() => {
      if (openedApproval.current) {
        openedApproval.current = false;
        void finishIfDone();
      }
    }, [finishIfDone]),
  );

  useEffect(() => {
    return () => {
      void recorder.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = async () => {
    if (recorder.status === 'recording') {
      const result = await recorder.finish();
      if (result.kind === 'text') {
        setText((prev) => (prev ? `${prev} ${result.text}` : result.text));
        setInputMode('voice');
      } else if (result.kind === 'no_provider')
        toast.show({ message: t('assistant.voice.noStt'), icon: 'keyboard' });
      else if (result.kind === 'empty')
        toast.show({
          message: t('assistant.voice.transcribeFailed'),
          icon: 'conflict',
          iconTone: 'critical',
        });
      else
        toast.show({
          message: describeError(result.error, t).title,
          icon: 'conflict',
          iconTone: 'critical',
        });
      return;
    }
    const ok = await recorder.start();
    if (!ok && recorder.status === 'denied')
      toast.show({
        message: t('assistant.voice.permissionTitle'),
        icon: 'offline',
        iconTone: 'critical',
      });
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    post.submit.mutate(
      { text: trimmed, inputMode },
      {
        onError: (e) =>
          toast.show({
            message: describeError(e, t).title,
            icon: 'conflict',
            iconTone: 'critical',
          }),
      },
    );
  };

  const save = () => {
    const next = post.pending[0];
    if (!next) {
      void finishIfDone();
      return;
    }
    openedApproval.current = true;
    router.push({ pathname: '/approvals/[id]', params: { id: next.approvalId } });
  };

  const nothing = () => {
    post.markHandled.mutate(undefined, {
      onSuccess: () => {
        toast.show({ message: t('meeting.post.nothingDone'), icon: 'check' });
        router.back();
      },
      onError: (e) =>
        toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
    });
  };

  const meta = event.data
    ? `${event.data.title} · ${formatTime(event.data.startAt, ctx)}–${formatTime(event.data.endAt, ctx)}`
    : null;

  return (
    <Screen
      scroll
      keyboardAvoiding
      topGap={6}
      testID="post-screen"
      header={
        <ScreenHeader
          variant="sub"
          kicker={t('meeting.post.kicker')}
          onBack={() => router.back()}
          backLabel={t('common.close')}
          backIcon="close"
        />
      }
    >
      <OfflineNotice />
      <View style={styles.stack}>
        {meta ? (
          <Text variant="small" tone="secondary">
            {meta}
          </Text>
        ) : null}
        <Text variant="h1">{t('meeting.post.title')}</Text>
        <Text variant="body" tone="secondary">
          {t('meeting.post.question')}
        </Text>
        <TextField
          value={text}
          onChangeText={setText}
          multiline
          maxLines={8}
          placeholder={t('meeting.post.placeholder')}
          accessibilityLabel={t('meeting.post.question')}
          disabled={post.submit.isPending}
          testID="post-input"
        />
        {recorder.status === 'recording' ? (
          <Card padding={{ vertical: 12, horizontal: 16 }}>
            <View style={styles.recordingRow}>
              <Waveform
                live
                level={recorder.level}
                bars={26}
                height={24}
                barWidth={3}
                gap={3}
                activeColor={theme.colors.primary}
                inactiveColor={theme.colors.primarySoft}
                accessibilityLabel={t('assistant.voice.listening')}
              />
              <Text variant="caption" tone="tertiary" tabular>
                {Math.floor(recorder.durationSec / 60)}:
                {String(Math.floor(recorder.durationSec % 60)).padStart(2, '0')} ·{' '}
                {t('meeting.post.recording')}
              </Text>
            </View>
          </Card>
        ) : null}
        <View style={styles.inputRow}>
          <IconButton
            icon={recorder.status === 'recording' ? 'pause' : 'mic'}
            variant={recorder.status === 'recording' ? 'dark' : 'primary'}
            size={44}
            iconSize={22}
            accessibilityLabel={
              recorder.status === 'recording' ? t('a11y.stopRecording') : t('a11y.record')
            }
            onPress={() => void toggleMic()}
            disabled={recorder.status === 'transcribing' || post.submit.isPending}
            testID="post-mic"
          />
          <Button
            label={t('meeting.post.newCommitment')}
            icon="ai"
            size="md"
            style={styles.submit}
            loading={post.submit.isPending || recorder.status === 'transcribing'}
            loadingLabel={t('common.preparing')}
            disabled={!text.trim() || offline}
            onPress={submit}
            testID="post-submit"
          />
        </View>
        {post.submitted ? (
          post.proposals.length === 0 ? (
            <Card>
              <Text variant="body" testID="post-no-proposals">
                {t('meeting.post.noProposals')}
              </Text>
            </Card>
          ) : (
            <AiInsightCard
              label={t('meeting.post.proposals', { count: post.proposals.length })}
              title={t('meeting.post.review')}
              testID="post-proposals"
            >
              <ListGroup padding={{ vertical: 0, horizontal: 12 }}>
                {post.proposals.map((p, i) => {
                  const status = post.decided[p.approvalId];
                  return (
                    <ListRow
                      key={p.approvalId}
                      icon="commitment"
                      iconColor={theme.colors.primaryText}
                      title={p.commitment.text}
                      meta={[
                        p.commitment.dueText ??
                          (p.commitment.dueAt
                            ? formatRelativeLabel(p.commitment.dueAt, ctx)
                            : null),
                        p.commitment.counterpartName,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      trailing={
                        status ? (
                          <Icon
                            name="complete"
                            size={20}
                            color={
                              status === 'rejected'
                                ? theme.colors.inkDisabled
                                : theme.colors.success
                            }
                            filled
                          />
                        ) : undefined
                      }
                      onPress={() => {
                        openedApproval.current = true;
                        router.push({ pathname: '/approvals/[id]', params: { id: p.approvalId } });
                      }}
                      testID={`post-proposal-${i}`}
                    />
                  );
                })}
              </ListGroup>
            </AiInsightCard>
          )
        ) : null}
        <View style={styles.actions}>
          {post.submitted && post.proposals.length > 0 ? (
            <Button
              label={
                post.pending.length > 1
                  ? `${t('meeting.post.save')} · ${post.pending.length}`
                  : t('meeting.post.save')
              }
              size="lg"
              fullWidth
              loading={post.markHandled.isPending}
              onPress={save}
              testID="post-save"
            />
          ) : null}
          <Button
            label={t('meeting.post.nothing')}
            variant="ghostSecondary"
            size="md"
            fullWidth
            loading={post.markHandled.isPending && !post.submitted}
            onPress={nothing}
            testID="post-nothing"
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submit: { flex: 1 },
  recordingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { gap: 6, marginTop: 8 },
});
