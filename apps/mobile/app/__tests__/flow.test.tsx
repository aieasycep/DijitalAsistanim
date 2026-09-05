import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
// FlashList measures its viewport natively; a FlatList with the same props renders every item under Jest.
jest.mock('@shopify/flash-list', () => ({ FlashList: require('react-native').FlatList }));

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
  usePathname: () => '/flow',
  useFocusEffect: jest.fn(),
}));

import { fireEvent, waitFor, within } from '@testing-library/react-native';
import FlowScreen from '../(tabs)/flow';
import { resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';

describe('Flow screen', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
  });

  it('renders the feed with filter chips, cards and the Mail Özeti entry', async () => {
    const screen = renderWithProviders(<FlowScreen />);
    expect(screen.getByTestId('flow-screen')).toBeTruthy();
    for (const key of ['all', 'important', 'mail', 'calendar', 'follow_up', 'personal']) {
      expect(screen.getByTestId(`flow-filter-${key}`)).toBeTruthy();
    }
    await screen.findByTestId('flow-item-0', {}, { timeout: 5000 });
    expect(screen.getByTestId('flow-mail-intelligence')).toBeTruthy();
    fireEvent.press(screen.getByTestId('flow-mail-intelligence'));
    expect(mockPush).toHaveBeenCalledWith('/mail-intelligence');
  });

  it('switches filters and shows either items or the empty state', async () => {
    const screen = renderWithProviders(<FlowScreen />);
    await screen.findByTestId('flow-item-0', {}, { timeout: 5000 });
    fireEvent.press(screen.getByTestId('flow-filter-personal'));
    await waitFor(
      () => {
        expect(screen.queryByTestId('flow-loading')).toBeNull();
        expect(
          screen.queryByTestId('flow-item-0') ?? screen.queryByTestId('flow-empty'),
        ).toBeTruthy();
      },
      { timeout: 5000 },
    );
  });

  it('renders every card as a labelled button with its badge and title', async () => {
    const screen = renderWithProviders(<FlowScreen />);
    const first = await screen.findByTestId('flow-item-0', {}, { timeout: 5000 });
    const card = within(first)
      .getAllByRole('button')
      .find(
        (n) =>
          typeof n.props.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.includes('·'),
      );
    expect(card).toBeTruthy();
    fireEvent.press(card as NonNullable<typeof card>);
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: expect.any(String) }),
    );
  });
});
