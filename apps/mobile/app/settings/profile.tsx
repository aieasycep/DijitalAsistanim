import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Text, TextField } from '@da/ui';
import { SettingsFooter, SettingsScreen } from '@/features/settings/SettingsScreen';
import { SettingsRowLink } from '@/features/settings/SettingsRowLink';
import { SettingsSection } from '@/features/settings/SettingsSection';
import { SettingsSkeleton } from '@/features/settings/SettingsSkeleton';
import { TimezoneSheet } from '@/features/settings/TimezoneSheet';
import { timezoneLabel } from '@/features/settings/timezones';
import { MAX_NAME_LENGTH, useProfileForm } from '@/features/settings/useProfileForm';
import { useSessionStore } from '@/store/session';

/** Profile: display name (→ firstName for greetings), sign-in provider, email, time zone. */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const form = useProfileForm();
  const session = useSessionStore((s) => s.session);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [now] = useState(() => new Date());

  const providerKey = session?.user.provider ?? 'email';
  const avatarName = form.values.displayName.trim() || form.initial.displayName || t('app.name');

  return (
    <SettingsScreen
      title={t('settings.profile')}
      subtitle={t('settings.profileScreen.subtitle')}
      keyboardAvoiding
      testID="profile-screen"
      footer={
        <SettingsFooter>
          <Button
            label={t('common.save')}
            size="lg"
            fullWidth
            disabled={!form.canSave}
            loading={form.isSaving}
            loadingLabel={t('common.loading')}
            onPress={() => void form.save()}
            testID="profile-save"
          />
        </SettingsFooter>
      }
    >
      {!form.profile ? (
        <SettingsSkeleton rows={3} testID="profile-loading" />
      ) : (
        <>
          <View style={styles.identity}>
            <Avatar name={avatarName} imageUrl={form.profile.avatarUrl} size={72} variant="ink" />
            <Text variant="h2" align="center" numberOfLines={1} style={styles.name}>
              {avatarName}
            </Text>
            <Text variant="caption" tone="tertiary" align="center">
              {t('settings.profileScreen.signedInWith', {
                provider: t(`settings.profileScreen.providers.${providerKey}`),
              })}
            </Text>
          </View>

          <TextField
            label={t('settings.profileScreen.name')}
            value={form.values.displayName}
            onChangeText={form.setDisplayName}
            error={form.dirty ? form.nameError : null}
            helper={t('settings.profileScreen.nameHint')}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={MAX_NAME_LENGTH}
            returnKeyType="done"
            testID="profile-name"
          />

          <SettingsSection
            title={t('settings.groups.account')}
            note={`${t('settings.profileScreen.emailNote')} ${t('settings.profileScreen.timezoneNote')}`}
          >
            <SettingsRowLink
              icon="mail"
              title={t('settings.profileScreen.email')}
              value={form.profile.email ?? '—'}
              testID="profile-email"
            />
            <SettingsRowLink
              icon="schedule"
              title={t('settings.profileScreen.timezone')}
              value={timezoneLabel(form.values.timezone, now)}
              onPress={() => setTimezoneOpen(true)}
              testID="profile-timezone"
            />
          </SettingsSection>

          <TimezoneSheet
            visible={timezoneOpen}
            current={form.values.timezone}
            onClose={() => setTimezoneOpen(false)}
            onSelect={(tz) => {
              form.setTimezone(tz);
              setTimezoneOpen(false);
            }}
            testID="profile-tz"
          />
        </>
      )}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: 6, paddingTop: 4 },
  name: { marginTop: 6, maxWidth: '90%' },
});
