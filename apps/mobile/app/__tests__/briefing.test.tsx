import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null, setStatusBarStyle: jest.fn() }));
jest.mock('@/lib/monitoring', () => ({
  captureError: jest.fn(),
  setupMonitoring: jest.fn(),
  wrapWithMonitoring: (c: unknown) => c,
}));
jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
  trackScreen: jest.fn(),
  resetAnalytics: jest.fn(),
}));
jest.mock('@/lib/i18n', () => ({
  formatCtx: (overrides: Record<string, unknown> = {}) => ({
    locale: 'tr',
    timezone: 'Europe/Istanbul',
    now: new Date('2026-09-05T06:41:00Z'),
    ...overrides,
  }),
  setupI18n: jest.fn(),
  changeLocale: jest.fn(),
}));
jest.mock('@/lib/openExternal', () => ({
  openExternal: jest.fn(async () => true),
  providerMailUrl: (webUrl: string | null | undefined) => webUrl ?? '',
  mapsUrl: (q: string) => `maps://?q=${encodeURIComponent(q)}`,
  telUrl: (p: string) => `tel:${p}`,
}));
jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: () => require('@/features/flow/testing/demoSource').getTestDataSource(),
}));

/**
 * The native briefing player (expo-audio / expo-speech) is replaced by an in-memory engine that keeps the
 * same contract: every control mutates `useUiStore.audio` exactly like the real singleton would.
 */
type UiStoreLike = {
  getState: () => {
    audio: AudioPlayerState;
    setAudio: (patch: Partial<AudioPlayerState>) => void;
    closeAudio: () => void;
  };
};
jest.mock('@/services/audio', () => {
  const SPEEDS = [1, 1.25, 1.5] as const;
  const ui = () => (require('@/store/ui') as { useUiStore: UiStoreLike }).useUiStore;
  const chapterAt = (chapters: AudioPlayerState['chapters'], position: number): number =>
    chapters.reduce((index, chapter, i) => (chapter.startSec <= position ? i : index), 0);
  const seekTo = async (sec: number): Promise<void> => {
    const store = ui().getState();
    const { durationSec, chapters } = store.audio;
    const positionSec = Math.max(0, Math.min(sec, durationSec > 0 ? durationSec : sec));
    store.setAudio({ positionSec, chapterIndex: chapterAt(chapters, positionSec) });
  };
  const player = {
    get state() {
      return ui().getState().audio;
    },
    load: jest.fn(async (snapshot: BriefingAudioSnapshot) => {
      const last = snapshot.chapters[snapshot.chapters.length - 1];
      ui()
        .getState()
        .setAudio({
          briefingId: snapshot.briefingId,
          title: snapshot.title,
          chapters: snapshot.chapters,
          script: snapshot.script,
          provider: snapshot.provider,
          url: snapshot.url ?? null,
          playing: false,
          positionSec: 0,
          durationSec: snapshot.durationSec ?? (last ? last.startSec + last.durationSec : 0),
          chapterIndex: 0,
          visible: true,
        });
      return true;
    }),
    play: jest.fn(async () => ui().getState().setAudio({ playing: true })),
    pause: jest.fn(async () => ui().getState().setAudio({ playing: false })),
    toggle: jest.fn(async () => {
      const store = ui().getState();
      store.setAudio({ playing: !store.audio.playing });
    }),
    seekBy: jest.fn(async (delta: number) => seekTo(ui().getState().audio.positionSec + delta)),
    seekTo: jest.fn(seekTo),
    jumpToChapter: jest.fn(async (index: number) => {
      const chapter = ui().getState().audio.chapters[index];
      if (chapter) await seekTo(chapter.startSec);
    }),
    setSpeed: jest.fn(async (speed: AudioPlayerState['speed']) =>
      ui().getState().setAudio({ speed }),
    ),
    stop: jest.fn(async () => ui().getState().closeAudio()),
  };
  return {
    briefingPlayer: player,
    SEEK_STEP_SEC: 15,
    PLAYBACK_SPEEDS: SPEEDS,
    nextSpeed: (current: AudioPlayerState['speed']) =>
      SPEEDS[(SPEEDS.indexOf(current) + 1) % SPEEDS.length] ?? 1,
  };
});

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
  useSegments: () => [],
  usePathname: () => '/briefing',
  useFocusEffect: jest.fn(),
}));

