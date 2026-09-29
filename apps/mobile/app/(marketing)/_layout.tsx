import { Stack } from 'expo-router';
import { useTheme } from '@da/ui';

/** Signed-out group: the value carousel. */
export default function MarketingLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="welcome" />
    </Stack>
  );
}
