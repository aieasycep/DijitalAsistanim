import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as Device from 'expo-device';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, ListGroupTitle, TextField, useToast } from '@da/ui';
import { appInfo, appVersionLabel } from '@/features/settings/links';
import { SettingsFooter, SettingsScreen } from '@/features/settings/SettingsScreen';
import { SettingsSection } from '@/features/settings/SettingsSection';
import { ToggleRow } from '@/features/settings/ToggleRow';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';

const CATEGORIES = ['bug', 'idea', 'praise', 'other'] as const;
type FeedbackCategory = (typeof CATEGORIES)[number];
const MIN_MESSAGE_LENGTH = 5;
const MAX_MESSAGE_LENGTH = 2000;

/** Diagnostics attached with consent: app version, OS and device model — never message content. */
function diagnosticsSummary(appName: string): string {
  let os = Platform.OS as string;
  let model: string | null = null;
  try {
    os = `${Platform.OS} ${Device.osVersion ?? ''}`.trim();
    model = Device.modelName ?? null;
  } catch {
    model = null;
  }
  return [`${appName} ${appVersionLabel()}`, os, model].filter(Boolean).join(' · ');
}

/** Feedback composer: topic chips, message, diagnostics consent, send → `profile.submitFeedback`. */
export default function FeedbackScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const ds = useDataSource();
  const toast = useToast();
  const [category, setCategory] = useState<FeedbackCategory>('idea');
  const [message, setMessage] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [touched, setTouched] = useState(false);

  const trimmed = message.trim();
  const tooShort = trimmed.length < MIN_MESSAGE_LENGTH;
  const diagnostics = diagnosticsSummary(t('app.name'));

  const send = useMutation({
    mutationFn: () => {
      const info = appInfo();
      return ds.profile.submitFeedback({
        category,
        message: trimmed,
        includeDiagnostics,
        appVersion: appVersionLabel(),
        platform: info.platform === 'web' ? undefined : info.platform,
      });
    },
    onSuccess: () => {
      toast.show({
        message: t('settings.feedbackScreen.sent'),
        icon: 'check',
        iconTone: 'success',
      });
      if (router.canGoBack()) router.back();
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
  });

  const submit = () => {
    setTouched(true);
    if (tooShort || send.isPending) return;
    send.mutate();
  };

  return (
    <SettingsScreen
      title={t('settings.feedbackScreen.title')}
      subtitle={t('settings.feedbackScreen.subtitle')}
      keyboardAvoiding
      testID="feedback-screen"
      footer={
        <SettingsFooter>
          <Button
            label={t('settings.feedbackScreen.send')}
            size="lg"
            fullWidth
            icon="send"
            loading={send.isPending}
            loadingLabel={t('common.sending')}
            onPress={submit}
            testID="feedback-send"
          />
        </SettingsFooter>
      }
    >
      <View>
        <ListGroupTitle label={t('settings.feedbackScreen.category')} />
        <View style={styles.chips} accessibilityRole="tablist">
          {CATEGORIES.map((key) => (
            <FilterChip
              key={key}
              label={t(`settings.feedbackScreen.categories.${key}`)}
              selected={category === key}
              onPress={() => setCategory(key)}
              testID={`feedback-category-${key}`}
            />
          ))}
        </View>
      </View>

      <TextField
        label={t('settings.feedbackScreen.messageLabel')}
        value={message}
        onChangeText={setMessage}
        onBlur={() => setTouched(true)}
        placeholder={t('settings.feedbackScreen.placeholder')}
        multiline
        maxLines={8}
        maxLength={MAX_MESSAGE_LENGTH}
        error={touched && tooShort ? t('settings.feedbackScreen.tooShort') : null}
        helper={`${trimmed.length} / ${MAX_MESSAGE_LENGTH}`}
        testID="feedback-message"
      />

      <SettingsSection
        note={
          includeDiagnostics
            ? t('settings.feedbackScreen.diagnosticsPreview', { details: diagnostics })
            : null
        }
      >
        <ToggleRow
          icon="info"
          title={t('settings.feedbackScreen.diagnostics')}
          value={includeDiagnostics}
          onValueChange={setIncludeDiagnostics}
          testID="feedback-diagnostics"
        />
      </SettingsSection>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
