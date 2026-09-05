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
jest.mock('@/services/media', () => ({
  pickImage: jest.fn(async () => ({
    status: 'picked',
    asset: {
      uri: 'file:///tmp/photo.jpg',
      mimeType: 'image/jpeg',
      fileName: 'photo.jpg',
      sizeBytes: 1200,
      kind: 'image',
    },
  })),
  pickDocument: jest.fn(async () => ({ status: 'cancelled' })),
}));
jest.mock('@/services/handoff', () => ({
  openAppSettings: jest.fn(async () => true),
  openHandoff: jest.fn(async () => ({ ok: true, url: null })),
  detectMeetingProvider: () => 'other',
}));

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
  usePathname: () => '/capture',
  useFocusEffect: jest.fn(),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';
import CaptureScreen from '../../../../app/capture/index';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';
import { pickImage } from '@/services/media';
import { isValidCaptureUrl } from '../useCapture';

describe('Universal capture', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    mockBack.mockClear();
    delete mockParams.id;
  });

  it('validates links', () => {
    expect(isValidCaptureUrl('https://example.com/etkinlik')).toBe(true);
    expect(isValidCaptureUrl('javascript:alert(1)')).toBe(false);
    expect(isValidCaptureUrl('')).toBe(false);
  });

  it('analyzes typed text and offers contextual actions', async () => {
    const screen = renderWithProviders(<CaptureScreen />);
    expect(screen.getByTestId('capture-screen')).toBeTruthy();
    for (const kind of ['camera', 'photo', 'pdf', 'file', 'link', 'text'])
      expect(screen.getByTestId(`capture-source-${kind}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId('capture-source-text'));
    fireEvent.changeText(
      screen.getByTestId('capture-text-input'),
      '12 Eylül 20:00 Zorlu PSM konser buluşması',
    );
    fireEvent.press(screen.getByTestId('capture-analyze'));
    await screen.findByTestId('capture-result', {}, { timeout: 5000 });
    expect(screen.getByText('BULUNANLAR')).toBeTruthy();
    expect(screen.getByTestId('capture-save-note')).toBeTruthy();
    fireEvent.press(screen.getByTestId('capture-save-note'));
    await waitFor(() => expect(screen.getByText('Kaydedildi')).toBeTruthy());
    expect(mockBack).toHaveBeenCalled();
  }, 15000);

  it('creates a calendar approval from a detected event', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.approvals, 'createApproval');
    const screen = renderWithProviders(<CaptureScreen />);
    fireEvent.press(screen.getByTestId('capture-source-text'));
    fireEvent.changeText(
      screen.getByTestId('capture-text-input'),
      '12 Eylül 20:00 Zorlu PSM konser buluşması',
    );
    fireEvent.press(screen.getByTestId('capture-analyze'));
    const action = await screen.findByTestId(
      'capture-action-add_to_calendar',
      {},
      { timeout: 5000 },
    );
    fireEvent.press(action);
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'calendar_create', requestedBy: 'capture' }),
      ),
    );
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/approvals/[id]' }));
  }, 15000);

  it('uploads a picked photo before creating the capture', async () => {
    const ds = getTestDataSource();
    const upload = jest.spyOn(ds.capture, 'uploadCaptureFile');
    const screen = renderWithProviders(<CaptureScreen />);
    fireEvent.press(screen.getByTestId('capture-source-photo'));
    await waitFor(() => expect(pickImage).toHaveBeenCalledWith({ camera: false }));
    await waitFor(() =>
      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: 'image/jpeg', fileName: 'photo.jpg' }),
      ),
    );
    await screen.findByTestId('capture-result', {}, { timeout: 5000 });
  }, 15000);
});
