import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
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
// Keep the real provider detection (Meet / Teams labels); only the hand-off itself is faked.
jest.mock('@/services/handoff', () => ({
  ...jest.requireActual('@/services/handoff'),
  openHandoff: jest.fn(async () => ({ ok: true, url: 'https://meet.google.com/abc-defg-hij' })),
  openAppSettings: jest.fn(async () => true),
}));
// Microphone session: a scripted recorder + transcription instead of expo-audio.
jest.mock('@/services/speech', () => {
  class TranscriptionError extends Error {
    readonly key = 'assistant.voice.transcribeFailed';
    readonly reason: string;
    constructor(reason: string) {
      super(`transcription failed: ${reason}`);
      this.name = 'TranscriptionError';
      this.reason = reason;
    }
  }
  const idle = { status: 'idle', durationSec: 0, autoStopped: false, pendingRecording: null };
  return {
    TranscriptionError,
    transcribe: jest.fn(async () => ({
      text: "Selin'e sözleşme yorumunu yarın göndereceğim",
      provider: 'server',
    })),
    voiceRecorder: {
      supported: true,
      level: { value: 0 },
      getState: () => idle,
      subscribe: jest.fn(() => jest.fn()),
      start: jest.fn(async () => 'started'),
      stop: jest.fn(async () => ({
        uri: 'file:///tmp/post-meeting.m4a',
        durationSec: 2.4,
        mimeType: 'audio/m4a',
      })),
      cancel: jest.fn(async () => undefined),
    },
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
  usePathname: () => '/meeting',
  useFocusEffect: jest.fn(),
}));

import type { ReactElement } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import { PRO_QUOTAS, type EntitlementState } from '@da/domain';
import { track } from '@/lib/analytics';
import { openHandoff } from '@/services/handoff';
import { transcribe, voiceRecorder } from '@/services/speech';
import MeetingPrepScreen from '../meeting/[id]/prep';
import PostMeetingScreen from '../meeting/[id]/post';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';
import { useSessionStore } from '@/store/session';

/** Seed ids (mirror packages/api-client/src/demo/ids.ts). */
const seed = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const CONTACT_MEHMET = seed('2202');
const THREAD_MEHMET_TEKLIF_V2 = seed('e4');
const THREAD_MEHMET_TOPLANTI = seed('eb');
const EVENT_MEHMET_MEETING = seed('d1');
const EVENT_DOKTOR = seed('d5');
const POST_MEETING_NOTE_MEHMET = seed('3901');
const MEET_URL = 'https://meet.google.com/abc-defg-hij';

const FIND = { timeout: 5000 };

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

/** status 'loading' keeps the entitlement query disabled so the store's entitlement decides the gate. */
function setEntitlement(entitlement: EntitlementState | null) {
  useSessionStore.setState({ preferences: null, entitlement, status: 'loading' });
}

/** Mutations must not keep 5-minute GC timers alive after a test (would stall Jest's exit). */
function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}

function renderScreen(ui: ReactElement) {
  return renderWithProviders(ui, { queryClient: makeClient() });
}

