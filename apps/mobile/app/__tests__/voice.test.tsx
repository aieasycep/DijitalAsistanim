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
jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: () => require('@/features/flow/testing/demoSource').getTestDataSource(),
}));
jest.mock('@/services/handoff', () => ({
  openAppSettings: jest.fn(async () => true),
  openHandoff: jest.fn(async () => ({ ok: true, url: null })),
  detectMeetingProvider: () => 'other',
}));

/** Knobs for the microphone / STT fake below; reset in `beforeEach`. */
const mockSpeech = {
  startOutcome: 'started' as 'started' | 'permissionDenied' | 'unsupported' | 'failed' | 'busy',
  recording: {
    uri: 'file:///cache/voice-1.m4a',
    durationSec: 2.4,
    mimeType: 'audio/m4a',
  } as VoiceRecording | null,
  transcript: 'Bugün neye odaklanmalıyım?',
  transcribeError: null as unknown,
};

/** Declared outside the factory: jest-hoist rejects named parameters of function types inside it. */
type VoiceListener = (next: VoiceInputState) => void;

/**
 * The native microphone session (expo-audio) and the STT chain are replaced by a fake that keeps the
 * `VoiceInput` contract: state subscriptions, a live level value and `transcribe()` results.
 */
jest.mock('@/services/speech', () => {
  class TranscriptionError extends Error {
    readonly key = 'assistant.voice.transcribeFailed';
    readonly reason: 'server_failed' | 'unsupported' | 'empty';
    constructor(reason: 'server_failed' | 'unsupported' | 'empty') {
      super(`transcription failed: ${reason}`);
      this.name = 'TranscriptionError';
      this.reason = reason;
    }
  }
  const listeners = new Set<VoiceListener>();
  let state: VoiceInputState = {
    status: 'idle',
    durationSec: 0,
    autoStopped: false,
    pendingRecording: null,
  };
  const update = (patch: Partial<VoiceInputState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state));
  };
  const voiceRecorder = {
    supported: true,
    level: { value: 0 },
    start: jest.fn(async () => {
      if (mockSpeech.startOutcome === 'started') update({ status: 'recording', durationSec: 0 });
      return mockSpeech.startOutcome;
    }),
    stop: jest.fn(async () => {
      update({ status: 'idle', durationSec: mockSpeech.recording?.durationSec ?? 0 });
      return mockSpeech.recording;
    }),
    cancel: jest.fn(async () => update({ status: 'idle', durationSec: 0 })),
    getState: () => state,
    subscribe: (listener: VoiceListener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const transcribe = jest.fn(async () => {
    if (mockSpeech.transcribeError) throw mockSpeech.transcribeError;
    return { text: mockSpeech.transcript, provider: 'server' as const };
  });
  return {
    TranscriptionError,
    voiceRecorder,
    transcribe,
    MAX_RECORDING_SEC: 60,
    DEFAULT_SPEECH_LANGUAGE: 'tr-TR',
  };
});

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
  useSegments: () => [],
  usePathname: () => '/voice',
  useFocusEffect: jest.fn(),
}));

