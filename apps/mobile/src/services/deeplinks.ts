/**
 * Deep link parsing — the single place that turns an incoming URL (custom scheme, universal link,
 * Expo dev-client URL, push payload, widget tap, share extension) into an expo-router href.
 *
 * Contract: packages/domain/src/deeplinks.ts (DeepLinks). Unknown paths and malformed ids are rejected
 * (`null`) so nothing outside the contract can drive navigation.
 */
import {
  BRIEFING_KINDS,
  DEEP_LINK_SCHEME,
  FLOW_FILTERS,
  type BriefingKind,
  type FlowFilter,
} from '@da/domain';
import { env } from '@/lib/env';

export interface ParsedDeepLink {
  /** expo-router pathname (group-qualified where the route lives in a group). */
  href: string;
  /** Validated string params for the route. */
  params?: Record<string, string>;
}

/** Pseudo-route handled by `useDeepLinks` (Supabase PKCE / magic-link return). Never pushed to the router. */
export const AUTH_CALLBACK_HREF = '/auth/callback';

export const OAUTH_PROVIDERS = ['google', 'microsoft'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const SETTINGS_SECTIONS = [
  'profile',
  'subscription',
  'briefing',
  'notifications',
  'priority-rules',
  'vip',
  'integrations',
  'data-sources',
  'ai-personalization',
  'privacy',
  'appearance',
  'language',
  'help',
  'feedback',
  'android-notifications',
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Demo fixtures use readable ids such as `ins-001` or `thread_ahmet_3`. */
const DEMO_ID_RE = /^[a-z0-9]+(?:[-_.][a-z0-9]+){0,7}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAYWALL_CONTEXT_RE = /^[a-z][a-z0-9_]{0,39}$/;
const REFERRAL_CODE_RE = /^[a-z0-9][a-z0-9-]{2,23}$/i;
const MAX_QUERY_TEXT = 500;
const EXPO_DEV_HOSTS = new Set(['expo-development-client']);

export function isValidEntityId(id: string): boolean {
  return id.length > 0 && id.length <= 64 && (UUID_RE.test(id) || DEMO_ID_RE.test(id));
}

interface RawUrl {
  scheme: string;
  host: string;
  path: string;
  query: string;
  fragment: string;
}

const URL_RE = /^([a-z][a-z0-9+.-]*):(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i;

function splitUrl(url: string): RawUrl | null {
  const m = URL_RE.exec(url.trim());
  if (!m) return null;
  return {
    scheme: (m[1] ?? '').toLowerCase(),
    host: m[2] ?? '',
    path: m[3] ?? '',
    query: m[4] ?? '',
    fragment: m[5] ?? '',
  };
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

/** Minimal, dependency-free query parser (first occurrence wins, keys and values decoded). */
export function parseQueryString(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!query) return out;
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
    const key = safeDecode(rawKey);
    const value = safeDecode(rawValue);
    if (!key || value === null || key in out) continue;
    out[key] = value;
  }
  return out;
}

function hostOf(url: string): string {
  return (splitUrl(url)?.host ?? '').toLowerCase().replace(/:\d+$/, '');
}

function allowedUniversalHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const h of env.universalHosts) hosts.add(h.toLowerCase());
  const webHost = hostOf(env.webUrl);
  if (webHost) hosts.add(webHost);
  return hosts;
}

function appSchemes(): Set<string> {
  return new Set([env.appScheme.toLowerCase(), DEEP_LINK_SCHEME]);
}

/**
 * Extracts the in-app path (`/email/<id>`) and query from any supported URL form:
 *  - `dijitalasistan://email/<id>?x=1` and `dijitalasistan:///email/<id>`
 *  - `https://dijitalasistan.app/app/email/<id>`
 *  - `exp://192.168.1.4:8081/--/email/<id>` (Expo dev / Expo Go)
 */
