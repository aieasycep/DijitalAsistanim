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
jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
  trackScreen: jest.fn(),
  resetAnalytics: jest.fn(),
}));
jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: () => require('@/features/flow/testing/demoSource').getTestDataSource(),
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(async () => ({ type: 'cancel' })),
  openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
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
  usePathname: () => '/settings/integrations',
  useFocusEffect: jest.fn(),
}));

import { QueryClient } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';
import type { ConnectedAccount, EntitlementState } from '@da/domain';
import { FREE_QUOTAS, PRO_QUOTAS } from '@da/domain';
import IntegrationsScreen from '../../../../app/settings/integrations';
import DataSourcesScreen from '../../../../app/settings/data-sources';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';

import { useSessionStore } from '@/store/session';
import {
  grantedWriteGroups,
  hasWriteScope,
  missingWriteGroups,
  nextWriteGroup,
  statusTone,
} from '../scopes';

/** Mutations must not keep 5-minute GC timers alive after a test (would stall Jest's exit). */
function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}

/** Seed ids (mirror packages/api-client/src/demo/ids.ts). */
const ACCOUNT_GMAIL = '00000000-0000-4000-8000-0000000000c1';
const ACCOUNT_DEVICE = '00000000-0000-4000-8000-0000000000c2';

const FIND_OPTS = { timeout: 5000 };

const PRO: EntitlementState = {
  plan: 'pro',
  isPro: true,
  source: 'demo',
  isTrial: false,
  quotas: PRO_QUOTAS,
  usage: { assistantQueriesToday: 0, capturesToday: 0, emailAccounts: 1, calendarAccounts: 1 },
};
const FREE: EntitlementState = { ...PRO, plan: 'free', isPro: false, quotas: FREE_QUOTAS };

async function gmail(): Promise<ConnectedAccount> {
  const account = (await getTestDataSource().accounts.listAccounts()).find(
    (a) => a.id === ACCOUNT_GMAIL,
  );
  if (!account) throw new Error('seed account missing');
  return account;
}

describe('scope helpers', () => {
  it('detects granted write scopes for Google and Microsoft', async () => {
    resetTestDataSource();
    const account = await gmail();
    expect(hasWriteScope(account, 'mail_send')).toBe(false);
    expect(grantedWriteGroups(account)).toEqual([]);
    expect(missingWriteGroups(account)).toEqual(['mail_send', 'calendar_write', 'tasks_write']);
    const upgraded: ConnectedAccount = {
      ...account,
      grantedScopes: [
        ...account.grantedScopes,
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/calendar.events',
      ],
    };
    expect(grantedWriteGroups(upgraded)).toEqual(['mail_send', 'calendar_write']);
    expect(nextWriteGroup(upgraded)).toBe('tasks_write');
    const microsoft: ConnectedAccount = {
      ...account,
      provider: 'microsoft',
      kinds: ['email'],
      grantedScopes: ['Mail.Read', 'Mail.Send'],
    };
    expect(nextWriteGroup(microsoft)).toBeNull();
    // read-only calendar scope must not count as write access
    expect(hasWriteScope(account, 'calendar_write')).toBe(false);
    expect(statusTone('active')).toBe('approved');
    expect(statusTone('expired')).toBe('critical');
  });
});

