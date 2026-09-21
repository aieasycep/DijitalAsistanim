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

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  usePathname: () => '/analysis',
  useFocusEffect: jest.fn(),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';
import { ClientApiError, qk } from '@da/api-client';
import type { FirstAnalysisProgress, InitialAnalysisStatusResponse } from '@da/domain';
import AnalysisScreen from '../(onboarding)/analysis';
import {
  getTestDataSource,
  resetTestDataSource,
  TEST_NOW,
} from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/monitoring';

/** Seed id of today's morning briefing (mirrors packages/api-client/src/demo/ids.ts). */
const BRIEFING_MORNING = '00000000-0000-4000-8000-0000000000b1';

const FIND_OPTS = { timeout: 5000 };
const STEP_KEYS = ['scanning', 'classifying', 'calendar', 'open_loops'] as const;

function status(
  step: FirstAnalysisProgress['step'],
  counts: Partial<
    Pick<
      FirstAnalysisProgress,
      'emailsFound' | 'potentialImportant' | 'upcomingEvents' | 'possibleFollowUps'
    >
  > = {},
  extra: Partial<InitialAnalysisStatusResponse> = {},
): InitialAnalysisStatusResponse {
  return {
    step,
    emailsFound: 0,
    potentialImportant: 0,
    upcomingEvents: 0,
    possibleFollowUps: 0,
    startedAt: TEST_NOW,
    completedAt: step === 'done' ? TEST_NOW : null,
    windowHours: 72,
    error: null,
    insights: [],
    briefingId: null,
    ...counts,
    ...extra,
  };
}

/** Replaces the 1-second poll with a deterministic sequence; the last status repeats. */
function queueStatuses(list: InitialAnalysisStatusResponse[]) {
  const ds = getTestDataSource();
  const queue = [...list];
  let last = queue[0] as InitialAnalysisStatusResponse;
  return jest.spyOn(ds.onboarding, 'getInitialAnalysisStatus').mockImplementation(async () => {
    const next = queue.shift();
    if (next) last = next;
    return last;
  });
}

beforeEach(() => {
  resetTestDataSource();
  jest.clearAllMocks();
});

