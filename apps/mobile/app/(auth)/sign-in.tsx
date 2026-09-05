import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { IconName } from '@da/design-tokens';
import { Button, Icon, Screen, ScreenHeader, Text, useTheme } from '@da/ui';
import { useNativeSignIn, type SignInProvider } from '@/features/auth/useNativeSignIn';
import { env, isDemoMode } from '@/lib/env';
import { openExternal } from '@/lib/openExternal';

const PROVIDER_ICON: Record<SignInProvider, IconName> = {
  apple: 'verified',
  google: 'language',
  microsoft: 'domain',
};

/** Account creation: Apple / Google / Microsoft / e-mail. Provider order follows the platform (Apple first on iOS). */
export default function SignInScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { signIn, pending, providers } = useNativeSignIn();
  const c = theme.colors;
  const signInMode = params.mode === 'signin';

  return (
    <Screen
      scroll
      topGap={6}
      header={
        <ScreenHeader variant="sub" onBack={() => router.back()} backLabel={t('common.back')} />
      }
      testID="auth-screen"
    >
      <View style={styles.center}>
        <View style={[styles.tile, { backgroundColor: c.primary, borderRadius: theme.radius.xl }]}>
          <Icon name="ai" size={30} color={c.onPrimary} filled />
        </View>
        <Text variant="display" align="center" style={styles.title} accessibilityRole="header">
          {signInMode ? t('onboarding.auth.signInTitle') : t('onboarding.auth.title')}
        </Text>
        <Text variant="body" tone="secondary" align="center" style={styles.subtitle}>
          {t('onboarding.auth.subtitle')}
        </Text>
      </View>

      <View style={styles.buttons}>
        {providers.map((provider, index) => (
          <Button
            key={provider}
            label={t(`onboarding.auth.${provider}`)}
            icon={PROVIDER_ICON[provider]}
            variant={index === 0 ? 'dark' : 'surface'}
            size="lg"
            fullWidth
            loading={pending === provider}
            disabled={pending !== null && pending !== provider}
            onPress={() => void signIn(provider)}
            testID={`auth-${provider}`}
          />
        ))}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: c.divider }]} />
          <Text variant="caption" tone="tertiary">
            {t('common.or')}
          </Text>
          <View style={[styles.dividerLine, { backgroundColor: c.divider }]} />
        </View>
        <Button
          label={t('onboarding.auth.email')}
          icon="mail"
          variant="surface"
          size="lg"
          fullWidth
          disabled={pending !== null}
          onPress={() => router.push('/(auth)/email')}
          testID="auth-email"
        />
        {isDemoMode ? (
          <Text variant="caption" tone="tertiary" align="center">
            {t('onboarding.auth.demoNotice')}
          </Text>
        ) : null}
      </View>

      <Text
        variant="caption"
        tone="tertiary"
        align="center"
        style={styles.legal}
        testID="auth-legal"
      >
        {t('onboarding.auth.legal')}{' '}
        <Text
          variant="caption"
          tone="secondary"
          onPress={() => void openExternal(`${env.webUrl}/terms`)}
          accessibilityRole="link"
          style={styles.link}
        >
          {t('onboarding.auth.terms')}
        </Text>
        {' · '}
        <Text
          variant="caption"
          tone="secondary"
          onPress={() => void openExternal(`${env.webUrl}/privacy`)}
          accessibilityRole="link"
          style={styles.link}
        >
          {t('onboarding.auth.privacy')}
        </Text>
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', marginTop: 24 },
  tile: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 22 },
  subtitle: { marginTop: 6, maxWidth: 320 },
  buttons: { marginTop: 32, gap: 10 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  legal: { marginTop: 28, paddingHorizontal: 8 },
  link: { textDecorationLine: 'underline' },
});
