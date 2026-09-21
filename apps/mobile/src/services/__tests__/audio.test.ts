jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));

type StatusListener = (status: Record<string, unknown>) => void;

interface FakePlayer {
  listeners: StatusListener[];
  play: jest.Mock;
  pause: jest.Mock;
  seekTo: jest.Mock;
  setPlaybackRate: jest.Mock;
  setActiveForLockScreen: jest.Mock;
  clearLockScreenControls: jest.Mock;
  remove: jest.Mock;
  addListener: (event: string, listener: StatusListener) => { remove: () => void };
  emit: (status: Record<string, unknown>) => void;
}

const players: FakePlayer[] = [];

function mockMakeFakePlayer(): FakePlayer {
  const player: FakePlayer = {
    listeners: [],
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(async () => undefined),
    setPlaybackRate: jest.fn(),
    setActiveForLockScreen: jest.fn(),
    clearLockScreenControls: jest.fn(),
    remove: jest.fn(),
    addListener: (_event, listener) => {
      player.listeners.push(listener);
      return {
        remove: () => {
          player.listeners = player.listeners.filter((l) => l !== listener);
        },
      };
    },
    emit: (status) => player.listeners.forEach((l) => l(status)),
  };
  players.push(player);
  return player;
}

const mockSetAudioMode = jest.fn(async () => undefined);
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => mockMakeFakePlayer()),
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioMode(...(args as [])),
}));

interface SpokenUtterance {
  text: string;
  options: {
    rate?: number;
    voice?: string;
    language?: string;
    onDone?: () => void;
    onBoundary?: (ev: { charIndex: number; charLength: number }) => void;
    onError?: (e: Error) => void;
  };
}
const mockSpoken: SpokenUtterance[] = [];
const mockSpeechStop = jest.fn(async () => undefined);
const mockSpeechPause = jest.fn(async () => undefined);
const mockSpeechResume = jest.fn(async () => undefined);
jest.mock('expo-speech', () => ({
  VoiceQuality: { Default: 'Default', Enhanced: 'Enhanced' },
  maxSpeechInputLength: 4000,
  speak: jest.fn((text: string, options: SpokenUtterance['options']) => {
    mockSpoken.push({ text, options });
  }),
  stop: (...args: unknown[]) => mockSpeechStop(...(args as [])),
  pause: (...args: unknown[]) => mockSpeechPause(...(args as [])),
  resume: (...args: unknown[]) => mockSpeechResume(...(args as [])),
  isSpeakingAsync: jest.fn(async () => true),
  getAvailableVoicesAsync: jest.fn(async () => [
    {
      identifier: 'com.apple.voice.compact.en-US.Samantha',
      name: 'Samantha',
      quality: 'Default',
      language: 'en-US',
    },
    {
      identifier: 'com.apple.voice.compact.tr-TR.Yelda',
      name: 'Yelda',
      quality: 'Default',
      language: 'tr-TR',
    },
    {
      identifier: 'com.apple.voice.enhanced.tr-TR.Yelda',
      name: 'Yelda (Enhanced)',
      quality: 'Enhanced',
      language: 'tr-TR',
    },
  ]),
}));

import { Platform } from 'react-native';
import { useUiStore } from '@/store/ui';
import {
  briefingPlayer,
  buildDeviceTimeline,
  chapterIndexAt,
  estimateSpeechSeconds,
  nextSpeed,
  normalizeServerChapters,
  pickTurkishVoice,
  positionForBoundary,
  resetVoiceCache,
  sentenceIndexAt,
  speechRateFor,
  splitSentences,
  type AudioChapter,
} from '@/services/audio';

