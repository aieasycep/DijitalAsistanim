/**
 * Briefing audio player — one process-wide singleton (`briefingPlayer`) behind two engines:
 *
 *  - `server_tts`: an expo-audio player streaming the narration file. Background audio, lock-screen
 *    controls, playback in silent mode and rate changes with pitch correction all come from the OS.
 *  - `device_tts`: expo-speech reading the chapter texts. On-device TTS has no seekable timeline, so the
 *    position is *estimated*: Turkish narration is assumed to run at ~150 words per minute (scaled by the
 *    playback speed), re-anchored on every word boundary the synthesizer reports. Seeking (±15 s, chapter
 *    taps) restarts the current chapter from the sentence that contains the target offset — the position
 *    snaps to that sentence's start, which is the granularity the platform offers. iOS pauses/resumes the
 *    synthesizer natively; Android has no pause, so pausing stops the utterance and resuming restarts at the
 *    current sentence. Rate changes restart the sentence as well.
 *
 * All state is mirrored into `useUiStore.audio` (visible while something is loaded) so the mini player,
 * the full player screen and the tab bar padding stay in sync. Interruptions (calls, other apps taking the
 * audio session) surface as a paused state — never as a crash.
 */
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import type { BriefingAudio } from '@da/domain';
import { captureError } from '@/lib/monitoring';
import { useUiStore, type AudioPlayerState } from '@/store/ui';

export type PlaybackSpeed = AudioPlayerState['speed'];
export type AudioChapter = BriefingAudio['chapters'][number];

/** What `load()` needs: the `briefings.getAudio` response plus the briefing identity for the UI. */
export interface BriefingAudioSnapshot {
  briefingId: string;
  title: string;
  provider: BriefingAudio['provider'];
  url?: string | null;
  script: string;
  chapters: AudioChapter[];
  durationSec?: number | null;
}

export interface BriefingPlayer {
  readonly state: AudioPlayerState;
  load(snapshot: BriefingAudioSnapshot): Promise<boolean>;
  play(): Promise<void>;
  pause(): Promise<void>;
  toggle(): Promise<void>;
  seekBy(deltaSec: number): Promise<void>;
  seekTo(sec: number): Promise<void>;
  jumpToChapter(index: number): Promise<void>;
  setSpeed(speed: PlaybackSpeed): Promise<void>;
  stop(): Promise<void>;
}

export const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = [1, 1.25, 1.5];
/** ±15 s per the design (§4.6). */
export const SEEK_STEP_SEC = 15;
/** Estimated Turkish narration pace at 1× used for the device-TTS timeline. */
export const WORDS_PER_MINUTE = 150;
/** Status/ticker cadence in ms. */
const TICK_MS = 250;
const STATUS_INTERVAL_MS = 500;
/** How long past the estimated end of an utterance we wait before treating a silent synthesizer as interrupted. */
const STALL_GRACE_MS = 4000;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

export function isPlaybackSpeed(value: number): value is PlaybackSpeed {
  return (PLAYBACK_SPEEDS as readonly number[]).includes(value);
}

/** 1.0× → 1.25× → 1.5× → 1.0× */
export function nextSpeed(current: PlaybackSpeed): PlaybackSpeed {
  const i = PLAYBACK_SPEEDS.indexOf(current);
  return PLAYBACK_SPEEDS[(i + 1) % PLAYBACK_SPEEDS.length] ?? 1;
}

