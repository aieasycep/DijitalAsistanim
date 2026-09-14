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
jest.mock('@/lib/openExternal', () => ({
  openExternal: jest.fn(async () => true),
  providerMailUrl: (webUrl: string | null | undefined) => webUrl ?? '',
  mapsUrl: (q: string) => `maps://?q=${encodeURIComponent(q)}`,
  telUrl: (p: string) => `tel:${p}`,
}));
jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: () => require('@/features/flow/testing/demoSource').getTestDataSource(),
}));

/** `isDemoMode` is read through a getter so a test can switch between the demo adapter and the native flows. */
const mockEnv = { demo: true };
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
  get isDemoMode() {
    return mockEnv.demo;
  },
}));

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(async () => ({
    user: 'apple-user-1',
    identityToken: 'apple-identity-token',
    email: 'yunus@privaterelay.appleid.com',
    fullName: { givenName: 'Yunus', familyName: 'Emre' },
  })),
  formatFullName: jest.fn((name: { givenName?: string | null; familyName?: string | null }) =>
    [name.givenName, name.familyName].filter(Boolean).join(' '),
  ),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => '11111111-1111-4111-8111-111111111111',
  digestStringAsync: jest.fn(async (_algorithm: string, input: string) => `sha256:${input}`),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytes: (n: number) => new Uint8Array(n),
}));
jest.mock('expo-web-browser', () => ({
  // The demo OAuth URL already *is* the redirect (`…/auth/callback?provider=…&code=…`), so echo it back.
  openAuthSessionAsync: jest.fn(async (url: string) => ({ type: 'success', url })),
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
  WebBrowserResultType: {
    CANCEL: 'cancel',
    DISMISS: 'dismiss',
    OPENED: 'opened',
    LOCKED: 'locked',
  },
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
  usePathname: () => '/sign-in',
  useFocusEffect: jest.fn(),
}));

import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { ClientApiError } from '@da/api-client';
import SignInScreen from '../(auth)/sign-in';
import EmailSignInScreen from '../(auth)/email';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';
import { captureError } from '@/lib/monitoring';
import { openExternal } from '@/lib/openExternal';

const FIND_OPTS = { timeout: 5000 };
const CALLBACK_URL = 'dijitalasistan://auth/callback';

function resetParams(next: Record<string, string>) {
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  Object.assign(mockParams, next);
}

function isDisabled(node: { props: { accessibilityState?: { disabled?: boolean } } }): boolean {
  return node.props.accessibilityState?.disabled === true;
}

beforeEach(() => {
  resetTestDataSource();
  jest.clearAllMocks();
  mockEnv.demo = true;
  resetParams({});
});

