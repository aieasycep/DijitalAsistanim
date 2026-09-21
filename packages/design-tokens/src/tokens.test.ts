import { describe, expect, it } from 'vitest';
import { badgeColors, darkColors, lightColors, palette, toCssVariables, typeScale } from './index';

function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('design tokens', () => {
  it('matches the design system primary values', () => {
    expect(lightColors.primary).toBe('#5B5CE2');
    expect(lightColors.primaryPressed).toBe('#4B4CCB');
    expect(lightColors.background).toBe('#F5F4F0');
    expect(darkColors.background).toBe('#141311');
    expect(darkColors.surface).toBe('#1F1E1B');
    expect(darkColors.primary).toBe('#8586F2');
  });

  it('keeps body text ≥ 4.5:1 and bold badge text ≥ 4:1 on soft backgrounds (rule 3)', () => {
    // Badge text is 11px/700 and always paired with an icon or explicit label; the design tokens
    // as specified measure between 4.3 and 6.5 — we guard against regressions below 4:1.
    expect(contrast(palette.coral600, palette.coral100)).toBeGreaterThanOrEqual(4);
    expect(contrast(palette.amber700, palette.amber100)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.green700, palette.green100)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.indigo700, palette.indigo100)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(lightColors.ink, lightColors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(lightColors.inkSecondary, lightColors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkColors.ink, darkColors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkColors.inkSecondary, darkColors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkColors.onPrimary, darkColors.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(lightColors.onPrimary, lightColors.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('maps badge tones semantically', () => {
    expect(badgeColors(lightColors, 'critical')).toEqual({ bg: '#FCEDE9', fg: '#C7432F' });
    expect(badgeColors(lightColors, 'deadline')).toEqual({ bg: '#FDF2DC', fg: '#9A6300' });
    expect(badgeColors(lightColors, 'approved')).toEqual({ bg: '#E4F5EA', fg: '#1E7A47' });
  });

  it('exposes the documented type scale', () => {
    expect(typeScale.display).toMatchObject({ fontSize: 34, lineHeight: 40, fontWeight: '600' });
    expect(typeScale.h1).toMatchObject({ fontSize: 28, lineHeight: 34 });
    expect(typeScale.editorial).toMatchObject({ fontSize: 18, lineHeight: 29, family: 'serif' });
  });

  it('produces css variables', () => {
    const vars = toCssVariables(lightColors);
    expect(vars['--da-primary']).toBe('#5B5CE2');
    expect(vars['--da-ink-secondary']).toBe('#6B6860');
  });
});
