/**
 * Voice input for the assistant and post-meeting notes.
 *
 *  - Microphone permission that never loops: once the OS reports `canAskAgain: false` we return `denied`
 *    without prompting again, and the screen offers "Ayarları Aç".
 *  - `voiceRecorder`: an expo-audio recorder (16 kHz mono AAC, the speech preset) with live metering
 *    published on a Reanimated shared value (`level`, 0..1) for `<Waveform live>`, a hard 60 s auto-stop,
 *    haptics on start/stop, and a hand-off of the finished file `{ uri, durationSec, mimeType }`.
 *  - `transcribe()`: server STT first (`ds.assistant.transcribe`, which returns `null` when the backend has
 *    no STT configured), then the on-device provider, else a `TranscriptionError` carrying the i18n key
 *    `assistant.voice.transcribeFailed` so the Voice screen can offer "Yazarak sor".
 *
 * On-device recognition (`deviceSpeechRecognition`) is a provider slot. It reports `supported: false`
 * because the community module `expo-speech-recognition` is an OPTIONAL dependency that is not installed.
 * To enable it: `pnpm --filter @da/mobile add expo-speech-recognition`, add its config plugin, and call
 * `registerDeviceSpeechRecognition(provider)` at startup with an adapter over `ExpoSpeechRecognitionModule`.
 * No dynamic import is attempted here: Metro rejects non-literal requires in app code, and a literal
 * import of a missing module would break the bundle.
 */
import { Platform } from 'react-native';
import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  setAudioModeAsync,
  type AudioRecorder,
  type RecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { makeMutable, type SharedValue } from 'react-native-reanimated';
import type { DataSource } from '@da/api-client';
import { haptic } from '@da/ui';
import { captureError } from '@/lib/monitoring';
import { briefingPlayer } from './audio';
import { toPermissionOutcome, type PermissionOutcome } from './permissions';

export const MAX_RECORDING_SEC = 60;
/** Anything shorter is a tap, not speech. */
export const MIN_RECORDING_SEC = 0.4;
export const METER_INTERVAL_MS = 100;
/** Metering below this (dBFS) renders as silence. */
export const METERING_FLOOR_DB = -60;
export const TRANSCRIBE_FAILED_KEY = 'assistant.voice.transcribeFailed';
export const DEFAULT_SPEECH_LANGUAGE = 'tr-TR';

/** Speech preset: 16 kHz mono AAC in an .m4a container — small uploads, what STT services expect. */
export const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac', audioSource: 'voice_recognition' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

export function voiceMimeType(platform: string = Platform.OS): string {
  return platform === 'web' ? 'audio/webm' : 'audio/m4a';
}

/** dBFS metering (−160..0) → 0..1 waveform level. Missing metering renders as silence. */
export function meteringToLevel(
  db: number | null | undefined,
  floorDb: number = METERING_FLOOR_DB,
): number {
  if (typeof db !== 'number' || !Number.isFinite(db)) return 0;
  if (db >= 0) return 1;
  if (db <= floorDb) return 0;
  return (db - floorDb) / -floorDb;
}

// ---------------------------------------------------------------------------
// Microphone permission
// ---------------------------------------------------------------------------

export async function getMicrophonePermission(): Promise<PermissionOutcome> {
  try {
    return toPermissionOutcome(await AudioModule.getRecordingPermissionsAsync());
  } catch (e) {
    captureError(e, { where: 'speech.getMicrophonePermission' });
    return 'undetermined';
  }
}

/** Prompts at most once: a permanently denied permission is reported as `denied` without a new prompt. */
export async function requestMicrophonePermission(): Promise<PermissionOutcome> {
  try {
    const current = await AudioModule.getRecordingPermissionsAsync();
    if (current.granted) return 'granted';
    if (current.status === 'denied' && current.canAskAgain === false) return 'denied';
    return toPermissionOutcome(await AudioModule.requestRecordingPermissionsAsync());
  } catch (e) {
    captureError(e, { where: 'speech.requestMicrophonePermission' });
    return 'denied';
  }
}

