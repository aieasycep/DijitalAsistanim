import { darkColors, gradients, lightColors, type SemanticColors } from './colors';
import { layout, radius, shadows, sizes, spacing, type ShadowToken } from './layout';
import { motion } from './motion';
import { fontFamilies, typeScale } from './typography';

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  scheme: ColorScheme;
  isDark: boolean;
  colors: SemanticColors;
  spacing: typeof spacing;
  layout: typeof layout;
  radius: typeof radius;
  sizes: typeof sizes;
  /** In dark mode shadows collapse to none; surfaces use a hairline ring instead. */
  shadows: Record<keyof typeof shadows, ShadowToken>;
  /** 1px ring color used on cards in dark mode (rgba white 6%). Empty in light. */
  cardRing: string;
  typography: typeof typeScale;
  fonts: typeof fontFamilies;
  gradients: typeof gradients;
  motion: typeof motion;
}

const darkShadows: Record<keyof typeof shadows, ShadowToken> = {
  none: shadows.none,
  s1: shadows.none,
  s2: shadows.none,
  s3: { ...shadows.s3, shadowColor: '#000', shadowOpacity: 0.5 },
  brand: shadows.none,
};

export const lightTheme: Theme = {
  scheme: 'light',
  isDark: false,
  colors: lightColors,
  spacing,
  layout,
  radius,
  sizes,
  shadows,
  cardRing: 'transparent',
  typography: typeScale,
  fonts: fontFamilies,
  gradients,
  motion,
};

export const darkTheme: Theme = {
  scheme: 'dark',
  isDark: true,
  colors: darkColors,
  spacing,
  layout,
  radius,
  sizes,
  shadows: darkShadows,
  cardRing: 'rgba(255,255,255,0.06)',
  typography: typeScale,
  fonts: fontFamilies,
  gradients,
  motion,
};

export function themeFor(scheme: ColorScheme): Theme {
  return scheme === 'dark' ? darkTheme : lightTheme;
}

/** CSS custom-property map for the web app (both schemes). */
export function toCssVariables(colors: SemanticColors, prefix = '--da'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) {
    const kebab = key.replace(/[A-Z0-9]/g, (m) => `-${m.toLowerCase()}`);
    out[`${prefix}-${kebab}`] = value;
  }
  return out;
}