const chapters: AudioChapter[] = [
  {
    index: 0,
    title: 'Genel bakış',
    startSec: 0,
    durationSec: 18,
    text: 'Merhaba Yunus. Bugün bilmen gereken beş şey var. Gün oldukça sakin görünüyor.',
  },
  {
    index: 1,
    title: 'Öncelikler',
    startSec: 18,
    durationSec: 32,
    text: 'Mehmet Yılmaz teklif hakkında yanıt bekliyor! Fatura son ödeme tarihi yarın. Ayşe ile toplantı on dörtte.',
  },
  {
    index: 2,
    title: 'Takipler',
    startSec: 50,
    durationSec: 24,
    text: 'Ahmet üç gündür yanıt vermedi.',
  },
];

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-05T08:00:00Z'));
  players.splice(0);
  mockSpoken.splice(0);
  mockSetAudioMode.mockClear();
  mockSpeechStop.mockClear();
  mockSpeechPause.mockClear();
  mockSpeechResume.mockClear();
  resetVoiceCache();
  await briefingPlayer.stop();
  // The chosen speed deliberately survives stop(); tests start from 1×.
  await briefingPlayer.setSpeed(1);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('pure helpers', () => {
  it('cycles speeds and maps them to intelligible speech rates', () => {
    expect(nextSpeed(1)).toBe(1.25);
    expect(nextSpeed(1.25)).toBe(1.5);
    expect(nextSpeed(1.5)).toBe(1);
    expect(speechRateFor(1)).toBe(1);
    expect(speechRateFor(1.25)).toBe(1.15);
    expect(speechRateFor(1.5)).toBe(1.3);
  });

  it('splits narration into sentences and estimates 150 wpm', () => {
    expect(splitSentences('Merhaba Yunus. Bugün 5 şey var! Hazır mısın? Evet…  ')).toEqual([
      'Merhaba Yunus.',
      'Bugün 5 şey var!',
      'Hazır mısın?',
      'Evet…',
    ]);
    expect(splitSentences('')).toEqual([]);
    expect(estimateSpeechSeconds('')).toBe(0);
    expect(estimateSpeechSeconds('bir iki üç')).toBe(1.2);
    // 150 words → exactly one minute at 1×
    expect(estimateSpeechSeconds(Array.from({ length: 150 }, () => 'kelime').join(' '))).toBe(60);
  });

  it('builds a cumulative device timeline and recomputes chapter offsets', () => {
    const timeline = buildDeviceTimeline(chapters);
    expect(timeline.sentences).toHaveLength(7);
    expect(timeline.chapters[0]?.startSec).toBe(0);
    expect(timeline.chapters[1]?.startSec).toBe(timeline.chapters[0]?.durationSec);
    expect(timeline.chapters[2]?.startSec).toBeCloseTo(
      (timeline.chapters[1]?.startSec ?? 0) + (timeline.chapters[1]?.durationSec ?? 0),
      0,
    );
    expect(timeline.durationSec).toBeGreaterThan(0);
    const last = timeline.sentences[timeline.sentences.length - 1];
    expect(timeline.durationSec).toBeCloseTo((last?.startSec ?? 0) + (last?.durationSec ?? 0), 1);
    expect(chapterIndexAt(timeline.chapters, 0)).toBe(0);
    expect(chapterIndexAt(timeline.chapters, timeline.chapters[1]?.startSec ?? 0)).toBe(1);
    expect(chapterIndexAt(timeline.chapters, 10_000)).toBe(2);
    expect(sentenceIndexAt(timeline.sentences, -5)).toBe(0);
    expect(sentenceIndexAt(timeline.sentences, 10_000)).toBe(6);
    expect(sentenceIndexAt([], 3)).toBe(-1);
  });

  it('normalises server chapters with missing offsets', () => {
    const normalised = normalizeServerChapters([
      { index: 0, title: 'A', startSec: 0, durationSec: 10, text: 'a' },
      { index: 1, title: 'B', startSec: 0, durationSec: 5, text: 'b' },
    ]);
    expect(normalised.map((c) => c.startSec)).toEqual([0, 10]);
    expect(normalizeServerChapters(chapters).map((c) => c.startSec)).toEqual([0, 18, 50]);
  });

  it('maps a word boundary inside an utterance to an estimated position', () => {
    const { sentences } = buildDeviceTimeline(chapters);
    const first = sentences[0];
    const second = sentences[1];
    if (!first || !second) throw new Error('fixture');
    expect(positionForBoundary(sentences, 0, 3, 0)).toBe(0);
    // Start of the second sentence (first sentence + joining space)
    expect(positionForBoundary(sentences, 0, 3, first.text.length + 1)).toBeCloseTo(
      second.startSec,
      5,
    );
    // Past the end clamps to the utterance end
    expect(positionForBoundary(sentences, 0, 3, 10_000)).toBeCloseTo(
      (sentences[2]?.startSec ?? 0) + (sentences[2]?.durationSec ?? 0),
      5,
    );
  });

  it('prefers an enhanced Turkish voice', async () => {
    await expect(pickTurkishVoice()).resolves.toBe('com.apple.voice.enhanced.tr-TR.Yelda');
  });
});

