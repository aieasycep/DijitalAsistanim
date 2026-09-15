import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CardSkeleton, ErrorState, OfflineBanner, useTheme } from '@da/ui';
import { formatTime } from '@da/i18n';
import { describeError } from '@/lib/errors';
import { useUiStore } from '@/store/ui';
import { useFormatCtx } from './useFormatCtx';

/** Offline pill shown at the top of a screen while the device has no connectivity. */
export function OfflineNotice({ onRetry, retrying }: { onRetry?: () => void; retrying?: boolean }) {
  const { t } = useTranslation();
  const offline = useUiStore((s) => s.offline);
  const lastAnalyzedAt = useUiStore((s) => s.lastAnalyzedAt);
  const ctx = useFormatCtx();
  if (!offline) return null;
  const text = lastAnalyzedAt
    ? t('common.offlineLastAnalysis', { time: formatTime(lastAnalyzedAt, ctx) })
    : t('errors.offline');
  return (
    <OfflineBanner
      text={text}
      retryLabel={t('common.retry')}
      onRetry={onRetry}
      retrying={retrying}
      style={styles.banner}
      testID="offline-banner"
    />
  );
}

/** Full-screen error with calm copy derived from the API error code. */
export function QueryErrorState({
  error,
  onRetry,
  testID,
}: {
  error: unknown;
  onRetry?: () => void;
  testID?: string;
}) {
  const { t } = useTranslation();
  const copy = describeError(error, t);
  return (
    <ErrorState
      variant="full"
      title={copy.title}
      message={copy.body ?? t('common.genericError')}
      retryLabel={t('common.retry')}
      onRetry={copy.recovery === 'none' ? undefined : onRetry}
      testID={testID}
    />
  );
}

/** Card-shaped shimmer list (real card dimensions). */
export function ListSkeleton({ count = 3, testID }: { count?: number; testID?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.skeletons, { gap: theme.layout.cardGap }]} testID={testID}>
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { marginBottom: 12 },
  skeletons: { paddingTop: 4 },
});
