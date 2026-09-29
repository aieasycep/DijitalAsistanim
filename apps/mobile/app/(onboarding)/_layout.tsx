import { Stack } from 'expo-router';
import { useTheme } from '@da/ui';

/**
 * Signed-in, onboarding not completed: connect → calendar permission → briefing prefs → personalization →
 * VIP → first analysis → aha → notifications. The analysis / aha screens cannot be swiped back.
 */
export default function OnboardingLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="connect" options={{ gestureEnabled: false }} />
      <Stack.Screen
        name="explainer/[provider]"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="calendar-permission" />
      <Stack.Screen name="briefing-prefs" />
      <Stack.Screen name="personalization" />
      <Stack.Screen name="vip" />
      <Stack.Screen name="analysis" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="aha" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="notifications" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
