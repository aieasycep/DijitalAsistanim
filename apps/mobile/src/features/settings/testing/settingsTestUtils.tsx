/**
 * Test helpers for the settings screens: a deterministic demo DataSource (instant latency), a session
 * seeder that mirrors what SessionProvider does at runtime, and a provider stack whose ThemeProvider
 * reads the session store — so appearance changes apply in tests exactly like in AppProviders.
 */
import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setI18n } from 'react-i18next';
import { createDemoDataSource, type DataSource } from '@da/api-client';
import { FREE_QUOTAS, PRO_QUOTAS, type EntitlementState } from '@da/domain';
import { createI18n } from '@da/i18n';
import { ThemeProvider, ToastProvider } from '@da/ui';
import { useSessionStore } from '@/store/session';

export const SETTINGS_TEST_NOW = '2026-09-05T06:41:00Z';

export function makeSettingsDataSource(now: string = SETTINGS_TEST_NOW): DataSource {
  return createDemoDataSource(
    {
      mode: 'demo',
      appScheme: 'dijitalasistan',
      webUrl: 'https://dijitalasistan.app',
      now: () => new Date(now),
      timezone: 'Europe/Istanbul',
      locale: 'tr',
      isProduction: false,
    },
    { timeScale: 0 },
  );
}

/** Signs the demo user in and mirrors profile / preferences into the session store. */
export async function seedSession(ds: DataSource): Promise<void> {
  const session = await ds.auth.signInWithIdToken({ provider: 'google', idToken: 'demo-token' });
  const [profile, preferences] = await Promise.all([
    ds.profile.getProfile(),
    ds.profile.getPreferences(),
  ]);
  const store = useSessionStore.getState();
  store.setSession(session);
  store.setProfile(profile);
  store.setPreferences(preferences);
  store.setEntitlement(null);
}

export const FREE_ENTITLEMENT: EntitlementState = {
  plan: 'free',
  isPro: false,
  source: 'none',
  expiresAt: null,
  isTrial: false,
  quotas: { ...FREE_QUOTAS },
  usage: { assistantQueriesToday: 3, capturesToday: 1, emailAccounts: 1, calendarAccounts: 1 },
};

export const PRO_ENTITLEMENT: EntitlementState = {
  plan: 'pro',
  isPro: true,
  source: 'demo',
  expiresAt: '2027-09-05T00:00:00.000Z',
  isTrial: false,
  quotas: { ...PRO_QUOTAS },
  usage: { assistantQueriesToday: 3, capturesToday: 1, emailAccounts: 1, calendarAccounts: 1 },
};

/** Returns a copy of `ds` whose billing.getEntitlement resolves the given state. */
export function withEntitlement(ds: DataSource, entitlement: EntitlementState): DataSource {
  return { ...ds, billing: { ...ds.billing, getEntitlement: async () => entitlement } };
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function ThemedProviders({ children, client }: { children: ReactNode; client: QueryClient }) {
  const preferences = useSessionStore((s) => s.preferences);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <ThemeProvider
            preference={preferences?.theme ?? 'system'}
            reducedMotion={preferences?.reducedMotion ?? false}
            hapticsEnabled={preferences?.hapticsEnabled ?? true}
          >
            <ToastProvider>{children}</ToastProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export function renderSettings(
  ui: ReactElement,
  options: { client?: QueryClient } & Omit<RenderOptions, 'wrapper'> = {},
) {
  const { client = createTestQueryClient(), ...rest } = options;
  setI18n(createI18n('tr'));
  const wrapper = ({ children }: { children: ReactElement }) => (
    <ThemedProviders client={client}>{children}</ThemedProviders>
  );
  return { client, ...render(ui, { wrapper, ...rest }) };
}
