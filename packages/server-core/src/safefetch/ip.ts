/**
 * IP literal parsing and "is this address safe to talk to?" classification.
 * Everything that is not a globally routable unicast address is blocked.
 */

export type BlockedIpReason =
  | 'loopback'
  | 'private'
  | 'link_local'
  | 'cgnat'
  | 'multicast'
  | 'unspecified'
  | 'reserved'
  | 'documentation'
  | 'unique_local'
  | 'site_local'
  | 'ipv4_mapped'
  | 'nat64'
  | 'tunnel';

export interface IpClassification {
  version: 4 | 6;
  blocked: boolean;
  reason?: BlockedIpReason;
}

export function parseIPv4(text: string): number[] | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/** Returns eight 16-bit groups, or null when the text is not a valid IPv6 literal. */
export function parseIPv6(text: string): number[] | null {
  let input = text.trim();
  if (input.startsWith('[') && input.endsWith(']')) input = input.slice(1, -1);
  const zone = input.indexOf('%');
  if (zone >= 0) input = input.slice(0, zone);
  if (input.length === 0 || !/^[0-9a-fA-F:.]+$/.test(input)) return null;

  // Embedded IPv4 in the last 32 bits (::ffff:1.2.3.4, 64:ff9b::1.2.3.4).
  const lastColon = input.lastIndexOf(':');
  const tail = input.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    const [a, b, c, d] = v4 as [number, number, number, number];
    const hi = ((a << 8) | b).toString(16);
    const lo = ((c << 8) | d).toString(16);
    input = `${input.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const doubleColon = input.indexOf('::');
  if (doubleColon !== input.lastIndexOf('::')) return null;

  const toGroups = (s: string): number[] | null => {
    if (s === '') return [];
    const out: number[] = [];
    for (const g of s.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(Number.parseInt(g, 16));
    }
    return out;
  };

  if (doubleColon >= 0) {
    const head = toGroups(input.slice(0, doubleColon));
    const rest = toGroups(input.slice(doubleColon + 2));
    if (!head || !rest || head.length + rest.length > 7) return null;
    return [...head, ...new Array<number>(8 - head.length - rest.length).fill(0), ...rest];
  }
  const groups = toGroups(input);
  return groups && groups.length === 8 ? groups : null;
}

function v4InRange(octets: number[], base: number[], prefix: number): boolean {
  const value = octets.reduce((acc, o) => ((acc << 8) | o) >>> 0, 0);
  const baseValue = base.reduce((acc, o) => ((acc << 8) | o) >>> 0, 0);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) >>> 0 === (baseValue & mask) >>> 0;
}

const IPV4_BLOCKLIST: { base: number[]; prefix: number; reason: BlockedIpReason }[] = [
  { base: [0, 0, 0, 0], prefix: 8, reason: 'unspecified' },
  { base: [10, 0, 0, 0], prefix: 8, reason: 'private' },
  { base: [100, 64, 0, 0], prefix: 10, reason: 'cgnat' },
  { base: [127, 0, 0, 0], prefix: 8, reason: 'loopback' },
  { base: [169, 254, 0, 0], prefix: 16, reason: 'link_local' },
  { base: [172, 16, 0, 0], prefix: 12, reason: 'private' },
  { base: [192, 0, 0, 0], prefix: 24, reason: 'reserved' },
  { base: [192, 0, 2, 0], prefix: 24, reason: 'documentation' },
  { base: [192, 88, 99, 0], prefix: 24, reason: 'tunnel' },
  { base: [192, 168, 0, 0], prefix: 16, reason: 'private' },
  { base: [198, 18, 0, 0], prefix: 15, reason: 'reserved' },
  { base: [198, 51, 100, 0], prefix: 24, reason: 'documentation' },
  { base: [203, 0, 113, 0], prefix: 24, reason: 'documentation' },
  { base: [224, 0, 0, 0], prefix: 4, reason: 'multicast' },
  { base: [240, 0, 0, 0], prefix: 4, reason: 'reserved' },
];

export function classifyIPv4(octets: number[]): IpClassification {
  for (const entry of IPV4_BLOCKLIST) {
    if (v4InRange(octets, entry.base, entry.prefix)) {
      return { version: 4, blocked: true, reason: entry.reason };
    }
  }
  return { version: 4, blocked: false };
}

function v4FromGroups(groups: number[], offset: number): number[] {
  const hi = groups[offset] ?? 0;
  const lo = groups[offset + 1] ?? 0;
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
}

export function classifyIPv6(groups: number[]): IpClassification {
  const g = (i: number) => groups[i] ?? 0;
  const allZeroUntil = (end: number) => groups.slice(0, end).every((x) => x === 0);

  if (groups.every((x) => x === 0)) return { version: 6, blocked: true, reason: 'unspecified' };
  if (allZeroUntil(7) && g(7) === 1) return { version: 6, blocked: true, reason: 'loopback' };

  // ::ffff:a.b.c.d (IPv4-mapped) and ::a.b.c.d (IPv4-compatible): judge the embedded IPv4.
  if (allZeroUntil(5) && (g(5) === 0xffff || g(5) === 0)) {
    const inner = classifyIPv4(v4FromGroups(groups, 6));
    return { version: 6, blocked: true, reason: inner.blocked ? inner.reason : 'ipv4_mapped' };
  }
  // 64:ff9b::/96 (NAT64) and 64:ff9b:1::/48 (local NAT64).
  if (g(0) === 0x64 && g(1) === 0xff9b) {
    if (g(2) === 1) return { version: 6, blocked: true, reason: 'nat64' };
    const inner = classifyIPv4(v4FromGroups(groups, 6));
    return inner.blocked
      ? { version: 6, blocked: true, reason: 'nat64' }
      : { version: 6, blocked: false };
  }
  // 2002::/16 (6to4): embedded IPv4 in groups 1-2.
  if (g(0) === 0x2002) {
    const inner = classifyIPv4(v4FromGroups(groups, 1));
    return inner.blocked
      ? { version: 6, blocked: true, reason: 'tunnel' }
      : { version: 6, blocked: false };
  }
  if ((g(0) & 0xfe00) === 0xfc00) return { version: 6, blocked: true, reason: 'unique_local' };
  if ((g(0) & 0xffc0) === 0xfe80) return { version: 6, blocked: true, reason: 'link_local' };
  if ((g(0) & 0xffc0) === 0xfec0) return { version: 6, blocked: true, reason: 'site_local' };
  if ((g(0) & 0xff00) === 0xff00) return { version: 6, blocked: true, reason: 'multicast' };
  if (g(0) === 0x2001 && g(1) === 0x0db8)
    return { version: 6, blocked: true, reason: 'documentation' };
  if (g(0) === 0x2001 && g(1) === 0) return { version: 6, blocked: true, reason: 'tunnel' }; // Teredo
  if (g(0) === 0x2001 && (g(1) & 0xfff0) === 0x0010)
    return { version: 6, blocked: true, reason: 'reserved' }; // ORCHID
  if (g(0) === 0x0100 && g(1) === 0 && g(2) === 0 && g(3) === 0)
    return { version: 6, blocked: true, reason: 'reserved' }; // discard
  return { version: 6, blocked: false };
}

/** Classify an IP literal; returns null when the text is not an IP address at all. */
export function classifyIp(text: string): IpClassification | null {
  const v4 = parseIPv4(text);
  if (v4) return classifyIPv4(v4);
  const v6 = parseIPv6(text);
  if (v6) return classifyIPv6(v6);
  return null;
}

export function isIpLiteral(text: string): boolean {
  return classifyIp(text) !== null;
}
