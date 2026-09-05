import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { qk } from '@da/api-client';
import { palette, type IconName } from '@da/design-tokens';
import type { FirstAnalysisProgress } from '@da/domain';
import { Button, Icon, Text, haptic, useTheme, useThemeContext } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { track } from '@/lib/analytics';
import { describeError } from '@/lib/errors';
import { captureError } from '@/lib/monitoring';

type StepKey = 'scanning' | 'classifying' | 'calendar' | 'open_loops';

interface StepSpec {
  key: StepKey;
  icon: IconName;
  countKey: 'mails' | 'important' | 'events' | 'followUps';
  count: (p: FirstAnalysisProgress) => number;
}

const STEPS: StepSpec[] = [
  { key: 'scanning', icon: 'search', countKey: 'mails', count: (p) => p.emailsFound },
  { key: 'classifying', icon: 'mail', countKey: 'important', count: (p) => p.potentialImportant },
  { key: 'calendar', icon: 'event', countKey: 'events', count: (p) => p.upcomingEvents },
  { key: 'open_loops', icon: 'followUp', countKey: 'followUps', count: (p) => p.possibleFollowUps },
];

const POLL_MS = 1000;
const SLOW_AFTER_MS = 60_000;

/** Position of a step in the pipeline (done / failed count as "past every step"). */
export function stepIndex(step: FirstAnalysisProgress['step']): number {
  const index = STEPS.findIndex((s) => s.key === step);
  return index >= 0 ? index : STEPS.length;
}