// ---------------------------------------------------------------------------
// Shared value for the waveform
// ---------------------------------------------------------------------------

function plainSharedValue(initial: number): SharedValue<number> {
  let current = initial;
  const listeners = new Map<number, (value: number) => void>();
  const notify = (): void => {
    listeners.forEach((listener) => listener(current));
  };
  return {
    get value() {
      return current;
    },
    set value(next: number) {
      current = next;
      notify();
    },
    get: () => current,
    set: (next) => {
      current = typeof next === 'function' ? next(current) : next;
      notify();
    },
    addListener: (id, listener) => {
      listeners.set(id, listener);
    },
    removeListener: (id) => {
      listeners.delete(id);
    },
    modify: (modifier) => {
      if (modifier) current = modifier(current);
      notify();
    },
  };
}

/** A Reanimated mutable when the runtime provides one (a plain holder under Jest's mock). */
export function createLevelValue(initial = 0): SharedValue<number> {
  try {
    const mutable: unknown = makeMutable(initial);
    if (typeof mutable === 'object' && mutable !== null && 'value' in mutable)
      return mutable as SharedValue<number>;
  } catch (e) {
    captureError(e, { where: 'speech.createLevelValue' });
  }
  return plainSharedValue(initial);
}

// ---------------------------------------------------------------------------
// Recorder
// ---------------------------------------------------------------------------

export interface VoiceRecording {
  uri: string;
  durationSec: number;
  mimeType: string;
}

export type VoiceInputStatus = 'idle' | 'starting' | 'recording' | 'stopping';
export type VoiceStartOutcome = 'started' | 'permissionDenied' | 'unsupported' | 'busy' | 'failed';

export interface VoiceInputState {
  status: VoiceInputStatus;
  durationSec: number;
  /** The last recording ended because the 60 s cap was reached. */
  autoStopped: boolean;
  /** A recording finished by the auto-stop, waiting for the screen to collect it via `stop()`. */
  pendingRecording: VoiceRecording | null;
}

export interface VoiceInput {
  readonly supported: boolean;
  /** Live input level 0..1 for `<Waveform live level={…}>`. */
  readonly level: SharedValue<number>;
  start(): Promise<VoiceStartOutcome>;
  /** Stops and returns the recording (or the pending auto-stopped one); `null` when nothing usable was captured. */
  stop(): Promise<VoiceRecording | null>;
  cancel(): Promise<void>;
  getState(): VoiceInputState;
  subscribe(listener: (state: VoiceInputState) => void): () => void;
}

const IDLE_STATE: VoiceInputState = {
  status: 'idle',
  durationSec: 0,
  autoStopped: false,
  pendingRecording: null,
};