describe('Integrations screen', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    useSessionStore.setState({ preferences: null, entitlement: PRO });
  });

  it('lists accounts with status badges and the primary marker', async () => {
    const screen = renderWithProviders(<IntegrationsScreen />, { queryClient: makeClient() });
    expect(screen.getByTestId('integrations-screen')).toBeTruthy();
    await screen.findByTestId(`integration-${ACCOUNT_GMAIL}`, {}, FIND_OPTS);
    expect(screen.getByTestId(`integration-${ACCOUNT_DEVICE}`)).toBeTruthy();
    expect(screen.getAllByText('Bağlı').length).toBe(2);
    expect(screen.getByText('Birincil')).toBeTruthy();
    expect(screen.getByText('BAĞLI HESAPLAR · 2')).toBeTruthy();
    expect(screen.getByText('Okuma')).toBeTruthy();
  });

  it('grants a write scope through progressive OAuth', async () => {
    const ds = getTestDataSource();
    const start = jest.spyOn(ds.accounts, 'startOAuth');
    const screen = renderWithProviders(<IntegrationsScreen />, { queryClient: makeClient() });
    await screen.findByTestId(`integration-${ACCOUNT_GMAIL}`, {}, FIND_OPTS);
    fireEvent.press(screen.getByTestId(`integration-grant-${ACCOUNT_GMAIL}`));
    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'google',
          scopeGroup: 'mail_send',
          accountId: ACCOUNT_GMAIL,
          redirectTo: 'dijitalasistan://oauth/google',
        }),
      ),
    );
    await waitFor(async () => expect(hasWriteScope(await gmail(), 'mail_send')).toBe(true));
    await screen.findByText('Okuma · Gönderme (onaylı)', {}, FIND_OPTS);
  });

  it('reconnects an account and syncs on demand', async () => {
    const ds = getTestDataSource();
    const reconnect = jest.spyOn(ds.accounts, 'reconnect');
    const sync = jest.spyOn(ds.accounts, 'syncNow');
    const screen = renderWithProviders(<IntegrationsScreen />, { queryClient: makeClient() });
    await screen.findByTestId(`integration-${ACCOUNT_GMAIL}`, {}, FIND_OPTS);
    fireEvent.press(screen.getByTestId(`integration-reconnect-${ACCOUNT_GMAIL}`));
    await waitFor(() =>
      expect(reconnect).toHaveBeenCalledWith(ACCOUNT_GMAIL, 'dijitalasistan://oauth/google'),
    );
    await screen.findByText('Bağlantı yenilendi', {}, FIND_OPTS);
    fireEvent.press(screen.getByTestId(`integration-sync-${ACCOUNT_GMAIL}`));
    await waitFor(() => expect(sync).toHaveBeenCalledWith({ accountId: ACCOUNT_GMAIL }));
  });

  it('removes an account only after the confirmation modal', async () => {
    const ds = getTestDataSource();
    const disconnect = jest.spyOn(ds.accounts, 'disconnect');
    const screen = renderWithProviders(<IntegrationsScreen />, { queryClient: makeClient() });
    await screen.findByTestId(`integration-${ACCOUNT_DEVICE}`, {}, FIND_OPTS);
    fireEvent.press(screen.getByTestId(`integration-remove-${ACCOUNT_DEVICE}`));
    expect(disconnect).not.toHaveBeenCalled();
    await screen.findByText('Analizler durur; geçmiş özetler 30 gün saklanır.', {}, FIND_OPTS);
    const confirmButtons = screen.getAllByText('Kaldır');
    const confirm = confirmButtons[confirmButtons.length - 1];
    if (!confirm) throw new Error('confirm button missing');
    fireEvent.press(confirm);
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith(ACCOUNT_DEVICE));
    await waitFor(() => expect(screen.queryByTestId(`integration-${ACCOUNT_DEVICE}`)).toBeNull());
    await screen.findByTestId('integrations-device-connect', {}, FIND_OPTS);
  });

  it('gates "Hesap Ekle" behind the paywall for free users with a mail account', async () => {
    useSessionStore.setState({ entitlement: FREE });
    const screen = renderWithProviders(<IntegrationsScreen />, { queryClient: makeClient() });
    await screen.findByTestId(`integration-${ACCOUNT_GMAIL}`, {}, FIND_OPTS);
    expect(screen.getByText('Birden fazla hesap Pro ile.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('integrations-add'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/paywall', params: { context: 'integrations' } }),
      ),
    );
    expect(screen.queryByTestId('integrations-add-gmail')).toBeNull();
  });

  it('lets Pro users add a second mail account from the sheet', async () => {
    const screen = renderWithProviders(<IntegrationsScreen />, { queryClient: makeClient() });
    await screen.findByTestId(`integration-${ACCOUNT_GMAIL}`, {}, FIND_OPTS);
    fireEvent.press(screen.getByTestId('integrations-add'));
    const row = await screen.findByTestId('integrations-add-outlook', {}, FIND_OPTS);
    fireEvent.press(row);
    await screen.findByText('BAĞLI HESAPLAR · 3', {}, FIND_OPTS);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('Data source control screen', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    useSessionStore.setState({ preferences: null, entitlement: PRO });
  });

  it('renders per-account toggles and persists a change', async () => {
    const screen = renderWithProviders(<DataSourcesScreen />, { queryClient: makeClient() });
    await screen.findByTestId(`dsc-${ACCOUNT_GMAIL}-readEmail`, {}, FIND_OPTS);
    for (const key of [
      'analyzeAttachments',
      'detectDeadlines',
      'prepareDrafts',
      'readEvents',
      'suggestSchedule',
      'createEventsWithApproval',
      'readTasks',
    ])
      expect(screen.getByTestId(`dsc-${ACCOUNT_GMAIL}-${key}`)).toBeTruthy();
    expect(screen.getByTestId(`dsc-${ACCOUNT_DEVICE}-readEvents`)).toBeTruthy();
    expect(screen.queryByTestId(`dsc-${ACCOUNT_DEVICE}-readEmail`)).toBeNull();
    fireEvent.press(screen.getByTestId(`dsc-${ACCOUNT_GMAIL}-analyzeAttachments`));
    await waitFor(async () => expect((await gmail()).controls.analyzeAttachments).toBe(false));
    expect(
      screen.getByTestId(`dsc-${ACCOUNT_GMAIL}-analyzeAttachments`).props.accessibilityState
        ?.checked,
    ).toBe(false);
  });

  it('rolls the toggle back when the server rejects the change', async () => {
    const ds = getTestDataSource();
    jest.spyOn(ds.accounts, 'updateControls').mockRejectedValueOnce(new Error('boom'));
    const screen = renderWithProviders(<DataSourcesScreen />, { queryClient: makeClient() });
    const toggle = await screen.findByTestId(`dsc-${ACCOUNT_GMAIL}-detectDeadlines`, {}, FIND_OPTS);
    expect(toggle.props.accessibilityState?.checked).toBe(true);
    fireEvent.press(toggle);
    await screen.findByText('Kaydedilemedi; ayar geri alındı.', {}, FIND_OPTS);
    await waitFor(() =>
      expect(
        screen.getByTestId(`dsc-${ACCOUNT_GMAIL}-detectDeadlines`).props.accessibilityState
          ?.checked,
      ).toBe(true),
    );
    expect((await gmail()).controls.detectDeadlines).toBe(true);
  });
});
