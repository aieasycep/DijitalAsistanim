import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type ColorScheme, type Theme } from '@da/design-tokens';
import type { Locale, ThemePreference } from '@da/domain';
import { DEFAULT_UI_LABELS, resolveUiLabels, type UiLabels } from './labels';

export interface ThemeContextValue {
  theme: Theme;
  scheme: ColorScheme;
  preference: ThemePreference;
  reducedMotion: boolean;
  hapticsEnabled: boolean;
  /** UI language — drives locale-aware casing of upper-cased type tokens (Turkish İ / ı). */
  locale: Locale;
  /** Generic chrome / accessibility copy supplied by the app (see `UiLabels`). */
  labels: UiLabels;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  scheme: 'light',
  preference: 'system',
  reducedMotion: false,
  hapticsEnabled: true,
  locale: 'tr',
  labels: DEFAULT_UI_LABELS,
});

export interface ThemeProviderProps {
  /** system | light | dark — from user preferences */
  preference?: ThemePreference;
  reducedMotion?: boolean;
  hapticsEnabled?: boolean;
  /** Force a scheme (tests / previews) */
  forceScheme?: ColorScheme;
  /**
   * UI language (default `'tr'`). `Text` upper-cases the `kicker` / `aiLabel` tokens in JS with
   * `toLocaleUpperCase` for this locale instead of the device locale, so Turkish keeps its dotted İ.
   * Pass the user's preference locale — English copy rendered as `'tr'` would dot its capital I's.
   */
  locale?: Locale;
  /**
   * Chrome / accessibility copy the components need (back, close, loading…), wired from i18n.
   * Keys left out render no label. Memoize the object in the app so consumers don't re-render each frame.
   */
  labels?: Partial<UiLabels>;
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
  locale = 'tr',
  labels,
  children,
}: PropsWithChildren<ThemeProviderProps>) {
  const system = useColorScheme();
  const scheme = forceScheme ?? resolveScheme(preference, system);
  const resolvedLabels = useMemo(() => resolveUiLabels(labels), [labels]);
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: scheme === 'dark' ? darkTheme : lightTheme,
      scheme,
      preference,
      reducedMotion,
      hapticsEnabled,
      locale,
      labels: resolvedLabels,
    }),
    [scheme, preference, reducedMotion, hapticsEnabled, locale, resolvedLabels],
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

/** UI language from the nearest ThemeProvider (default `'tr'`). */
export function useLocale(): Locale {
  return useContext(ThemeContext).locale;
}

/** Chrome / accessibility copy from the nearest ThemeProvider (empty strings until the app wires them). */
export function useUiLabels(): UiLabels {
  return useContext(ThemeContext).labels;
}