function readStatus(recorder: AudioRecorder): RecorderState | null {
  try {
    return recorder.getStatus();
  } catch {
    return null;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

class RecorderVoiceInput implements VoiceInput {
  readonly supported = true;
  readonly level: SharedValue<number> = createLevelValue(0);
  private recorder: AudioRecorder | null = null;
  private state: VoiceInputState = IDLE_STATE;
  private readonly listeners = new Set<(state: VoiceInputState) => void>();
  private meter: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private finishing: { promise: Promise<VoiceRecording | null>; autoStopped: boolean } | null =
    null;

  getState(): VoiceInputState {
    return this.state;
  }

  subscribe(listener: (state: VoiceInputState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private update(patch: Partial<VoiceInputState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener(this.state));
  }

  async start(): Promise<VoiceStartOutcome> {
    if (this.state.status !== 'idle') return 'busy';
    this.update({ status: 'starting', durationSec: 0, autoStopped: false, pendingRecording: null });
    const permission = await requestMicrophonePermission();
    if (permission !== 'granted') {
      this.update({ status: 'idle' });
      return 'permissionDenied';
    }
    try {
      if (briefingPlayer.state.playing) await briefingPlayer.pause();
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
      });
      const recorder = new AudioModule.AudioRecorder(VOICE_RECORDING_OPTIONS);
      await recorder.prepareToRecordAsync();
      recorder.record();
      this.recorder = recorder;
      this.startedAt = Date.now();
      this.update({ status: 'recording' });
      this.startMeter();
      void haptic('medium');
      return 'started';
    } catch (e) {
      captureError(e, { where: 'speech.start' });
      await this.teardown();
      this.update({ status: 'idle' });
      return 'failed';
    }
  }

  async stop(): Promise<VoiceRecording | null> {
    const inFlight = this.finishing;
    if (inFlight) {
      const result = await inFlight.promise;
      // A user stop already in flight belongs to its caller; an auto-stop hands its file over exactly once.
      if (!inFlight.autoStopped || !result || this.state.pendingRecording !== result) return null;
      this.update({ pendingRecording: null });
      return result;
    }
    if (this.state.status === 'idle') {
      const pending = this.state.pendingRecording;
      if (pending) this.update({ pendingRecording: null });
      return pending;
    }
    if (this.state.status !== 'recording') return null;
    return this.finish(false);
  }

  async cancel(): Promise<void> {
    if (this.finishing) await this.finishing.promise;
    if (this.state.status === 'idle') {
      if (this.state.pendingRecording || this.state.autoStopped)
        this.update({ pendingRecording: null, autoStopped: false, durationSec: 0 });
      return;
    }
    this.stopMeter();
    try {
      await this.recorder?.stop();
    } catch (e) {
      captureError(e, { where: 'speech.cancel' });
    }
    await this.teardown();
    this.update({ status: 'idle', durationSec: 0, autoStopped: false, pendingRecording: null });
  }

  private finish(autoStopped: boolean): Promise<VoiceRecording | null> {
    const run = async (): Promise<VoiceRecording | null> => {
      const recorder = this.recorder;
      this.stopMeter();
      this.update({ status: 'stopping' });
      let recording: VoiceRecording | null = null;
      try {
        if (recorder) {
          const status = readStatus(recorder);
          await recorder.stop();
          const durationSec = this.durationFrom(status);
          const uri = recorder.uri ?? status?.url ?? null;
          if (uri && durationSec >= MIN_RECORDING_SEC)
            recording = { uri, durationSec: round1(durationSec), mimeType: voiceMimeType() };
        }
      } catch (e) {
        captureError(e, { where: 'speech.stop' });
      }
      await this.teardown();
      void haptic('light');
      this.update({
        status: 'idle',
        autoStopped,
        durationSec: recording?.durationSec ?? 0,
        pendingRecording: autoStopped ? recording : null,
      });
      return recording;
    };
    const promise = run().finally(() => {
      this.finishing = null;
    });
    this.finishing = { promise, autoStopped };
    return promise;
  }

  private durationFrom(status: RecorderState | null): number {
    if (status && status.durationMillis > 0) return status.durationMillis / 1000;
    return (Date.now() - this.startedAt) / 1000;
  }

  private startMeter(): void {
    this.stopMeter();
    this.meter = setInterval(() => this.tick(), METER_INTERVAL_MS);
  }

  private stopMeter(): void {
    if (this.meter) clearInterval(this.meter);
    this.meter = null;
  }

  private tick(): void {
    const recorder = this.recorder;
    if (!recorder || this.state.status !== 'recording') return;
    const status = readStatus(recorder);
    this.level.value = meteringToLevel(status?.metering);
    const durationSec = this.durationFrom(status);
    this.update({ durationSec: round1(durationSec) });
    if (durationSec >= MAX_RECORDING_SEC) void this.finish(true);
  }

  private async teardown(): Promise<void> {
    this.stopMeter();
    this.level.value = 0;
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      try {
        recorder.release();
      } catch (e) {
        captureError(e, { where: 'speech.release' });
      }
    }
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch (e) {
      captureError(e, { where: 'speech.restoreAudioMode' });
    }
  }
}

