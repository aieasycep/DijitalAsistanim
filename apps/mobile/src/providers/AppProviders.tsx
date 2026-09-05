import { useEffect, useMemo, type PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { ThemeProvider, ToastProvider } from '@da/ui';
import { queryClient, setupQueryClientListeners } from '@/lib/queryClient';
import { useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';
import { SessionProvider } from './SessionProvider';

/** Composition root: gestures → safe area → query → theme → toast → session. */
export function AppProviders({ children }: PropsWithChildren) {
  const preferences = useSessionStore((s) => s.preferences);
  const setOffline = useUiStore((s) => s.setOffline);

  useEffect(() => setupQueryClientListeners(), []);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) =>
      setOffline(!(state.isConnected && state.isInternetReachable !== false)),
    );
    return unsub;
  }, [setOffline]);

  const themeProps = useMemo(
    () => ({
      preference: preferences?.theme ?? 'system',
      reducedMotion: preferences?.reducedMotion ?? false,
      hapticsEnabled: preferences?.hapticsEnabled ?? true,
    }),
    [preferences?.theme, preferences?.reducedMotion, preferences?.hapticsEnabled],
  );

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider {...themeProps}>
            <ToastProvider>
              <SessionProvider>{children}</SessionProvider>
            </ToastProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
