import { Stack } from 'expo-router';
import { useTheme } from '@da/ui';

/** Every section screen under /settings (see ROUTES.md). Headers are drawn by the screens themselves. */
const SECTION_SCREENS = [
  'profile',
  'subscription',
  'briefing',
  'notifications',
  'priority-rules',
  'vip',
  'integrations',
  'data-sources',
  'ai-personalization',
  'privacy',
  'appearance',
  'language',
  'help',
  'feedback',
  'android-notifications',
] as const;

export default function SettingsLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'default',
      }}
    >
      <Stack.Screen name="index" />
      {SECTION_SCREENS.map((name) => (
        <Stack.Screen key={name} name={name} />
      ))}
    </Stack>
  );
}