import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { ClientApiError } from '@da/api-client';
import VoiceScreen from '../voice';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';
import { trackScreen } from '@/lib/analytics';
import { openAppSettings } from '@/services/handoff';
import {
  TranscriptionError,
  transcribe,
  voiceRecorder,
  type VoiceInputState,
  type VoiceRecording,
} from '@/services/speech';
import { useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';

/** Seed ids (mirror packages/api-client/src/demo/ids.ts). */
const THREAD_AHMET_REVIZE = '00000000-0000-4000-8000-0000000000e1';
const CONTACT_MEHMET = '00000000-0000-4000-8000-000000002202';

const FIND_OPTS = { timeout: 5000 };
const EXAMPLES = ['Bugün ne var?', "Mehmet'e cevap vermem gerekiyor mu?", 'Brifingimi oku.'];

function resetParams(next: Record<string, string>) {
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  Object.assign(mockParams, next);
}

function isDisabled(node: { props: { accessibilityState?: { disabled?: boolean } } }): boolean {
  return node.props.accessibilityState?.disabled === true;
}

/** One tap-to-speak round trip: start recording, stop, transcribe `mockSpeech.transcript`. */
async function speak(screen: ReturnType<typeof renderWithProviders>) {
  fireEvent.press(screen.getByTestId('voice-record'));
  await waitFor(() =>
    expect(screen.getByTestId('voice-status').props.children).toBe('Dinliyorum…'),
  );
  expect(screen.getByTestId('voice-record').props.accessibilityLabel).toBe('Kaydı bitir');
  expect(screen.queryByTestId('voice-examples')).toBeNull();
  // Stopping resolves the recorder + STT promises: flush them inside act.
  await act(async () => {
    fireEvent.press(screen.getByTestId('voice-record'));
  });
}

beforeEach(() => {
  resetTestDataSource();
  jest.clearAllMocks();
  mockSpeech.startOutcome = 'started';
  mockSpeech.recording = {
    uri: 'file:///cache/voice-1.m4a',
    durationSec: 2.4,
    mimeType: 'audio/m4a',
  };
  mockSpeech.transcript = 'Bugün neye odaklanmalıyım?';
  mockSpeech.transcribeError = null;
  useSessionStore.setState({
    status: 'loading',
    entitlement: null,
    profile: null,
    preferences: null,
  });
  useUiStore.setState({ offline: false, pendingApprovals: 0, lastAnalyzedAt: null });
  resetParams({});
});

describe('Voice assistant screen', () => {
  it('opens on the night stage with tap-to-speak, example questions and the typed fallback', () => {
    const screen = renderWithProviders(<VoiceScreen />);
    expect(screen.getByTestId('voice-screen')).toBeTruthy();
    expect(screen.getByText('SESLİ ASİSTAN')).toBeTruthy();
    expect(screen.getByTestId('voice-waveform')).toBeTruthy();
    expect(screen.getByTestId('voice-status').props.children).toBe('Konuşmak için dokun');
    const record = screen.getByTestId('voice-record');
    expect(record.props.accessibilityLabel).toBe('Kayda başla');
    expect(isDisabled(record)).toBe(false);
    EXAMPLES.forEach((example, i) => {
      expect(screen.getByTestId(`voice-example-${i}`)).toBeTruthy();
      expect(screen.getByText(example)).toBeTruthy();
    });
    expect(screen.queryByTestId('voice-transcript')).toBeNull();
    expect(screen.queryByTestId('voice-answer')).toBeNull();
    expect(screen.queryByTestId('voice-offline')).toBeNull();
    expect(trackScreen).toHaveBeenCalledWith('voice');

    fireEvent.press(screen.getByTestId('voice-type-instead'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/assistant', params: {} });
    fireEvent.press(screen.getByTestId('voice-close'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('records, transcribes and answers a spoken question grounded in the demo data', async () => {
    const ds = getTestDataSource();
    const ask = jest.spyOn(ds.assistant, 'ask');
    const screen = renderWithProviders(<VoiceScreen />);

    await speak(screen);
    await waitFor(() => expect(voiceRecorder.stop).toHaveBeenCalled());
    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({ assistant: ds.assistant }), {
      uri: 'file:///cache/voice-1.m4a',
      durationSec: 2.4,
      mimeType: 'audio/m4a',
    });
    await waitFor(() =>
      expect(ask).toHaveBeenCalledWith({
        threadId: null,
        message: 'Bugün neye odaklanmalıyım?',
        inputMode: 'voice',
        contactId: null,
      }),
    );
    expect(await screen.findByTestId('voice-transcript', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByText('“Bugün neye odaklanmalıyım?”')).toBeTruthy();
    const answer = await screen.findByTestId('voice-answer', {}, FIND_OPTS);
    expect(answer).toBeTruthy();
    expect(screen.getByText('YANIT')).toBeTruthy();
    expect(screen.getByText(/^En kritik konu: /)).toBeTruthy();
    expect(screen.queryByTestId('voice-approval-0')).toBeNull();
    expect(screen.queryByText('Bunu yapmadan önce onayına sunuyorum.')).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('voice-status').props.children).toBe('Konuşmak için dokun'),
    );
    expect(screen.getByTestId('voice-examples')).toBeTruthy();
    expect(isDisabled(screen.getByTestId('voice-record'))).toBe(false);

    // The transcript travels along when the user switches to typing.
    fireEvent.press(screen.getByTestId('voice-type-instead'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(tabs)/assistant',
      params: { q: 'Bugün neye odaklanmalıyım?' },
    });
  });

  it('turns a spoken write intent into a pending approval instead of executing it', async () => {
    const ds = getTestDataSource();
    mockSpeech.transcript = "Ahmet'e yanıt taslağı hazırla";
    const before = await ds.email.getThread(THREAD_AHMET_REVIZE);
    const pendingBefore = await ds.approvals.pendingCount();
    const decide = jest.spyOn(ds.approvals, 'decideApproval');
    const screen = renderWithProviders(<VoiceScreen />);

    await speak(screen);
    await screen.findByTestId('voice-answer', {}, FIND_OPTS);
    expect(screen.getByText('Bunu yapmadan önce onayına sunuyorum.')).toBeTruthy();
    const open = await screen.findByTestId('voice-approval-0', {}, FIND_OPTS);
    expect(screen.getByText(/^Onayı Gör · Ahmet Yılmaz'a yanıt gönder$/)).toBeTruthy();
    expect(screen.getByText(/Göndermek için onaylaman yeterli\./)).toBeTruthy();

    // The approval exists server-side, is still pending and was requested by the voice channel…
    const approvals = await ds.approvals.listApprovals();
    const created = approvals.find((a) => a.type === 'email_send' && a.requestedBy === 'voice');
    expect(created).toBeTruthy();
    expect(created?.status).toBe('pending');
    expect(created?.executedAt).toBeNull();
    expect((created?.payload as { threadId: string }).threadId).toBe(THREAD_AHMET_REVIZE);
    expect(decide).not.toHaveBeenCalled();
    // …and nothing was sent: the thread is untouched.
    const after = await ds.email.getThread(THREAD_AHMET_REVIZE);
    expect(after.thread.messageCount).toBe(before.thread.messageCount);
    expect(after.thread.userMarkedDone).toBe(false);
    expect(after.thread.lastFromUser).toBe(before.thread.lastFromUser);
    // The pending badge was refreshed.
    await waitFor(() => expect(useUiStore.getState().pendingApprovals).toBe(pendingBefore + 1));

    fireEvent.press(open);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/approvals/[id]',
      params: { id: created?.id },
    });
  });

  it('asks example questions in voice mode, keeps the thread and scopes to a contact', async () => {
    resetParams({ contactId: CONTACT_MEHMET });
    const ds = getTestDataSource();
    // Hold the first answer back so the busy state is observable (the demo adapter answers instantly).
    const original = ds.assistant.ask.bind(ds.assistant);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ask = jest.spyOn(ds.assistant, 'ask').mockImplementationOnce(async (req) => {
      await held;
      return original(req);
    });
    const screen = renderWithProviders(<VoiceScreen />);

    fireEvent.press(screen.getByTestId('voice-example-1'));
    await waitFor(() =>
      expect(ask).toHaveBeenCalledWith({
        threadId: null,
        message: EXAMPLES[1],
        inputMode: 'voice',
        contactId: CONTACT_MEHMET,
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('voice-status').props.children).toBe('Anlıyorum…'),
    );
    expect(isDisabled(screen.getByTestId('voice-record'))).toBe(true);
    expect(screen.queryByTestId('voice-examples')).toBeNull();
    release();
    await screen.findByTestId('voice-answer', {}, FIND_OPTS);
    expect(screen.getByText(`“${EXAMPLES[1]}”`)).toBeTruthy();
    const threadId = (await ask.mock.results[0]?.value)?.threadId as string;
    expect(threadId).toBeTruthy();

    fireEvent.press(await screen.findByTestId('voice-example-0', {}, FIND_OPTS));
    await waitFor(() =>
      expect(ask).toHaveBeenLastCalledWith({
        threadId,
        message: EXAMPLES[0],
        inputMode: 'voice',
        contactId: CONTACT_MEHMET,
      }),
    );
    await waitFor(() => expect(screen.getByText(`“${EXAMPLES[0]}”`)).toBeTruthy());
    expect(voiceRecorder.start).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('voice-type-instead'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(tabs)/assistant',
      params: { q: EXAMPLES[0], contactId: CONTACT_MEHMET },
    });
  });

  it('explains a denied microphone permission and offers the settings shortcut', async () => {
    mockSpeech.startOutcome = 'permissionDenied';
    const ds = getTestDataSource();
    const ask = jest.spyOn(ds.assistant, 'ask');
    const screen = renderWithProviders(<VoiceScreen />);
    expect(screen.queryByTestId('voice-settings')).toBeNull();

    fireEvent.press(screen.getByTestId('voice-record'));
    expect(await screen.findByTestId('voice-settings', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByTestId('voice-status').props.children).toBe('Mikrofon izni gerekiyor');
    expect(screen.getByTestId('voice-record').props.accessibilityLabel).toBe('Kayda başla');
    expect(voiceRecorder.stop).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Ayarları Aç'));
    await waitFor(() => expect(openAppSettings).toHaveBeenCalled());
  });

  it('falls back to typing when nothing usable was said or no provider can transcribe', async () => {
    const ds = getTestDataSource();
    const ask = jest.spyOn(ds.assistant, 'ask');
    const screen = renderWithProviders(<VoiceScreen />);

    mockSpeech.transcribeError = new TranscriptionError('unsupported');
    await speak(screen);
    expect(
      await screen.findByText(
        'Ses tanıma şu an kullanılamıyor. Yazarak sorabilirsin.',
        {},
        FIND_OPTS,
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('voice-notice')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('voice-status').props.children).toBe('Konuşmak için dokun'),
    );
    expect(screen.getByTestId('voice-examples')).toBeTruthy();

    mockSpeech.transcribeError = null;
    mockSpeech.recording = null; // a tap, not speech
    await speak(screen);
    expect(
      await screen.findByText('Sesi anlayamadım. Tekrar dener misin?', {}, FIND_OPTS),
    ).toBeTruthy();
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(ask).not.toHaveBeenCalled();
    expect(screen.queryByTestId('voice-transcript')).toBeNull();
  });

  it('opens the contextual paywall when the daily assistant quota is exhausted', async () => {
    const ds = getTestDataSource();
    jest
      .spyOn(ds.assistant, 'ask')
      .mockRejectedValueOnce(
        new ClientApiError(
          { code: 'quota_exceeded', message: 'Günlük asistan kotası doldu.', retryAfterSec: 3600 },
          429,
        ),
      );
    const screen = renderWithProviders(<VoiceScreen />);
    fireEvent.press(screen.getByTestId('voice-example-0'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/paywall',
        params: { context: 'assistant' },
      }),
    );
    expect(await screen.findByText('Günlük AI kotan doldu.', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.queryByTestId('voice-answer')).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('voice-status').props.children).toBe('Konuşmak için dokun'),
    );
    expect(isDisabled(screen.getByTestId('voice-record'))).toBe(false);
  });

  it('blocks recording and the example chips while offline but keeps the typed fallback', async () => {
    useUiStore.setState({ offline: true });
    const ds = getTestDataSource();
    const ask = jest.spyOn(ds.assistant, 'ask');
    const screen = renderWithProviders(<VoiceScreen />);
    expect(screen.getByTestId('voice-offline')).toBeTruthy();
    expect(
      screen.getByText(
        'Çevrimdışısın. Sesli soru için bağlantı gerekiyor; yazarak devam edebilirsin.',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('voice-status').props.children).toBe('Çevrimdışı');
    expect(isDisabled(screen.getByTestId('voice-record'))).toBe(true);
    expect(isDisabled(screen.getByTestId('voice-example-0'))).toBe(true);

    fireEvent.press(screen.getByTestId('voice-record'));
    fireEvent.press(screen.getByTestId('voice-example-0'));
    expect(voiceRecorder.start).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('voice-type-instead'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/assistant', params: {} });
  });
});
