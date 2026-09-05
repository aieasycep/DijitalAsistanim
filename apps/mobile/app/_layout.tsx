import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { Lora_400Regular, Lora_400Regular_Italic, Lora_500Medium, Lora_600SemiBold } from '@expo-google-fonts/lora';
import { useIsDark, useTheme } from '@da/ui';
import { AppProviders } from '@/providers/AppProviders';
import { setupI18n } from '@/lib/i18n';
import { setupMonitoring, wrapWithMonitoring } from '@/lib/monitoring';
import { setupAnalytics } from '@/lib/analytics';
import { useSessionStore } from '@/store/session';
import { useDeepLinks } from '@/hooks/useDeepLinks';
import { useShareIntentCapture } from '@/hooks/useShareIntentCapture';
import { useNotificationRouting } from '@/hooks/useNotificationRouting';
import { useWidgetSync } from '@/hooks/useWidgetSync';
import { AudioMiniPlayer } from '@/features/briefing/AudioMiniPlayer';

setupMonitoring();
setupI18n();
void SplashScreen.preventAutoHideAsync();

export { ErrorBoundary } from '@/components/ErrorBoundary';

function RootNavigator() {
  const theme = useTheme();
  const isDark = useIsDark();
  const status = useSessionStore((s) => s.status);
  const onboardingCompleted = useSessionStore((s) => s.onboardingCompleted);
  const profile = useSessionStore((s) => s.profile);
  const segments = useSegments();
  const router = useRouter();

  useDeepLinks();
  useShareIntentCapture();
  useNotificationRouting();
  useWidgetSync();

  useEffect(() => {
    if (status === 'loading') return;
    const group = segments[0] as string | undefined;
    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';
    if (status === 'signedOut' && !inAuth && group !== '(marketing)') {
      router.replace('/(marketing)/welcome');
      return;
    }
    if (status === 'signedIn') {
      const needsOnboarding = profile !== null && !onboardingCompleted;
      if (needsOnboarding && !inOnboarding) router.replace('/(onboarding)/connect');
      else if (!needsOnboarding && (inAuth || group === '(marketing)')) router.replace('/(tabs)/today');
    }
  }, [status, onboardingCompleted, profile, segments, router]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'default',
        }}
      >
        <Stack.Screen name="(marketing)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="briefing/[kind]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="briefing/audio" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="capture/index" options={{ presentation: 'modal' }} />
        <Stack.Screen name="voice" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reminder" options={{ presentation: 'transparentModal', animation: 'fade' }} />
        <Stack.Screen name="search" options={{ animation: 'fade' }} />
      </Stack>
      <AudioMiniPlayer />
    </>
  );
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Lora_400Regular,
    Lora_400Regular_Italic,
    Lora_500Medium,
    Lora_600SemiBold,
  });
  const status = useSessionStore((s) => s.status);

  useEffect(() => {
    void setupAnalytics();
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && status !== 'loading') void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError, status]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

export default wrapWithMonitoring(RootLayout);