function extractAppPath(raw: RawUrl): { path: string; query: string; fragment: string } | null {
  const isExpoDev = raw.scheme === 'exp' || raw.scheme === 'exps' || raw.scheme.startsWith('exp+');
  if (isExpoDev) {
    const idx = raw.path.indexOf('/--/');
    if (idx === -1) return null;
    return { path: raw.path.slice(idx + 3), query: raw.query, fragment: raw.fragment };
  }
  if (raw.scheme === 'https' || raw.scheme === 'http') {
    if (raw.scheme !== 'https') return null;
    const host = raw.host.toLowerCase().replace(/:\d+$/, '');
    if (!allowedUniversalHosts().has(host)) return null;
    if (raw.path === '/app' || raw.path === '/app/')
      return { path: '/today', query: raw.query, fragment: raw.fragment };
    if (!raw.path.startsWith('/app/')) return null;
    return { path: raw.path.slice(4), query: raw.query, fragment: raw.fragment };
  }
  if (appSchemes().has(raw.scheme)) {
    if (EXPO_DEV_HOSTS.has(raw.host.toLowerCase())) return null;
    const devIdx = raw.path.indexOf('/--/');
    if (devIdx !== -1)
      return { path: raw.path.slice(devIdx + 3), query: raw.query, fragment: raw.fragment };
    // `scheme://host/path` — the host is the first path segment; share-extension payloads (`dataUrl=`) fall through as unknown.
    const path = `/${raw.host}${raw.path}`.replace(/\/{2,}/g, '/');
    return { path, query: raw.query, fragment: raw.fragment };
  }
  return null;
}

function segmentsOf(path: string): string[] | null {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  if (!trimmed) return [];
  const segments: string[] = [];
  for (const seg of trimmed.split('/')) {
    const decoded = safeDecode(seg);
    if (
      decoded === null ||
      decoded === '' ||
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/')
    )
      return null;
    segments.push(decoded);
  }
  return segments;
}

function pick(
  query: Record<string, string>,
  key: string,
  validate: (v: string) => boolean,
): string | undefined {
  const v = query[key];
  if (v === undefined) return undefined;
  const trimmed = v.trim();
  return trimmed && validate(trimmed) ? trimmed : undefined;
}

function withParams(href: string, params: Record<string, string | undefined>): ParsedDeepLink {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined) clean[k] = v;
  return Object.keys(clean).length ? { href, params: clean } : { href };
}

const isFreeText = (v: string): boolean => v.length <= MAX_QUERY_TEXT;
const isFlag = (v: string): boolean => v === '1' || v === 'true';

function resolveRoute(segments: string[], query: Record<string, string>): ParsedDeepLink | null {
  const [s0, s1, s2] = segments;
  const len = segments.length;
  if (s0 === undefined) return { href: '/(tabs)/today' };

  switch (s0) {
    case 'today':
      return len === 1 ? { href: '/(tabs)/today' } : null;
    case 'flow':
      return len === 1
        ? withParams('/(tabs)/flow', {
            filter: pick(query, 'filter', (v) => (FLOW_FILTERS as readonly string[]).includes(v)),
          })
        : null;
    case 'plan':
      return len === 1
        ? withParams('/(tabs)/plan', { date: pick(query, 'date', (v) => ISO_DATE_RE.test(v)) })
        : null;
    case 'assistant':
      return len === 1
        ? withParams('/(tabs)/assistant', { q: pick(query, 'q', isFreeText) })
        : null;
    case 'briefing': {
      if (len !== 2 || s1 === undefined) return null;
      if (s1 === 'audio') {
        const id = pick(query, 'id', isValidEntityId);
        return id ? { href: '/briefing/audio', params: { id } } : null;
      }
      if (!(BRIEFING_KINDS as readonly string[]).includes(s1)) return null;
      return withParams(`/briefing/${s1}`, {
        id: pick(query, 'id', isValidEntityId),
        autoplay: pick(query, 'autoplay', isFlag) ? '1' : undefined,
      });
    }
    case 'email':
      if (s1 === undefined || !isValidEntityId(s1)) return null;
      if (len === 2) return { href: `/email/${s1}`, params: { id: s1 } };
      if (len === 3 && s2 === 'reply') return { href: `/email/${s1}/reply`, params: { id: s1 } };
      return null;
    case 'meeting':
      if (len !== 3 || s1 === undefined || !isValidEntityId(s1)) return null;
      if (s2 !== 'prep' && s2 !== 'post') return null;
      return { href: `/meeting/${s1}/${s2}`, params: { id: s1 } };
    case 'conflict':
    case 'person':
    case 'life':
      if (len !== 2 || s1 === undefined || !isValidEntityId(s1)) return null;
      return { href: `/${s0}/${s1}`, params: { id: s1 } };
    case 'approvals':
      if (len === 1) return { href: '/approvals' };
      if (len === 2 && s1 !== undefined && isValidEntityId(s1))
        return { href: `/approvals/${s1}`, params: { id: s1 } };
      return null;
    case 'followups':
    case 'waiting':
    case 'commitments':
      return len === 1 ? { href: `/${s0}` } : null;
    case 'capture':
      return len === 1 ? withParams('/capture', { id: pick(query, 'id', isValidEntityId) }) : null;
    case 'search':
      return len === 1 ? withParams('/search', { q: pick(query, 'q', isFreeText) }) : null;
    case 'settings':
      if (len === 1) return { href: '/settings' };
      if (len === 2 && s1 !== undefined && (SETTINGS_SECTIONS as readonly string[]).includes(s1))
        return { href: `/settings/${s1}` };
      return null;
    case 'paywall':
      return len === 1
        ? withParams('/paywall', {
            context: pick(query, 'context', (v) => PAYWALL_CONTEXT_RE.test(v)),
          })
        : null;
    case 'referral':
      return len === 1
        ? withParams('/referral', { code: pick(query, 'code', (v) => REFERRAL_CODE_RE.test(v)) })
        : null;
    case 'oauth': {
      if (len !== 2 || s1 === undefined || !(OAUTH_PROVIDERS as readonly string[]).includes(s1))
        return null;
      const state = pick(query, 'state', (v) => v.length <= 256);
      if (!state) return null;
      const error = pick(query, 'error', (v) => v.length <= 200);
      const accountId = pick(query, 'accountId', isValidEntityId);
      const status =
        query.status === 'error' || (error !== undefined && accountId === undefined)
          ? 'error'
          : 'ok';
      return withParams(`/oauth/${s1}`, { provider: s1, state, status, accountId, error });
    }
    case 'auth':
      return len === 2 && s1 === 'callback' ? withParams(AUTH_CALLBACK_HREF, query) : null;
    default:
      return null;
  }
}