describe('server_tts engine', () => {
  const snapshot = {
    briefingId: 'b-1',
    title: 'Sabah Brifingi',
    provider: 'server_tts' as const,
    url: 'https://cdn.example.com/b1.m4a',
    script: 's',
    chapters,
  };

  it('loads with background audio mode, mirrors status into the store and drives the player', async () => {
    await expect(briefingPlayer.load(snapshot)).resolves.toBe(true);
    expect(mockSetAudioMode).toHaveBeenCalledWith(
      expect.objectContaining({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      }),
    );
    const player = players[0];
    if (!player) throw new Error('player not created');
    expect(player.setActiveForLockScreen).toHaveBeenCalled();
    let audio = useUiStore.getState().audio;
    expect(audio).toMatchObject({
      briefingId: 'b-1',
      provider: 'server_tts',
      visible: true,
      playing: false,
      positionSec: 0,
      durationSec: 74,
      chapterIndex: 0,
    });

    await briefingPlayer.play();
    expect(player.play).toHaveBeenCalledTimes(1);
    player.emit({
      playing: true,
      currentTime: 20,
      duration: 74,
      didJustFinish: false,
      error: null,
    });
    audio = useUiStore.getState().audio;
    expect(audio.playing).toBe(true);
    expect(audio.positionSec).toBe(20);
    expect(audio.chapterIndex).toBe(1);

    await briefingPlayer.toggle();
    expect(player.pause).toHaveBeenCalledTimes(1);

    await briefingPlayer.seekBy(-15);
    expect(player.seekTo).toHaveBeenLastCalledWith(5);
    await briefingPlayer.jumpToChapter(2);
    expect(player.seekTo).toHaveBeenLastCalledWith(50);
    expect(useUiStore.getState().audio.chapterIndex).toBe(2);
    await briefingPlayer.seekTo(1000);
    expect(player.seekTo).toHaveBeenLastCalledWith(74);

    await briefingPlayer.setSpeed(1.5);
    expect(player.setPlaybackRate).toHaveBeenLastCalledWith(1.5, 'high');
    expect(useUiStore.getState().audio.speed).toBe(1.5);

    player.emit({
      playing: false,
      currentTime: 74,
      duration: 74,
      didJustFinish: true,
      error: null,
    });
    expect(useUiStore.getState().audio).toMatchObject({
      playing: false,
      positionSec: 0,
      chapterIndex: 0,
      visible: true,
    });

    await briefingPlayer.stop();
    expect(player.clearLockScreenControls).toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalled();
    expect(useUiStore.getState().audio.visible).toBe(false);
    // The chosen speed survives closing the player.
    expect(useUiStore.getState().audio.speed).toBe(1.5);
  });

  it('rebuilds the player when media services reset instead of going silent', async () => {
    await briefingPlayer.load(snapshot);
    const first = players[0];
    if (!first) throw new Error('player not created');
    first.emit({ playing: true, currentTime: 30, duration: 74, didJustFinish: false, error: null });
    first.emit({
      mediaServicesDidReset: true,
      playing: false,
      currentTime: 0,
      duration: 74,
      didJustFinish: false,
      error: null,
    });
    expect(first.remove).toHaveBeenCalled();
    const second = players[1];
    if (!second) throw new Error('player not recreated');
    expect(second.seekTo).toHaveBeenCalledWith(30);
    expect(useUiStore.getState().audio.playing).toBe(false);
  });

  it('falls back to device TTS when a server response has no url', async () => {
    await briefingPlayer.load({ ...snapshot, url: null });
    expect(players).toHaveLength(0);
    expect(useUiStore.getState().audio.provider).toBe('device_tts');
  });
});

