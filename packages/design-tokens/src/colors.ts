/**
 * Color tokens — transcribed from "01 · Tasarım Sistemi" (Claude Design, primary visual source).
 *
 * Rules from the design system:
 *  1. Colored badges on cards only for ACİL (coral), SON TARİH (amber), GÜVENLİK (coral), ONAYLANDI (green).
 *  2. Indigo is reserved for AI marks (auto_awesome), primary buttons, selected tab, links. Never decoration.
 *  3. Text/background contrast ≥ 4.5:1; text on soft backgrounds uses the dark "text" variant.
 */

export const palette = {
  // brand
  indigo500: '#5B5CE2',
  indigo600: '#4B4CCB',
  indigo700: '#4547C9',
  indigo100: '#EDEDFC',
  indigo150: '#DCDCF8',
  indigo200: '#D9D6F7',
  indigo300: '#A9AAF5',
  indigo400: '#8586F2',
  indigo50: '#F7F7FE',
  indigoGlow: '#E4E4FA',
  indigo250: '#C3C4F8',
  // critical (coral)
  coral500: '#E0553F',
  coral600: '#C7432F',
  coral700: '#A83726',
  coral100: '#FCEDE9',
  coral300: '#F08B78',
  // warning (amber)
  amber500: '#E09A1C',
  amber700: '#9A6300',
  amber100: '#FDF2DC',
  amber300: '#F0B85A',
  // success (green)
  green500: '#2FA062',
  green700: '#1E7A47',
  green100: '#E4F5EA',
  green300: '#6FCF97',
  green050: '#E3EFE6',
  green800: '#1E5A36',
  // info (blue)
  blue500: '#3B82E6',
  blue700: '#2262BE',
  blue100: '#E7F0FD',
  blue050: '#DCE4F5',
  blue800: '#2B3F73',
  // warm neutrals (light)
  warm50: '#FBFAF7',
  warm75: '#F7F6F2',
  warm100: '#F5F4F0',
  warm150: '#F0EFEB',
  warm200: '#E9E7E1',
  warm250: '#E0DED7',
  warm300: '#D9D6D0',
  warm350: '#C9C5BC',
  warm400: '#B8B4AA',
  warm500: '#9B978E',
  warm600: '#6B6860',
  warm900: '#1A1917',
  white: '#FFFFFF',
  black: '#000000',
  // warm neutrals (dark)
  dark900: '#141311',
  dark800: '#1F1E1B',
  dark700: '#2A2926',
  dark600: '#5E5B54',
  dark500: '#7A776F',
  dark300: '#A39F96',
  dark100: '#F2F0EB',
  onPrimaryDark: '#0F0F2A',
  // gradients stops
  dawn0: '#1E1E4C',
  dawn1: '#3B3CA8',
  dawn2: '#7071EA',
  night0: '#15153A',
  night1: '#25266A',
  night2: '#3B3CA8',
  dusk0: '#2A1E3F',
  dusk1: '#4A3A8A',
  dusk2: '#8C6BD6',
} as const;

export type SemanticColors = {
  /** brand/primary — primary button, AI mark, selected tab */
  primary: string;
  /** brand/primary-pressed */
  primaryPressed: string;
  /** brand/soft — tonal button, AI card glow */
  primarySoft: string;
  /** brand/soft pressed */
  primarySoftPressed: string;
  /** brand/text-on-soft — ghost button, link */
  primaryText: string;
  /** brand/dark-glow — AI mark on dark surfaces */
  primaryGlow: string;
  /** text color on primary surfaces */
  onPrimary: string;
  /** dashed "suggested / not yet real" surface */
  suggestedSurface: string;
  suggestedBorder: string;

  critical: string;
  criticalSoft: string;
  criticalText: string;
  destructive: string;
  destructivePressed: string;

  warning: string;
  warningSoft: string;
  warningText: string;

  success: string;
  successSoft: string;
  successText: string;

  info: string;
  infoSoft: string;
  infoText: string;

  /** neutral/bg — app background (warm) */
  background: string;
  /** neutral/surface — cards */
  surface: string;
  /** neutral/surface-2 — icon tile, neutral badge */
  surface2: string;
  /** elevated sheet / modal surface */
  surfaceElevated: string;
  /** editorial/paper — weekly review, reading view */
  paper: string;
  /** hairline separator */
  hairline: string;
  /** stronger divider (editorial) */
  divider: string;

  /** primary text */
  ink: string;
  /** secondary text */
  inkSecondary: string;
  /** kicker, meta */
  inkTertiary: string;
  /** passive icons */
  inkDisabled: string;
  /** inverse (dark card) text/background */
  inkInverse: string;
  inverseSurface: string;
  inverseSurface2: string;
  inverseSecondary: string;

  /** avatar tints */
  avatarGreenBg: string;
  avatarGreenFg: string;
  avatarBlueBg: string;
  avatarBlueFg: string;

  /** tab bar */
  tabBarBackground: string;
  tabBarBorder: string;
  tabActive: string;
  tabInactive: string;

  /** toggle */
  toggleOn: string;
  toggleOff: string;

  /** scrim behind sheets/modals (35% ink) */
  scrim: string;
  /** skeleton shimmer */
  skeletonBase: string;
  skeletonHighlight: string;
  /** focus ring */
  focusRing: string;
  /** overlay chips on gradient heroes */
  onGradientChip: string;
  onGradientChipStrong: string;
  onGradientMuted: string;
  onGradientText: string;
};

