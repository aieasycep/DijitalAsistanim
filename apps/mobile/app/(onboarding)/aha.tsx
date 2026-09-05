import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import { Button, CardSkeleton, ErrorState, GradientHeader, useTheme } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { formatCtx } from '@/lib/i18n';
import { PrioritySection } from '@/features/today/PrioritySection';

const MAX_CARDS = 5;

/** "Hazır." — the first value moment: up to five real findings before any notification prompt. */
export default function AhaScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const ds = useDataSource();
  const status = useQuery({
    queryKey: qk.firstAnalysis,
    queryFn: () => ds.onboarding.getInitialAnalysisStatus(),
  });
  const insights = (status.data?.insights ?? []).slice(0, MAX_CARDS);
  const count = status.data?.insights.length ?? 0;
  const ctx = formatCtx();

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]} testID="aha-screen">
      <GradientHeader
        gradient="dawn"
        kicker={t('onboarding.aha.kicker')}
        title={t('onboarding.aha.title')}
        subtitle={
          status.isPending
            ? t('common.preparing')
            : count > 0
              ? t('onboarding.aha.body', { count })
              : t('onboarding.aha.bodyZero')
        }
        contentStyle={[styles.sheet, { paddingHorizontal: theme.layout.screenPaddingH }]}
      >
        {status.isPending ? (
          <View style={styles.cards}>
            <CardSkeleton />
            <CardSkeleton />
          </View>
        ) : status.isError ? (
          <ErrorState
            message={describeError(status.error, t).title}
            onRetry={() => void status.refetch()}
            retryLabel={t('common.retry')}
          />
        ) : (
          <PrioritySection
            insights={insights}
            ctx={ctx}
            max={MAX_CARDS}
            readOnly
            testIDFor={(_insight, index) => `aha-card-${index}`}
          />
        )}
        <Button
          label={t('onboarding.aha.cta')}
          size="lg"
          fullWidth
          onPress={() => router.replace('/(onboarding)/notifications')}
          style={styles.cta}
          testID="aha-cta"
        />
      </GradientHeader>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sheet: { paddingBottom: 40 },
  cards: { gap: 12 },
  cta: { marginTop: 20 },
});
