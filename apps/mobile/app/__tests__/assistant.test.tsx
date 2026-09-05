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
  usePathname: () => '/assistant',
  useFocusEffect: jest.fn(),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';
import AssistantScreen from '../(tabs)/assistant';
import { resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';

describe('Assistant screen', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
  });

  it('never opens empty: suggested questions lead to a grounded answer with sources', async () => {
    const screen = renderWithProviders(<AssistantScreen />);
    expect(screen.getByTestId('assistant-screen')).toBeTruthy();
    expect(screen.getByTestId('assistant-input')).toBeTruthy();
    expect(screen.getByTestId('assistant-mic')).toBeTruthy();
    const suggestion = await screen.findByTestId('assistant-suggestion-0', {}, { timeout: 5000 });
    expect(screen.getByText('ÖNERİLEN SORULAR')).toBeTruthy();
    fireEvent.press(suggestion);
    await screen.findByTestId('assistant-message-1', {}, { timeout: 5000 });
    expect(screen.getByTestId('assistant-message-0')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('assistant-source-0')).toBeTruthy());
    expect(screen.getByText('KAYNAKLAR')).toBeTruthy();
    expect(screen.queryByTestId('assistant-suggestion-0')).toBeNull();
  });

  it('sends typed questions and renders rich cards', async () => {
    const screen = renderWithProviders(<AssistantScreen />);
    await screen.findByTestId('assistant-suggestion-0', {}, { timeout: 5000 });
    fireEvent.changeText(screen.getByTestId('assistant-input'), 'Mehmet ile en son ne konuştuk?');
    fireEvent.press(screen.getByTestId('assistant-send'));
    await screen.findByTestId('assistant-message-1', {}, { timeout: 5000 });
    expect(screen.getAllByText(/Mehmet/).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByTestId('assistant-card-0')).toBeTruthy());
    expect(screen.getByTestId('assistant-input').props.value).toBe('');
  });

  it('opens the voice screen from the mic', async () => {
    const screen = renderWithProviders(<AssistantScreen />);
    await screen.findByTestId('assistant-suggestion-0', {}, { timeout: 5000 });
    fireEvent.press(screen.getByTestId('assistant-mic'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/voice' }));
  });
});
