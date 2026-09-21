import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import { palette } from '@da/design-tokens';
import type { Briefing } from '@da/domain';
import type { FormatCtx } from '@da/i18n';
import {
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  Pressable,
  Text,
  Waveform,
  useTheme,
} from '@da/ui';
import { OfflineNotice } from '@/features/flow/ScreenStates';
import { formatDateKey } from '@/features/plan/dates';
import { useDataSource } from '@/hooks/useDataSource';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { describeError } from '@/lib/errors';
import { formatCtx } from '@/lib/i18n';
import { SEEK_STEP_SEC } from '@/services/audio';
import { useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';

/** "m:ss" for positions and durations. */
export function formatClock(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

/** A briefing the briefing screen already fetched (by kind, by id or weekly) — saves a round trip. */
function cachedBriefing(queryClient: QueryClient, id: string): Briefing | undefined {
  const byId = queryClient.getQueryData<Briefing>(qk.briefingById(id));
  if (byId) return byId;
  for (const prefix of ['briefing', 'weekly']) {
    for (const [, data] of queryClient.getQueriesData<Briefing | null>({ queryKey: [prefix] })) {
      if (data?.id === id) return data;
    }
  }
  return undefined;
}

/** Full audio player (night gradient): waveform, progress, ±15 s, speed pill, chapter list. */
export default function AudioScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const preferences = useSessionStore((s) => s.preferences);
  const offline = useUiStore((s) => s.offline);
  const {
    state: audio,
    loading,
    error: playerError,
    load,
    toggle,
    seekBack,
    seekForward,
    cycleSpeed,
    jumpToChapter,
  } = useAudioPlayer();
  const requestedRef = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failedId, setFailedId] = useState<string | null>(null);
  const c = theme.colors;

  const ctx: FormatCtx = formatCtx({
    ...(preferences?.locale ? { locale: preferences.locale } : {}),
    ...(preferences?.timezone ? { timezone: preferences.timezone } : {}),
  });

  // The briefing behind the narration: its `forDate` and `kind` drive the meta line and the title.
  const requestedId = typeof params.id === 'string' && params.id.length > 0 ? params.id : null;
  const briefingId = requestedId ?? audio.briefingId;
  const briefingQuery = useQuery({
    queryKey: qk.briefingById(briefingId ?? 'none'),
    queryFn: () => ds.briefings.getBriefingById(briefingId as string),
    enabled: briefingId !== null,
    initialData: () => (briefingId ? cachedBriefing(queryClient, briefingId) : undefined),
    staleTime: 5 * 60_000,
  });
  const briefing = briefingQuery.data ?? null;
  const fetchedId = briefing?.id ?? null;
  const fetchedKind = briefing?.kind ?? null;

  // Opened for a briefing that is not loaded yet (deep link / cold start): once the briefing is known,
  // load its narration with the kind-specific title and start it. Waits for connectivity when offline.
  useEffect(() => {
    if (!requestedId || fetchedId !== requestedId || !fetchedKind) return;
    if (requestedId === audio.briefingId || requestedRef.current === requestedId) return;
    if (offline) return;
    requestedRef.current = requestedId;
    void load(requestedId, { title: t(`briefing.audio.${fetchedKind}Title`), autoplay: true }).then(
      (ok) => {
        if (!ok) setFailedId(requestedId);
      },
    );
  }, [requestedId, fetchedId, fetchedKind, audio.briefingId, load, t, offline, attempt]);

  const retryLoad = () => {
    setFailedId(null);
    requestedRef.current = null;
    if (briefingQuery.isError) void briefingQuery.refetch();
    else setAttempt((n) => n + 1);
  };

  const loadFailed =
    requestedId !== null &&
    requestedId !== audio.briefingId &&
    (failedId === requestedId || briefingQuery.isError);
  // A deep-linked briefing is still on its way: keep the player chrome instead of the empty state.
  const pendingLoad = requestedId !== null && requestedId !== audio.briefingId && !loadFailed;
  const waitingForNetwork = pendingLoad && offline && !loading;

  const progress =
    audio.durationSec > 0 ? Math.min(1, Math.max(0, audio.positionSec / audio.durationSec)) : 0;
  const chapter = audio.chapters[audio.chapterIndex] ?? audio.chapters[0];
  const chapterLabel =
    chapter?.title ?? t('briefing.audio.chapter', { index: audio.chapterIndex + 1 });
  const dateLabel = briefing ? formatDateKey(briefing.forDate, ctx) : null;
  const meta =
    loading || pendingLoad
      ? t('common.preparing')
      : dateLabel
        ? t('briefing.audio.meta', {
            date: dateLabel,
            duration: formatClock(audio.durationSec),
            chapter: chapterLabel,
          })
        : t('briefing.audio.metaShort', {
            duration: formatClock(audio.durationSec),
            chapter: chapterLabel,
          });
  const kindTitle = fetchedKind ? t(`briefing.audio.${fetchedKind}Title`) : null;
  const title = kindTitle ?? (pendingLoad ? t('common.preparing') : audio.title);

  const panel = (content: React.ReactNode) => (
    <View
      style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top + 12 }]}
      testID="audio-screen"
    >
      <View style={[styles.topRow, { paddingHorizontal: theme.layout.screenPaddingH }]}>
        <IconButton
          icon="expandMore"
          accessibilityLabel={t('a11y.close')}
          onPress={() => router.back()}
          testID="audio-close"
        />
      </View>
      {content}
    </View>
  );

  if (loadFailed || waitingForNetwork) {
    const failure = briefingQuery.isError ? briefingQuery.error : playerError;
    return panel(
      <View style={[styles.panelBody, { paddingHorizontal: theme.layout.screenPaddingH }]}>
        <OfflineNotice onRetry={retryLoad} retrying={briefingQuery.isRefetching || loading} />
        {loadFailed ? (
          <ErrorState
            variant="full"
            title={t('briefing.audio.unavailable')}
            message={failure ? describeError(failure, t).title : t('briefing.audio.loadFailedBody')}
            retryLabel={t('common.retry')}
            onRetry={retryLoad}
            secondaryLabel={t('common.back')}
            onSecondary={() => router.back()}
            testID="audio-error"
          />
        ) : (
          <EmptyState
            icon="offline"
            title={t('errors.offline')}
            body={t('common.noNetworkAction')}
            actionLabel={t('common.back')}
            onAction={() => router.back()}
            testID="audio-offline"
          />
        )}
      </View>,
    );
  }

  if (!audio.briefingId && !pendingLoad) {
    return panel(
      <EmptyState
        icon="listen"
        title={t('briefing.audio.nothingPlaying')}
        actionLabel={t('common.back')}
        onAction={() => router.back()}
        testID="audio-empty"
      />,
    );
  }

  return (
    <LinearGradient
      colors={theme.gradients.night.stops}
      locations={theme.gradients.night.locations}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[
        styles.root,
        { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 24) + 24 },
      ]}
      testID="audio-screen"
    >
      {/* Night gradient in both themes → the status bar is always light on this screen. */}
      <StatusBar style="light" />
      <View style={[styles.topRow, { paddingHorizontal: theme.layout.screenPaddingH }]}>
        <IconButton
          icon="expandMore"
          variant="onGradient"
          accessibilityLabel={t('a11y.close')}
          onPress={() => router.back()}
          testID="audio-close"
        />
        <Text variant="kicker" color={c.onGradientMuted}>
          {t('briefing.audio.title')}
        </Text>
        <Pressable
          onPress={cycleSpeed}
          accessibilityRole="button"
          accessibilityLabel={`${t('a11y.speed')} · ${t('briefing.audio.speed', { speed: audio.speed })}`}
          hapticOnPress="selection"
          style={[styles.speedPill, { backgroundColor: c.onGradientChip }]}
          testID="audio-speed"
        >
          <Text variant="chip" color={c.onGradientText} tabular>
            {t('briefing.audio.speed', { speed: audio.speed })}
          </Text>
        </Pressable>
      </View>
      {offline ? (
        <View style={[styles.notice, { paddingHorizontal: theme.layout.screenPaddingH }]}>
          <OfflineNotice />
        </View>
      ) : null}

      <View style={styles.titleBlock}>
        <Text variant="h2" tone="onGradient" align="center" accessibilityRole="header">
          {title}
        </Text>
        <Text
          variant="secondary"
          color={c.onGradientMuted}
          align="center"
          style={styles.meta}
          numberOfLines={1}
        >
          {meta}
        </Text>
        {audio.provider === 'device_tts' ? (
          <Text
            variant="caption"
            color="rgba(255,255,255,0.55)"
            align="center"
            style={styles.deviceVoice}
          >
            {t('briefing.audio.usingDeviceVoice')}
          </Text>
        ) : null}
      </View>

      <Waveform
        progress={progress}
        playing={audio.playing}
        accessibilityLabel={title}
        style={styles.waveform}
      />

      <View style={[styles.progress, { paddingHorizontal: theme.layout.screenPaddingH }]}>
        <View
          style={styles.track}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('briefing.audio.progress')}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
        >
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <View style={styles.times}>
          <Text variant="caption" color={c.onGradientMuted} tabular>
            {formatClock(audio.positionSec)}
          </Text>
          <Text variant="caption" color={c.onGradientMuted} tabular>
            {formatClock(audio.durationSec)}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={seekBack}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.back15')}
          hapticOnPress="selection"
          style={styles.seek}
          testID="audio-back15"
        >
          <Icon name="replay15" size={30} color={palette.white} />
          <Text variant="badge" color={palette.white} style={styles.seekLabel}>
            {SEEK_STEP_SEC}
          </Text>
        </Pressable>
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={audio.playing ? t('a11y.pause') : t('a11y.play')}
          accessibilityState={{ selected: audio.playing }}
          hapticOnPress="light"
          pressScale={0.95}
          style={[styles.play, theme.shadows.s3]}
          testID="audio-play"
        >
          <Icon name={audio.playing ? 'pause' : 'play'} size={40} color={palette.night1} filled />
        </Pressable>
        <Pressable
          onPress={seekForward}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.forward15')}
          hapticOnPress="selection"
          style={styles.seek}
          testID="audio-forward15"
        >
          <Icon name="forward15" size={30} color={palette.white} />
          <Text variant="badge" color={palette.white} style={styles.seekLabel}>
            {SEEK_STEP_SEC}
          </Text>
        </Pressable>
      </View>

      <View
        style={[styles.chapters, { paddingHorizontal: theme.layout.screenPaddingH }]}
        accessibilityRole="list"
      >
        <Text variant="kicker" color={c.onGradientMuted} style={styles.chaptersTitle}>
          {t('briefing.audio.chapters')}
        </Text>
        {audio.chapters.map((item, index) => {
          const active = index === audio.chapterIndex;
          return (
            <Pressable
              key={item.index}
              onPress={() => jumpToChapter(index)}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.selectChapter', { title: item.title })}
              accessibilityState={{ selected: active }}
              pressScale={1}
              style={[styles.chapter, { opacity: active ? 1 : 0.55 }]}
              testID={`audio-chapter-${index}`}
            >
              <Text variant="caption" color={c.onGradientMuted} style={styles.chapterIndex} tabular>
                {String(index + 1).padStart(2, '0')}
              </Text>
              <Text
                variant="bodyMedium"
                tone="onGradient"
                numberOfLines={1}
                style={styles.chapterTitle}
              >
                {item.title}
              </Text>
              <Text variant="caption" color={c.onGradientMuted} tabular>
                {formatClock(item.durationSec)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelBody: { paddingTop: 12 },
  notice: { marginTop: 12 },
  speedPill: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: { marginTop: 44, paddingHorizontal: 28 },
  meta: { marginTop: 6 },
  deviceVoice: { marginTop: 6 },
  waveform: { marginTop: 40 },
  progress: { marginTop: 28 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 2, backgroundColor: palette.white },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    marginTop: 24,
  },
  seek: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  seekLabel: { marginTop: -6, letterSpacing: 0 },
  play: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapters: { marginTop: 36 },
  chaptersTitle: { marginBottom: 4 },
  chapter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  chapterIndex: { width: 22 },
  chapterTitle: { flex: 1, minWidth: 0 },
});
