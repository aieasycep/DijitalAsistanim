import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setI18n } from 'react-i18next';
import { createI18n } from '@da/i18n';
import { ThemeProvider, ToastProvider } from '@da/ui';

/** Binds the shared i18next instance (Turkish) to react-i18next for the test run. */
export function setupTestI18n(locale: 'tr' | 'en' = 'tr'): void {
  setI18n(createI18n(locale));
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** Gesture root → safe area → query → theme → toast, mirroring AppProviders without the session layer. */
export function renderWithProviders(
  ui: ReactElement,
  options: { queryClient?: QueryClient } & Omit<RenderOptions, 'wrapper'> = {},
) {
  const { queryClient = createTestQueryClient(), ...rest } = options;
  setupTestI18n();
  const wrapper = ({ children }: { children: ReactElement }) => (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider forceScheme="light">
            <ToastProvider>{children}</ToastProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
  return { queryClient, ...render(ui, { wrapper, ...rest }) };
}
