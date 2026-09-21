/** Outbound URL policy for user-supplied links (Universal Capture). */
import { classifyIp, isIpLiteral, type BlockedIpReason } from './ip';

export type SafeFetchRejectReason =
  | 'invalid_url'
  | 'unsupported_scheme'
  | 'credentials_in_url'
  | 'blocked_host'
  | 'blocked_ip'
  | 'blocked_port'
  | 'dns_failed'
  | 'dns_blocked'
  | 'too_many_redirects'
  | 'redirect_missing_location'
  | 'timeout'
  | 'too_large'
  | 'unsupported_content_type'
  | 'http_error'
  | 'network_error';

export interface UrlPolicy {
  /** Ports allowed besides the scheme default. Default: 80 and 443. */
  allowedPorts?: number[];
  /** Extra hostname suffixes to block (lowercase, with or without leading dot). */
  blockedHostSuffixes?: string[];
}

export const DEFAULT_ALLOWED_PORTS = [80, 443] as const;

/** Names that only make sense inside a private network. */
const BLOCKED_HOST_SUFFIXES = [
  'localhost',
  'localhost.localdomain',
  'local',
  'internal',
  'localdomain',
  'intranet',
  'lan',
  'home',
  'corp',
  'private',
  'arpa',
  'onion',
  'test',
  'example',
  'invalid',
];

/** Bare names cloud providers expose for instance metadata. */
const BLOCKED_HOST_NAMES = ['metadata', 'instance-data', 'metadata.google.internal', 'kubernetes'];

export type UrlValidation =
  | { ok: true; url: URL; hostname: string; port: number; isIpLiteral: boolean }
  | { ok: false; reason: SafeFetchRejectReason; message: string; ipReason?: BlockedIpReason };

function normalizeHostname(raw: string): string {
  let host = raw.toLowerCase();
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  return host;
}

function hasBlockedSuffix(host: string, suffixes: string[]): boolean {
  return suffixes.some((s) => {
    const suffix = s.startsWith('.') ? s.slice(1) : s;
    return host === suffix || host.endsWith(`.${suffix}`);
  });
}

export function isBlockedHostname(host: string, extraSuffixes: string[] = []): boolean {
  if (BLOCKED_HOST_NAMES.includes(host)) return true;
  if (hasBlockedSuffix(host, [...BLOCKED_HOST_SUFFIXES, ...extraSuffixes])) return true;
  // Single-label names (no dot) resolve via search domains inside a VPC — never public.
  if (!host.includes('.')) return true;
  return false;
}

function effectivePort(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

/**
 * Validate a user-supplied URL against the SSRF policy. Rejects non-http(s) schemes, embedded
 * credentials, loopback/private/link-local/CGNAT/multicast IPv4 & IPv6 literals (including
 * mapped/NAT64/6to4 forms), intranet-looking hostnames and unexpected ports.
 */
export function validateOutboundUrl(input: string | URL, policy: UrlPolicy = {}): UrlValidation {
  let url: URL;
  try {
    url = typeof input === 'string' ? new URL(input.trim()) : new URL(input.href);
  } catch {
    return { ok: false, reason: 'invalid_url', message: 'Bağlantı adresi geçersiz.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      reason: 'unsupported_scheme',
      message: 'Sadece http ve https bağlantıları açılabilir.',
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      reason: 'credentials_in_url',
      message: 'Kullanıcı bilgisi içeren bağlantılar açılamaz.',
    };
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) return { ok: false, reason: 'invalid_url', message: 'Bağlantı adresi geçersiz.' };

  const ip = classifyIp(hostname);
  if (ip) {
    if (ip.blocked) {
      return {
        ok: false,
        reason: 'blocked_ip',
        message: 'Bu adres yerel bir ağa işaret ediyor, açılamaz.',
        ipReason: ip.reason,
      };
    }
  } else if (isBlockedHostname(hostname, policy.blockedHostSuffixes)) {
    return {
      ok: false,
      reason: 'blocked_host',
      message: 'Bu adres yerel bir ağa işaret ediyor, açılamaz.',
    };
  }

  const port = effectivePort(url);
  const allowedPorts = policy.allowedPorts ?? [...DEFAULT_ALLOWED_PORTS];
  if (!allowedPorts.includes(port)) {
    return { ok: false, reason: 'blocked_port', message: 'Bu bağlantı noktası desteklenmiyor.' };
  }

  url.hash = '';
  return { ok: true, url, hostname, port, isIpLiteral: isIpLiteral(hostname) };
}

/** Validate every address a resolver returned for a hostname; any blocked address rejects. */
export function validateResolvedAddresses(
  addresses: string[],
): { ok: true } | { ok: false; reason: SafeFetchRejectReason; message: string; address?: string } {
  if (addresses.length === 0) {
    return { ok: false, reason: 'dns_failed', message: 'Adres çözümlenemedi.' };
  }
  for (const address of addresses) {
    const ip = classifyIp(address);
    if (!ip || ip.blocked) {
      return {
        ok: false,
        reason: 'dns_blocked',
        message: 'Bu adres yerel bir ağa işaret ediyor, açılamaz.',
        address,
      };
    }
  }
  return { ok: true };
}