describe('Meeting prep', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    mockBack.mockClear();
    (track as jest.Mock).mockClear();
    (openHandoff as jest.Mock).mockClear();
    resetParams({ id: EVENT_MEHMET_MEETING });
    setEntitlement(PRO);
  });

  it('renders the person, the three talking points and every evidence section', async () => {
    const screen = renderScreen(<MeetingPrepScreen />);
    expect(screen.getByTestId('prep-screen')).toBeTruthy();
    // Kickers are upper-cased with Turkish casing rules (dotted İ / dotless I) by the Text primitive.
    expect(screen.getByText('TOPLANTIYA HAZIRLAN')).toBeTruthy();
    await screen.findByTestId('prep-person', {}, FIND);
    expect(screen.queryByTestId('prep-gate')).toBeNull();
    expect(screen.getByText('Mehmet Yılmaz')).toBeTruthy();
    expect(screen.getByText(/^Mehmet ile müşteri toplantısı · 14:30 · 1 sa · Ofis$/)).toBeTruthy();

    // Signature card: "Konuşman gereken 3 şey", each point tappable to its source.
    expect(screen.getByTestId('prep-talking-points')).toBeTruthy();
    expect(screen.getByText('TOPLANTIDA KONUŞMAN GEREKEN 3 ŞEY')).toBeTruthy();
    expect(screen.getByText('Kısa ve net: bunları konuş.')).toBeTruthy();
    expect(within(screen.getByTestId('prep-talking-0')).getByText('Revize fiyat')).toBeTruthy();
    expect(within(screen.getByTestId('prep-talking-1')).getByText('Teslim tarihi')).toBeTruthy();
    expect(within(screen.getByTestId('prep-talking-2')).getByText('Sözleşme maddesi')).toBeTruthy();

    // Evidence sections.
    expect(screen.getByText('TOPLANTININ AMACI')).toBeTruthy();
    expect(
      screen.getByText(
        'Eylül teklifinin son hâlini netleştirmek ve Ekim teslimatı için onay almak.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('SON GÖRÜŞMENİZ')).toBeTruthy();
    expect(screen.getByTestId('prep-last-contact')).toBeTruthy();
    expect(screen.getByText('SON E-POSTALAR')).toBeTruthy();
    expect(screen.getByText('2 mail')).toBeTruthy();
    expect(within(screen.getByTestId('prep-email-0')).getByText('Teklif v2')).toBeTruthy();
    expect(
      within(screen.getByTestId('prep-email-1')).getByText('Re: Bugünkü toplantı'),
    ).toBeTruthy();
    expect(screen.getByText('AÇIK KONULAR')).toBeTruthy();
    expect(
      within(screen.getByTestId('prep-loop-0')).getByText('Sözleşme taslağı hukuk yorumu bekliyor'),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('prep-loop-1')).getByText('Nakliye maliyeti kimde?'),
    ).toBeTruthy();
    expect(screen.getByText('SENDEN BEKLENENLER')).toBeTruthy();
    expect(
      within(screen.getByTestId('prep-mine-0')).getByText("Mehmet'e teklif gönder"),
    ).toBeTruthy();
    expect(screen.getByText('SENİN BEKLEDİKLERİN')).toBeTruthy();
    expect(
      within(screen.getByTestId('prep-theirs-0')).getByText(
        'Mehmet Teklif v2 geri bildirimi gönderecek',
      ),
    ).toBeTruthy();
    expect(screen.getByText('İLGİLİ DOSYALAR')).toBeTruthy();
    expect(within(screen.getByTestId('prep-file-0')).getByText('Teklif_v2.pdf')).toBeTruthy();
    expect(screen.queryByTestId('prep-empty')).toBeNull();
    expect(screen.queryByTestId('prep-travel')).toBeNull();

    // Footer CTAs + analytics.
    expect(screen.getByTestId('prep-summary')).toBeTruthy();
    expect(screen.getByTestId('prep-note')).toBeTruthy();
    expect(track).toHaveBeenCalledWith(
      'meeting_prep_opened',
      expect.objectContaining({ minutesBefore: expect.any(Number) }),
    );
  });

  it('"Hazırlan" actions: joins via Google Meet hand-off and opens every source', async () => {
    const screen = renderScreen(<MeetingPrepScreen />);
    const join = await screen.findByTestId('prep-join', {}, FIND);
    expect(join.props.accessibilityLabel).toBe("Google Meet'te Aç");
    expect(screen.queryByTestId('prep-directions')).toBeNull();

    fireEvent.press(join);
    await waitFor(() =>
      expect(openHandoff).toHaveBeenCalledWith({ kind: 'meeting', url: MEET_URL }),
    );
    expect(screen.queryByText('Uygulama açılamadı.')).toBeNull();

    fireEvent.press(screen.getByTestId('prep-email-0'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/email/[id]',
      params: { id: THREAD_MEHMET_TEKLIF_V2 },
    });
    fireEvent.press(screen.getByTestId('prep-email-1'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/email/[id]',
      params: { id: THREAD_MEHMET_TOPLANTI },
    });
    fireEvent.press(screen.getByTestId('prep-talking-0'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/meeting/[id]/post',
      params: { id: POST_MEETING_NOTE_MEHMET },
    });
    fireEvent.press(screen.getByTestId('prep-last-contact'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/meeting/[id]/post',
      params: { id: POST_MEETING_NOTE_MEHMET },
    });
    fireEvent.press(screen.getByTestId('prep-file-0'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/email/[id]',
      params: { id: THREAD_MEHMET_TEKLIF_V2 },
    });
    fireEvent.press(screen.getByTestId('prep-mine-0'));
    expect(mockPush).toHaveBeenLastCalledWith('/commitments');
    fireEvent.press(screen.getByTestId('prep-person'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/person/[id]',
      params: { id: CONTACT_MEHMET },
    });
    fireEvent.press(screen.getByTestId('prep-note'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/meeting/[id]/post',
      params: { id: EVENT_MEHMET_MEETING },
    });
  });

  it('warns when the meeting app cannot be opened', async () => {
    (openHandoff as jest.Mock).mockResolvedValueOnce({
      ok: false,
      url: null,
      reason: 'unavailable',
    });
    const screen = renderScreen(<MeetingPrepScreen />);
    fireEvent.press(await screen.findByTestId('prep-join', {}, FIND));
    await screen.findByText('Uygulama açılamadı.', {}, FIND);
  });

  it('opens the two-minute summary sheet and regenerates the prep', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.meetings, 'getMeetingPrep');
    const screen = renderScreen(<MeetingPrepScreen />);
    await screen.findByTestId('prep-summary', {}, FIND);
    expect(screen.queryByTestId('prep-summary-text')).toBeNull();

    fireEvent.press(screen.getByTestId('prep-summary'));
    const text = await screen.findByTestId('prep-summary-text', {}, FIND);
    expect(screen.getByText('Nerede kalmıştınız?')).toBeTruthy();
    expect(screen.getByText('Mehmet Yılmaz · 14:30')).toBeTruthy();
    expect(text.props.children).toMatch(/^Mehmet ile en son .* konuştunuz\./);
    expect(text.props.children).toMatch(/Nakliye maliyetinin kimde olacağı/);

    fireEvent.press(screen.getByTestId('prep-regenerate'));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(EVENT_MEHMET_MEETING, { regenerate: true }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('prep-regenerate').props.accessibilityState?.busy).toBe(false),
    );
    expect(screen.getByTestId('prep-person')).toBeTruthy();
  });

  it('shows travel time and directions for an in-person meeting', async () => {
    resetParams({ id: EVENT_DOKTOR });
    const screen = renderScreen(<MeetingPrepScreen />);
    await screen.findByTestId('prep-travel', {}, FIND);
    expect(screen.getByText(/'de çıkman yeterli$/)).toBeTruthy();
    const person = screen.getByTestId('prep-person');
    expect(within(person).getByText('Doktor randevusu')).toBeTruthy();
    expect(within(person).getByText(/^Doktor randevusu · 14:30 · 45 dk · Nişantaşı$/)).toBeTruthy();
    expect(screen.queryByTestId('prep-join')).toBeNull();
    // No attendee → no person to open, one fallback talking point built from the invite itself.
    expect(person.props.accessibilityState?.disabled).toBe(true);
    expect(within(screen.getByTestId('prep-talking-0')).getByText('Doktor randevusu')).toBeTruthy();
    expect(screen.queryByTestId('prep-talking-1')).toBeNull();

    fireEvent.press(screen.getByTestId('prep-directions'));
    await waitFor(() =>
      expect(openHandoff).toHaveBeenCalledWith({ kind: 'directions', location: 'Nişantaşı' }),
    );
  });

  it('gates the screen behind Pro for free users', async () => {
    setEntitlement(null);
    const screen = renderScreen(<MeetingPrepScreen />);
    await screen.findByTestId('prep-gate', {}, FIND);
    expect(screen.getByText('Toplantı hazırlığı Pro ile.')).toBeTruthy();
    expect(screen.queryByTestId('prep-person')).toBeNull();
    expect(screen.queryByTestId('prep-summary')).toBeNull();
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/paywall',
        params: { context: 'meeting_prep' },
      }),
    );
    expect(track).toHaveBeenCalledWith('paywall_viewed', { context: 'meeting_prep' });
  });

  it('shows the error state and recovers on retry', async () => {
    const ds = getTestDataSource();
    jest.spyOn(ds.meetings, 'getMeetingPrep').mockRejectedValueOnce(new Error('boom'));
    const screen = renderScreen(<MeetingPrepScreen />);
    await screen.findByTestId('prep-error', {}, FIND);
    expect(screen.queryByTestId('prep-summary')).toBeNull();
    fireEvent.press(screen.getByText('Tekrar dene'));
    await screen.findByTestId('prep-person', {}, FIND);
    expect(screen.queryByTestId('prep-error')).toBeNull();
  });
});

