/**
 * Floating mini player rendered once in the root navigator. Visible while a briefing is loaded, sticks
 * 8 px above the tab bar (62 + bottom safe-area, matching `(tabs)/_layout`), hidden on the full player
 * route. Tap → `/briefing/audio`; play/pause and close drive the player singleton directly.
 */
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useRouter, usePathname, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { MiniPlayer } from '@da/ui';
import { useUiStore } from '@/store/ui';
import { briefingPlayer } from '@/services/audio';

/** Tab bar content height before the bottom inset (see `(tabs)/_layout`). */
const TAB_BAR_CONTENT_HEIGHT = 62;
const TAB_BAR_MIN_BOTTOM_PAD = Platform.OS === 'android' ? 12 : 22;
const GAP_ABOVE_TAB_BAR = 8;
const FULL_PLAYER_ROUTE = '/briefing/audio';

export function miniPlayerBottomOffset(bottomInset: number): number {
  return TAB_BAR_CONTENT_HEIGHT + Math.max(bottomInset, TAB_BAR_MIN_BOTTOM_PAD) + GAP_ABOVE_TAB_BAR;
}

export function AudioMiniPlayer() {
  const audio = useUiStore((s) => s.audio);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const briefingId = audio.briefingId;

  const openFullPlayer = useCallback(() => {
    if (!briefingId) return;
    router.push({ pathname: FULL_PLAYER_ROUTE, params: { id: briefingId } } as Href);
  }, [briefingId, router]);
  const onToggle = useCallback(() => {
    void briefingPlayer.toggle();
  }, []);
  const onClose = useCallback(() => {
    void briefingPlayer.stop();
  }, []);

  if (!audio.visible || pathname.startsWith(FULL_PLAYER_ROUTE)) return null;

  const chapter = audio.chapters[audio.chapterIndex]?.title ?? '';

  return (
    <MiniPlayer
      testID="audio-mini-player"
      title={chapter ? t('briefing.audio.miniTitle', { chapter }) : audio.title}
      positionSec={audio.positionSec}
      durationSec={audio.durationSec}
      playing={audio.playing}
      onToggle={onToggle}
      onClose={onClose}
      onPress={openFullPlayer}
      playLabel={t('a11y.play')}
      pauseLabel={t('a11y.pause')}
      closeLabel={t('a11y.close')}
      bottomOffset={miniPlayerBottomOffset(insets.bottom)}
    />
  );
}