describe('Sign-in screen', () => {
  it('lists Apple first on iOS, then Google, Microsoft and e-mail, with the legal links', async () => {
    const screen = renderWithProviders(<SignInScreen />);
    expect(screen.getByTestId('auth-screen')).toBeTruthy();
    expect(screen.getByText('Hesabını oluştur')).toBeTruthy();
    expect(screen.getByText('Giriş yöntemin, bağlayacağın hesaplardan bağımsızdır.')).toBeTruthy();
    const order = screen
      .getAllByRole('button')
      .map((node) => node.props.testID as unknown)
      .filter((id): id is string => typeof id === 'string' && id.startsWith('auth-'));
    expect(order).toEqual(['auth-apple', 'auth-google', 'auth-microsoft', 'auth-email']);
    expect(screen.getByText('Deneme modu · gerçek hesap gerekmez')).toBeTruthy();
    expect(screen.getByTestId('auth-legal')).toBeTruthy();

    fireEvent.press(screen.getByText('Kullanım Şartları'));
    expect(openExternal).toHaveBeenCalledWith('https://dijitalasistan.app/terms');
    fireEvent.press(screen.getByText('Gizlilik Politikası'));
    expect(openExternal).toHaveBeenCalledWith('https://dijitalasistan.app/privacy');

    fireEvent.press(screen.getByTestId('auth-email'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/email');
    fireEvent.press(screen.getByLabelText('Geri'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('uses the sign-in title when opened with mode=signin', () => {
    resetParams({ mode: 'signin' });
    const screen = renderWithProviders(<SignInScreen />);
    expect(screen.getByText('Giriş yap')).toBeTruthy();
    expect(screen.queryByText('Hesabını oluştur')).toBeNull();
  });

  it('signs in through the demo adapter for every provider without touching native SDKs', async () => {
    const ds = getTestDataSource();
    const idToken = jest.spyOn(ds.auth, 'signInWithIdToken');
    const apple = jest.spyOn(ds.auth, 'signInWithApple');
    const screen = renderWithProviders(<SignInScreen />);

    fireEvent.press(screen.getByTestId('auth-google'));
    await waitFor(() =>
      expect(idToken).toHaveBeenCalledWith({ provider: 'google', idToken: 'demo-identity-token' }),
    );
    await waitFor(async () => expect((await ds.auth.getSession())?.user.provider).toBe('google'));
    await waitFor(() => expect(isDisabled(screen.getByTestId('auth-email'))).toBe(false));

    fireEvent.press(screen.getByTestId('auth-microsoft'));
    await waitFor(() =>
      expect(idToken).toHaveBeenCalledWith({ provider: 'azure', idToken: 'demo-identity-token' }),
    );
    await waitFor(async () =>
      expect((await ds.auth.getSession())?.user.provider).toBe('microsoft'),
    );

    fireEvent.press(screen.getByTestId('auth-apple'));
    await waitFor(() =>
      expect(apple).toHaveBeenCalledWith({ identityToken: 'demo-identity-token', nonce: 'demo' }),
    );
    await waitFor(async () => expect((await ds.auth.getSession())?.user.provider).toBe('apple'));

    expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it('runs native Sign in with Apple with a hashed nonce outside demo mode', async () => {
    mockEnv.demo = false;
    const ds = getTestDataSource();
    const apple = jest.spyOn(ds.auth, 'signInWithApple');
    const screen = renderWithProviders(<SignInScreen />);
    await waitFor(() => expect(AppleAuthentication.isAvailableAsync).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('auth-apple'));
    await waitFor(() =>
      expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          nonce: 'sha256:11111111-1111-4111-8111-111111111111',
          requestedScopes: [0, 1],
        }),
      ),
    );
    await waitFor(() =>
      expect(apple).toHaveBeenCalledWith({
        identityToken: 'apple-identity-token',
        nonce: '11111111-1111-4111-8111-111111111111',
        fullName: 'Yunus Emre',
      }),
    );
    await waitFor(async () => expect((await ds.auth.getSession())?.user.provider).toBe('apple'));
  });

  it('opens the Google auth session and exchanges the returned code; a cancelled session signs nobody in', async () => {
    mockEnv.demo = false;
    const ds = getTestDataSource();
    const getUrl = jest.spyOn(ds.auth, 'getOAuthSignInUrl');
    const exchange = jest.spyOn(ds.auth, 'exchangeCodeForSession');
    const screen = renderWithProviders(<SignInScreen />);

    fireEvent.press(screen.getByTestId('auth-google'));
    await waitFor(() =>
      expect(getUrl).toHaveBeenCalledWith({ provider: 'google', redirectTo: CALLBACK_URL }),
    );
    await waitFor(() =>
      expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
        expect.stringContaining(`${CALLBACK_URL}?provider=google&code=demo-google-`),
        CALLBACK_URL,
      ),
    );
    await waitFor(() =>
      expect(exchange).toHaveBeenCalledWith(expect.stringContaining('provider=google&code=')),
    );
    await waitFor(async () => expect((await ds.auth.getSession())?.user.provider).toBe('google'));

    await ds.auth.signOut();
    jest
      .mocked(WebBrowser.openAuthSessionAsync)
      .mockResolvedValueOnce({ type: WebBrowser.WebBrowserResultType.CANCEL });
    fireEvent.press(screen.getByTestId('auth-microsoft'));
    await waitFor(() =>
      expect(getUrl).toHaveBeenCalledWith({ provider: 'azure', redirectTo: CALLBACK_URL }),
    );
    await waitFor(() => expect(isDisabled(screen.getByTestId('auth-google'))).toBe(false));
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(await ds.auth.getSession()).toBeNull();
    expect(screen.queryByText('Bir şeyler ters gitti.')).toBeNull();
  });

  it('surfaces a provider failure as a calm toast and re-enables the buttons', async () => {
    const ds = getTestDataSource();
    jest
      .spyOn(ds.auth, 'signInWithIdToken')
      .mockRejectedValueOnce(
        new ClientApiError({ code: 'provider_unavailable', message: 'upstream down' }),
      );
    const screen = renderWithProviders(<SignInScreen />);
    fireEvent.press(screen.getByTestId('auth-google'));
    await screen.findByText('Eşitleme gecikti.', {}, FIND_OPTS);
    await waitFor(() => expect(isDisabled(screen.getByTestId('auth-apple'))).toBe(false));
    expect(captureError).toHaveBeenCalledWith(
      expect.any(ClientApiError),
      expect.objectContaining({ where: 'useNativeSignIn', provider: 'google' }),
    );
    expect(await ds.auth.getSession()).toBeNull();
  });
});

describe('E-mail OTP screen', () => {
  /** Types a valid address, requests the code and waits for the OTP step. */
  async function reachOtpStep(screen: ReturnType<typeof renderWithProviders>) {
    fireEvent.changeText(screen.getByTestId('auth-email-input'), ' Yunus@Example.com ');
    fireEvent.press(screen.getByTestId('auth-email-submit'));
    await screen.findByTestId('auth-otp-input', {}, FIND_OPTS);
  }

  it('validates the address locally, requests a code and moves to the OTP step', async () => {
    const ds = getTestDataSource();
    const send = jest.spyOn(ds.auth, 'signInWithEmailOtp');
    const screen = renderWithProviders(<EmailSignInScreen />);
    expect(screen.getByTestId('auth-email-screen')).toBeTruthy();
    expect(screen.getByText('E-posta ile devam et')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('auth-email-input'), 'yunus');
    fireEvent.press(screen.getByTestId('auth-email-submit'));
    expect(await screen.findByText('Geçerli bir e-posta adresi gir.')).toBeTruthy();
    expect(send).not.toHaveBeenCalled();

    await reachOtpStep(screen);
    expect(send).toHaveBeenCalledWith('yunus@example.com');
    expect(
      await screen.findByText('Kod gönderildi. Mailini kontrol et.', {}, FIND_OPTS),
    ).toBeTruthy();
    expect(screen.getByText('Kodu gir')).toBeTruthy();
    expect(
      screen.getByText('yunus@example.com adresine gönderdiğimiz 6 haneli kodu gir.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('auth-email-input')).toBeNull();
  });

  it('verifies a six-digit code (digits only) and signs the user in', async () => {
    const ds = getTestDataSource();
    const verify = jest.spyOn(ds.auth, 'verifyEmailOtp');
    const screen = renderWithProviders(<EmailSignInScreen />);
    await reachOtpStep(screen);

    fireEvent.changeText(screen.getByTestId('auth-otp-input'), '12');
    fireEvent.press(screen.getByTestId('auth-otp-submit'));
    expect(await screen.findByText('Kod 6 haneli olmalı.')).toBeTruthy();
    expect(verify).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('auth-otp-input'), 'ab12cd3456');
    fireEvent.press(screen.getByTestId('auth-otp-submit'));
    await waitFor(() =>
      expect(verify).toHaveBeenCalledWith({ email: 'yunus@example.com', token: '123456' }),
    );
    await waitFor(async () => expect((await ds.auth.getSession())?.user.provider).toBe('email'));
    expect(screen.queryByText('Kod 6 haneli olmalı.')).toBeNull();
  });

  it('shows server validation errors under the field and other failures as a toast', async () => {
    const ds = getTestDataSource();
    const send = jest
      .spyOn(ds.auth, 'signInWithEmailOtp')
      .mockRejectedValueOnce(new ClientApiError({ code: 'offline', message: 'no network' }));
    const verify = jest
      .spyOn(ds.auth, 'verifyEmailOtp')
      .mockRejectedValueOnce(
        new ClientApiError({ code: 'validation', message: 'Kod bu e-posta için gönderilmedi.' }),
      );
    const screen = renderWithProviders(<EmailSignInScreen />);

    fireEvent.changeText(screen.getByTestId('auth-email-input'), 'yunus@example.com');
    fireEvent.press(screen.getByTestId('auth-email-submit'));
    expect(await screen.findByText('Çevrimdışısın.', {}, FIND_OPTS)).toBeTruthy();
    expect(screen.getByTestId('auth-email-input')).toBeTruthy();
    expect(screen.queryByTestId('auth-otp-input')).toBeNull();

    fireEvent.press(screen.getByTestId('auth-email-submit'));
    await screen.findByTestId('auth-otp-input', {}, FIND_OPTS);
    expect(send).toHaveBeenCalledTimes(2);

    fireEvent.changeText(screen.getByTestId('auth-otp-input'), '000000');
    fireEvent.press(screen.getByTestId('auth-otp-submit'));
    expect(
      await screen.findByText('Kod bu e-posta için gönderilmedi.', {}, FIND_OPTS),
    ).toBeTruthy();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('auth-otp-input')).toBeTruthy();
    expect(await ds.auth.getSession()).toBeNull();
  });

  it('resends the code, lets the user change the address, and goes back from the first step', async () => {
    const ds = getTestDataSource();
    const send = jest.spyOn(ds.auth, 'signInWithEmailOtp');
    const screen = renderWithProviders(<EmailSignInScreen />);
    await reachOtpStep(screen);

    fireEvent.press(screen.getByTestId('auth-otp-resend'));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send).toHaveBeenLastCalledWith('yunus@example.com');

    fireEvent.press(screen.getByTestId('auth-otp-change'));
    expect(await screen.findByTestId('auth-email-input')).toBeTruthy();
    expect(screen.queryByTestId('auth-otp-input')).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Geri'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
