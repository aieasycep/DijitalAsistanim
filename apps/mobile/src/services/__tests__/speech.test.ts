import type { DataSource } from '@da/api-client';

jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));
jest.mock('@da/ui', () => ({ haptic: jest.fn(async () => undefined) }));
jest.mock('react-native-reanimated', () => ({
  makeMutable: (initial: unknown) => ({ value: initial }),
}));
jest.mock('@/services/audio', () => ({
  briefingPlayer: { state: { playing: false }, pause: jest.fn(async () => undefined) },
}));

const permission = { status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' };
const mockGetPermission = jest.fn(async () => ({ ...permission }));
const mockRequestPermission = jest.fn(async () => {
  permission.status = 'granted';
  permission.granted = true;
  return { ...permission };
});
const mockSetAudioMode = jest.fn(async () => undefined);

interface MockRecorderState {
  durationMillis: number;
  metering: number;
  isRecording: boolean;
  canRecord: boolean;
  mediaServicesDidReset: boolean;
  url: string | null;
}
interface MockRecorderLike {
  uri: string | null;
  state: MockRecorderState;
  options: unknown;
  prepareToRecordAsync: jest.Mock;
  record: jest.Mock;
  stop: jest.Mock;
  release: jest.Mock;
  getStatus: jest.Mock;
}
const mockRecorders: MockRecorderLike[] = [];

jest.mock('expo-audio', () => {
  class MockRecorder implements MockRecorderLike {
    uri: string | null = null;
    state: MockRecorderState = {
      durationMillis: 0,
      metering: -160,
      isRecording: false,
      canRecord: true,
      mediaServicesDidReset: false,
      url: null,
    };
    prepareToRecordAsync = jest.fn(async () => undefined);
    record = jest.fn(() => {
      this.state.isRecording = true;
    });
    stop = jest.fn(async () => {
      this.state.isRecording = false;
      this.uri = 'file:///cache/voice-1.m4a';
      this.state.url = this.uri;
    });
    release = jest.fn();
    getStatus = jest.fn(() => ({ ...this.state }));
    options: unknown;
    constructor(mockOptions: unknown) {
      this.options = mockOptions;
      mockRecorders.push(this);
    }
  }
  return {
    AudioModule: {
      AudioRecorder: MockRecorder,
      getRecordingPermissionsAsync: (...args: unknown[]) => mockGetPermission(...(args as [])),
      requestRecordingPermissionsAsync: (...args: unknown[]) =>
        mockRequestPermission(...(args as [])),
    },
    AudioQuality: { MIN: 0, LOW: 32, MEDIUM: 64, HIGH: 96, MAX: 127 },
    IOSOutputFormat: { MPEG4AAC: 'aac ' },
    setAudioModeAsync: (...args: unknown[]) => mockSetAudioMode(...(args as [])),
  };
});

import { haptic } from '@da/ui';
import {
  MAX_RECORDING_SEC,
  TranscriptionError,
  VOICE_RECORDING_OPTIONS,
  deviceSpeechRecognition,
  meteringToLevel,
  registerDeviceSpeechRecognition,
  requestMicrophonePermission,
  transcribe,
  voiceRecorder,
  type VoiceInputState,
} from '@/services/speech';

function makeDs(
  transcribeImpl: DataSource['assistant']['transcribe'],
): Pick<DataSource, 'assistant'> {
  return { assistant: { transcribe: transcribeImpl } as unknown as DataSource['assistant'] };
}

beforeEach(async () => {
  jest.useFakeTimers();
  mockRecorders.splice(0);
  permission.status = 'undetermined';
  permission.granted = false;
  permission.canAskAgain = true;
  mockGetPermission.mockClear();
  mockRequestPermission.mockClear();
  mockSetAudioMode.mockClear();
  (haptic as jest.Mock).mockClear();
  registerDeviceSpeechRecognition(null);
  await voiceRecorder.cancel();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('recording preset & metering', () => {
  it('records 16 kHz mono AAC with metering enabled', () => {
    expect(VOICE_RECORDING_OPTIONS).toMatchObject({
      extension: '.m4a',
      sampleRate: 16000,
      numberOfChannels: 1,
      isMeteringEnabled: true,
      android: { audioEncoder: 'aac', outputFormat: 'mpeg4' },
    });
  });

  it('maps dBFS to a 0..1 level', () => {
    expect(meteringToLevel(undefined)).toBe(0);
    expect(meteringToLevel(-160)).toBe(0);
    expect(meteringToLevel(-60)).toBe(0);
    expect(meteringToLevel(-30)).toBeCloseTo(0.5, 5);
    expect(meteringToLevel(0)).toBe(1);
    expect(meteringToLevel(3)).toBe(1);
  });
});

describe('microphone permission', () => {
  it('prompts when undetermined and reports the result', async () => {
    await expect(requestMicrophonePermission()).resolves.toBe('granted');
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it('never re-prompts once the OS says it cannot ask again', async () => {
    permission.status = 'denied';
    permission.canAskAgain = false;
    await expect(requestMicrophonePermission()).resolves.toBe('denied');
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('skips the prompt when already granted', async () => {
    permission.status = 'granted';
    permission.granted = true;
    await expect(requestMicrophonePermission()).resolves.toBe('granted');
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });
});

describe('voiceRecorder', () => {
  it('records, publishes the level, hands over the file with duration and mime type', async () => {
    const states: VoiceInputState[] = [];
    const unsubscribe = voiceRecorder.subscribe((s) => states.push(s));
    await expect(voiceRecorder.start()).resolves.toBe('started');
    expect(mockSetAudioMode).toHaveBeenCalledWith(
      expect.objectContaining({ allowsRecording: true }),
    );
    const recorder = mockRecorders[0];
    if (!recorder) throw new Error('recorder not created');
    expect(recorder.options).toBe(VOICE_RECORDING_OPTIONS);
    expect(recorder.prepareToRecordAsync).toHaveBeenCalled();
    expect(recorder.record).toHaveBeenCalled();
    expect(haptic).toHaveBeenCalledWith('medium');
    expect(voiceRecorder.getState().status).toBe('recording');

    recorder.state.metering = -30;
    recorder.state.durationMillis = 1500;
    jest.advanceTimersByTime(100);
    expect(voiceRecorder.level.value).toBeCloseTo(0.5, 5);
    expect(voiceRecorder.getState().durationSec).toBe(1.5);

    await expect(voiceRecorder.start()).resolves.toBe('busy');

    recorder.state.durationMillis = 3200;
    const recording = await voiceRecorder.stop();
    expect(recording).toEqual({
      uri: 'file:///cache/voice-1.m4a',
      durationSec: 3.2,
      mimeType: 'audio/m4a',
    });
    expect(recorder.release).toHaveBeenCalled();
    expect(mockSetAudioMode).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowsRecording: false }),
    );
    expect(haptic).toHaveBeenCalledWith('light');
    expect(voiceRecorder.level.value).toBe(0);
    expect(voiceRecorder.getState()).toMatchObject({
      status: 'idle',
      autoStopped: false,
      pendingRecording: null,
    });
    expect(states.map((s) => s.status)).toEqual(
      expect.arrayContaining(['starting', 'recording', 'stopping', 'idle']),
    );
    unsubscribe();
  });

  it('reports a denied permission without touching the recorder', async () => {
    permission.status = 'denied';
    permission.canAskAgain = false;
    await expect(voiceRecorder.start()).resolves.toBe('permissionDenied');
    expect(mockRecorders).toHaveLength(0);
    expect(voiceRecorder.getState().status).toBe('idle');
  });

  it('auto-stops at 60 s and hands the recording to the next stop()', async () => {
    await voiceRecorder.start();
    const recorder = mockRecorders[0];
    if (!recorder) throw new Error('recorder not created');
    recorder.state.durationMillis = MAX_RECORDING_SEC * 1000;
    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(voiceRecorder.getState()).toMatchObject({ status: 'idle', autoStopped: true });
    expect(voiceRecorder.getState().pendingRecording?.durationSec).toBe(60);
    const handed = await voiceRecorder.stop();
    expect(handed?.durationSec).toBe(60);
    await expect(voiceRecorder.stop()).resolves.toBeNull();
  });

  it('discards recordings shorter than a tap and cancelled ones', async () => {
    await voiceRecorder.start();
    const recorder = mockRecorders[0];
    if (!recorder) throw new Error('recorder not created');
    recorder.state.durationMillis = 200;
    await expect(voiceRecorder.stop()).resolves.toBeNull();

    await voiceRecorder.start();
    await voiceRecorder.cancel();
    expect(voiceRecorder.getState()).toMatchObject({
      status: 'idle',
      durationSec: 0,
      pendingRecording: null,
    });
    await expect(voiceRecorder.stop()).resolves.toBeNull();
  });
});

describe('transcribe', () => {
  const recording = { uri: 'file:///cache/voice-1.m4a', durationSec: 3.2, mimeType: 'audio/m4a' };

  it('uses the server when it answers', async () => {
    const ds = makeDs(async () => ({ text: '  Bugün ne var?  ' }));
    await expect(transcribe(ds, recording)).resolves.toEqual({
      text: 'Bugün ne var?',
      provider: 'server',
    });
  });

  it('fails with the i18n key when the server declines and no on-device provider exists', async () => {
    expect(deviceSpeechRecognition.supported).toBe(false);
    const ds = makeDs(async () => null);
    await expect(transcribe(ds, recording)).rejects.toMatchObject({
      key: 'assistant.voice.transcribeFailed',
      reason: 'unsupported',
    });
  });

  it('reports a server failure distinctly', async () => {
    const ds = makeDs(async () => {
      throw new Error('network');
    });
    const error = await transcribe(ds, recording).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TranscriptionError);
    expect((error as TranscriptionError).reason).toBe('server_failed');
  });

  it('falls back to a registered on-device provider', async () => {
    registerDeviceSpeechRecognition({
      supported: true,
      level: { value: 0 } as unknown as typeof deviceSpeechRecognition.level,
      start: async () => 'started',
      stop: async () => ({ text: 'x' }),
      cancel: async () => undefined,
      transcribeFile: async () => ({ text: 'Mehmet’e cevap ver' }),
    });
    expect(deviceSpeechRecognition.supported).toBe(true);
    const ds = makeDs(async () => null);
    await expect(transcribe(ds, recording)).resolves.toEqual({
      text: 'Mehmet’e cevap ver',
      provider: 'device',
    });
  });

  it('treats an empty transcript as a failure', async () => {
    const ds = makeDs(async () => ({ text: '   ' }));
    await expect(transcribe(ds, recording)).rejects.toMatchObject({ reason: 'empty' });
  });
});
