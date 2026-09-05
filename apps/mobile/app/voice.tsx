import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ClientApiError } from '@da/api-client';
import type { AssistantAskResponse } from '@da/domain';
import {
  Button,
  Icon,
  IconButton,
  Pressable,
  Text,
  Waveform,
  useTheme,
  useThemeContext,
  haptic,
} from '@da/ui';
import { useApprovalFlow } from '@/features/approvals/useApprovalFlow';
import { nightGradientProps } from '@/features/voice/nightGradient';
import { useVoiceRecorder } from '@/features/voice/useVoiceRecorder';
import { useDataSource } from '@/hooks/useDataSource';
import { useEntitlement } from '@/hooks/useEntitlement';
import { trackScreen } from '@/lib/analytics';
import { describeError } from '@/lib/errors';
import { openAppSettings } from '@/services/handoff';

type Phase = 'idle' | 'recording' | 'transcribing' | 'asking' | 'answered';

export default function VoiceScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { hapticsEnabled } = useThemeContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ds = useDataSource();
  const { gate } = useEntitlement();
  const { refreshPending } = useApprovalFlow();
  const params = useLocalSearchParams<{ contactId?: string }>();
  const recorder = useVoiceRecorder();
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AssistantAskResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const examples = t('assistant.voice.examples', { returnObjects: true }) as string[];
  const white = theme.colors.onGradientText;
  const muted = theme.colors.onGradientMuted;

  useEffect(() => {
    trackScreen('voice');
  }, []);

  const ask = useMutation({
    mutationFn: (message: string) =>
      ds.assistant.ask({
        threadId,
        message,
        inputMode: 'voice',
        contactId: params.contactId ?? null,
      }),
    onMutate: () => {
      setPhase('asking');
      setNotice(null);
    },
    onSuccess: async (response) => {
      setThreadId(response.threadId);
      setAnswer(response);
      setPhase('answered');
      if (response.approvals.length > 0) {
        void haptic('light', hapticsEnabled);
        await refreshPending();
      }
    },
    onError: (e) => {
      setPhase('idle');
      if (ClientApiError.from(e).code === 'quota_exceeded')
        gate('unlimited_assistant', 'assistant');
      setNotice(describeError(e, t).title);
    },
  });

  const submit = useCallback(
    (text: string) => {
      setTranscript(text);
      ask.mutate(text);
    },
    [ask],
  );

  const toggleRecording = useCallback(async () => {
    if (phase === 'recording') {
      setPhase('transcribing');
      const result = await recorder.finish();
      switch (result.kind) {
        case 'text':
          submit(result.text);
          return;
        case 'no_provider':
          setPhase('idle');
          setNotice(t('assistant.voice.noStt'));
          return;
        case 'empty':
          setPhase('idle');
          setNotice(t('assistant.voice.transcribeFailed'));
          return;
        case 'error':
          setPhase('idle');
          setNotice(describeError(result.error, t).title);
          return;
      }
    }
    if (phase === 'asking' || phase === 'transcribing') return;
    setNotice(null);
    setAnswer(null);
    const ok = await recorder.start();
    if (ok) {
      void haptic('medium', hapticsEnabled);
      setPhase('recording');
    }
  }, [phase, recorder, submit, t, hapticsEnabled]);

  const typeInstead = useCallback(() => {
    router.replace({
      pathname: '/(tabs)/assistant',
      params: {
        ...(transcript ? { q: transcript } : {}),
        ...(params.contactId ? { contactId: params.contactId } : {}),
      },
    });
  }, [router, transcript, params.contactId]);

  const statusLine =
    recorder.status === 'denied'
      ? t('assistant.voice.permissionTitle')
      : phase === 'recording'
        ? t('assistant.voice.listening')
        : phase === 'transcribing' || phase === 'asking'
          ? t('assistant.voice.processing')
          : phase === 'answered'
            ? t('assistant.voice.tapToSpeak')
            : t('assistant.voice.tapToSpeak');

  return (
    <View style={styles.root} testID="voice-screen">
      <LinearGradient {...nightGradientProps(theme)} style={StyleSheet.absoluteFill} />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Text variant="kicker" color={muted}>
          {t('assistant.voice.title')}
        </Text>
        <IconButton
          icon="close"
          variant="onGradient"
          size={36}
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
          testID="voice-close"
        />
      </View>
      <ScrollView
        contentContainerStyle={[styles.stage, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => void toggleRecording()}
          accessibilityRole="button"
          accessibilityLabel={phase === 'recording' ? t('a11y.stopRecording') : t('a11y.record')}
          accessibilityState={{ busy: phase === 'asking' || phase === 'transcribing' }}
          disabled={phase === 'asking' || phase === 'transcribing'}
          pressScale={0.96}
          style={[styles.orbOuter, { backgroundColor: theme.colors.onGradientChip }]}
          testID="voice-record"
        >
          <View style={[styles.orbInner, { backgroundColor: theme.colors.onGradientChipStrong }]}>
            <View style={[styles.orbCore, { backgroundColor: white }]}>
              <Icon
                name={recorder.status === 'denied' ? 'offline' : 'mic'}
                size={36}
                color={theme.gradients.night.stops[1]}
                filled={phase === 'recording'}
              />
            </View>
          </View>
        </Pressable>
        <Waveform
          live={phase === 'recording'}
          playing={phase === 'asking' || phase === 'transcribing'}
          level={recorder.level}
          bars={22}
          height={44}
          accessibilityLabel={statusLine}
          testID="voice-waveform"
        />
        {transcript ? (
          <Text
            variant="h3"
            color={white}
            align="center"
            style={styles.transcript}
            testID="voice-transcript"
          >
            “{transcript}”
          </Text>
        ) : null}
        {answer ? (
          <View style={styles.answer} testID="voice-answer">
            <Text variant="kicker" color={muted}>
              {t('assistant.voice.answer')}
            </Text>
            <Text variant="h3" color={white}>
              {answer.message.content}
            </Text>
            {answer.message.uncertain ? (
              <Text variant="caption" color={muted}>
                {t('assistant.uncertain')}
              </Text>
            ) : null}
            {answer.approvals.length > 0 ? (
              <View style={styles.approvals}>
                <Text variant="small" color={muted}>
                  {t('assistant.voice.writeDetected')}
                </Text>
                {answer.approvals.map((approval, i) => (
                  <Button
                    key={approval.id}
                    label={`${t('assistant.openApproval')} · ${approval.what}`}
                    icon="approval"
                    variant="onGradient"
                    size="sm"
                    onPress={() =>
                      router.push({ pathname: '/approvals/[id]', params: { id: approval.id } })
                    }
                    testID={`voice-approval-${i}`}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        <Text variant="secondary" color={muted} align="center" testID="voice-status">
          {statusLine}
        </Text>
        {recorder.status === 'denied' ? (
          <Button
            label={t('assistant.voice.openSettings')}
            variant="onGradient"
            size="sm"
            onPress={() => void openAppSettings()}
            testID="voice-settings"
          />
        ) : null}
        {notice ? (
          <Text
            variant="small"
            color={theme.colors.onGradientText}
            align="center"
            testID="voice-notice"
          >
            {notice}
          </Text>
        ) : null}
        {phase === 'idle' || phase === 'answered' ? (
          <View style={styles.examples} testID="voice-examples">
            {examples.map((example, i) => (
              <Pressable
                key={example}
                onPress={() => submit(example)}
                accessibilityRole="button"
                accessibilityLabel={example}
                style={[styles.chip, { backgroundColor: theme.colors.onGradientChip }]}
                testID={`voice-example-${i}`}
              >
                <Text variant="chip" color={white}>
                  {example}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Button
          label={t('assistant.voice.typeInstead')}
          icon="keyboard"
          variant="onGradient"
          size="sm"
          onPress={typeInstead}
          testID="voice-type-instead"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  stage: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  orbOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbCore: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcript: { maxWidth: 300 },
  answer: { alignSelf: 'stretch', gap: 8 },
  approvals: { gap: 8, marginTop: 4 },
  examples: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
