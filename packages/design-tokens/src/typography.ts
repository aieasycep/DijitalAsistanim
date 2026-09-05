/**
 * Typography — Geist (UI) + Lora (editorial). Values from "01 · Tasarım Sistemi".
 * On iOS body text may fall back to SF Pro; Geist is kept for headings. Lora is only used for
 * briefing narrative, weekly review and commitment quotes. Numbers use tabular figures.
 */

export const fontFamilies = {
  /** UI sans — loaded from @expo-google-fonts/geist on mobile, Google Fonts on web */
  sans: 'Geist',
  sansMedium: 'Geist_500Medium',
  sansSemiBold: 'Geist_600SemiBold',
  sansRegular: 'Geist_400Regular',
  /** Editorial serif */
  serif: 'Lora',
  serifRegular: 'Lora_400Regular',
  serifMedium: 'Lora_500Medium',
  serifSemiBold: 'Lora_600SemiBold',
  serifItalic: 'Lora_400Regular_Italic',
  /** Monospace for token labels (dev surfaces only) */
  mono: 'ui-monospace',
  /** Platform fallbacks */
  webSansStack: 'Geist, -apple-system, "SF Pro Text", "Segoe UI", Roboto, system-ui, sans-serif',
  webSerifStack: 'Lora, Georgia, "Times New Roman", serif',
} as const;

export type FontWeightToken = '400' | '500' | '600' | '700';

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: FontWeightToken;
  letterSpacing: number;
  family: 'sans' | 'serif';
  textTransform?: 'uppercase' | 'none';
  fontStyle?: 'italic' | 'normal';
}

/** letterSpacing is expressed in px for RN (em × size). */
const em = (size: number, ratio: number) => Math.round(size * ratio * 100) / 100;

export const typeScale = {
  /** 34/40 · 600 · −2.5% — "Bugün bilmen gereken 5 şey var." */
  display: { fontSize: 34, lineHeight: 40, fontWeight: '600', letterSpacing: em(34, -0.025), family: 'sans' },
  /** 28/34 · 600 · −2% — "Günaydın, Yunus" */
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: em(28, -0.02), family: 'sans' },
  /** 26/32 hero sentence inside briefing card */
  hero: { fontSize: 26, lineHeight: 32, fontWeight: '600', letterSpacing: em(26, -0.02), family: 'sans' },
  /** 22/28 · 600 · −2% — "Toplantıya Hazırlan" */
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: em(22, -0.02), family: 'sans' },
  /** 18/24 modal title */
  h2s: { fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: em(18, -0.01), family: 'sans' },
  /** 17/23 · 600 · −1% — card title */
  h3: { fontSize: 17, lineHeight: 23, fontWeight: '600', letterSpacing: em(17, -0.01), family: 'sans' },
  /** 16/22 · 600 — calendar row title */
  h4: { fontSize: 16, lineHeight: 22, fontWeight: '600', letterSpacing: em(16, -0.01), family: 'sans' },
  /** 15/22 · 400 */
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400', letterSpacing: 0, family: 'sans' },
  /** 15/20 · 500 — list row title */
  bodyMedium: { fontSize: 15, lineHeight: 20, fontWeight: '500', letterSpacing: em(15, -0.01), family: 'sans' },
  /** 15/20 · 600 — button label */
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: 0, family: 'sans' },
  /** 14/20 · 600 — inline action (Yanıtla, Hatırlat) */
  action: { fontSize: 14, lineHeight: 20, fontWeight: '600', letterSpacing: 0, family: 'sans' },
  /** 14/20 · 400 · secondary */
  secondary: { fontSize: 14, lineHeight: 20, fontWeight: '400', letterSpacing: 0, family: 'sans' },
  /** 13/18 · 400 — meta */
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: 0, family: 'sans' },
  /** 13/18 · 600 — chip label */
  chip: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0, family: 'sans' },
  /** 12/16 · 400 — source line, timestamps */
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400', letterSpacing: 0, family: 'sans' },
  /** 12/16 · 600 · +8% · caps — kicker "ÖNCELİKLERİN" */
  kicker: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: em(12, 0.08), family: 'sans', textTransform: 'uppercase' },
  /** 12/16 · 600 · +6% — AI mark label "BRİFİNG HAZIR" */
  aiLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: em(12, 0.06), family: 'sans', textTransform: 'uppercase' },
  /** 11/14 · 700 · +5% — badge "ACİL" */
  badge: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: em(11, 0.05), family: 'sans' },
  /** 11/14 · 500 — tab label */
  tab: { fontSize: 11, lineHeight: 14, fontWeight: '500', letterSpacing: 0, family: 'sans' },
  /** Lora 18/29 — briefing narrative */
  editorial: { fontSize: 18, lineHeight: 29, fontWeight: '400', letterSpacing: 0, family: 'serif' },
  /** Lora 17/27 — secondary narrative */
  editorialSmall: { fontSize: 17, lineHeight: 27, fontWeight: '400', letterSpacing: 0, family: 'serif' },
  /** Lora 16 italic — editorial kicker "Haftalık özet" */
  editorialKicker: { fontSize: 16, lineHeight: 22, fontWeight: '400', letterSpacing: 0, family: 'serif', fontStyle: 'italic' },
  /** Lora 34/36 · 500 — editorial numbers */
  editorialNumber: { fontSize: 34, lineHeight: 36, fontWeight: '500', letterSpacing: em(34, -0.02), family: 'serif' },
  /** Lora 36/40 — time saved */
  editorialStat: { fontSize: 36, lineHeight: 40, fontWeight: '400', letterSpacing: em(36, -0.02), family: 'serif' },
  /** Lora 38/44 · 500 — "Haftan nasıl geçti?" */
  editorialDisplay: { fontSize: 38, lineHeight: 44, fontWeight: '500', letterSpacing: em(38, -0.02), family: 'serif' },
} as const satisfies Record<string, TypeStyle>;

export type TypeToken = keyof typeof typeScale;
