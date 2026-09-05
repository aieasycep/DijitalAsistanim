import { Stack } from 'expo-router';
import { useTheme } from '@da/ui';

/** Account creation / sign-in stack (provider buttons → e-mail OTP). */
export default function AuthLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="email" />
    </Stack>
  );
}