import { Share } from 'react-native';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import { ClientApiError } from '@da/api-client';
import { PRO_QUOTAS, type EntitlementState } from '@da/domain';
import BriefingScreen from '../briefing/[kind]';
import AudioScreen from '../briefing/audio';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';
import { track } from '@/lib/analytics';
import { briefingPlayer, type BriefingAudioSnapshot } from '@/services/audio';
import { useSessionStore } from '@/store/session';
import { useUiStore, type AudioPlayerState } from '@/store/ui';

/** Seed ids (mirror packages/api-client/src/demo/ids.ts). */
const BRIEFING_MORNING = '00000000-0000-4000-8000-0000000000b1';
const BRIEFING_EVENING = '00000000-0000-4000-8000-0000000000b3';
const THREAD_AHMET_REVIZE = '00000000-0000-4000-8000-0000000000e1';

const FIND_OPTS = { timeout: 5000 };

const PRO: EntitlementState = {
  plan: 'pro',
  isPro: true,
  source: 'demo',
  isTrial: false,
  quotas: PRO_QUOTAS,
  usage: { assistantQueriesToday: 0, capturesToday: 0, emailAccounts: 1, calendarAccounts: 1 },
};

function resetParams(next: Record<string, string>) {
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  Object.assign(mockParams, next);
}

function isDisabled(node: { props: { accessibilityState?: { disabled?: boolean } } }): boolean {
  return node.props.accessibilityState?.disabled === true;
}

/** Signed-in demo profile/preferences in the store; `status: 'loading'` keeps the entitlement query off. */
async function seedSession(entitlement: EntitlementState | null) {
  const ds = getTestDataSource();
  const [profile, preferences] = await Promise.all([
    ds.profile.getProfile(),
    ds.profile.getPreferences(),
  ]);
  useSessionStore.setState({ profile, preferences, entitlement, status: 'loading' });
  return { profile, preferences };
}

beforeEach(() => {
  resetTestDataSource();
  jest.clearAllMocks();
  useUiStore.getState().closeAudio();
  useUiStore.setState({ offline: false, pendingApprovals: 0, lastAnalyzedAt: null });
  resetParams({});
});

