/**
 * Generic chrome and accessibility copy the design system needs but never ships itself: the app passes
 * these through `<ThemeProvider labels>` from i18n (no user-facing literals live in @da/ui). A label left
 * empty renders no accessibility label at all — nothing falls back to Turkish or English.
 */
export interface UiLabels {
  /** Screen-reader label for `Skeleton` shimmer placeholders. */
  loading: string;
  /** Back button in `ScreenHeader` and `GradientHeader` (the `backLabel` prop overrides). */
  back: string;
  /** Close controls: `BottomSheet` scrim and `MiniPlayer` close button (the `closeLabel` prop overrides). */
  close: string;
  /** Share button in `GradientHeader` (the `shareLabel` prop overrides). */
  share: string;
  /** Clear (×) button in `SearchBar` (the `clearLabel` prop overrides). */
  clear: string;
  /** `MiniPlayer` play button (the `playLabel` prop overrides). */
  play: string;
  /** `MiniPlayer` pause button (the `pauseLabel` prop overrides). */
  pause: string;
  /** Screen-reader prefix for a tappable `SourceLine`: "<openSource>: Gmail · …". */
  openSource: string;
  /** Screen-reader suffix appended to a `CalendarRowCard` rendered with `conflict`. */
  conflict: string;
  /** Screen-reader suffix for the `ApprovalBadge` pill (the `accessibilityLabel` prop overrides). */
  approvalCenter: string;
  /** Screen-reader prefix for the `ScreenHeader` avatar button: "<profile> · name". */
  profile: string;
}

export type UiLabelKey = keyof UiLabels;

/** Every label is empty until the app provides it. */
export const DEFAULT_UI_LABELS: Readonly<UiLabels> = Object.freeze({
  loading: '',
  back: '',
  close: '',
  share: '',
  clear: '',
  play: '',
  pause: '',
  openSource: '',
  conflict: '',
  approvalCenter: '',
  profile: '',
});

/** Merge app-provided labels over the empty defaults, ignoring `undefined` entries. */
export function resolveUiLabels(overrides?: Partial<UiLabels>): UiLabels {
  const merged: UiLabels = { ...DEFAULT_UI_LABELS };
  if (!overrides) return merged;
  for (const key of Object.keys(merged) as UiLabelKey[]) {
    const value = overrides[key];
    if (typeof value === 'string') merged[key] = value;
  }
  return merged;
}