/** Maps the UI speed to an expo-speech `rate` that stays intelligible on both platforms. */
export function speechRateFor(speed: PlaybackSpeed): number {
  switch (speed) {
    case 1.25:
      return 1.15;
    case 1.5:
      return 1.3;
    default:
      return 1;
  }
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Seconds a text takes to narrate at 1× (never less than 1 s for non-empty text). */
export function estimateSpeechSeconds(text: string, wordsPerMinute = WORDS_PER_MINUTE): number {
  const words = countWords(text);
  if (words === 0) return 0;
  return Math.max(1, (words / wordsPerMinute) * 60);
}

const SENTENCE_RE = /[^.!?…\n]+(?:[.!?…]+["'”’)\]]*)?/g;

/** Splits narration into sentences (terminal punctuation or line breaks). Whitespace-only parts are dropped. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const match of text.match(SENTENCE_RE) ?? []) {
    const s = match.trim();
    if (s) out.push(s);
  }
  return out;
}

export interface TimelineSentence {
  chapterIndex: number;
  text: string;
  startSec: number;
  durationSec: number;
  words: number;
}

export interface DeviceTimeline {
  chapters: AudioChapter[];
  sentences: TimelineSentence[];
  durationSec: number;
}

/**
 * Builds the estimated 1× timeline for device TTS: every chapter's sentences with cumulative start times.
 * Chapter `startSec`/`durationSec` are recomputed from the estimate so the chapter list matches playback.
 */
export function buildDeviceTimeline(
  chapters: AudioChapter[],
  wordsPerMinute = WORDS_PER_MINUTE,
): DeviceTimeline {
  const sentences: TimelineSentence[] = [];
  const outChapters: AudioChapter[] = [];
  let cursor = 0;
  chapters.forEach((chapter, chapterIndex) => {
    const start = cursor;
    const parts = splitSentences(chapter.text);
    for (const text of parts) {
      const durationSec = estimateSpeechSeconds(text, wordsPerMinute);
      sentences.push({
        chapterIndex,
        text,
        startSec: cursor,
        durationSec,
        words: countWords(text),
      });
      cursor += durationSec;
    }
    outChapters.push({
      ...chapter,
      index: chapterIndex,
      startSec: round1(start),
      durationSec: round1(cursor - start),
    });
  });
  return { chapters: outChapters, sentences, durationSec: round1(cursor) };
}

/** Normalises server chapters: fills missing/zero start offsets cumulatively from the durations. */
export function normalizeServerChapters(chapters: AudioChapter[]): AudioChapter[] {
  const allZero = chapters.length > 1 && chapters.every((c) => !c.startSec);
  let cursor = 0;
  return chapters.map((c, index) => {
    const startSec = allZero ? cursor : Math.max(0, c.startSec || 0);
    const durationSec = Math.max(0, c.durationSec || 0);
    cursor = startSec + durationSec;
    return { ...c, index, startSec, durationSec };
  });
}

/** Index of the chapter containing `positionSec` (the last chapter whose start is ≤ position). */
export function chapterIndexAt(chapters: readonly AudioChapter[], positionSec: number): number {
  let index = 0;
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    if (c && c.startSec <= positionSec + 1e-6) index = i;
    else break;
  }
  return index;
}

/** Index of the sentence containing `positionSec` (clamped to the last sentence). */
export function sentenceIndexAt(
  sentences: readonly TimelineSentence[],
  positionSec: number,
): number {
  if (sentences.length === 0) return -1;
  let index = 0;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    if (s && s.startSec <= positionSec + 1e-6) index = i;
    else break;
  }
  return index;
}

/** Estimated position for a word boundary inside an utterance built from `sentences[from..to)`. */
export function positionForBoundary(
  sentences: readonly TimelineSentence[],
  from: number,
  to: number,
  charIndex: number,
): number {
  let offset = 0;
  for (let i = from; i < to; i++) {
    const s = sentences[i];
    if (!s) break;
    const end = offset + s.text.length;
    if (charIndex < end || i === to - 1) {
      const local = clamp(charIndex - offset, 0, s.text.length);
      const wordsBefore = countWords(s.text.slice(0, local));
      const fraction = s.words > 0 ? clamp(wordsBefore / s.words, 0, 1) : 0;
      return s.startSec + fraction * s.durationSec;
    }
    offset = end + 1; // sentences are joined with a single space
  }
  const last = sentences[to - 1];
  return last ? last.startSec + last.durationSec : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------

type Patch = Partial<AudioPlayerState>;

interface EngineHost {
  emit(patch: Patch): void;
  onFinished(): void;
}

interface PlaybackEngine {
  load(snapshot: BriefingAudioSnapshot, chapters: AudioChapter[]): Promise<number>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(sec: number): Promise<void>;
  setSpeed(speed: PlaybackSpeed): Promise<void>;
  currentPosition(): number;
  dispose(): Promise<void>;
}

async function applyAudioMode(provider: BriefingAudio['provider']): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      allowsRecording: false,
      interruptionMode: provider === 'server_tts' ? 'doNotMix' : 'duckOthers',
    });
  } catch (e) {
    captureError(e, { where: 'audio.applyAudioMode', provider });
  }
}

/** expo-audio engine for narration files produced server-side. */
class ServerTtsEngine implements PlaybackEngine {
  private player: AudioPlayer | null = null;
  private subscription: { remove(): void } | null = null;
  private snapshot: BriefingAudioSnapshot | null = null;
  private chapters: AudioChapter[] = [];
  private fallbackDuration = 0;
  private lastPosition = 0;
  private speed: PlaybackSpeed = 1;
  private finished = false;

