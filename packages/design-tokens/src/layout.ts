/** 4-point spacing grid. Screen edge 20 · card inner 16 · between cards 12 · between sections 18–22 · list row min 50. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const layout = {
  screenPaddingH: 20,
  cardPadding: 16,
  cardGap: 12,
  sectionGap: 18,
  sectionGapLarge: 22,
  listRowMinHeight: 50,
  listRowPaddingV: 11,
  touchTargetMin: 44,
  tabBarHeight: 84,
  tabBarPaddingBottom: 22,
  miniPlayerHeight: 60,
  bottomCtaHeight: 52,
  sheetHandleWidth: 36,
  sheetHandleHeight: 5,
  heroCardPadding: 22,
  editorialPaddingH: 24,
} as const;

export const radius = {
  /** chip icon tile */
  xs: 10,
  /** inline button */
  sm: 12,
  /** button */
  md: 14,
  /** small card */
  lg: 16,
  /** list group card */
  xl: 18,
  /** card */
  xxl: 20,
  /** modal */
  modal: 24,
  /** hero / page */
  hero: 28,
  pill: 999,
} as const;

export type ShadowToken = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

/** Shadows: 1 (row), 2 (card), 3 (page/sheet). Dark mode uses a 6% white hairline instead of shadow. */
export const shadows: Record<'s1' | 's2' | 's3' | 'brand' | 'none', ShadowToken> = {
  none: { shadowColor: '#000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  s1: { shadowColor: '#1B1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
  s2: { shadowColor: '#1B1917', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 3 },
  s3: { shadowColor: '#1B1917', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.14, shadowRadius: 32, elevation: 8 },
  /** hero briefing card — indigo tinted */
  brand: { shadowColor: '#5B5CE2', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.1, shadowRadius: 32, elevation: 4 },
};

export const shadowCss = {
  s1: '0 1px 2px rgba(27,25,23,.06)',
  s2: '0 1px 2px rgba(27,25,23,.04),0 6px 20px rgba(27,25,23,.05)',
  s3: '0 12px 32px rgba(27,25,23,.14)',
  brand: '0 1px 2px rgba(27,25,23,.04),0 12px 32px rgba(91,92,226,.10)',
  toast: '0 10px 30px rgba(27,25,23,.25)',
} as const;

/** Component sizes (px) from the system page. */
export const sizes = {
  buttonLarge: 52,
  buttonMedium: 48,
  buttonSmall: 40,
  buttonInline: 42,
  buttonGhost: 36,
  iconButton: 36,
  iconButtonPrimary: 40,
  filterChip: 34,
  metaChip: 30,
  input: 52,
  searchBar: 44,
  chatInput: 52,
  toggleWidth: 50,
  toggleHeight: 30,
  toggleKnob: 26,
  avatarSm: 28,
  avatarMd: 40,
  avatarLg: 56,
  avatarXl: 72,
  iconTile: 44,
  iconTileSm: 30,
  timeTile: 48,
  playButton: 76,
  segmentHeight: 32,
  iconSm: 16,
  iconMd: 20,
  iconLg: 24,
  iconXl: 26,
  cardActionIcon: 22,
} as const;