describe('Post-meeting note', () => {
  const recorder = voiceRecorder as unknown as {
    start: jest.Mock;
    stop: jest.Mock;
    cancel: jest.Mock;
  };

  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    mockBack.mockClear();
    recorder.start.mockClear();
    recorder.stop.mockClear();
    recorder.cancel.mockClear();
    (transcribe as jest.Mock).mockClear();
    resetParams({ id: EVENT_MEHMET_MEETING });
    setEntitlement(PRO);
  });

  it('extracts a commitment proposal from the note and walks into its approval', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.meetings, 'submitPostMeeting');
    const commitmentsBefore = (await ds.plan.listCommitments()).length;
    const screen = renderScreen(<PostMeetingScreen />);
    expect(screen.getByTestId('post-screen')).toBeTruthy();
    expect(screen.getByText('TOPLANTI SONRASI')).toBeTruthy();
    expect(screen.getByText('Toplantın bitti.')).toBeTruthy();
    expect(screen.getByText('Takip etmen gereken bir şey var mı?')).toBeTruthy();
    await screen.findByText('Mehmet ile müşteri toplantısı · 14:30–15:30', {}, FIND);
    expect(screen.getByTestId('post-submit').props.accessibilityState?.disabled).toBe(true);
    expect(screen.queryByTestId('post-save')).toBeNull();

    fireEvent.changeText(screen.getByTestId('post-input'), "Mehmet'e yarın teklif göndereceğim.");
    expect(screen.getByTestId('post-submit').props.accessibilityState?.disabled).toBe(false);
    fireEvent.press(screen.getByTestId('post-submit'));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        eventId: EVENT_MEHMET_MEETING,
        text: "Mehmet'e yarın teklif göndereceğim.",
        inputMode: 'text',
      }),
    );

    // One proposal, phrased as a commitment, with its due text and counterpart.
    await screen.findByTestId('post-proposals', {}, FIND);
    expect(screen.getByText('1 YENİ TAAHHÜT')).toBeTruthy();
    expect(
      screen.getByText('Yeşil işaret “tespit edildi” demek; kayıt yalnızca onayınla olur.'),
    ).toBeTruthy();
    const row = screen.getByTestId('post-proposal-0');
    expect(within(row).getByText("Mehmet'e teklif gönder")).toBeTruthy();
    expect(within(row).getByText(/Mehmet Yılmaz$/)).toBeTruthy();
    expect(screen.queryByTestId('post-proposal-1')).toBeNull();
    expect(screen.queryByTestId('post-no-proposals')).toBeNull();

    // "Kaydet" never bulk-approves: it opens the first pending approval card.
    fireEvent.press(screen.getByTestId('post-save'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/approvals/[id]',
      params: { id: expect.any(String) },
    });
    const approvalId = (mockPush.mock.calls[0]?.[0] as { params: { id: string } }).params.id;
    const approval = await ds.approvals.getApproval(approvalId);
    expect(approval.type).toBe('commitment_create');
    expect(approval.status).toBe('pending');
    expect(approval.requestedBy).toBe('post_meeting');
    expect(approval.payload).toEqual(
      expect.objectContaining({
        text: "Mehmet'e teklif gönder",
        direction: 'user_owes',
        counterpartName: 'Mehmet Yılmaz',
        relatedEventId: EVENT_MEHMET_MEETING,
      }),
    );
    // Nothing is written to the commitments until the approval is decided.
    expect(await ds.plan.listCommitments()).toHaveLength(commitmentsBefore);
    fireEvent.press(screen.getByTestId('post-proposal-0'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/approvals/[id]',
      params: { id: approvalId },
    });
  });

  it('reports a note without commitments and closes with "Takip gerekmiyor"', async () => {
    const ds = getTestDataSource();
    const handled = jest.spyOn(ds.meetings, 'markPostMeetingHandled');
    const screen = renderScreen(<PostMeetingScreen />);
    await screen.findByText('Mehmet ile müşteri toplantısı · 14:30–15:30', {}, FIND);

    fireEvent.changeText(screen.getByTestId('post-input'), 'Toplantı iyi geçti, karar çıkmadı.');
    fireEvent.press(screen.getByTestId('post-submit'));
    await screen.findByTestId('post-no-proposals', {}, FIND);
    expect(
      screen.getByText('Notunda bir taahhüt bulamadım. Kaydettim, takip gerekmiyor.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('post-save')).toBeNull();

    fireEvent.press(screen.getByTestId('post-nothing'));
    await waitFor(() => expect(handled).toHaveBeenCalledWith(EVENT_MEHMET_MEETING));
    await screen.findByText('Tamam, takip gerekmiyor.', {}, FIND);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect((await ds.plan.getEvent(EVENT_MEHMET_MEETING)).postMeetingHandledAt).not.toBeNull();
  });

  it('records a voice note, transcribes it into the field and submits it as voice input', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.meetings, 'submitPostMeeting');
    const screen = renderScreen(<PostMeetingScreen />);
    await screen.findByText('Mehmet ile müşteri toplantısı · 14:30–15:30', {}, FIND);
    expect(screen.getByTestId('post-mic').props.accessibilityLabel).toBe('Kayda başla');

    fireEvent.press(screen.getByTestId('post-mic'));
    await waitFor(() => expect(recorder.start).toHaveBeenCalledTimes(1));
    await screen.findByText(/dinleniyor$/, {}, FIND);
    expect(screen.getByLabelText('Dinliyorum…')).toBeTruthy();
    expect(screen.getByTestId('post-mic').props.accessibilityLabel).toBe('Kaydı bitir');

    fireEvent.press(screen.getByTestId('post-mic'));
    await waitFor(() => expect(recorder.stop).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(transcribe).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ uri: 'file:///tmp/post-meeting.m4a', durationSec: 2.4 }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Takip etmen gereken bir şey var mı?').props.value).toBe(
        "Selin'e sözleşme yorumunu yarın göndereceğim",
      ),
    );
    expect(screen.queryByText(/dinleniyor$/)).toBeNull();

    fireEvent.press(screen.getByTestId('post-submit'));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        eventId: EVENT_MEHMET_MEETING,
        text: "Selin'e sözleşme yorumunu yarın göndereceğim",
        inputMode: 'voice',
      }),
    );
    await screen.findByTestId('post-proposal-0', {}, FIND);
    expect(
      within(screen.getByTestId('post-proposal-0')).getByText("Selin'e sözleşme yorumunu gönder"),
    ).toBeTruthy();
  });
});