function Ring({ active }: { active: boolean }) {
  const { reducedMotion } = useThemeContext();
  const rotation = useSharedValue(0);
  useEffect(() => {
    if (!active || reducedMotion) {
      cancelAnimation(rotation);
      rotation.value = 0;
      return;
    }
    rotation.value = withRepeat(
      withTiming(360, { duration: 1400, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, [active, reducedMotion, rotation]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  return (
    <View style={styles.ringWrap}>
      <View style={styles.ringTrack} />
      <Animated.View style={[styles.ringArc, style]} />
      <Icon name="ai" size={44} color={palette.white} filled />
    </View>
  );
}

/** First 72-hour analysis: 4 steps with growing counts, polled every second; failure offers a retry. */
export default function AnalysisScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { hapticsEnabled } = useThemeContext();
  const router = useRouter();
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  const lastIndexRef = useRef(-1);
  const startedAtRef = useRef(0);
  const [started, setStarted] = useState(false);
  const [slow, setSlow] = useState(false);

  const accountsQuery = useQuery({
    queryKey: qk.accounts,
    queryFn: () => ds.accounts.listAccounts(),
  });
  const providers = (accountsQuery.data ?? [])
    .filter((a) => !a.deletedAt)
    .map((a) => a.displayName.split(' · ')[0] ?? a.displayName);

  const start = useMutation({
    mutationFn: () => ds.onboarding.startInitialAnalysis({ windowHours: 72 }),
    onMutate: () => {
      startedAtRef.current = Date.now();
      setSlow(false);
    },
    onSuccess: async (progress) => {
      queryClient.setQueryData(qk.firstAnalysis, { ...progress, insights: [], briefingId: null });
      setStarted(true);
    },
    onError: (e) => captureError(e, { where: 'analysis.start' }),
  });
  const startMutate = start.mutate;

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startedAtRef.current = Date.now();
    let cancelled = false;
    (async () => {
      try {
        const current = await ds.onboarding.getInitialAnalysisStatus();
        if (cancelled) return;
        if (current.step === 'done') {
          queryClient.setQueryData(qk.firstAnalysis, current);
          router.replace('/(onboarding)/aha');
          return;
        }
      } catch (e) {
        captureError(e, { where: 'analysis.status' });
      }
      if (!cancelled) startMutate();
    })();
    return () => {
      cancelled = true;
    };
  }, [ds, queryClient, router, startMutate]);

  const status = useQuery({
    queryKey: qk.firstAnalysis,
    queryFn: () => ds.onboarding.getInitialAnalysisStatus(),
    enabled: started,
    refetchInterval: (query) => {
      const step = query.state.data?.step;
      return step === 'done' || step === 'failed' ? false : POLL_MS;
    },
  });
  const progress = status.data;
  const step = progress?.step ?? 'scanning';
  const current = stepIndex(step);

  useEffect(() => {
    if (current > lastIndexRef.current && lastIndexRef.current >= 0)
      void haptic('light', hapticsEnabled);
    lastIndexRef.current = current;
  }, [current, hapticsEnabled]);

  useEffect(() => {
    if (!progress || progress.step !== 'done' || doneRef.current) return;
    doneRef.current = true;
    void haptic('success', hapticsEnabled);
    track('first_analysis_completed', {
      durationMs: Date.now() - startedAtRef.current,
      emailsFound: progress.emailsFound,
      insights: progress.insights.length,
    });
    router.replace('/(onboarding)/aha');
  }, [progress, hapticsEnabled, router]);

  useEffect(() => {
    if (!started || step === 'done' || step === 'failed') return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [started, step]);

  const failed = step === 'failed' || start.isError || status.isError;
  const failureMessage = start.error
    ? describeError(start.error, t).title
    : status.error
      ? describeError(status.error, t).title
      : (progress?.error ?? null);

  return (
    <LinearGradient
      colors={theme.gradients.night.stops}
      locations={theme.gradients.night.locations}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[
        styles.root,
        { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 20) + 12 },
      ]}
      testID="analysis-screen"
    >
      <View style={styles.center}>
        <Ring active={!failed} />
        <Text
          variant="h2"
          tone="onGradient"
          align="center"
          style={styles.title}
          accessibilityRole="header"
        >
          {failed ? t('onboarding.analysis.failed') : t('onboarding.analysis.title')}
        </Text>
        <Text
          variant="secondary"
          color={theme.colors.onGradientMuted}
          align="center"
          style={styles.subtitle}
        >
          {failed
            ? (failureMessage ?? t('onboarding.analysis.failedBody'))
            : t('onboarding.analysis.subtitle', {
                providers: providers.length ? providers.join(' · ') : t('app.name'),
              })}
        </Text>

        {failed ? (
          <Button
            label={t('onboarding.analysis.retry')}
            variant="onGradient"
            size="lg"
            icon="refresh"
            loading={start.isPending}
            onPress={() => start.mutate()}
            style={styles.retry}
            testID="analysis-retry"
          />
        ) : (
          <View style={styles.steps} accessibilityRole="list">
            {STEPS.map((spec, index) => {
              const done = step === 'done' || index < current;
              const active = !done && index === current;
              const count = progress ? spec.count(progress) : 0;
              return (
                <View
                  key={spec.key}
                  style={[styles.step, !done && !active ? styles.pending : null]}
                  accessibilityLabel={t(`onboarding.analysis.steps.${spec.key}`)}
                  testID={`analysis-step-${spec.key}`}
                >
                  <View style={styles.indicator}>
                    {done ? (
                      <Icon name="complete" size={22} color={palette.green300} filled />
                    ) : active ? (
                      <ActivityIndicator size="small" color={palette.white} />
                    ) : (
                      <View style={styles.pendingDot} />
                    )}
                  </View>
                  <Icon name={spec.icon} size={18} color="rgba(255,255,255,0.8)" />
                  <View style={styles.stepTexts}>
                    <Text variant="bodyMedium" tone="onGradient" numberOfLines={1}>
                      {t(`onboarding.analysis.steps.${spec.key}`)}
                    </Text>
                    {count > 0 ? (
                      <Text variant="caption" color={theme.colors.primaryGlow} numberOfLines={1}>
                        {t(`onboarding.analysis.found.${spec.countKey}`, { count })}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
            <View
              style={[styles.step, step !== 'done' ? styles.pending : null]}
              testID="analysis-step-prioritizing"
            >
              <View style={styles.indicator}>
                {step === 'done' ? (
                  <Icon name="complete" size={22} color={palette.green300} filled />
                ) : current >= STEPS.length ? (
                  <ActivityIndicator size="small" color={palette.white} />
                ) : (
                  <View style={styles.pendingDot} />
                )}
              </View>
              <Icon name="ai" size={18} color="rgba(255,255,255,0.8)" />
              <Text variant="bodyMedium" tone="onGradient" style={styles.stepTexts}>
                {t('onboarding.analysis.prioritizing')}
              </Text>
            </View>
          </View>
        )}
        {slow && !failed ? (
          <Text
            variant="small"
            color={theme.colors.onGradientMuted}
            align="center"
            style={styles.slow}
          >
            {t('onboarding.analysis.slow')}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color="rgba(255,255,255,0.6)" align="center">
        {t('onboarding.analysis.footer')}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ringWrap: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  ringTrack: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  ringArc: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: palette.white,
  },
  title: { maxWidth: 320 },
  subtitle: { marginTop: 8, maxWidth: 320 },
  steps: { width: '100%', marginTop: 36, gap: 14 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pending: { opacity: 0.4 },
  indicator: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  pendingDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  stepTexts: { flex: 1, minWidth: 0 },
  retry: { marginTop: 28 },
  slow: { marginTop: 20 },
});
