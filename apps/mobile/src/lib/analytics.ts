/**
 * Privacy-safe analytics. PostHog when EXPO_PUBLIC_POSTHOG_KEY is set, otherwise a no-op.
 * Events and properties are strictly typed (AnalyticsEventMap) and scrubbed of forbidden keys.
 */
import { ANALYTICS_FORBIDDEN_KEYS, type AnalyticsEventMap, type AnalyticsEventName } from '@da/domain';
import { env } from './env';

interface Sink {
  capture(event: string, props: Record<string, string | number | boolean>): void;
  identify(distinctId: string): void;
  reset(): void;
  screen(name: string): void;
}

const noop: Sink = { capture: () => undefined, identify: () => undefined, reset: () => undefined, screen: () => undefined };

let sink: Sink = noop;
let ready = false;

export async function setupAnalytics(): Promise<void> {
  if (ready) return;
  ready = true;
  if (!env.posthogKey) return;
  try {
    const mod = await import('posthog-react-native');
    const client = new mod.default(env.posthogKey, {
      host: env.posthogHost,
      captureAppLifecycleEvents: true,
      disableGeoip: true,
      persistence: 'memory',
    });
    sink = {
      capture: (event, props) => client.capture(event, props),
      identify: (id) => client.identify(id),
      reset: () => client.reset(),
      screen: (name) => client.screen(name),
    };
  } catch {
    sink = noop;
  }
}

function scrub(props: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if ((ANALYTICS_FORBIDDEN_KEYS as readonly string[]).some((f) => k.toLowerCase().includes(f))) continue;
    if (typeof v === 'string') {
      if (v.length > 80 || /@/.test(v)) continue;
      out[k] = v;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return out;
}

export function track<N extends AnalyticsEventName>(name: N, props: AnalyticsEventMap[N]): void {
  sink.capture(name, scrub(props as Record<string, unknown>));
}

export function trackScreen(name: string): void {
  sink.screen(name);
}

/** Identify with an opaque id only (never email). */
export function identifyUser(userId: string): void {
  sink.identify(userId);
}

export function resetAnalytics(): void {
  sink.reset();
}