export const lightColors: SemanticColors = {
  primary: palette.indigo500,
  primaryPressed: palette.indigo600,
  primarySoft: palette.indigo100,
  primarySoftPressed: palette.indigo150,
  primaryText: palette.indigo700,
  primaryGlow: palette.indigo300,
  onPrimary: palette.white,
  suggestedSurface: palette.indigo50,
  suggestedBorder: palette.indigo300,

  critical: palette.coral500,
  criticalSoft: palette.coral100,
  criticalText: palette.coral600,
  destructive: palette.coral600,
  destructivePressed: palette.coral700,

  warning: palette.amber500,
  warningSoft: palette.amber100,
  warningText: palette.amber700,

  success: palette.green500,
  successSoft: palette.green100,
  successText: palette.green700,

  info: palette.blue500,
  infoSoft: palette.blue100,
  infoText: palette.blue700,

  background: palette.warm100,
  surface: palette.white,
  surface2: palette.warm150,
  surfaceElevated: palette.white,
  paper: palette.warm50,
  hairline: 'rgba(27,25,23,0.06)',
  divider: 'rgba(27,25,23,0.12)',

  ink: palette.warm900,
  inkSecondary: palette.warm600,
  inkTertiary: palette.warm500,
  inkDisabled: palette.warm400,
  inkInverse: palette.white,
  inverseSurface: palette.warm900,
  inverseSurface2: 'rgba(255,255,255,0.10)',
  inverseSecondary: 'rgba(255,255,255,0.65)',

  avatarGreenBg: palette.green050,
  avatarGreenFg: palette.green800,
  avatarBlueBg: palette.blue050,
  avatarBlueFg: palette.blue800,

  tabBarBackground: 'rgba(255,255,255,0.92)',
  tabBarBorder: 'rgba(27,25,23,0.06)',
  tabActive: palette.indigo500,
  tabInactive: palette.warm500,

  toggleOn: palette.indigo500,
  toggleOff: palette.warm300,

  scrim: 'rgba(27,25,23,0.35)',
  skeletonBase: '#EFEDE7',
  skeletonHighlight: palette.warm75,
  focusRing: palette.indigo500,
  onGradientChip: 'rgba(255,255,255,0.16)',
  onGradientChipStrong: 'rgba(255,255,255,0.14)',
  onGradientMuted: 'rgba(255,255,255,0.72)',
  onGradientText: palette.white,
};

