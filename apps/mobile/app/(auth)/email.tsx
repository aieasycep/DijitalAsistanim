import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ClientApiError } from '@da/api-client';
import { Button, Screen, ScreenHeader, Text, TextField, useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const OTP_RE = /^\d{6}$/;

/** E-mail OTP sign-in: address → 6-digit code. The session change is handled by SessionProvider. */
export default function EmailSignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const ds = useDataSource();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const fail = useCallback(
    (e: unknown, setError: (message: string) => void) => {
      const err = ClientApiError.from(e);
      const copy = describeError(e, t);
      if (err.code === 'validation') setError(copy.title);
      else toast.show({ message: copy.title, icon: 'warning', iconTone: 'critical' });
    },
    [t, toast],
  );

  const send = useMutation({
    mutationFn: (address: string) => ds.auth.signInWithEmailOtp(address),
    onSuccess: () => {
      setStep('code');
      setCode('');
      setCodeError(null);
      toast.show({ message: t('onboarding.auth.codeSent'), icon: 'mail' });
    },
    onError: (e) => fail(e, setEmailError),
  });

  const verify = useMutation({
    mutationFn: (input: { email: string; token: string }) => ds.auth.verifyEmailOtp(input),
    onError: (e) => fail(e, setCodeError),
  });

  const submitEmail = useCallback(() => {
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) {
      setEmailError(t('onboarding.auth.emailInvalid'));
      return;
    }
    setEmailError(null);
    send.mutate(address);
  }, [email, send, t]);

  const submitCode = useCallback(() => {
    const token = code.trim();
    if (!OTP_RE.test(token)) {
      setCodeError(t('onboarding.auth.otpInvalid'));
      return;
    }
    setCodeError(null);
    verify.mutate({ email: email.trim().toLowerCase(), token });
  }, [code, email, verify, t]);

  return (
    <Screen
      scroll
      keyboardAvoiding
      topGap={6}
      header={
        <ScreenHeader
          variant="sub"
          onBack={() => (step === 'code' ? setStep('email') : router.back())}
          backLabel={t('common.back')}
        />
      }
      testID="auth-email-screen"
    >
      {step === 'email' ? (
        <View style={styles.block}>
          <Text variant="h1" accessibilityRole="header">
            {t('onboarding.auth.email')}
          </Text>
          <Text variant="body" tone="secondary" style={styles.subtitle}>
            {t('onboarding.auth.subtitle')}
          </Text>
          <TextField
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (emailError) setEmailError(null);
            }}
            placeholder={t('onboarding.auth.emailPlaceholder')}
            leftIcon="mail"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={submitEmail}
            error={emailError}
            style={styles.field}
            testID="auth-email-input"
          />
          <Button
            label={t('onboarding.auth.sendCode')}
            size="lg"
            fullWidth
            loading={send.isPending}
            loadingLabel={t('common.sending')}
            onPress={submitEmail}
            style={styles.cta}
            testID="auth-email-submit"
          />
        </View>
      ) : (
        <View style={styles.block}>
          <Text variant="h1" accessibilityRole="header">
            {t('onboarding.auth.otpTitle')}
          </Text>
          <Text variant="body" tone="secondary" style={styles.subtitle}>
            {t('onboarding.auth.otpBody', { email: email.trim().toLowerCase() })}
          </Text>
          <TextField
            value={code}
            onChangeText={(v) => {
              setCode(v.replace(/[^\d]/g, '').slice(0, 6));
              if (codeError) setCodeError(null);
            }}
            placeholder={t('onboarding.auth.otpPlaceholder')}
            leftIcon="key"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={submitCode}
            error={codeError}
            style={styles.field}
            testID="auth-otp-input"
          />
          <Button
            label={t('onboarding.auth.verify')}
            size="lg"
            fullWidth
            loading={verify.isPending}
            loadingLabel={t('common.wait')}
            onPress={submitCode}
            style={styles.cta}
            testID="auth-otp-submit"
          />
          <View style={styles.secondary}>
            <Button
              label={t('onboarding.auth.resend')}
              variant="ghost"
              size="ghost"
              disabled={send.isPending}
              onPress={() => send.mutate(email.trim().toLowerCase())}
              testID="auth-otp-resend"
            />
            <Button
              label={t('onboarding.auth.changeEmail')}
              variant="ghostSecondary"
              size="ghost"
              onPress={() => setStep('email')}
              testID="auth-otp-change"
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 16 },
  subtitle: { marginTop: 8 },
  field: { marginTop: 24 },
  cta: { marginTop: 16 },
  secondary: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
});