  constructor(private readonly host: EngineHost) {}

  async load(snapshot: BriefingAudioSnapshot, chapters: AudioChapter[]): Promise<number> {
    this.snapshot = snapshot;
    this.chapters = chapters;
    const last = chapters[chapters.length - 1];
    this.fallbackDuration = snapshot.durationSec ?? (last ? last.startSec + last.durationSec : 0);
    this.createPlayer(snapshot.url ?? '');
    return this.fallbackDuration;
  }

  private createPlayer(uri: string): void {
    this.disposePlayer();
    const player = createAudioPlayer(
      { uri },
      { updateInterval: STATUS_INTERVAL_MS, keepAudioSessionActive: false },
    );
    this.player = player;
    this.finished = false;
    this.subscription = player.addListener('playbackStatusUpdate', (status) =>
      this.onStatus(status),
    );
    try {
      player.setActiveForLockScreen(
        true,
        { title: this.snapshot?.title ?? '', artist: 'Dijital Asistan' },
        { showSeekForward: true, showSeekBackward: true },
      );
    } catch (e) {
      captureError(e, { where: 'audio.lockScreen' });
    }
  }

  private onStatus(status: AudioStatus): void {
    if (status.mediaServicesDidReset) {
      // The media daemon restarted (iOS): rebuild the player at the last position instead of going silent.
      const position = this.lastPosition;
      this.createPlayer(this.snapshot?.url ?? '');
      void this.player?.seekTo(position).catch(() => undefined);
      this.player?.setPlaybackRate(this.speed, 'high');
      this.host.emit({ playing: false, positionSec: position });
      return;
    }
    if (status.error) {
      captureError(new Error(status.error), { where: 'audio.serverTts.status' });
      this.host.emit({ playing: false });
      return;
    }
    const duration =
      Number.isFinite(status.duration) && status.duration > 0
        ? status.duration
        : this.fallbackDuration;
    const position = clamp(status.currentTime, 0, duration || Number.MAX_SAFE_INTEGER);
    this.lastPosition = position;
    if (status.didJustFinish && !this.finished) {
      this.finished = true;
      this.host.onFinished();
      return;
    }
    this.host.emit({
      playing: status.playing,
      positionSec: position,
      durationSec: duration,
      chapterIndex: chapterIndexAt(this.chapters, position),
    });
  }

  async play(): Promise<void> {
    if (!this.player) return;
    if (this.finished) {
      this.finished = false;
      await this.player.seekTo(0).catch(() => undefined);
    }
    this.player.play();
  }

  async pause(): Promise<void> {
    this.player?.pause();
  }

  async seekTo(sec: number): Promise<void> {
    if (!this.player) return;
    this.finished = false;
    this.lastPosition = sec;
    await this.player.seekTo(sec);
  }

  async setSpeed(speed: PlaybackSpeed): Promise<void> {
    this.speed = speed;
    this.player?.setPlaybackRate(speed, 'high');
  }

  currentPosition(): number {
    return this.lastPosition;
  }

  private disposePlayer(): void {
    this.subscription?.remove();
    this.subscription = null;
    const player = this.player;
    this.player = null;
    if (!player) return;
    try {
      player.pause();
      player.clearLockScreenControls();
    } catch (e) {
      captureError(e, { where: 'audio.serverTts.disposeControls' });
    }
    try {
      player.remove();
    } catch (e) {
      captureError(e, { where: 'audio.serverTts.remove' });
    }
  }

  async dispose(): Promise<void> {
    this.disposePlayer();
  }
}

interface Utterance {
  token: number;
  from: number;
  /** exclusive */
  to: number;
  endSec: number;
  anchorSec: number;
  anchorAt: number;
}

let cachedVoice: string | null | undefined;

/** Prefers an enhanced tr-TR voice, then any Turkish voice; `null` lets the platform pick by language. */
export async function pickTurkishVoice(): Promise<string | null> {
  if (cachedVoice !== undefined) return cachedVoice;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const turkish = voices.filter((v) => /^tr([-_]|$)/i.test(v.language ?? ''));
    const enhanced = turkish.find((v) => v.quality === Speech.VoiceQuality.Enhanced);
    cachedVoice = (enhanced ?? turkish[0])?.identifier ?? null;
  } catch (e) {
    captureError(e, { where: 'audio.pickTurkishVoice' });
    cachedVoice = null;
  }
  return cachedVoice;
}

