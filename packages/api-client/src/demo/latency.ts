/** Simulated network latency and background-transition timings (deterministic, scalable for tests). */

export interface Timings {
  latencyMinMs: number;
  latencyMaxMs: number;
  approvalExecutionMs: number;
  analysisStepMs: number;
  captureAnalyzeMs: number;
  exportProcessingMs: number;
  persistDebounceMs: number;
}

export const DEFAULT_TIMINGS: Timings = {
  latencyMinMs: 80,
  latencyMaxMs: 250,
  approvalExecutionMs: 1200,
  analysisStepMs: 1200,
  captureAnalyzeMs: 1500,
  exportProcessingMs: 2000,
  persistDebounceMs: 200,
};

export function scaleTimings(base: Timings, scale: number): Timings {
  const s = Math.max(0, scale);
  return {
    latencyMinMs: Math.round(base.latencyMinMs * s),
    latencyMaxMs: Math.round(base.latencyMaxMs * s),
    approvalExecutionMs: Math.round(base.approvalExecutionMs * s),
    analysisStepMs: Math.round(base.analysisStepMs * s),
    captureAnalyzeMs: Math.round(base.captureAnalyzeMs * s),
    exportProcessingMs: Math.round(base.exportProcessingMs * s),
    persistDebounceMs: Math.round(base.persistDebounceMs * s),
  };
}

/** mulberry32 — tiny seeded PRNG, good enough for jitter and demo state tokens. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    schedule(ms, resolve);
  });
}

type TimerHandle = ReturnType<typeof setTimeout>;

/** setTimeout that never keeps a Node process alive (no-op on React Native / browsers). */
export function schedule(ms: number, fn: () => void): () => void {
  const handle: TimerHandle = setTimeout(fn, Math.max(0, ms));
  const maybeUnref = handle as unknown as { unref?: () => void };
  if (typeof maybeUnref.unref === 'function') maybeUnref.unref();
  return () => clearTimeout(handle);
}

export interface Latency {
  wait(): Promise<void>;
  random(): number;
  token(length?: number): string;
}

export function createLatency(seed: number, timings: Timings): Latency {
  const random = createRandom(seed);
  return {
    wait: () =>
      sleep(timings.latencyMinMs + random() * (timings.latencyMaxMs - timings.latencyMinMs)),
    random,
    token: (length = 8) => {
      let out = '';
      const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
      for (let i = 0; i < length; i += 1)
        out += alphabet[Math.floor(random() * alphabet.length)] ?? 'a';
      return out;
    },
  };
}
