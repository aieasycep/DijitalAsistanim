/**
 * "Kişi Ekle" sheet: pick from the device contacts (system picker, permission explained first) or add a
 * person by name + e-mail with an optional relation ("Yönetici", "Müşteri") and the always-notify switch.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, ListGroup, SheetRow, Text, TextField, Toggle } from '@da/ui';
import type { AddVipInput } from './useVips';

export interface AddVipSheetProps {
  visible: boolean;
  saving?: boolean;
  onClose: () => void;
  onPickContacts: () => void;
  onSubmit: (input: AddVipInput) => void;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function AddVipSheet({
  visible,
  saving = false,
  onClose,
  onPickContacts,
  onSubmit,
}: AddVipSheetProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [relation, setRelation] = useState('');
  const [notifyAlways, setNotifyAlways] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);

  // Clear the form every time the sheet opens — state adjustment during render, no effect needed.
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) {
      setName('');
      setEmail('');
      setRelation('');
      setNotifyAlways(true);
      setError(null);
    }
  }

  const submit = () => {
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) {
      setError(t('settings.vipScreen.invalidEmail'));
      return;
    }
    setError(null);
    onSubmit({
      contactId: null,
      displayName: name.trim() || address,
      email: address,
      relation: relation.trim() || null,
      notifyAlways,
    });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('settings.vipScreen.add')}
      subtitle={t('settings.vipScreen.addSubtitle')}
      closeLabel={t('common.close')}
      swipeToClose={false}
      testID="vip-add-sheet"
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ListGroup padding={{ horizontal: 12, vertical: 2 }}>
          <SheetRow
            icon="person"
            iconTone="primary"
            label={t('settings.vipScreen.fromContacts')}
            onPress={onPickContacts}
            disabled={saving}
            testID="vip-add-contacts"
          />
        </ListGroup>
        <Text variant="kicker" tone="tertiary" style={styles.kicker}>
          {t('settings.vipScreen.byEmail')}
        </Text>
        <View style={styles.form}>
          <TextField
            value={name}
            onChangeText={setName}
            placeholder={t('settings.vipScreen.namePlaceholder')}
            leftIcon="person"
            autoCapitalize="words"
            returnKeyType="next"
            testID="vip-add-name-input"
          />
          <TextField
            value={email}
            onChangeText={(next) => {
              setEmail(next);
              if (error) setError(null);
            }}
            placeholder={t('settings.vipScreen.emailPlaceholder')}
            leftIcon="mail"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={error}
            returnKeyType="next"
            testID="vip-add-email-input"
          />
          <TextField
            value={relation}
            onChangeText={setRelation}
            placeholder={t('settings.vipScreen.relationPlaceholder')}
            label={t('settings.vipScreen.relation')}
            leftIcon="commitment"
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={submit}
            testID="vip-add-relation-input"
          />
          <View style={styles.toggleRow}>
            <View style={styles.toggleTexts}>
              <Text variant="bodyMedium">{t('settings.vipScreen.notifyAlways')}</Text>
              <Text variant="caption" tone="tertiary">
                {notifyAlways
                  ? t('settings.vipScreen.notifyMeta')
                  : t('settings.vipScreen.notifyOffMeta')}
              </Text>
            </View>
            <Toggle
              value={notifyAlways}
              onValueChange={setNotifyAlways}
              accessibilityLabel={t('settings.vipScreen.notifyAlways')}
              testID="vip-add-notify"
            />
          </View>
          <Button
            label={t('settings.vipScreen.save')}
            size="lg"
            fullWidth
            loading={saving}
            disabled={email.trim().length === 0}
            onPress={submit}
            testID="vip-add-save"
          />
        </View>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  kicker: { marginTop: 16, marginBottom: 8, paddingHorizontal: 4 },
  form: { gap: 10 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  toggleTexts: { flex: 1, minWidth: 0 },
});
