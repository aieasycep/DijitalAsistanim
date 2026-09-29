import type { GradientName, Theme } from '@da/design-tokens';

export interface GradientPoint {
  x: number;
  y: number;
}

/**
 * Convert a CSS `linear-gradient` angle (0deg = to top, 90deg = to right) into the
 * start/end points expected by expo-linear-gradient.
 */
export function gradientPoints(angleDeg: number): { start: GradientPoint; end: GradientPoint } {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    start: { x: round(0.5 - dx), y: round(0.5 - dy) },
    end: { x: round(0.5 + dx), y: round(0.5 + dy) },
  };
}

/** Props for `<LinearGradient>` from a named brand gradient token (dawn · night · dusk). */
export function gradientProps(theme: Theme, name: GradientName) {
  const gradient = theme.gradients[name];
  return {
    colors: gradient.stops,
    locations: gradient.locations,
    ...gradientPoints(gradient.angle),
  };
}