/** expo-speech engine: reads chapters sentence by sentence with an estimated, boundary-corrected timeline. */
class DeviceTtsEngine implements PlaybackEngine {
  private timeline: DeviceTimeline = { chapters: [], sentences: [], durationSec: 0 };
  private voice: string | null = null;
  private speed: PlaybackSpeed = 1;
  private playing = false;
  /** iOS: the synthesizer is paused natively and can resume in place. */
  private nativePaused = false;
  private position = 0;
  private utterance: Utterance | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private token = 0;
  private stallCheckInFlight = false;

  constructor(private readonly host: EngineHost) {}

  async load(snapshot: BriefingAudioSnapshot, chapters: AudioChapter[]): Promise<number> {
    this.timeline = buildDeviceTimeline(chapters);
    this.timeline.chapters = chapters;
    this.voice = await pickTurkishVoice();
    this.position = 0;
    return this.timeline.durationSec;
  }

  async play(): Promise<void> {
    if (this.timeline.sentences.length === 0) return;
    if (this.nativePaused && Platform.OS === 'ios' && this.utterance) {
      try {
        await Speech.resume();
        this.nativePaused = false;
        this.playing = true;
        this.utterance.anchorSec = this.position;
        this.utterance.anchorAt = Date.now();
        this.startTicker();
        this.emitPosition();
        return;
      } catch (e) {
        captureError(e, { where: 'audio.deviceTts.resume' });
      }
    }
    this.speakFrom(this.position);
  }

  async pause(): Promise<void> {
    if (!this.playing) return;
    this.position = this.estimatedPosition();
    this.stopTicker();
    this.playing = false;
    if (Platform.OS === 'ios' && this.utterance) {
      try {
        await Speech.pause();
        this.nativePaused = true;
        this.emitPosition();
        return;
      } catch (e) {
        captureError(e, { where: 'audio.deviceTts.pause' });
      }
    }
    // Android (or a failed native pause): stop the utterance; resume restarts at the current sentence.
    await this.stopSpeaking();
    this.emitPosition();
  }

  async seekTo(sec: number): Promise<void> {
    const index = sentenceIndexAt(this.timeline.sentences, sec);
    const target = index >= 0 ? (this.timeline.sentences[index]?.startSec ?? 0) : 0;
    if (this.playing) {
      this.speakFrom(target);
      return;
    }
    await this.stopSpeaking();
    this.position = target;
    this.emitPosition();
  }

  async setSpeed(speed: PlaybackSpeed): Promise<void> {
    if (speed === this.speed) return;
    this.speed = speed;
    if (this.playing) {
      this.speakFrom(this.estimatedPosition());
      return;
    }
    if (this.nativePaused) {
      // A paused utterance keeps its old rate; drop it so resume re-speaks the sentence at the new rate.
      this.position = this.estimatedPosition();
      await this.stopSpeaking();
    }
  }

  currentPosition(): number {
    return this.playing ? this.estimatedPosition() : this.position;
  }

  async dispose(): Promise<void> {
    this.stopTicker();
    this.playing = false;
    await this.stopSpeaking();
  }

  private async stopSpeaking(): Promise<void> {
    this.token++;
    this.utterance = null;
    this.nativePaused = false;
    try {
      await Speech.stop();
    } catch (e) {
      captureError(e, { where: 'audio.deviceTts.stop' });
    }
  }

  private estimatedPosition(): number {
    const u = this.utterance;
    if (!u || !this.playing) return this.position;
    const elapsed = ((Date.now() - u.anchorAt) / 1000) * this.speed;
    return clamp(u.anchorSec + elapsed, 0, u.endSec);
  }

  /** Text-length cap per utterance (Android rejects inputs above `maxSpeechInputLength`). */
  private maxChunkLength(): number {
    const limit = Number.isFinite(Speech.maxSpeechInputLength) ? Speech.maxSpeechInputLength : 4000;
    return Math.max(200, Math.min(limit, 4000) - 100);
  }

