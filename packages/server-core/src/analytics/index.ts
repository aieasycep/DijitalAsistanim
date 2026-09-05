/**
 * analytics — privacy-safe product analytics.
 *
 * Only events from the typed catalogue are accepted, and properties are scrubbed twice: keys on
 * the forbidden list are dropped, anything that looks like an e-mail address is dropped, long
 * strings (which is where subjects and snippets would hide) are dropped. User ids are hashed
 * before they leave the process. Failures never surface to the caller — analytics must not break
 * a product flow.
 */
import type { AnalyticsEventMap, AnalyticsEventName } from '@da/domain';
import { ANALYTICS_FORBIDDEN_KEYS } from '@da/domain';
import { sha256Hex } from '../crypto';
import type { FetchLike } from '../safefetch';

export type { FetchLike } from '../safefetch';

const EVENT_CATALOGUE: Record<AnalyticsEventName, true> = {
  onboarding_started: true,
  account_connected: true,
  calendar_connected: true,
  first_analysis_completed: true,
  first_brief_opened: true,
  insight_opened: true,
  action_approved: true,
  meeting_prep_opened: true,
  followup_completed: true,
  assistant_query: true,
  paywall_viewed: true,
  trial_started: true,
  subscription_started: true,
  referral_shared: true,
};

export const ANALYTICS_EVENT_NAMES = Object.keys(EVENT_CATALOGUE) as AnalyticsEventName[];
export const ANALYTICS_MAX_STRING_LENGTH = 80;
export const ANALYTICS_MAX_KEY_LENGTH = 40;
export const ANALYTICS_MAX_PROPS = 30;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const FORBIDDEN = new Set<string>(ANALYTICS_FORBIDDEN_KEYS.map((k) => k.toLowerCase()));

export type AnalyticsPropValue = string | number | boolean;
export type AnalyticsProps = Record<string, AnalyticsPropValue>;

export function isAnalyticsEventName(name: string): name is AnalyticsEventName {
  return Object.prototype.hasOwnProperty.call(EVENT_CATALOGUE, name);
}

export function looksLikeEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export type SanitizeDropReason =
  'forbidden_key' | 'email' | 'too_long' | 'unsupported_value' | 'too_many';

export type SanitizeResult =
  | {
      ok: true;
      name: AnalyticsEventName;
      props: AnalyticsProps;
      dropped: { key: string; reason: SanitizeDropReason }[];
    }
  | { ok: false; reason: 'unknown_event' | 'invalid_props' };

function sanitizeValue(
  value: unknown,
): { ok: true; value: AnalyticsPropValue } | { ok: false; reason: SanitizeDropReason } {
  if (typeof value === 'boolean') return { ok: true, value };
  if (typeof value === 'number')
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, reason: 'unsupported_value' };
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (looksLikeEmail(trimmed)) return { ok: false, reason: 'email' };
    if (trimmed.length > ANALYTICS_MAX_STRING_LENGTH) return { ok: false, reason: 'too_long' };
    return { ok: true, value: trimmed };
  }
  return { ok: false, reason: 'unsupported_value' };
}

/**
 * Validate the event name against the catalogue and scrub the properties. Nested objects,
 * arrays and functions are dropped; only short strings, finite numbers and booleans survive.
 */
export function sanitizeAnalyticsEvent(name: string, props: unknown): SanitizeResult {
  if (!isAnalyticsEventName(name)) return { ok: false, reason: 'unknown_event' };
  if (props === undefined || props === null) return { ok: true, name, props: {}, dropped: [] };
  if (typeof props !== 'object' || Array.isArray(props))
    return { ok: false, reason: 'invalid_props' };

  const out: AnalyticsProps = {};
  const dropped: { key: string; reason: SanitizeDropReason }[] = [];
  let kept = 0;
  for (const [rawKey, rawValue] of Object.entries(props as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key || key.length > ANALYTICS_MAX_KEY_LENGTH || FORBIDDEN.has(key.toLowerCase())) {
      dropped.push({ key: rawKey, reason: 'forbidden_key' });
      continue;
    }
    if (kept >= ANALYTICS_MAX_PROPS) {
      dropped.push({ key, reason: 'too_many' });
      continue;
    }
    const v = sanitizeValue(rawValue);
    if (!v.ok) {
      dropped.push({ key, reason: v.reason });
      continue;
    }
    out[key] = v.value;
    kept += 1;
  }
  return { ok: true, name, props: out, dropped };
}

