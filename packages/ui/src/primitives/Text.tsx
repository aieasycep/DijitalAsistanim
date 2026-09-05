import { forwardRef, useMemo } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { fontFamilies, type TypeToken } from '@da/design-tokens';
import { useTheme } from '../theme/ThemeProvider';

export type TextTone =
  | 'ink'
  | 'secondary'
  | 'tertiary'
  | 'disabled'
  | 'primary'
  | 'inverse'
  | 'critical'
  | 'warning'
  | 'success'
  | 'info'
  | 'onGradient'
  | 'onGradientMuted'
  | 'onPrimary';

export interface TextProps extends RNTextProps {
  /** Type scale token from the design system (default: body). */
  variant?: TypeToken;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
  /** Tabular figures for times/amounts. */
  tabular?: boolean;
  /** Override color (use sparingly; tokens preferred). */
  color?: string;
}

/** Resolve the font family name registered by expo-font for a weight/family. */
export function fontFor(family: 'sans' | 'serif', weight: string, italic = false): string {
  if (family === 'serif') {
    if (italic) return fontFamilies.serifItalic;
    if (weight === '600' || weight === '700') return fontFamilies.serifSemiBold;
    if (weight === '500') return fontFamilies.serifMedium;
    return fontFamilies.serifRegular;
  }
  if (weight === '600' || weight === '700') return fontFamilies.sansSemiBold;
  if (weight === '500') return fontFamilies.sansMedium;
  return fontFamilies.sansRegular;
}

export const Text = forwardRef<RNText, TextProps>(function Text(
  {
    variant = 'body',
    tone = 'ink',
    align,
    tabular,
    color,
    style,
    children,
    maxFontSizeMultiplier = 1.4,
    ...rest
  },
  ref,
) {
  const theme = useTheme();
  const computed = useMemo<TextStyle>(() => {
    const t = theme.typography[variant];
    const toneColor: Record<TextTone, string> = {
      ink: theme.colors.ink,
      secondary: theme.colors.inkSecondary,
      tertiary: theme.colors.inkTertiary,
      disabled: theme.colors.inkDisabled,
      primary: theme.colors.primaryText,
      inverse: theme.colors.inkInverse,
      critical: theme.colors.criticalText,
      warning: theme.colors.warningText,
      success: theme.colors.successText,
      info: theme.colors.infoText,
      onGradient: theme.colors.onGradientText,
      onGradientMuted: theme.colors.onGradientMuted,
      onPrimary: theme.colors.onPrimary,
    };
    return {
      fontFamily: fontFor(t.family, t.fontWeight, 'fontStyle' in t && t.fontStyle === 'italic'),
      fontSize: t.fontSize,
      lineHeight: t.lineHeight,
      letterSpacing: t.letterSpacing,
      fontWeight: t.fontWeight,
      color: color ?? toneColor[tone],
      textAlign: align,
      textTransform: 'textTransform' in t ? t.textTransform : undefined,
      fontVariant: tabular ? ['tabular-nums'] : undefined,
    };
  }, [theme, variant, tone, color, align, tabular]);

  return (
    <RNText
      ref={ref}
      style={[computed, style]}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...rest}
    >
      {children}
    </RNText>
  );
});
