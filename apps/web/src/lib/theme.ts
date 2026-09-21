import {
  darkColors,
  darkTheme,
  gradientCss,
  lightColors,
  radius,
  shadowCss,
  spacing,
  toCssVariables,
} from '@da/design-tokens';

function block(selector: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  return `${selector}{${body}}`;
}

const staticVars: Record<string, string> = {
  '--da-radius-xs': `${radius.xs}px`,
  '--da-radius-sm': `${radius.sm}px`,
  '--da-radius-md': `${radius.md}px`,
  '--da-radius-lg': `${radius.lg}px`,
  '--da-radius-xl': `${radius.xl}px`,
  '--da-radius-xxl': `${radius.xxl}px`,
  '--da-radius-modal': `${radius.modal}px`,
  '--da-radius-hero': `${radius.hero}px`,
  '--da-radius-pill': `${radius.pill}px`,
  '--da-space-xs': `${spacing.xs}px`,
  '--da-space-sm': `${spacing.sm}px`,
  '--da-space-md': `${spacing.md}px`,
  '--da-space-lg': `${spacing.lg}px`,
  '--da-space-xl': `${spacing.xl}px`,
  '--da-space-xxl': `${spacing.xxl}px`,
  '--da-space-xxxl': `${spacing.xxxl}px`,
  '--da-space-huge': `${spacing.huge}px`,
  '--da-gradient-dawn': gradientCss.dawn,
  '--da-gradient-night': gradientCss.night,
  '--da-gradient-dusk': gradientCss.dusk,
};

const lightExtras: Record<string, string> = {
  '--da-shadow-s1': shadowCss.s1,
  '--da-shadow-s2': shadowCss.s2,
  '--da-shadow-s3': shadowCss.s3,
  '--da-shadow-brand': shadowCss.brand,
  '--da-card-ring': 'transparent',
  '--da-glow-radial': 'radial-gradient(140% 100% at 100% 0%, #E4E4FA 0%, #FFFFFF 58%)',
  '--da-glow-radial-left': 'radial-gradient(140% 100% at 0% 0%, #E4E4FA 0%, #FFFFFF 60%)',
  '--da-avatar-warm-bg': '#F5E1D6',
  '--da-avatar-warm-fg': '#7A3E1F',
  '--da-tint-mid': '#C9C7F3',
  '--da-bezel': '#1A1917',
  '--da-header-bg': 'rgba(245,244,240,0.86)',
  '--da-color-scheme': 'light',
};

const darkExtras: Record<string, string> = {
  '--da-shadow-s1': 'none',
  '--da-shadow-s2': 'none',
  '--da-shadow-s3': '0 12px 32px rgba(0,0,0,.5)',
  '--da-shadow-brand': 'none',
  '--da-card-ring': darkTheme.cardRing,
  '--da-glow-radial':
    'radial-gradient(140% 100% at 100% 0%, rgba(133,134,242,0.22) 0%, #1F1E1B 58%)',
  '--da-glow-radial-left':
    'radial-gradient(140% 100% at 0% 0%, rgba(133,134,242,0.22) 0%, #1F1E1B 60%)',
  '--da-avatar-warm-bg': 'rgba(240,139,120,0.22)',
  '--da-avatar-warm-fg': '#F5C2B3',
  '--da-tint-mid': 'rgba(133,134,242,0.45)',
  '--da-bezel': '#3A3936',
  '--da-header-bg': 'rgba(20,19,17,0.86)',
  '--da-color-scheme': 'dark',
};

/**
 * CSS custom properties for both color schemes, generated from @da/design-tokens.
 * Injected once in the root layout so globals.css can use var(--da-*).
 */
export function themeCss(): string {
  const light = { ...toCssVariables(lightColors), ...staticVars, ...lightExtras };
  const dark = { ...toCssVariables(darkColors), ...darkExtras };
  return [
    block(':root', light),
    `@media (prefers-color-scheme: dark){${block(':root', dark)}}`,
  ].join('');
}