  private speakFrom(sec: number): void {
    const { sentences } = this.timeline;
    const from = sentenceIndexAt(sentences, sec);
    const first = sentences[from];
    if (from < 0 || !first) return;
    // One utterance per chapter (or until the platform length cap), so chapter boundaries come from onDone.
    let to = from;
    let length = 0;
    const cap = this.maxChunkLength();
    while (to < sentences.length) {
      const s = sentences[to];
      if (!s || s.chapterIndex !== first.chapterIndex) break;
      if (to > from && length + 1 + s.text.length > cap) break;
      length += (to > from ? 1 : 0) + s.text.length;
      to++;
    }
    const last = sentences[to - 1] ?? first;
    const text = sentences
      .slice(from, to)
      .map((s) => s.text)
      .join(' ');
    const token = ++this.token;
    this.utterance = {
      token,
      from,
      to,
      endSec: last.startSec + last.durationSec,
      anchorSec: first.startSec,
      anchorAt: Date.now(),
    };
    this.position = first.startSec;
    this.playing = true;
    this.nativePaused = false;

    const isCurrent = (): boolean => this.utterance?.token === token;
    try {
      void Speech.stop().catch(() => undefined);
      Speech.speak(text, {
        language: 'tr-TR',
        voice: this.voice ?? undefined,
        rate: speechRateFor(this.speed),
        onStart: () => {
          if (!isCurrent() || !this.utterance) return;
          this.utterance.anchorAt = Date.now();
        },
        onBoundary: (ev: { charIndex: number; charLength: number }) => {
          if (!isCurrent() || !this.utterance) return;
          const charIndex = Number(ev.charIndex);
          if (!Number.isFinite(charIndex)) return;
          this.utterance.anchorSec = positionForBoundary(sentences, from, to, charIndex);
          this.utterance.anchorAt = Date.now();
        },
        onDone: () => {
          if (!isCurrent()) return;
          if (to < sentences.length) {
            const next = sentences[to];
            if (next) {
              this.speakFrom(next.startSec);
              return;
            }
          }
          this.finish();
        },
        onError: (error) => {
          if (!isCurrent()) return;
          captureError(error, { where: 'audio.deviceTts.speak' });
          this.position = this.estimatedPosition();
          this.stopTicker();
          this.playing = false;
          this.utterance = null;
          this.emitPosition();
        },
      });
    } catch (e) {
      captureError(e, { where: 'audio.deviceTts.speakFrom' });
      this.playing = false;
      this.utterance = null;
    }
    this.startTicker();
    this.emitPosition();
  }

  private finish(): void {
    this.stopTicker();
    this.playing = false;
    this.utterance = null;
    this.position = 0;
    this.host.onFinished();
  }

  private startTicker(): void {
    this.stopTicker();
    this.ticker = setInterval(() => this.tick(), TICK_MS);
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private tick(): void {
    const u = this.utterance;
    if (!u || !this.playing) return;
    this.emitPosition();
    const expectedMs = ((u.endSec - u.anchorSec) / this.speed) * 1000;
    if (Date.now() - u.anchorAt > expectedMs + STALL_GRACE_MS && !this.stallCheckInFlight) {
      // No onDone long after the estimated end: a call or another app probably took the audio session.
      this.stallCheckInFlight = true;
      void Speech.isSpeakingAsync()
        .then((speaking) => {
          if (speaking || this.utterance?.token !== u.token || !this.playing) return;
          this.position = u.endSec;
          this.stopTicker();
          this.playing = false;
          this.utterance = null;
          this.emitPosition();
        })
        .catch(() => undefined)
        .finally(() => {
          this.stallCheckInFlight = false;
        });
    }
  }

  private emitPosition(): void {
    const positionSec = this.currentPosition();
    this.host.emit({
      playing: this.playing,
      positionSec,
      durationSec: this.timeline.durationSec,
      chapterIndex: chapterIndexAt(this.timeline.chapters, positionSec),
    });
  }
}

// ---------------------------------------------------------------------------
// Player facade
// ---------------------------------------------------------------------------

class BriefingPlayerImpl implements BriefingPlayer {
  private engine: PlaybackEngine | null = null;
  private loadSeq = 0;
  private lastEmitted: Patch = {};

  get state(): AudioPlayerState {
    return useUiStore.getState().audio;
  }

  private readonly host: EngineHost = {
    emit: (patch) => this.emit(patch),
    onFinished: () => {
      // Design: at the end playback stops and resets to 0 (the mini player stays until closed).
      this.emit({ playing: false, positionSec: 0, chapterIndex: 0 }, true);
    },
  };

  private emit(patch: Patch, force = false): void {
    const prev = this.lastEmitted;
    const changed =
      force ||
      (patch.playing !== undefined && patch.playing !== prev.playing) ||
      (patch.chapterIndex !== undefined && patch.chapterIndex !== prev.chapterIndex) ||
      (patch.durationSec !== undefined && patch.durationSec !== prev.durationSec) ||
      (patch.positionSec !== undefined &&
        (prev.positionSec === undefined || Math.abs(patch.positionSec - prev.positionSec) >= 0.2));
    if (!changed) return;
    this.lastEmitted = { ...prev, ...patch };
    useUiStore.getState().setAudio(patch);
  }