// --- Sinks -------------------------------------------------------------------------------------------

export interface AnalyticsEvent<N extends AnalyticsEventName = AnalyticsEventName> {
  name: N;
  props: AnalyticsEventMap[N];
  /** Internal user id; hashed before being sent anywhere. */
  userId?: string | null;
  /** ISO timestamp; defaults to the sink's clock. */
  timestamp?: string;
}

export interface AnalyticsSink {
  capture(event: AnalyticsEvent): Promise<void>;
  flush?(): Promise<void>;
}

export const ANONYMOUS_DISTINCT_ID = 'anonymous';

/** Stable, non-reversible distinct id: sha256 of the internal user id. */
export async function hashDistinctId(userId: string | null | undefined): Promise<string> {
  const id = userId?.trim();
  return id ? sha256Hex(id) : ANONYMOUS_DISTINCT_ID;
}

/** Discards everything — used when no analytics key is configured. */
export class NoopSink implements AnalyticsSink {
  capture(): Promise<void> {
    return Promise.resolve();
  }
}

/** Keeps sanitized events in memory — for tests and local development. */
export class MemorySink implements AnalyticsSink {
  readonly events: {
    name: AnalyticsEventName;
    props: AnalyticsProps;
    distinctId: string;
    timestamp?: string;
  }[] = [];
  readonly rejected: { name: string; reason: 'unknown_event' | 'invalid_props' }[] = [];

  async capture(event: AnalyticsEvent): Promise<void> {
    const s = sanitizeAnalyticsEvent(event.name, event.props);
    if (!s.ok) {
      this.rejected.push({ name: event.name, reason: s.reason });
      return;
    }
    this.events.push({
      name: s.name,
      props: s.props,
      distinctId: await hashDistinctId(event.userId),
      timestamp: event.timestamp,
    });
  }
}

export interface PostHogSinkOptions {
  /** e.g. https://eu.i.posthog.com */
  host: string;
  apiKey: string;
  /** Clock for default timestamps (tests). */
  now?: () => string;
  /** Request timeout in ms (default 5000). */
  timeoutMs?: number;
}

/**
 * Sends events to PostHog's capture endpoint with a hashed distinct id and no person profile.
 * Never throws: network or API failures are counted in `failures` and otherwise ignored.
 */
export class PostHogSink implements AnalyticsSink {
  private readonly host: string;
  private readonly apiKey: string;
  private readonly now: () => string;
  private readonly timeoutMs: number;
  sent = 0;
  failures = 0;
  lastStatus: number | null = null;

  constructor(
    private readonly fetchFn: FetchLike,
    opts: PostHogSinkOptions,
  ) {
    this.host = opts.host.replace(/\/+$/, '');
    this.apiKey = opts.apiKey.trim();
    this.now = opts.now ?? (() => new Date().toISOString());
    this.timeoutMs = opts.timeoutMs ?? 5000;
  }

  get enabled(): boolean {
    return this.apiKey.length > 0 && this.host.length > 0;
  }

  async capture(event: AnalyticsEvent): Promise<void> {
    if (!this.enabled) return;
    const s = sanitizeAnalyticsEvent(event.name, event.props);
    if (!s.ok) return;
    const body = {
      api_key: this.apiKey,
      event: s.name,
      distinct_id: await hashDistinctId(event.userId),
      timestamp: event.timestamp ?? this.now(),
      properties: { ...s.props, $lib: 'da-server-core', $process_person_profile: false },
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(`${this.host}/capture/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      this.lastStatus = res.status;
      if (res.ok) this.sent += 1;
      else this.failures += 1;
    } catch {
      this.failures += 1;
    } finally {
      clearTimeout(timer);
    }
  }
}
