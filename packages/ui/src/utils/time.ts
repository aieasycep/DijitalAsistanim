/** "m:ss" clock label for audio positions ("0:42", "12:05"). Negative / NaN input clamps to "0:00". */
export function formatClock(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

/** Clamp a fraction into [0, 1]. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
