import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ErrorBoundaryProps } from 'expo-router';
import { Button, Text, useTheme } from '@da/ui';
import { captureError } from '@/lib/monitoring';

/** Route-level error boundary: friendly copy, no stack traces, retry re-mounts the route. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  captureError(error);
  return (
    <View style={[styles.wrap, { backgroundColor: theme.colors.background }]}>
      <Text variant="h2" align="center">
        {t('common.genericError')}
      </Text>
      <Text variant="secondary" tone="secondary" align="center" style={styles.body}>
        {t('errors.aiUnavailableBody')}
      </Text>
      <Button label={t('common.retry')} onPress={() => void retry()} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  body: { marginTop: 8, maxWidth: 320 },
  button: { marginTop: 20 },
});
