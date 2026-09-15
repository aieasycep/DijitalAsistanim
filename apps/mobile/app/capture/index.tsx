import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Icon,
  Screen,
  ScreenHeader,
  Text,
  TextField,
  useTheme,
  useToast,
} from '@da/ui';
import { CaptureResult } from '@/features/capture/CaptureResult';
import { CaptureSources } from '@/features/capture/CaptureSources';
import { isValidCaptureUrl, useCapture, type CaptureSource } from '@/features/capture/useCapture';
import { OfflineNotice, QueryErrorState } from '@/features/flow/ScreenStates';
import { useEntitlement } from '@/hooks/useEntitlement';
import { trackScreen } from '@/lib/analytics';
import { useUiStore } from '@/store/ui';

export default function CaptureScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const offline = useUiStore((s) => s.offline);
  const { hasFeature } = useEntitlement();
  const params = useLocalSearchParams<{ id?: string }>();
  const capture = useCapture(params.id ?? null);
  // A shared text/link is known from the first render (the hook consumes the hand-off synchronously).
  const shared = capture.sharedItem;
  const [source, setSource] = useState<CaptureSource | null>(() =>
    shared?.kind === 'text' || shared?.kind === 'link' ? shared.kind : null,
  );
  const [text, setText] = useState(() => (shared?.kind === 'text' ? (shared.text ?? '') : ''));
  const [url, setUrl] = useState(() => (shared?.kind === 'link' ? (shared.url ?? '') : ''));

  useEffect(() => {
    trackScreen('capture');
  }, []);

  const select = (next: CaptureSource) => {
    if (next === 'text' || next === 'link') {
      setSource(next);
      return;
    }
    setSource(next);
    void capture.pick(next);
  };

  const analyze = () => {
    if (source === 'link') void capture.submitLink(url);
    else void capture.submitText(text);
  };

  const canAnalyze =
    !offline &&
    !capture.busy &&
    (source === 'link'
      ? isValidCaptureUrl(url)
      : source === 'text'
        ? text.trim().length > 0
        : false);

  const saveNote = () => {
    toast.show({ message: t('capture.saved'), icon: 'check' });
    router.back();
  };

  return (
    <Screen
      scroll
      keyboardAvoiding
      topGap={6}
      testID="capture-screen"
      header={
        <ScreenHeader
          variant="sub"
          kicker={t('capture.kicker')}
          onBack={() => router.back()}
          backLabel={t('common.close')}
          backIcon="close"
        />
      }
    >
      <OfflineNotice />
      <View style={styles.stack}>
        <Text variant="h1">{t('capture.title')}</Text>
        {capture.sharedItem ? (
          <Text variant="small" tone="secondary">
            {t('capture.sharedFrom')}
            {capture.sharedItem.title ? ` · ${capture.sharedItem.title}` : ''}
          </Text>
        ) : null}
        <CaptureSources
          selected={source}
          isPro={hasFeature('advanced_capture')}
          disabled={capture.busy}
          onSelect={select}
        />
        {source === 'text' ? (
          <TextField
            value={text}
            onChangeText={setText}
            multiline
            maxLines={8}
            placeholder={t('capture.pastePlaceholder')}
            accessibilityLabel={t('capture.sources.text')}
            disabled={capture.busy}
            testID="capture-text-input"
          />
        ) : null}
        {source === 'link' ? (
          <TextField
            value={url}
            onChangeText={setUrl}
            placeholder={t('capture.linkPlaceholder')}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            leftIcon="link"
            accessibilityLabel={t('capture.sources.link')}
            disabled={capture.busy}
            error={url.trim().length > 0 && !isValidCaptureUrl(url) ? t('errors.invalidUrl') : null}
            testID="capture-link-input"
          />
        ) : null}
        {source === 'text' || source === 'link' ? (
          <Button
            label={t('capture.analyze')}
            icon="ai"
            size="lg"
            fullWidth
            disabled={!canAnalyze}
            loading={capture.busy}
            loadingLabel={t('capture.analyzing')}
            onPress={analyze}
            testID="capture-analyze"
          />
        ) : null}
        {capture.phase.kind === 'uploading' || capture.phase.kind === 'analyzing' ? (
          <Card testID="capture-progress">
            <View style={styles.progress}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text variant="aiLabel" tone="primary">
                {capture.phase.kind === 'uploading' ? t('common.sending') : t('capture.analyzing')}
              </Text>
            </View>
          </Card>
        ) : null}
        {capture.phase.kind === 'error' ? (
          <QueryErrorState
            error={capture.phase.error}
            onRetry={capture.retry}
            testID="capture-error"
          />
        ) : null}
        {capture.phase.kind === 'done' ? (
          capture.phase.capture.status === 'failed' || !capture.phase.capture.analysis ? (
            <Card testID="capture-failed">
              <View style={styles.failed}>
                <Icon name="conflict" size={20} color={theme.colors.criticalText} />
                <Text variant="small" style={styles.failedText}>
                  {capture.phase.capture.failureReason ?? t('capture.failed')}
                </Text>
              </View>
              <Button
                label={t('common.retry')}
                variant="tonal"
                size="sm"
                onPress={capture.retry}
                style={styles.retry}
              />
            </Card>
          ) : (
            <CaptureResult capture={capture.phase.capture} onSaveNote={saveNote} />
          )
        ) : null}
        <View style={styles.privacy}>
          <Icon name="lock" size={16} color={theme.colors.inkTertiary} />
          <Text variant="caption" tone="tertiary" style={styles.privacyText}>
            {t('capture.privacy')}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  failed: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  failedText: { flex: 1 },
  retry: { marginTop: 12 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  privacyText: { flex: 1 },
});
