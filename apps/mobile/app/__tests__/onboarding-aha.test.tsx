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
  usePathname: () => '/aha',
  useFocusEffect: jest.fn(),
}));

import { fireEvent } from '@testing-library/react-native';
import { ClientApiError } from '@da/api-client';
import AhaScreen from '../(onboarding)/aha';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';

const FIND_OPTS = { timeout: 5000 };

describe('Aha screen', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockReplace.mockClear();
  });

  it('scrolls the findings and keeps the CTA outside the scroll area', async () => {
    const screen = renderWithProviders(<AhaScreen />);
    expect(await screen.findByTestId('aha-card-0', {}, FIND_OPTS)).toBeTruthy();
    const ds = getTestDataSource();
    const { insights } = await ds.onboarding.getInitialAnalysisStatus();
    expect(insights.length).toBeGreaterThan(0);
    expect(
      screen.getByText(`Son 72 saatte bilmen gereken ${insights.length} şey bulduk.`),
    ).toBeTruthy();
    const scroll = screen.getByTestId('aha-scroll');
    // Every card lives inside the scroll view; the CTA does not, so it is reachable on small screens.
    expect(scroll.findAllByProps({ testID: 'aha-card-0' }).length).toBeGreaterThan(0);
    expect(scroll.findAllByProps({ testID: 'aha-cta' })).toHaveLength(0);
    fireEvent.press(screen.getByTestId('aha-cta'));
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/notifications');
  });

  it('shows the error state and recovers on retry', async () => {
    const ds = getTestDataSource();
    const spy = jest
      .spyOn(ds.onboarding, 'getInitialAnalysisStatus')
      .mockRejectedValueOnce(new ClientApiError({ code: 'internal', message: 'boom' }));
    const screen = renderWithProviders(<AhaScreen />);
    fireEvent.press(await screen.findByText('Tekrar dene', {}, FIND_OPTS));
    expect(await screen.findByTestId('aha-card-0', {}, FIND_OPTS)).toBeTruthy();
    spy.mockRestore();
  });
});