export const darkColors: SemanticColors = {
  primary: palette.indigo400,
  primaryPressed: palette.indigo500,
  primarySoft: 'rgba(133,134,242,0.16)',
  primarySoftPressed: 'rgba(133,134,242,0.24)',
  primaryText: palette.indigo250,
  primaryGlow: palette.indigo300,
  onPrimary: palette.onPrimaryDark,
  suggestedSurface: 'rgba(133,134,242,0.08)',
  suggestedBorder: palette.indigo400,

  critical: palette.coral500,
  criticalSoft: 'rgba(224,85,63,0.18)',
  criticalText: palette.coral300,
  destructive: palette.coral600,
  destructivePressed: palette.coral700,

  warning: palette.amber500,
  warningSoft: 'rgba(224,154,28,0.18)',
  warningText: palette.amber300,

  success: palette.green500,
  successSoft: 'rgba(47,160,98,0.18)',
  successText: palette.green300,

  info: palette.blue500,
  infoSoft: 'rgba(59,130,230,0.18)',
  infoText: '#8FB8F5',

  background: palette.dark900,
  surface: palette.dark800,
  surface2: 'rgba(255,255,255,0.08)',
  surfaceElevated: palette.dark700,
  paper: palette.dark800,
  hairline: 'rgba(255,255,255,0.06)',
  divider: 'rgba(255,255,255,0.12)',

  ink: palette.dark100,
  inkSecondary: palette.dark300,
  inkTertiary: palette.dark500,
  inkDisabled: palette.dark600,
  inkInverse: palette.dark900,
  inverseSurface: palette.dark100,
  inverseSurface2: 'rgba(20,19,17,0.10)',
  inverseSecondary: 'rgba(20,19,17,0.65)',

  avatarGreenBg: 'rgba(47,160,98,0.22)',
  avatarGreenFg: palette.green300,
  avatarBlueBg: 'rgba(59,130,230,0.22)',
  avatarBlueFg: '#B5CDF5',

  tabBarBackground: 'rgba(20,19,17,0.92)',
  tabBarBorder: 'rgba(255,255,255,0.08)',
  tabActive: palette.indigo300,
  tabInactive: palette.dark500,

  toggleOn: palette.indigo400,
  toggleOff: 'rgba(255,255,255,0.18)',

  scrim: 'rgba(0,0,0,0.55)',
  skeletonBase: 'rgba(255,255,255,0.06)',
  skeletonHighlight: 'rgba(255,255,255,0.12)',
  focusRing: palette.indigo400,
  onGradientChip: 'rgba(255,255,255,0.16)',
  onGradientChipStrong: 'rgba(255,255,255,0.14)',
  onGradientMuted: 'rgba(255,255,255,0.72)',
  onGradientText: palette.white,
};

/** Gradient definitions — identical in light and dark (brand moments). */
export const gradients = {
  /** Morning briefing, brand moments — 160deg */
  dawn: { angle: 160, stops: [palette.dawn0, palette.dawn1, palette.dawn2], locations: [0, 0.58, 1] },
  /** Voice / audio briefing / analysis — 180deg */
  night: { angle: 180, stops: [palette.night0, palette.night1, palette.night2], locations: [0, 0.6, 1] },
  /** Evening close — 160deg */
  dusk: { angle: 160, stops: [palette.dusk0, palette.dusk1, palette.dusk2], locations: [0, 0.55, 1] },
} as const;

export type GradientName = keyof typeof gradients;

/** CSS strings of the same gradients (web). */
export const gradientCss: Record<GradientName, string> = {
  dawn: 'linear-gradient(160deg,#1E1E4C 0%,#3B3CA8 58%,#7071EA 100%)',
  night: 'linear-gradient(180deg,#15153A 0%,#25266A 60%,#3B3CA8 100%)',
  dusk: 'linear-gradient(160deg,#2A1E3F 0%,#4A3A8A 55%,#8C6BD6 100%)',
};

/** Badge tone → background/foreground mapping (semantic only). */
export type BadgeTone =
  | 'critical'
  | 'deadline'
  | 'neutral'
  | 'calendar'
  | 'approved'
  | 'waiting'
  | 'pro'
  | 'security';

export function badgeColors(colors: SemanticColors, tone: BadgeTone): { bg: string; fg: string } {
  switch (tone) {
    case 'critical':
    case 'security':
      return { bg: colors.criticalSoft, fg: colors.criticalText };
    case 'deadline':
    case 'waiting':
      return { bg: colors.warningSoft, fg: colors.warningText };
    case 'calendar':
      return { bg: colors.infoSoft, fg: colors.infoText };
    case 'approved':
      return { bg: colors.successSoft, fg: colors.successText };
    case 'pro':
      return { bg: colors.primarySoft, fg: colors.primaryText };
    case 'neutral':
    default:
      return { bg: colors.surface2, fg: colors.inkSecondary };
  }
}
