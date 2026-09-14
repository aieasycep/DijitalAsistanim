import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useTranslation } from 'react-i18next';
import { ThemeProvider, ToastProvider } from '@da/ui';
import { deviceLocale } from '@/lib/datasource';
import { queryClient, setupQueryClientListeners } from '@/lib/queryClient';
import { uiLabelsFor } from '@/lib/uiLabels';
import { useSessionStore } from '@/store/session';
import { useUiStore } from '@/store/ui';
import { SessionProvider } from './SessionProvider';

/** OS-level "Reduce Motion": read once, then followed live. Never overrides the in-app toggle — it only adds. */
function useSystemReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setEnabled(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setEnabled);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}

/** Composition root: gestures → safe area → query → theme → toast → session. */
export function AppProviders({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const preferences = useSessionStore((s) => s.preferences);
  const setOffline = useUiStore((s) => s.setOffline);
  const systemReduceMotion = useSystemReduceMotion();

  useEffect(() => setupQueryClientListeners(), []);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) =>
      setOffline(!(state.isConnected && state.isInternetReachable !== false)),
    );
    return unsub;
  }, [setOffline]);

  // `t` changes identity with the language, so the chrome labels follow a locale switch.
  const labels = useMemo(() => uiLabelsFor(t), [t]);
  const locale = preferences?.locale ?? deviceLocale();

  const themeProps = useMemo(
    () => ({
      preference: preferences?.theme ?? 'system',
      reducedMotion: systemReduceMotion || (preferences?.reducedMotion ?? false),
      hapticsEnabled: preferences?.hapticsEnabled ?? true,
      locale,
      labels,
    }),
    [
      preferences?.theme,
      preferences?.reducedMotion,
      preferences?.hapticsEnabled,
      systemReduceMotion,
      locale,
      labels,
    ],
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