  async load(snapshot: BriefingAudioSnapshot): Promise<boolean> {
    const seq = ++this.loadSeq;
    await this.disposeEngine();
    const provider: BriefingAudio['provider'] =
      snapshot.provider === 'server_tts' && snapshot.url ? 'server_tts' : 'device_tts';
    const chapters =
      provider === 'server_tts'
        ? normalizeServerChapters(snapshot.chapters)
        : buildDeviceTimeline(snapshot.chapters).chapters;
    const speed = this.state.speed;
    this.lastEmitted = {};
    useUiStore.getState().setAudio({
      briefingId: snapshot.briefingId,
      title: snapshot.title,
      chapters,
      script: snapshot.script,
      provider,
      url: provider === 'server_tts' ? (snapshot.url ?? null) : null,
      playing: false,
      positionSec: 0,
      durationSec: snapshot.durationSec ?? 0,
      speed,
      chapterIndex: 0,
      visible: true,
    });
    await applyAudioMode(provider);
    if (seq !== this.loadSeq) return false;
    const engine: PlaybackEngine =
      provider === 'server_tts' ? new ServerTtsEngine(this.host) : new DeviceTtsEngine(this.host);
    try {
      const durationSec = await engine.load({ ...snapshot, provider }, chapters);
      if (seq !== this.loadSeq) {
        await engine.dispose();
        return false;
      }
      this.engine = engine;
      await engine.setSpeed(speed);
      this.emit({ durationSec, positionSec: 0, chapterIndex: 0, playing: false }, true);
      return true;
    } catch (e) {
      captureError(e, { where: 'audio.load', provider });
      await engine.dispose().catch(() => undefined);
      if (seq === this.loadSeq) useUiStore.getState().closeAudio();
      return false;
    }
  }

  async play(): Promise<void> {
    if (!this.engine) return;
    try {
      await this.engine.play();
    } catch (e) {
      captureError(e, { where: 'audio.play' });
    }
  }

  async pause(): Promise<void> {
    if (!this.engine) return;
    try {
      await this.engine.pause();
    } catch (e) {
      captureError(e, { where: 'audio.pause' });
    }
  }

  async toggle(): Promise<void> {
    if (this.state.playing) await this.pause();
    else await this.play();
  }

  async seekBy(deltaSec: number): Promise<void> {
    if (!this.engine) return;
    await this.seekTo(this.engine.currentPosition() + deltaSec);
  }

  async seekTo(sec: number): Promise<void> {
    if (!this.engine) return;
    const duration = this.state.durationSec;
    const target = clamp(sec, 0, duration > 0 ? duration : Number.MAX_SAFE_INTEGER);
    try {
      await this.engine.seekTo(target);
      this.emit(
        {
          positionSec: this.engine.currentPosition(),
          chapterIndex: chapterIndexAt(this.state.chapters, this.engine.currentPosition()),
        },
        true,
      );
    } catch (e) {
      captureError(e, { where: 'audio.seekTo' });
    }
  }

  async jumpToChapter(index: number): Promise<void> {
    const chapter = this.state.chapters[index];
    if (!chapter) return;
    await this.seekTo(chapter.startSec);
  }

  async setSpeed(speed: PlaybackSpeed): Promise<void> {
    if (!isPlaybackSpeed(speed)) return;
    useUiStore.getState().setAudio({ speed });
    if (!this.engine) return;
    try {
      await this.engine.setSpeed(speed);
    } catch (e) {
      captureError(e, { where: 'audio.setSpeed' });
    }
  }

  async stop(): Promise<void> {
    this.loadSeq++;
    await this.disposeEngine();
    this.lastEmitted = {};
    const speed = this.state.speed;
    useUiStore.getState().closeAudio();
    useUiStore.getState().setAudio({ speed });
  }

  private async disposeEngine(): Promise<void> {
    const engine = this.engine;
    this.engine = null;
    if (!engine) return;
    try {
      await engine.dispose();
    } catch (e) {
      captureError(e, { where: 'audio.dispose' });
    }
  }
}

export const briefingPlayer: BriefingPlayer = new BriefingPlayerImpl();

/** Test-only: forget the cached voice so a fresh `getAvailableVoicesAsync` lookup happens. */
export function resetVoiceCache(): void {
  cachedVoice = undefined;
}
