/**
 * Error monitoring — Sentry when EXPO_PUBLIC_SENTRY_DSN is set; otherwise a silent no-op.
 * PII scrubbing: emails, message bodies, tokens and long free text never leave the device.
 */
import * as Sentry from '@sentry/react-native';
import { env } from './env';

const SENSITIVE =
  /token|secret|password|authorization|cookie|body|subject|snippet|content|draft|email/i;

function scrubValue(v: unknown): unknown {
  if (typeof v === 'string') {
    if (v.length > 200) return '[trimmed]';
    return v
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
      .replace(/(ya29\.|eyJ|sk-)[\w.-]+/g, '[token]');
  }
  if (Array.isArray(v)) return v.map(scrubValue);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>))
      out[k] = SENSITIVE.test(k) ? '[redacted]' : scrubValue(val);
    return out;
  }
  return v;
}

export function setupMonitoring(): void {
  if (!env.sentryDsn) return;
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.isProduction ? 'production' : 'development',
    release: `dijital-asistan@${env.appVersion}`,
    tracesSampleRate: env.isProduction ? 0.1 : 1,
    sendDefaultPii: false,
    attachScreenshot: false,
    beforeSend(event) {
      if (event.user) event.user = { id: event.user.id };
      if (event.request) delete event.request;
      if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>;
      if (event.contexts) event.contexts = scrubValue(event.contexts) as typeof event.contexts;
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((b) => ({
          ...b,
          data: b.data ? (scrubValue(b.data) as Record<string, unknown>) : undefined,
          message: b.message ? (scrubValue(b.message) as string) : undefined,
        }));
      }
      return event;
    },
    beforeBreadcrumb(crumb) {
      if (crumb.category === 'xhr' || crumb.category === 'fetch') {
        return {
          ...crumb,
          data: crumb.data
            ? { method: crumb.data.method, status_code: crumb.data.status_code }
            : undefined,
        };
      }
      return crumb;
    },
  });
}

export function captureError(e: unknown, context?: Record<string, unknown>): void {
  if (!env.sentryDsn) return;
  Sentry.captureException(e, {
    extra: context ? (scrubValue(context) as Record<string, unknown>) : undefined,
  });
}

export function setMonitoringUser(id: string | null): void {
  if (!env.sentryDsn) return;
  Sentry.setUser(id ? { id } : null);
}

export const wrapWithMonitoring = <P extends object>(
  component: React.ComponentType<P>,
): React.ComponentType<P> =>
  env.sentryDsn
    ? (Sentry.wrap(component as React.ComponentType<Record<string, unknown>>) as unknown as React.ComponentType<P>)
    : component;