describe('Initial analysis screen', () => {
  it('starts the 72-hour analysis, grows the counts per step and hands over to Aha when done', async () => {
    const ds = getTestDataSource();
    const start = jest.spyOn(ds.onboarding, 'startInitialAnalysis');
    queueStatuses([
      status('scanning'),
      status('classifying', { emailsFound: 127, potentialImportant: 3 }),
      status('open_loops', {
        emailsFound: 127,
        potentialImportant: 8,
        upcomingEvents: 4,
        possibleFollowUps: 2,
      }),
      status(
        'done',
        { emailsFound: 127, potentialImportant: 8, upcomingEvents: 4, possibleFollowUps: 2 },
        { briefingId: BRIEFING_MORNING },
      ),
    ]);
    const screen = renderWithProviders(<AnalysisScreen />);

    expect(screen.getByTestId('analysis-screen')).toBeTruthy();
    expect(screen.getByText('Dijital hayatın analiz ediliyor…')).toBeTruthy();
    for (const key of STEP_KEYS) expect(screen.getByTestId(`analysis-step-${key}`)).toBeTruthy();
    expect(screen.getByTestId('analysis-step-prioritizing')).toBeTruthy();
    expect(screen.getByText('Son 72 saat taranıyor')).toBeTruthy();
    expect(screen.getByText('Öncelikler sıralanıyor')).toBeTruthy();
    expect(
      screen.getByText(
        'Genelde 20–40 saniye sürer. Mail içerikleri cihazında özetlenir, hiçbir şey gönderilmez.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('analysis-retry')).toBeNull();

    await waitFor(() => expect(start).toHaveBeenCalledWith({ windowHours: 72 }));
    expect(
      await screen.findByText('Son 72 saat · Gmail · Apple Takvim', {}, FIND_OPTS),
    ).toBeTruthy();

    // Step 2 with the first findings.
    expect(await screen.findByText('127 mail bulundu', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByText('3 potansiyel önemli konu')).toBeTruthy();
    expect(screen.queryByText('4 yaklaşan etkinlik')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();

    // Next poll: step 4 with every count in place.
    expect(await screen.findByText('4 yaklaşan etkinlik', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByText('8 potansiyel önemli konu')).toBeTruthy();
    expect(screen.getByText('2 olası takip')).toBeTruthy();

    // Done: haptic + analytics + hand-over to the Aha screen, with the result cached for it.
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/aha'), FIND_OPTS);
    expect(track).toHaveBeenCalledWith(
      'first_analysis_completed',
      expect.objectContaining({ emailsFound: 127, insights: 0, durationMs: expect.any(Number) }),
    );
    expect(
      screen.queryClient.getQueryData<InitialAnalysisStatusResponse>(qk.firstAnalysis),
    ).toEqual(expect.objectContaining({ step: 'done', briefingId: BRIEFING_MORNING }));
    expect(mockReplace).toHaveBeenCalledTimes(1);
  }, 15000);

  it('skips straight to Aha when the first analysis already completed (demo seed)', async () => {
    const ds = getTestDataSource();
    const start = jest.spyOn(ds.onboarding, 'startInitialAnalysis');
    const screen = renderWithProviders(<AnalysisScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/aha'), FIND_OPTS);
    expect(start).not.toHaveBeenCalled();
    const cached = screen.queryClient.getQueryData<InitialAnalysisStatusResponse>(qk.firstAnalysis);
    expect(cached?.step).toBe('done');
    expect(cached?.briefingId).toBe(BRIEFING_MORNING);
    expect(cached?.insights.length).toBeGreaterThan(0);
    expect(cached?.emailsFound).toBe(127);
  });

  it('starts anyway when the status check fails, and reports the failure', async () => {
    const ds = getTestDataSource();
    const start = jest.spyOn(ds.onboarding, 'startInitialAnalysis');
    const failure = new ClientApiError({ code: 'internal', message: 'status unavailable' });
    queueStatuses([status('scanning'), status('done', { emailsFound: 127 })]).mockRejectedValueOnce(
      failure,
    );
    const screen = renderWithProviders(<AnalysisScreen />);
    await waitFor(() =>
      expect(captureError).toHaveBeenCalledWith(failure, { where: 'analysis.status' }),
    );
    await waitFor(() => expect(start).toHaveBeenCalledWith({ windowHours: 72 }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/aha'), FIND_OPTS);
    expect(screen.getByTestId('analysis-screen')).toBeTruthy();
  });

  it('offers a retry when starting fails, then continues after the retry', async () => {
    const ds = getTestDataSource();
    const failure = new ClientApiError({ code: 'provider_unavailable', message: 'gmail down' });
    const start = jest.spyOn(ds.onboarding, 'startInitialAnalysis').mockRejectedValueOnce(failure);
    queueStatuses([status('scanning'), status('done', { emailsFound: 127 })]);
    const screen = renderWithProviders(<AnalysisScreen />);

    expect(await screen.findByText('Analiz tamamlanamadı.', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByText('Eşitleme gecikti.')).toBeTruthy();
    expect(screen.getByTestId('analysis-retry')).toBeTruthy();
    expect(screen.getByText('Tekrar Dene')).toBeTruthy();
    expect(screen.queryByTestId('analysis-step-scanning')).toBeNull();
    expect(captureError).toHaveBeenCalledWith(failure, { where: 'analysis.start' });
    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('analysis-retry'));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Dijital hayatın analiz ediliyor…', {}, FIND_OPTS)).toBeTruthy();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/aha'), FIND_OPTS);
  });

  it('shows the server-side failure reason when the analysis itself fails', async () => {
    const ds = getTestDataSource();
    const start = jest.spyOn(ds.onboarding, 'startInitialAnalysis');
    const statusSpy = queueStatuses([
      status('scanning'),
      status('failed', { emailsFound: 48 }, { error: 'Gmail bağlantısı koptu.' }),
    ]);
    const screen = renderWithProviders(<AnalysisScreen />);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Analiz tamamlanamadı.', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByText('Gmail bağlantısı koptu.')).toBeTruthy();
    expect(screen.getByTestId('analysis-retry')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    // A failed analysis stops the 1-second polling: no further status reads after the failure.
    const calls = statusSpy.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(statusSpy).toHaveBeenCalledTimes(calls);
  });
});
