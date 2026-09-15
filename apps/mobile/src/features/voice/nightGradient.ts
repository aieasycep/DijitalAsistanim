import type { Theme } from '@da/design-tokens';

/** expo-linear-gradient props for the brand "night" gradient (CSS angle → start/end points). */
export function nightGradientProps(theme: Theme) {
  const gradient = theme.gradients.night;
  const rad = (gradient.angle * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;
  return {
    colors: [...gradient.stops] as [string, string, ...string[]],
    locations: [...gradient.locations] as [number, number, ...number[]],
    start: { x: 0.5 - dx, y: 0.5 - dy },
    end: { x: 0.5 + dx, y: 0.5 + dy },
  };
}
