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
jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: () => require('@/features/flow/testing/demoSource').getTestDataSource(),
}));
jest.mock('@/lib/env', () => ({
  IS_PRODUCTION: false,
  hasSupabase: false,
  env: {
    dataMode: 'demo',
    webUrl: 'https://dijitalasistan.app',
    appScheme: 'dijitalasistan',
    demoUserName: 'Yunus',
    appVersion: '1.0.0',
    isProduction: false,
  },
  isDemoMode: true,
}));

const mockReplace = jest.fn();
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
  useSegments: () => ['auth', 'callback'],
  usePathname: () => '/auth/callback',
  useFocusEffect: jest.fn(),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';
import { ClientApiError } from '@da/api-client';
import AuthCallbackScreen, { callbackUrlFromParams } from '../auth/callback';
import { completeAuthCallback } from '@/features/auth/authCallback';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';
import { captureError } from '@/lib/monitoring';

const FIND_OPTS = { timeout: 5000 };
const CODE = 'demo-google-abc123';

function resetParams(next: Record<string, string>) {
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  Object.assign(mockParams, next);
}

beforeEach(() => {
  resetTestDataSource();
  jest.clearAllMocks();
  resetParams({});
});

describe('callbackUrlFromParams', () => {
  it('rebuilds the return URL with the params expo-router parsed, encoded', () => {
    expect(callbackUrlFromParams({ code: CODE })).toBe(
      `dijitalasistan://auth/callback?code=${CODE}`,
    );
    expect(callbackUrlFromParams({ code: CODE, provider: 'azure' })).toBe(
      `dijitalasistan://auth/callback?code=${CODE}&provider=azure`,
    );
    expect(
      callbackUrlFromParams({ error: 'access_denied', error_description: 'User denied access' }),
    ).toBe(
      'dijitalasistan://auth/callback?error=access_denied&error_description=User%20denied%20access',
    );
    expect(callbackUrlFromParams({})).toBe('dijitalasistan://auth/callback');
  });
});

describe('Auth callback screen', () => {
  it('shows progress while the code is exchanged and signs the user in', async () => {
    resetParams({ code: CODE, provider: 'google' });
    const ds = getTestDataSource();
    const exchange = jest.spyOn(ds.auth, 'exchangeCodeForSession');
    const screen = renderWithProviders(<AuthCallbackScreen />);

    expect(screen.getByTestId('auth-callback-working')).toBeTruthy();
    expect(screen.getByText('Hesabın doğrulanıyor…')).toBeTruthy();
    await waitFor(() =>
      expect(exchange).toHaveBeenCalledWith(
        `dijitalasistan://auth/callback?code=${CODE}&provider=google`,
      ),
    );
    await waitFor(async () => expect((await ds.auth.getSession())?.user.provider).toBe('google'));
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('auth-callback-error')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shares the exchange with the deep-link handler that already received the same URL', async () => {
    resetParams({ code: CODE });
    const ds = getTestDataSource();
    const exchange = jest.spyOn(ds.auth, 'exchangeCodeForSession');
    const fromLink = completeAuthCallback(ds, `dijitalasistan://auth/callback?code=${CODE}`);
    renderWithProviders(<AuthCallbackScreen />);

    await expect(fromLink).resolves.toMatchObject({ user: { provider: 'google' } });
    await waitFor(async () => expect((await ds.auth.getSession())?.user.provider).toBe('google'));
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('shows the failure and leads back to sign-in when the exchange fails', async () => {
    resetParams({ code: CODE });
    const ds = getTestDataSource();
    jest
      .spyOn(ds.auth, 'exchangeCodeForSession')
      .mockRejectedValueOnce(new ClientApiError({ code: 'unauthorized', message: 'flow expired' }));
    const screen = renderWithProviders(<AuthCallbackScreen />);

    await screen.findByTestId('auth-callback-error', {}, FIND_OPTS);
    expect(screen.getByText('Giriş tamamlanamadı.')).toBeTruthy();
    expect(captureError).toHaveBeenCalledWith(
      expect.any(ClientApiError),
      expect.objectContaining({ where: 'AuthCallbackScreen' }),
    );
    expect(await ds.auth.getSession()).toBeNull();

    fireEvent.press(screen.getByText('Girişe dön'));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('treats a provider error in the return URL as a failed sign-in', async () => {
    resetParams({ error: 'access_denied', error_description: 'User denied access' });
    const ds = getTestDataSource();
    const screen = renderWithProviders(<AuthCallbackScreen />);

    await screen.findByTestId('auth-callback-error', {}, FIND_OPTS);
    expect(await ds.auth.getSession()).toBeNull();
  });
});