/** Process-wide recorder: one microphone session at a time, shared by the Voice screen and post-meeting notes. */
export const voiceRecorder: VoiceInput = new RecorderVoiceInput();

// ---------------------------------------------------------------------------
// On-device speech recognition (optional provider)
// ---------------------------------------------------------------------------

export interface DeviceSpeechRecognition {
  readonly supported: boolean;
  readonly level: SharedValue<number>;
  /** Live recognition session (partial results are the provider's concern). */
  start(options: { language: string }): Promise<VoiceStartOutcome>;
  stop(): Promise<{ text: string } | null>;
  cancel(): Promise<void>;
  /** Recognises a finished recording file — used when the server declines. */
  transcribeFile(recording: VoiceRecording, language: string): Promise<{ text: string } | null>;
}

const unsupportedProvider: DeviceSpeechRecognition = {
  supported: false,
  level: createLevelValue(0),
  start: async () => 'unsupported',
  stop: async () => null,
  cancel: async () => undefined,
  transcribeFile: async () => null,
};

let registeredProvider: DeviceSpeechRecognition = unsupportedProvider;

/** Installs an on-device recogniser (adapter over `expo-speech-recognition`). Pass `null` to remove it. */
export function registerDeviceSpeechRecognition(provider: DeviceSpeechRecognition | null): void {
  registeredProvider = provider ?? unsupportedProvider;
}

/** The current on-device provider; `supported` is `false` until one is registered. */
export const deviceSpeechRecognition: DeviceSpeechRecognition = {
  get supported() {
    return registeredProvider.supported;
  },
  get level() {
    return registeredProvider.level;
  },
  start: (options) => registeredProvider.start(options),
  stop: () => registeredProvider.stop(),
  cancel: () => registeredProvider.cancel(),
  transcribeFile: (recording, language) => registeredProvider.transcribeFile(recording, language),
};

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

export type TranscriptionFailure = 'server_failed' | 'unsupported' | 'empty';

export class TranscriptionError extends Error {
  readonly key = TRANSCRIBE_FAILED_KEY;
  constructor(readonly reason: TranscriptionFailure) {
    super(`transcription failed: ${reason}`);
    this.name = 'TranscriptionError';
  }
}

export interface Transcription {
  text: string;
  provider: 'server' | 'device';
}

/** Server STT → on-device provider → `TranscriptionError` (key `assistant.voice.transcribeFailed`). */
export async function transcribe(
  ds: Pick<DataSource, 'assistant'>,
  recording: VoiceRecording,
  language: string = DEFAULT_SPEECH_LANGUAGE,
): Promise<Transcription> {
  let serverFailed = false;
  try {
    const result = await ds.assistant.transcribe({
      uri: recording.uri,
      mimeType: recording.mimeType,
      durationSec: recording.durationSec,
    });
    if (result) {
      const text = result.text.trim();
      if (text) return { text, provider: 'server' };
      throw new TranscriptionError('empty');
    }
  } catch (e) {
    if (e instanceof TranscriptionError) throw e;
    serverFailed = true;
    captureError(e, { where: 'speech.transcribe.server' });
  }
  if (deviceSpeechRecognition.supported) {
    try {
      const result = await deviceSpeechRecognition.transcribeFile(recording, language);
      const text = result?.text.trim() ?? '';
      if (text) return { text, provider: 'device' };
      throw new TranscriptionError('empty');
    } catch (e) {
      if (e instanceof TranscriptionError) throw e;
      captureError(e, { where: 'speech.transcribe.device' });
      throw new TranscriptionError('server_failed');
    }
  }
  throw new TranscriptionError(serverFailed ? 'server_failed' : 'unsupported');
}
