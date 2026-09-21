/**
 * React binding for the briefing player singleton: state from the UI store, imperative controls, and
 * `load(briefingId)` which fetches the narration (`briefings.getAudio`) and starts playback.
 * The Pro gate for `voice_briefing` belongs to the calling screen (`useEntitlement().gate`), not here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@da/i18n';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/monitoring';
import { readCache, writeCache } from '@/lib/storage';
import { useUiStore } from '@/store/ui';
import { briefingPlayer, nextSpeed, SEEK_STEP_SEC, type PlaybackSpeed } from '@/services/audio';
import { useDataSource } from './useDataSource';

export const BRIEF_OPENED_CACHE_KEY = 'analytics.briefOpened.v1';
const MAX_TRACKED_BRIEFINGS = 50;

/** Fires `first_brief_opened` once per briefing; the flag lives in the encrypted cache. Returns true when tracked. */
export function trackFirstBriefOpenedOnce(briefingId: string, itemCount: number): boolean {
  let opened: string[] = [];
  try {
    opened = readCache<string[]>(BRIEF_OPENED_CACHE_KEY) ?? [];
  } catch (e) {
    captureError(e, { where: 'useAudioPlayer.readOpened' });
  }
  if (opened.includes(briefingId)) return false;
  track('first_brief_opened', { itemCount });
  try {
    writeCache(BRIEF_OPENED_CACHE_KEY, [...opened, briefingId].slice(-MAX_TRACKED_BRIEFINGS));
  } catch (e) {
    captureError(e, { where: 'useAudioPlayer.writeOpened' });
  }
  return true;
}

export interface LoadAudioOptions {
  /** Title shown in the players; defaults to "Sabah Brifingi". */
  title?: string;
  /** Start playing right after loading (default true). */
  autoplay?: boolean;
}

export function useAudioPlayer() {
  const ds = useDataSource();
  const state = useUiStore((s) => s.audio);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (briefingId: string, opts: LoadAudioOptions = {}): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const audio = await ds.briefings.getAudio(briefingId);
        const ok = await briefingPlayer.load({
          briefingId,
          title: opts.title ?? t('briefing.audio.morningTitle'),
          provider: audio.provider,
          url: audio.url ?? null,
          script: audio.script,
          chapters: audio.chapters,
        });
        if (!ok) return false;
        trackFirstBriefOpenedOnce(briefingId, audio.chapters.length);
        if (opts.autoplay !== false) await briefingPlayer.play();
        return true;
      } catch (e) {
        captureError(e, { where: 'useAudioPlayer.load' });
        if (mounted.current) setError(e);
        return false;
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [ds],
  );

  const play = useCallback(() => briefingPlayer.play(), []);
  const pause = useCallback(() => briefingPlayer.pause(), []);
  const toggle = useCallback(() => briefingPlayer.toggle(), []);
  const seekBy = useCallback((deltaSec: number) => briefingPlayer.seekBy(deltaSec), []);
  const seekBack = useCallback(() => briefingPlayer.seekBy(-SEEK_STEP_SEC), []);
  const seekForward = useCallback(() => briefingPlayer.seekBy(SEEK_STEP_SEC), []);
  const seekTo = useCallback((sec: number) => briefingPlayer.seekTo(sec), []);
  const jumpToChapter = useCallback((index: number) => briefingPlayer.jumpToChapter(index), []);
  const setSpeed = useCallback((speed: PlaybackSpeed) => briefingPlayer.setSpeed(speed), []);
  const cycleSpeed = useCallback(
    () => briefingPlayer.setSpeed(nextSpeed(useUiStore.getState().audio.speed)),
    [],
  );
  const close = useCallback(() => briefingPlayer.stop(), []);
  const isCurrent = useCallback(
    (briefingId: string) => useUiStore.getState().audio.briefingId === briefingId,
    [],
  );

  return {
    state,
    loading,
    error,
    load,
    play,
    pause,
    toggle,
    seekBy,
    seekBack,
    seekForward,
    seekTo,
    jumpToChapter,
    setSpeed,
    cycleSpeed,
    close,
    isCurrent,
    seekStepSec: SEEK_STEP_SEC,
  };
}
