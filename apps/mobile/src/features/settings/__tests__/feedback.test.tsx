import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { DataSource } from '@da/api-client';
import {
  makeSettingsDataSource,
  renderSettings,
  seedSession,
} from '@/features/settings/testing/settingsTestUtils';
import { useUiStore } from '@/store/ui';
import FeedbackScreen from '../../../../app/settings/feedback';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});
jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View, Svg: View, Path: View };
});
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'tr-TR' }],
  getCalendars: () => [{ timeZone: 'Europe/Istanbul' }],
}));
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(n),
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.2.3',
  nativeBuildVersion: '45',
  applicationId: 'com.dijitalasistan.app',
}));
jest.mock('expo-device', () => ({ osVersion: '18.0', modelName: 'iPhone 16', isDevice: true }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), resetAnalytics: jest.fn() }));
jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));
jest.mock('@/lib/i18n', () => ({
  formatCtx: (overrides: Record<string, unknown> = {}) => ({
    locale: 'tr',
    timezone: 'Europe/Istanbul',
    ...overrides,
  }),
  setupI18n: jest.fn(),
  changeLocale: jest.fn(),
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: mockBack,
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  usePathname: () => '/settings/feedback',
}));

let mockDs: DataSource;
jest.mock('@/hooks/useDataSource', () => ({ useDataSource: () => mockDs }));

beforeEach(async () => {
  jest.clearAllMocks();
  useUiStore.setState({ offline: false });
  mockDs = makeSettingsDataSource();
  await seedSession(mockDs);
});

describe('Feedback screen', () => {
  it('validates the message before sending', async () => {
    const spy = jest.spyOn(mockDs.profile, 'submitFeedback');
    renderSettings(<FeedbackScreen />);

    fireEvent.press(await screen.findByTestId('feedback-send'));
    expect(await screen.findByText('Biraz daha detay verir misin? En az 5 karakter.')).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/iPhone 16/)).toBeTruthy();
  });

  it('sends the feedback with topic, diagnostics consent, version and platform', async () => {
    const spy = jest.spyOn(mockDs.profile, 'submitFeedback');
    renderSettings(<FeedbackScreen />);

    fireEvent.press(await screen.findByTestId('feedback-category-bug'));
    fireEvent.changeText(screen.getByLabelText('Mesajın'), '  Brifing saati yanlış görünüyor  ');
    fireEvent.press(screen.getByTestId('feedback-diagnostics'));
    await waitFor(() => expect(screen.queryByText(/iPhone 16/)).toBeNull());
    fireEvent.press(screen.getByTestId('feedback-send'));

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        category: 'bug',
        message: 'Brifing saati yanlış görünüyor',
        includeDiagnostics: false,
        appVersion: '1.2.3 (45)',
        platform: 'ios',
      }),
    );
    expect(await screen.findByText('Teşekkürler, aldık.')).toBeTruthy();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('keeps the draft and shows an error when sending fails', async () => {
    mockDs.profile.submitFeedback = async () => {
      throw { code: 'rate_limited', message: 'slow down' };
    };
    renderSettings(<FeedbackScreen />);
    fireEvent.changeText(await screen.findByLabelText('Mesajın'), 'Harika bir uygulama');
    fireEvent.press(screen.getByTestId('feedback-send'));
    expect(await screen.findByText('Biraz yavaşlayalım.')).toBeTruthy();
    expect(screen.getByDisplayValue('Harika bir uygulama')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