/**
 * Parses any incoming URL into a route. Returns `null` for anything outside the DeepLinks contract
 * (unknown paths, foreign hosts, malformed ids, share-extension payload URLs, dev-client launch URLs).
 */
export function parseDeepLink(url: string | null | undefined): ParsedDeepLink | null {
  if (!url || url.length > 4096) return null;
  const raw = splitUrl(url);
  if (!raw) return null;
  const extracted = extractAppPath(raw);
  if (!extracted) return null;
  const segments = segmentsOf(extracted.path);
  if (!segments) return null;
  // Supabase returns tokens in the fragment for implicit flows; merge so the auth callback sees them.
  const query = { ...parseQueryString(extracted.fragment), ...parseQueryString(extracted.query) };
  return resolveRoute(segments, query);
}

export type DeepLinkKind = 'auth_callback' | 'oauth' | 'referral' | 'email' | 'route';

export function deepLinkKind(link: ParsedDeepLink): DeepLinkKind {
  if (link.href === AUTH_CALLBACK_HREF) return 'auth_callback';
  if (link.href.startsWith('/oauth/')) return 'oauth';
  if (link.href === '/referral') return 'referral';
  if (link.href.startsWith('/email/')) return 'email';
  return 'route';
}

export function briefingKindOf(link: ParsedDeepLink): BriefingKind | null {
  const m = /^\/briefing\/(morning|midday|evening|weekly)$/.exec(link.href);
  return m ? (m[1] as BriefingKind) : null;
}

export function flowFilterOf(link: ParsedDeepLink): FlowFilter | null {
  const f = link.params?.filter;
  return f && (FLOW_FILTERS as readonly string[]).includes(f) ? (f as FlowFilter) : null;
}

// ---------------------------------------------------------------------------
// Dispatcher — a process-wide queue so notification taps, share intents and widget taps can hand a URL
// to `useDeepLinks` even before the navigator (or the session) is ready.
// ---------------------------------------------------------------------------

type DeepLinkHandler = (url: string) => void;

const queue: string[] = [];
let handler: DeepLinkHandler | null = null;

/** Hands a URL to the active deep-link handler, or queues it until one is installed. */
export function openDeepLink(url: string): void {
  if (handler) {
    handler(url);
    return;
  }
  queue.push(url);
  if (queue.length > 20) queue.shift();
}

/** Installs (or removes with `null`) the handler; queued URLs are flushed immediately on install. */
export function setDeepLinkHandler(next: DeepLinkHandler | null): void {
  handler = next;
  if (!next) return;
  while (queue.length) {
    const url = queue.shift();
    if (url !== undefined) next(url);
  }
}

export function pendingDeepLinkCount(): number {
  return queue.length;
}
