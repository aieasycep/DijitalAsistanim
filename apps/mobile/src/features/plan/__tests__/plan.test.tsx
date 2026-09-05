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
jest.mock('@/lib/i18n', () => ({
  formatCtx: (overrides: Record<string, unknown> = {}) => ({
    locale: 'tr',
    timezone: 'Europe/Istanbul',
    ...overrides,
  }),
  setupI18n: jest.fn(),
  changeLocale: jest.fn(),
}));
jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: () => require('@/features/flow/testing/demoSource').getTestDataSource(),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  usePathname: () => '/plan',
  useFocusEffect: jest.fn(),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';
import PlanScreen from '../../../../app/(tabs)/plan';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';

describe('Plan screen', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
  });

  it('shows the calendar intelligence suggestion and plans it through a task_create approval', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.approvals, 'createApproval');
    const screen = renderWithProviders(<PlanScreen />);
    expect(screen.getByTestId('plan-screen')).toBeTruthy();
    const primary = await screen.findByTestId('plan-suggestion-primary', {}, { timeout: 5000 });
    expect(screen.getByText('TAKVİM ZEKÂSI')).toBeTruthy();
    fireEvent.press(primary);
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task_create',
          requestedBy: 'plan',
          payload: expect.objectContaining({
            scheduledStartAt: expect.any(String),
            scheduledEndAt: expect.any(String),
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/approvals/[id]' }),
      ),
    );
  });

  it('dismisses a suggestion with Başka zaman and switches to the week view', async () => {
    const screen = renderWithProviders(<PlanScreen />);
    await screen.findByTestId('plan-suggestion-secondary', {}, { timeout: 5000 });
    fireEvent.press(screen.getByTestId('plan-suggestion-secondary'));
    fireEvent.press(screen.getByTestId('plan-segment-week'));
    await waitFor(() =>
      expect(screen.getByTestId('plan-segment-week').props.accessibilityState?.selected).toBe(true),
    );
    expect(screen.getByTestId('plan-commitments')).toBeTruthy();
    fireEvent.press(screen.getByTestId('plan-commitments'));
    expect(mockPush).toHaveBeenCalledWith('/commitments');
  });

  it('renders the timeline of the selected day', async () => {
    const screen = renderWithProviders(<PlanScreen />);
    await screen.findByTestId('plan-date-strip', {}, { timeout: 5000 });
    await waitFor(() => expect(screen.queryByTestId('plan-loading')).toBeNull(), { timeout: 5000 });
    const events = screen.queryAllByTestId(/^plan-event-/);
    const empty = screen.queryByTestId(/^plan-empty-/);
    expect(events.length > 0 || empty !== null).toBe(true);
  });
});