describe('device_tts engine', () => {
  const snapshot = {
    briefingId: 'b-2',
    title: 'Sabah Brifingi',
    provider: 'device_tts' as const,
    url: null,
    script: 's',
    chapters,
  };
  const timeline = buildDeviceTimeline(chapters);

  it('speaks chapter by chapter with the Turkish voice, tracks an estimated position and finishes', async () => {
    await expect(briefingPlayer.load(snapshot)).resolves.toBe(true);
    const audio = useUiStore.getState().audio;
    expect(audio.provider).toBe('device_tts');
    expect(audio.durationSec).toBeCloseTo(timeline.durationSec, 1);
    expect(audio.chapters.map((c) => c.startSec)).toEqual(timeline.chapters.map((c) => c.startSec));

    await briefingPlayer.play();
    expect(mockSpoken).toHaveLength(1);
    const first = mockSpoken[0];
    if (!first) throw new Error('no utterance');
    expect(first.text).toBe(chapters[0]?.text);
    expect(first.options.language).toBe('tr-TR');
    expect(first.options.voice).toBe('com.apple.voice.enhanced.tr-TR.Yelda');
    expect(first.options.rate).toBe(1);
    expect(useUiStore.getState().audio.playing).toBe(true);

    // Two seconds of real time at 1× → ~2 s of estimated position.
    jest.advanceTimersByTime(2000);
    expect(useUiStore.getState().audio.positionSec).toBeCloseTo(2, 0);

    // A word boundary at the start of the second sentence re-anchors the estimate.
    const sentence0 = timeline.sentences[0];
    const sentence1 = timeline.sentences[1];
    if (!sentence0 || !sentence1) throw new Error('fixture');
    first.options.onBoundary?.({ charIndex: sentence0.text.length + 1, charLength: 5 });
    jest.advanceTimersByTime(250);
    expect(useUiStore.getState().audio.positionSec).toBeCloseTo(sentence1.startSec + 0.25, 0);

    // Chapter done → next chapter starts at its offset.
    first.options.onDone?.();
    expect(mockSpoken).toHaveLength(2);
    expect(mockSpoken[1]?.text).toBe(chapters[1]?.text);
    expect(useUiStore.getState().audio.chapterIndex).toBe(1);
    expect(useUiStore.getState().audio.positionSec).toBeCloseTo(
      timeline.chapters[1]?.startSec ?? 0,
      1,
    );

    mockSpoken[1]?.options.onDone?.();
    expect(mockSpoken).toHaveLength(3);
    mockSpoken[2]?.options.onDone?.();
    expect(mockSpoken).toHaveLength(3);
    expect(useUiStore.getState().audio).toMatchObject({
      playing: false,
      positionSec: 0,
      chapterIndex: 0,
      visible: true,
    });
  });

  it('seeks by restarting the sentence that contains the target offset', async () => {
    await briefingPlayer.load(snapshot);
    await briefingPlayer.play();
    const target = timeline.sentences[4];
    if (!target) throw new Error('fixture');
    await briefingPlayer.seekTo(target.startSec + 0.5);
    expect(mockSpoken).toHaveLength(2);
    expect(mockSpoken[1]?.text.startsWith(target.text)).toBe(true);
    expect(useUiStore.getState().audio.positionSec).toBeCloseTo(target.startSec, 1);
    expect(useUiStore.getState().audio.chapterIndex).toBe(target.chapterIndex);

    // ±15 s from inside chapter 2 lands on a sentence start and never below zero.
    await briefingPlayer.seekBy(-1000);
    expect(useUiStore.getState().audio.positionSec).toBe(0);
    expect(mockSpoken[2]?.text).toBe(chapters[0]?.text);
  });

  it('changes rate by re-speaking the current sentence', async () => {
    await briefingPlayer.load(snapshot);
    await briefingPlayer.play();
    await briefingPlayer.setSpeed(1.5);
    expect(mockSpoken).toHaveLength(2);
    expect(mockSpoken[1]?.options.rate).toBe(1.3);
    expect(useUiStore.getState().audio.speed).toBe(1.5);
    jest.advanceTimersByTime(2000);
    // 1.5× → two real seconds advance the 1× timeline by three seconds.
    expect(useUiStore.getState().audio.positionSec).toBeCloseTo(3, 0);
  });

  it('pauses natively on iOS and restarts the sentence on Android', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    try {
      await briefingPlayer.load(snapshot);
      await briefingPlayer.play();
      jest.advanceTimersByTime(1000);
      await briefingPlayer.pause();
      expect(mockSpeechPause).toHaveBeenCalledTimes(1);
      expect(useUiStore.getState().audio.playing).toBe(false);
      const paused = useUiStore.getState().audio.positionSec;
      expect(paused).toBeGreaterThan(0);
      await briefingPlayer.play();
      expect(mockSpeechResume).toHaveBeenCalledTimes(1);
      expect(mockSpoken).toHaveLength(1);
      expect(useUiStore.getState().audio.playing).toBe(true);
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    }

    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      await briefingPlayer.stop();
      mockSpoken.splice(0);
      mockSpeechStop.mockClear();
      await briefingPlayer.load(snapshot);
      await briefingPlayer.play();
      jest.advanceTimersByTime(1000);
      await briefingPlayer.pause();
      expect(mockSpeechPause).toHaveBeenCalledTimes(1); // unchanged: no native pause on Android
      expect(mockSpeechStop).toHaveBeenCalled();
      expect(useUiStore.getState().audio.playing).toBe(false);
      await briefingPlayer.play();
      expect(mockSpoken).toHaveLength(2);
      // Resume restarts at the sentence containing the paused position (~1 s → second sentence), not the chapter.
      expect(mockSpoken[1]?.text).toBe(
        'Bugün bilmen gereken beş şey var. Gün oldukça sakin görünüyor.',
      );
      expect(chapters[0]?.text.endsWith(mockSpoken[1]?.text ?? '')).toBe(true);
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    }
  });

  it('treats a synthesizer that went silent long after the estimated end as an interruption', async () => {
    const Speech = jest.requireMock('expo-speech') as { isSpeakingAsync: jest.Mock };
    Speech.isSpeakingAsync.mockResolvedValueOnce(false);
    await briefingPlayer.load(snapshot);
    await briefingPlayer.play();
    const chapterEnd = (timeline.chapters[0]?.durationSec ?? 0) * 1000;
    jest.advanceTimersByTime(chapterEnd + 5000);
    await flush();
    expect(useUiStore.getState().audio.playing).toBe(false);
    expect(useUiStore.getState().audio.visible).toBe(true);
  });

  it('ignores stale callbacks after stop()', async () => {
    await briefingPlayer.load(snapshot);
    await briefingPlayer.play();
    const first = mockSpoken[0];
    await briefingPlayer.stop();
    first?.options.onDone?.();
    expect(mockSpoken).toHaveLength(1);
    expect(useUiStore.getState().audio.visible).toBe(false);
  });
});