describe('Briefing screen', () => {
  it('renders the morning briefing (kicker, greeting, narrative, sections, listen CTA) and marks it opened', async () => {
    await seedSession(PRO);
    resetParams({ kind: 'morning' });
    const ds = getTestDataSource();
    const markOpened = jest.spyOn(ds.briefings, 'markOpened');
    const screen = renderWithProviders(<BriefingScreen />);

    expect(screen.getByTestId('briefing-screen')).toBeTruthy();
    await screen.findByTestId('briefing-row-priorities-0', {}, FIND_OPTS);
    expect(screen.getByText('SABAH BRİFİNGİ · 5 EYL')).toBeTruthy();
    expect(screen.getByText('Günaydın Yunus')).toBeTruthy();
    expect(screen.getByText('Bugün oldukça sakin bir günün var.')).toBeTruthy();
    expect(screen.getByText(/Öğlene kadar toplantın bulunmuyor\./)).toBeTruthy();
    for (const section of [
      'BUGÜNÜN ÖNCELİKLERİ',
      'PROGRAMIN',
      'SENDEN CEVAP BEKLEYENLER',
      'SENİN CEVAP BEKLEDİKLERİN',
      'SON TARİHLER',
      'KİŞİSEL GELİŞMELER',
    ])
      expect(screen.getByText(section)).toBeTruthy();
    expect(screen.getByText("Ahmet'e revize teklif")).toBeTruthy();
    expect(screen.getByTestId('briefing-row-schedule-3')).toBeTruthy();
    expect(screen.getByText('46 mail, 1 takvim, 3 gün geçmiş analiz edildi · 07:58')).toBeTruthy();
    expect(screen.getByText('Brifingi Dinle · 2 dk')).toBeTruthy();
    expect(screen.queryByTestId('briefing-share')).toBeNull();
    expect(screen.queryByTestId('offline-banner')).toBeNull();

    await waitFor(() => expect(markOpened).toHaveBeenCalledWith(BRIEFING_MORNING));
    await waitFor(async () =>
      expect((await ds.briefings.getBriefing({ kind: 'morning' }))?.openedAt).toBeTruthy(),
    );
    expect(track).toHaveBeenCalledWith('first_brief_opened', { itemCount: 15 });

    fireEvent.press(screen.getByTestId('briefing-row-priorities-0'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/email/[id]',
      params: { id: THREAD_AHMET_REVIZE },
    });
    fireEvent.press(screen.getByTestId('briefing-back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('"Dinle" fetches the narration into the player and opens the audio screen for Pro users', async () => {
    await seedSession(PRO);
    resetParams({ kind: 'morning' });
    const ds = getTestDataSource();
    const getAudio = jest.spyOn(ds.briefings, 'getAudio');
    const screen = renderWithProviders(<BriefingScreen />);
    fireEvent.press(await screen.findByTestId('briefing-listen', {}, FIND_OPTS));

    await waitFor(() => expect(getAudio).toHaveBeenCalledWith(BRIEFING_MORNING));
    await waitFor(() =>
      expect(briefingPlayer.load).toHaveBeenCalledWith(
        expect.objectContaining({
          briefingId: BRIEFING_MORNING,
          title: 'Sabah Brifingi',
          provider: 'device_tts',
        }),
      ),
    );
    expect(jest.mocked(briefingPlayer.load).mock.calls[0]?.[0].chapters).toHaveLength(6);
    await waitFor(() => expect(briefingPlayer.play).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/briefing/audio',
        params: { id: BRIEFING_MORNING },
      }),
    );
    expect(useUiStore.getState().audio).toEqual(
      expect.objectContaining({ briefingId: BRIEFING_MORNING, playing: true, visible: true }),
    );
  });

  it('gates the voice briefing behind Pro and reports when the narration cannot be prepared', async () => {
    await seedSession(null);
    resetParams({ kind: 'morning' });
    const ds = getTestDataSource();
    const getAudio = jest.spyOn(ds.briefings, 'getAudio');
    const screen = renderWithProviders(<BriefingScreen />);
    fireEvent.press(await screen.findByTestId('briefing-listen', {}, FIND_OPTS));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/paywall', params: { context: 'voice' } }),
    );
    expect(getAudio).not.toHaveBeenCalled();
    expect(briefingPlayer.load).not.toHaveBeenCalled();
    screen.unmount();

    await seedSession(PRO);
    mockPush.mockClear();
    getAudio.mockRejectedValueOnce(
      new ClientApiError({ code: 'ai_unavailable', message: 'tts down' }),
    );
    const retry = renderWithProviders(<BriefingScreen />);
    fireEvent.press(await retry.findByTestId('briefing-listen', {}, FIND_OPTS));
    expect(
      await retry.findByText('Sesli brifing şu an hazırlanamadı.', {}, FIND_OPTS),
    ).toBeTruthy();
    expect(briefingPlayer.load).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(useUiStore.getState().audio.briefingId).toBeNull();
  });

  it('gates the evening close behind Pro with the contextual paywall', async () => {
    await seedSession(null);
    resetParams({ kind: 'evening' });
    const screen = renderWithProviders(<BriefingScreen />);
    expect(await screen.findByTestId('briefing-pro-gate', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByText('Akşam kapanışı Pro ile.')).toBeTruthy();
    expect(
      screen.getByText("Akşam kapanışı Pro'da. Sabah brifingin her zaman ücretsiz."),
    ).toBeTruthy();
    expect(screen.queryByTestId('briefing-close-day')).toBeNull();
    fireEvent.press(screen.getByText("Pro'ya Geç"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/paywall',
      params: { context: 'evening' },
    });
    fireEvent.press(screen.getByText('Şimdi Değil'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('"Yarına Hazırım" lets the user pick the open items to carry over, then closes the day', async () => {
    const { preferences } = await seedSession(PRO);
    resetParams({ kind: 'evening' });
    const ds = getTestDataSource();
    const evening = await ds.briefings.getBriefing({ kind: 'evening' });
    const carried = (evening?.items ?? []).filter(
      (i) => i.section === 'carried_over' && i.insightId,
    );
    expect(carried.length).toBeGreaterThan(1);
    const closeDay = jest.spyOn(ds.briefings, 'closeDay');
    const screen = renderWithProviders(<BriefingScreen />);

    const close = await screen.findByTestId('briefing-close-day', {}, FIND_OPTS);
    expect(screen.getByText('AKŞAM KAPANIŞI · 5 EYL')).toBeTruthy();
    expect(screen.getByText(/^Bugünden yarına \d+ konu kaldı\.$/)).toBeTruthy();
    expect(screen.getByText(/^TAMAMLANANLAR · \d+$/)).toBeTruthy();
    expect(screen.getByText(`YARINA KALANLAR · ${carried.length}`)).toBeTruthy();
    expect(screen.getByText('YARININ İLK ETKİNLİĞİ')).toBeTruthy();
    expect(screen.getByText('Yarına Hazırım')).toBeTruthy();
    expect(isDisabled(close)).toBe(false);

    fireEvent.press(close);
    expect(await screen.findByText('Açık konular yarına taşınsın mı?', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByTestId('briefing-carry-sheet')).toBeTruthy();
    expect(
      screen.getByText(`Yarına Taşı · ${carried.length} konu yarının önceliklerine eklenecek.`),
    ).toBeTruthy();
    expect(screen.getByTestId(`briefing-carry-${carried.length - 1}`)).toBeTruthy();
    expect(closeDay).not.toHaveBeenCalled();

    // Deselect the first item: the counter follows and the confirmation carries the rest.
    fireEvent.press(screen.getByTestId('briefing-carry-0'));
    expect(
      await screen.findByText(
        `Yarına Taşı · ${carried.length - 1} konu yarının önceliklerine eklenecek.`,
      ),
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId('briefing-carry-confirm'));
    await waitFor(() => expect(closeDay).toHaveBeenCalledTimes(1));
    const input = closeDay.mock.calls[0]?.[0];
    expect(input?.briefingId).toBe(BRIEFING_EVENING);
    expect([...(input?.carryOverInsightIds ?? [])].sort()).toEqual(
      carried
        .slice(1)
        .map((i) => i.insightId as string)
        .sort(),
    );
    expect(
      await screen.findByText(
        `Akşam bildirimleri sessize alındı · Sabah brifingi ${preferences.briefing.morningTime}`,
        {},
        FIND_OPTS,
      ),
    ).toBeTruthy();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect((await ds.briefings.getBriefingById(BRIEFING_EVENING)).closedAt).toBeTruthy();
  });

  it('"Taşımadan kapat" closes the day without carry-over and the CTA turns into "Gün kapatıldı"', async () => {
    await seedSession(PRO);
    resetParams({ kind: 'evening' });
    const ds = getTestDataSource();
    const closeDay = jest.spyOn(ds.briefings, 'closeDay');
    const screen = renderWithProviders(<BriefingScreen />);
    fireEvent.press(await screen.findByTestId('briefing-close-day', {}, FIND_OPTS));
    await screen.findByText('Açık konular yarına taşınsın mı?', {}, FIND_OPTS);
    fireEvent.press(screen.getByTestId('briefing-carry-none'));
    await waitFor(() =>
      expect(closeDay).toHaveBeenCalledWith({
        briefingId: BRIEFING_EVENING,
        carryOverInsightIds: [],
      }),
    );
    expect(await screen.findByText('Gün kapatıldı', {}, FIND_OPTS)).toBeTruthy();
    expect(isDisabled(screen.getByTestId('briefing-close-day'))).toBe(true);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('shows the offline notice and blocks closing the day while offline', async () => {
    await seedSession(PRO);
    resetParams({ kind: 'evening' });
    useUiStore.setState({ offline: true });
    const ds = getTestDataSource();
    const closeDay = jest.spyOn(ds.briefings, 'closeDay');
    const screen = renderWithProviders(<BriefingScreen />);
    const close = await screen.findByTestId('briefing-close-day', {}, FIND_OPTS);
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    expect(screen.getByText('Çevrimdışısın.')).toBeTruthy();
    expect(isDisabled(close)).toBe(true);
    fireEvent.press(close);
    expect(screen.queryByTestId('briefing-carry-sheet')).toBeNull();
    expect(closeDay).not.toHaveBeenCalled();
  });

  it('midday pulse lists the changes since the morning and closes with Tamam', async () => {
    await seedSession(PRO);
    resetParams({ kind: 'midday' });
    const screen = renderWithProviders(<BriefingScreen />);
    await screen.findByTestId('briefing-row-changes-0', {}, FIND_OPTS);
    expect(screen.getByText('ÖĞLE NABZI')).toBeTruthy();
    expect(screen.getByText(/^Sabahından beri \d+ önemli gelişme oldu\.$/)).toBeTruthy();
    expect(screen.getByText('GELİŞMELER')).toBeTruthy();
    expect(screen.getByText('GÜNÜN GERİ KALANI')).toBeTruthy();
    expect(screen.queryByTestId('briefing-no-changes')).toBeNull();
    expect(screen.queryByTestId('briefing-listen')).toBeNull();
    fireEvent.press(screen.getByTestId('briefing-done'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('renders the weekly review with its metrics and shares counts only (never names)', async () => {
    await seedSession(PRO);
    resetParams({ kind: 'weekly' });
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const screen = renderWithProviders(<BriefingScreen />);
    await screen.findByTestId('weekly-share', {}, FIND_OPTS);
    expect(screen.getByText('Haftan nasıl geçti?')).toBeTruthy();
    // The week range is the header kicker → upper-cased with Turkish casing.
    expect(screen.getByText('31 AĞUSTOS – 6 EYLÜL')).toBeTruthy();
    expect(screen.getByText('684')).toBeTruthy();
    expect(screen.getByText('mail analiz edildi')).toBeTruthy();
    expect(screen.getByText("toplantı, 14'üne hazırlık notu")).toBeTruthy();
    expect(screen.getByText('KAZANDIĞIN ZAMAN')).toBeTruthy();
    expect(screen.getByText('EN ÇOK İLETİŞİM')).toBeTruthy();
    // Top people appear in the share card and again as section rows.
    expect(screen.getAllByText('9 etkileşim').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Mehmet Yılmaz').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('GELECEK HAFTA')).toBeTruthy();
    expect(screen.getByTestId('briefing-share')).toBeTruthy();

    fireEvent.press(screen.getByTestId('weekly-share'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const payload = share.mock.calls[0]?.[0] as { message: string; title?: string };
    expect(payload.title).toBe('Dijital Haftam');
    expect(payload.message).toContain('DİJİTAL HAFTAM · 31 Ağustos – 6 Eylül');
    expect(payload.message).toContain('684 mail analiz edildi');
    expect(payload.message).toContain('32 önemli konu öne çıkarıldı');
    expect(payload.message).toContain('KAZANDIĞIN ZAMAN');
    expect(payload.message).not.toMatch(/Mehmet|Ahmet|Selin/);

    fireEvent.press(screen.getByTestId('briefing-share'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
  });

  it('shows the "not ready" empty state and regenerates on request', async () => {
    await seedSession(PRO);
    resetParams({ kind: 'morning' });
    const ds = getTestDataSource();
    const getBriefing = jest.spyOn(ds.briefings, 'getBriefing').mockResolvedValueOnce(null);
    const screen = renderWithProviders(<BriefingScreen />);
    expect(await screen.findByTestId('briefing-empty', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByText('Henüz hazır değil.')).toBeTruthy();
    expect(screen.getByText("Brifing 08:00'da hazırlanacak.")).toBeTruthy();
    expect(screen.queryByTestId('briefing-listen')).toBeNull();

    fireEvent.press(screen.getByText('Yeniden Hazırla'));
    await waitFor(() =>
      expect(getBriefing).toHaveBeenCalledWith({ kind: 'morning', regenerate: true }),
    );
    await screen.findByTestId('briefing-row-priorities-0', {}, FIND_OPTS);
    expect(screen.queryByTestId('briefing-empty')).toBeNull();
    expect((await ds.briefings.getBriefing({ kind: 'morning' }))?.version).toBe(2);
  });

  it('shows the calm error state and recovers on retry', async () => {
    await seedSession(PRO);
    resetParams({ kind: 'morning' });
    const ds = getTestDataSource();
    jest
      .spyOn(ds.briefings, 'getBriefing')
      .mockRejectedValueOnce(new ClientApiError({ code: 'ai_unavailable', message: 'llm down' }));
    const screen = renderWithProviders(<BriefingScreen />);
    expect(await screen.findByTestId('briefing-error', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByText('Brifing şu an hazırlanamadı.')).toBeTruthy();
    expect(screen.getByText('AI şu an kullanılamıyor.')).toBeTruthy();
    fireEvent.press(screen.getByText('Tekrar dene'));
    await screen.findByTestId('briefing-row-priorities-0', {}, FIND_OPTS);
    expect(screen.queryByTestId('briefing-error')).toBeNull();
  });
});

describe('Audio player screen', () => {
  /** Loads today's morning narration into the (mocked) player the way `useAudioPlayer.load` does. */
  async function loadMorningNarration() {
    const ds = getTestDataSource();
    const audio = await ds.briefings.getAudio(BRIEFING_MORNING);
    await briefingPlayer.load({
      briefingId: BRIEFING_MORNING,
      title: 'Sabah Brifingi',
      provider: audio.provider,
      url: audio.url,
      script: audio.script,
      chapters: audio.chapters,
    });
    jest.mocked(briefingPlayer.load).mockClear();
    return audio;
  }

  it('shows the empty state when nothing is playing', async () => {
    await seedSession(PRO);
    const screen = renderWithProviders(<AudioScreen />);
    expect(screen.getByTestId('audio-screen')).toBeTruthy();
    expect(screen.getByTestId('audio-empty')).toBeTruthy();
    expect(screen.getByText('Şu an çalan bir brifing yok.')).toBeTruthy();
    expect(screen.queryByTestId('audio-play')).toBeNull();
    fireEvent.press(screen.getByText('Geri'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('audio-close'));
    expect(mockBack).toHaveBeenCalledTimes(2);
  });

  it('drives play/pause, ±15 s, speed and chapter jumps through the player', async () => {
    await seedSession(PRO);
    const audio = await loadMorningNarration();
    const screen = renderWithProviders(<AudioScreen />);

    expect(screen.getByText('SESLİ BRİFİNG')).toBeTruthy();
    expect(screen.getByText('Sabah Brifingi')).toBeTruthy();
    expect(screen.getByText('Cihaz sesi kullanılıyor')).toBeTruthy();
    // The date arrives with the briefing behind the narration.
    expect(await screen.findByText('5 Eyl · 2:14 · Genel bakış', {}, FIND_OPTS)).toBeTruthy();
    // Kicker copy is upper-cased with Turkish casing by the Text primitive.
    expect(screen.getByText('BÖLÜMLER')).toBeTruthy();
    audio.chapters.forEach((chapter, index) => {
      expect(
        within(screen.getByTestId(`audio-chapter-${index}`)).getByText(chapter.title),
      ).toBeTruthy();
    });
    expect(screen.getByText('0:00')).toBeTruthy();
    expect(screen.getByText('2:14')).toBeTruthy();
    expect(screen.getByText('1x')).toBeTruthy();
    expect(screen.getByTestId('audio-play').props.accessibilityLabel).toBe('Oynat');

    fireEvent.press(screen.getByTestId('audio-play'));
    await waitFor(() => expect(briefingPlayer.toggle).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('audio-play').props.accessibilityLabel).toBe('Duraklat'),
    );
    fireEvent.press(screen.getByTestId('audio-play'));
    await waitFor(() =>
      expect(screen.getByTestId('audio-play').props.accessibilityLabel).toBe('Oynat'),
    );

    fireEvent.press(screen.getByTestId('audio-forward15'));
    await waitFor(() => expect(briefingPlayer.seekBy).toHaveBeenCalledWith(15));
    expect(await screen.findByText('0:15')).toBeTruthy();
    fireEvent.press(screen.getByTestId('audio-back15'));
    await waitFor(() => expect(briefingPlayer.seekBy).toHaveBeenCalledWith(-15));
    await waitFor(() => expect(screen.queryByText('0:15')).toBeNull());

    fireEvent.press(screen.getByTestId('audio-speed'));
    await waitFor(() => expect(briefingPlayer.setSpeed).toHaveBeenCalledWith(1.25));
    expect(await screen.findByText('1.25x')).toBeTruthy();
    fireEvent.press(screen.getByTestId('audio-speed'));
    expect(await screen.findByText('1.5x')).toBeTruthy();
    fireEvent.press(screen.getByTestId('audio-speed'));
    expect(await screen.findByText('1x')).toBeTruthy();

    fireEvent.press(screen.getByTestId('audio-chapter-2'));
    await waitFor(() => expect(briefingPlayer.jumpToChapter).toHaveBeenCalledWith(2));
    expect(await screen.findByText('0:50')).toBeTruthy();
    expect(screen.getByText('5 Eyl · 2:14 · Programın')).toBeTruthy();
    expect(screen.getByTestId('audio-chapter-2').props.accessibilityState?.selected).toBe(true);
    expect(screen.getByTestId('audio-chapter-0').props.accessibilityState?.selected).toBe(false);
    // The track is a plain View (not an accessibility element), so query it by its role prop.
    const tracks = screen.UNSAFE_getAllByProps({ accessibilityRole: 'progressbar' });
    expect(tracks.length).toBeGreaterThan(0);
    for (const node of tracks)
      expect(node.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 37 });
  });

  it('loads a deep-linked briefing once, shows the error state on failure and retries', async () => {
    await seedSession(PRO);
    resetParams({ id: BRIEFING_MORNING });
    const ds = getTestDataSource();
    const getAudio = jest
      .spyOn(ds.briefings, 'getAudio')
      .mockRejectedValueOnce(new ClientApiError({ code: 'ai_unavailable', message: 'tts down' }));
    const screen = renderWithProviders(<AudioScreen />);

    expect(await screen.findByTestId('audio-error', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByText('Sesli brifing şu an hazırlanamadı.')).toBeTruthy();
    expect(screen.getByText('AI şu an kullanılamıyor.')).toBeTruthy();
    expect(getAudio).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().audio.briefingId).toBeNull();

    fireEvent.press(screen.getByText('Tekrar dene'));
    await waitFor(() => expect(getAudio).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(briefingPlayer.load).toHaveBeenCalledWith(
        expect.objectContaining({ briefingId: BRIEFING_MORNING, title: 'Sabah Brifingi' }),
      ),
    );
    await waitFor(() => expect(briefingPlayer.play).toHaveBeenCalled());
    expect(await screen.findByTestId('audio-play', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByText('Sabah Brifingi')).toBeTruthy();
    expect(await screen.findByText('5 Eyl · 2:14 · Genel bakış', {}, FIND_OPTS)).toBeTruthy();
    expect(useUiStore.getState().audio.briefingId).toBe(BRIEFING_MORNING);
    expect(briefingPlayer.load).toHaveBeenCalledTimes(1);
  });

  it('waits for connectivity instead of loading a deep-linked briefing while offline', async () => {
    await seedSession(PRO);
    resetParams({ id: BRIEFING_MORNING });
    useUiStore.setState({ offline: true });
    const ds = getTestDataSource();
    const getAudio = jest.spyOn(ds.briefings, 'getAudio');
    const screen = renderWithProviders(<AudioScreen />);
    expect(await screen.findByTestId('audio-offline', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByText('Bu işlem için internet bağlantısı gerekiyor.')).toBeTruthy();
    expect(getAudio).not.toHaveBeenCalled();
    expect(briefingPlayer.load).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Geri'));
    expect(mockBack).toHaveBeenCalled();
  });
});
