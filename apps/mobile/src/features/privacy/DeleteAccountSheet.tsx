/**
 * "Hesabım silinsin mi?" in two steps: (1) what is deleted and what stays, (2) type the confirmation
 * word ("SİL" / "DELETE") to enable the coral button. Nothing is sent until the word matches exactly.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Icon, Text, TextField, useTheme } from '@da/ui';
import type { DeleteConfirmation } from './usePrivacyActions';

export interface DeleteAccountSheetProps {
  visible: boolean;
  loading?: boolean;
  onConfirm: (confirmation: DeleteConfirmation) => void;
  onClose: () => void;
}

function asConfirmation(word: string): DeleteConfirmation {
  return word === 'SİL' ? 'SİL' : 'DELETE';
}

export function DeleteAccountSheet({
  visible,
  loading = false,
  onConfirm,
  onClose,
}: DeleteAccountSheetProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState('');
  const [touched, setTouched] = useState(false);
  const word = t('settings.privacyScreen.deleteAccountWord');
  const matches = typed.trim().toLocaleUpperCase('tr-TR') === word.toLocaleUpperCase('tr-TR');
  const [wasVisible, setWasVisible] = useState(visible);

  // Back to step 1 with an empty field each time the sheet opens — state adjustment during render.
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) {
      setStep(1);
      setTyped('');
      setTouched(false);
    }
  }

  const submit = () => {
    setTouched(true);
    if (!matches) return;
    onConfirm(asConfirmation(word));
  };

  const cancel = loading ? () => undefined : onClose;

  return (
    <BottomSheet
      visible={visible}
      onClose={cancel}
      closeLabel={t('common.cancel')}
      dismissOnScrim={!loading}
      swipeToClose={!loading}
      testID="privacy-delete-account-sheet"
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={[styles.tile, { backgroundColor: c.criticalSoft, borderRadius: theme.radius.lg }]}
        >
          <Icon name="accountDelete" size={26} color={c.criticalText} />
        </View>
        <Text variant="kicker" tone="tertiary" style={styles.step}>
          {t('settings.privacyScreen.deleteAccountStep', { step })}
        </Text>
        <Text variant="h2" style={styles.title} accessibilityRole="header">
          {t('settings.privacyScreen.deleteAccountTitle')}
        </Text>
        <Text variant="body" tone="secondary" style={styles.body}>
          {t('settings.privacyScreen.deleteAccountBody')}
        </Text>
        {step === 1 ? (
          <>
            <View
              style={[
                styles.info,
                { backgroundColor: c.background, borderRadius: theme.radius.md },
              ]}
            >
              <Text variant="small" tone="secondary">
                {t('settings.privacyScreen.deleteAccountWhat')}
              </Text>
              <Text variant="small" tone="secondary">
                {t('settings.privacyScreen.deleteAccountKeep')}
              </Text>
            </View>
            <View style={styles.buttons}>
              <Button
                label={t('settings.privacyScreen.deleteAccountContinue')}
                variant="dark"
                size="lg"
                fullWidth
                onPress={() => setStep(2)}
                testID="privacy-delete-continue"
              />
              <Button
                label={t('common.cancel')}
                variant="ghostSecondary"
                size="md"
                fullWidth
                onPress={onClose}
                testID="privacy-delete-cancel"
              />
            </View>
          </>
        ) : (
          <>
            <TextField
              label={t('settings.privacyScreen.deleteAccountConfirmLabel')}
              value={typed}
              onChangeText={(next) => {
                setTyped(next);
                if (touched) setTouched(false);
              }}
              placeholder={word}
              error={
                touched && !matches
                  ? t('settings.privacyScreen.deleteAccountMismatch', { word })
                  : null
              }
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={submit}
              disabled={loading}
              style={styles.field}
              testID="privacy-delete-input"
            />
            <View style={styles.buttons}>
              <Button
                label={t('settings.privacyScreen.deleteAccountCta')}
                variant="destructive"
                size="lg"
                fullWidth
                disabled={!matches}
                loading={loading}
                loadingLabel={t('common.deleting')}
                onPress={submit}
                testID="privacy-delete-confirm"
              />
              <Button
                label={t('common.cancel')}
                variant="ghostSecondary"
                size="md"
                fullWidth
                disabled={loading}
                onPress={onClose}
                testID="privacy-delete-cancel"
              />
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  tile: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  step: { marginTop: 14 },
  title: { marginTop: 4 },
  body: { marginTop: 8 },
  info: { marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
  field: { marginTop: 14 },
  buttons: { marginTop: 18, gap: 8 },
});
