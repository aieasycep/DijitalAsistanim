import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type ColorScheme, type Theme } from '@da/design-tokens';
import type { ThemePreference } from '@da/domain';

export interface ThemeContextValue {
  theme: Theme;
  scheme: ColorScheme;
  preference: ThemePreference;
  reducedMotion: boolean;
  hapticsEnabled: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  scheme: 'light',
  preference: 'system',
  reducedMotion: false,
  hapticsEnabled: true,
});

export interface ThemeProviderProps {
  /** system | light | dark — from user preferences */
  preference?: ThemePreference;
  reducedMotion?: boolean;
  hapticsEnabled?: boolean;
  /** Force a scheme (tests / previews) */
  forceScheme?: ColorScheme;
}

export function resolveScheme(
  preference: ThemePreference,
  system: string | null | undefined,
): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({
  preference = 'system',
  reducedMotion = false,
  hapticsEnabled = true,
  forceScheme,
  children,
}: PropsWithChildren<ThemeProviderProps>) {
  const system = useColorScheme();
  const scheme = forceScheme ?? resolveScheme(preference, system);
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: scheme === 'dark' ? darkTheme : lightTheme,
      scheme,
      preference,
      reducedMotion,
      hapticsEnabled,
    }),
    [scheme, preference, reducedMotion, hapticsEnabled],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

export function useThemeContext(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function useIsDark(): boolean {
  return useContext(ThemeContext).scheme === 'dark';
}
