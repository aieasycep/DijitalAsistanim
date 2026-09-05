import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { DataSource } from '@da/api-client';
import {
  FREE_ENTITLEMENT,
  makeSettingsDataSource,
  PRO_ENTITLEMENT,
  renderSettings,
  seedSession,
  withEntitlement,
} from '@/features/settings/testing/settingsTestUtils';
import { useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';
import BriefingSettingsScreen from '../../../../app/settings/briefing';

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
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  const Picker = ({
    onChange,
    testID,
  }: {
    onChange: (event: { type: string }, date?: Date) => void;
    testID?: string;
  }) =>
    React.createElement(
      Pressable,
      { testID, onPress: () => onChange({ type: 'set' }, new Date(2026, 0, 1, 7, 30)) },
      React.createElement(Text, null, 'picker'),
    );
  return {
    __esModule: true,
    default: Picker,
    DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
  };
});

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
  usePathname: () => '/settings/briefing',
}));

let mockDs: DataSource;
jest.mock('@/hooks/useDataSource', () => ({ useDataSource: () => mockDs }));

beforeEach(async () => {
  jest.clearAllMocks();
  useUiStore.setState({ offline: false });
  mockDs = makeSettingsDataSource();
  await seedSession(mockDs);
});

async function waitForEntitlement(isPro: boolean): Promise<void> {
  await waitFor(() => expect(useSessionStore.getState().entitlement?.isPro).toBe(isPro));
}

describe('Briefing settings screen', () => {
  it('renders the schedule and turns the midday pulse off', async () => {
    mockDs = withEntitlement(mockDs, PRO_ENTITLEMENT);
    const spy = jest.spyOn(mockDs.profile, 'updatePreferences');
    renderSettings(<BriefingSettingsScreen />);

    expect(await screen.findByTestId('bset-morning')).toBeTruthy();
    expect(screen.getByText('08:00')).toBeTruthy();
    expect(screen.getByTestId('bset-midday-time')).toBeTruthy();
    expect(screen.getByTestId('bset-weekly-day')).toBeTruthy();
    expect(screen.getByTestId('bset-timezone')).toBeTruthy();
    await waitForEntitlement(true);

    fireEvent.press(screen.getByTestId('bset-midday'));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        briefing: expect.objectContaining({ middayEnabled: false, morningTime: '08:00' }),
      }),
    );
    await waitFor(() => expect(screen.queryByTestId('bset-midday-time')).toBeNull());
    expect(useSessionStore.getState().preferences?.briefing.middayEnabled).toBe(false);
  });

  it('gates Pro briefings for Free users through the paywall', async () => {
    mockDs = withEntitlement(mockDs, FREE_ENTITLEMENT);
    const spy = jest.spyOn(mockDs.profile, 'updatePreferences');
    const prefs = useSessionStore.getState().preferences;
    if (!prefs) throw new Error('preferences not seeded');
    useSessionStore
      .getState()
      .setPreferences({ ...prefs, briefing: { ...prefs.briefing, eveningEnabled: false } });
    renderSettings(<BriefingSettingsScreen />);

    expect(await screen.findByTestId('bset-evening')).toBeTruthy();
    await waitForEntitlement(false);
    expect(screen.getAllByText('PRO').length).toBeGreaterThan(0);

    fireEvent.press(screen.getByTestId('bset-evening'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/paywall',
          params: expect.objectContaining({ context: 'settings_briefing' }),
        }),
      ),
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('picks a new morning time through the iOS sheet', async () => {
    const spy = jest.spyOn(mockDs.profile, 'updatePreferences');
    renderSettings(<BriefingSettingsScreen />);

    fireEvent.press(await screen.findByTestId('bset-morning'));
    fireEvent.press(await screen.findByTestId('bset-morning-picker'));
    fireEvent.press(screen.getByTestId('bset-morning-done'));

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        briefing: expect.objectContaining({ morningTime: '07:30' }),
      }),
    );
    expect(await screen.findByText('07:30')).toBeTruthy();
  });

  it('toggles quiet days, weekends and the weekly day', async () => {
    mockDs = withEntitlement(mockDs, PRO_ENTITLEMENT);
    const spy = jest.spyOn(mockDs.profile, 'updatePreferences');
    renderSettings(<BriefingSettingsScreen />);

    fireEvent.press(await screen.findByTestId('bset-quiet-1'));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ briefing: expect.objectContaining({ quietDays: [1] }) }),
    );

    fireEvent.press(screen.getByTestId('bset-weekend'));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        briefing: expect.objectContaining({ weekendEnabled: false }),
      }),
    );

    fireEvent.press(screen.getByTestId('bset-weekly-day'));
    fireEvent.press(await screen.findByTestId('bset-weekly-day-5'));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ briefing: expect.objectContaining({ weeklyDay: 5 }) }),
    );
    expect(await screen.findByText('Cuma')).toBeTruthy();
  });

  it('changes the time zone from the sheet', async () => {
    const spy = jest.spyOn(mockDs.profile, 'updatePreferences');
    renderSettings(<BriefingSettingsScreen />);

    fireEvent.press(await screen.findByTestId('bset-timezone'));
    fireEvent.changeText(await screen.findByLabelText('Şehir veya bölge ara'), 'London');
    fireEvent.press(await screen.findByTestId('bset-tz-option-Europe/London'));

    await waitFor(() => expect(spy).toHaveBeenCalledWith({ timezone: 'Europe/London' }));
    expect(await screen.findByText(/London · GMT/)).toBeTruthy();
  });
});
