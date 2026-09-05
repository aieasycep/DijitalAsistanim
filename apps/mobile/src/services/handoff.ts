/**
 * Hand-off to other apps (Gmail / Outlook, Meet / Teams / Zoom, Maps, WhatsApp, phone, generic links).
 * Builds an ordered candidate list (native scheme first, web fallback last), validates every URL against
 * an allow-list and opens the first one the device can handle. Nothing here performs a write on the user's
 * behalf — composing a mail hands the draft to the mail app; sending stays with the user.
 */
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import type { SourceRef } from '@da/domain';
import { mapsUrl, openExternal, providerMailUrl, telUrl } from '@/lib/openExternal';
import { captureError } from '@/lib/monitoring';

export type MeetingProvider = 'google_meet' | 'teams' | 'zoom' | 'other';
export type MailProvider = 'gmail' | 'outlook';

export type HandoffTarget =
  | { kind: 'url'; url: string }
  | { kind: 'email'; provider: MailProvider; webUrl?: string | null }
  | { kind: 'compose'; to: string[]; subject?: string; body?: string; provider?: MailProvider | 'system' }
  | { kind: 'meeting'; url: string }
  | { kind: 'directions'; location: string }
  | { kind: 'whatsapp'; text: string; phone?: string }
  | { kind: 'phone'; phone: string }
  | { kind: 'source'; source: Pick<SourceRef, 'url' | 'type'> };

export interface HandoffResult {
  ok: boolean;
  /** The URL that was opened (or attempted last). */
  url: string | null;
  reason?: 'invalid' | 'unavailable' | 'failed';
}

const ALLOWED_SCHEMES = new Set(['https', 'http', 'mailto', 'tel', 'sms', 'maps', 'geo', 'comgooglemaps', 'googlegmail', 'ms-outlook', 'msteams', 'zoomus', 'whatsapp', 'googlemeet']);
const URL_RE = /^([a-z][a-z0-9+.-]*):(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i;

function hostOf(url: string): string | null {
  const m = URL_RE.exec(url);
  if (!m) return null;
  const authority = m[2] ?? '';
  const host = authority.replace(/^[^@]*@/, '').replace(/:\d+$/, '').toLowerCase();
  return host || null;
}

function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host === '[::1]') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Allow-listed schemes only; web URLs need a public host; control characters are rejected. */
export function isSafeHandoffUrl(url: string | null | undefined): boolean {
  if (!url || url.length > 4096) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f]/.test(url)) return false;
  const m = URL_RE.exec(url);
  if (!m) return false;
  const scheme = (m[1] ?? '').toLowerCase();
  if (!ALLOWED_SCHEMES.has(scheme)) return false;
  if (scheme === 'https' || scheme === 'http') {
    const host = hostOf(url);
    if (!host || !host.includes('.') || isPrivateHost(host)) return false;
  }
  return true;
}

export function detectMeetingProvider(url: string | null | undefined): MeetingProvider {
  const host = url ? (hostOf(url) ?? '') : '';
  if (host === 'meet.google.com') return 'google_meet';
  if (host === 'teams.microsoft.com' || host === 'teams.live.com' || host.endsWith('.teams.microsoft.com')) return 'teams';
  if (host === 'zoom.us' || host.endsWith('.zoom.us') || host === 'zoom.com' || host.endsWith('.zoom.com')) return 'zoom';
  return 'other';
}

const LINK_RE = /https?:\/\/[^\s<>"'`)\]]+/gi;

/** First known-provider meeting link found in the given texts (falls back to the first https link). */
export function extractMeetingUrl(texts: (string | null | undefined)[]): string | null {
  let fallback: string | null = null;
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.match(LINK_RE) ?? []) {
      const cleaned = match.replace(/[.,;]+$/, '');
      if (!isSafeHandoffUrl(cleaned)) continue;
      if (detectMeetingProvider(cleaned) !== 'other') return cleaned;
      fallback = fallback ?? cleaned;
    }
  }
  return fallback;
}

const enc = encodeURIComponent;

function mailtoUrl(to: string[], subject?: string, body?: string): string {
  const q: string[] = [];
  if (subject) q.push(`subject=${enc(subject)}`);
  if (body) q.push(`body=${enc(body)}`);
  return `mailto:${to.map((t) => t.trim()).filter(Boolean).join(',')}${q.length ? `?${q.join('&')}` : ''}`;
}

function meetingCandidates(url: string): string[] {
  const provider = detectMeetingProvider(url);
  const m = URL_RE.exec(url);
  const path = m?.[3] ?? '';
  const query = m?.[4] ? `?${m[4]}` : '';
  const out: string[] = [];
  if (provider === 'teams') out.push(`msteams:${path}${query}`);
  if (provider === 'zoom') {
    const id = /\/j\/(\d+)/.exec(path)?.[1];
    const pwd = /(?:^|[?&])pwd=([^&]+)/.exec(m?.[4] ?? '')?.[1];
    if (id) out.push(`zoomus://zoom.us/join?confno=${id}${pwd ? `&pwd=${pwd}` : ''}`);
  }
  out.push(url);
  return out;
}

/** Ordered candidates for a target: native app schemes first, a web fallback last. Invalid URLs are dropped. */
export function buildHandoffUrls(target: HandoffTarget): string[] {
  const list: string[] = [];
  switch (target.kind) {
    case 'url':
      list.push(target.url);
      break;
    case 'email':
      if (target.webUrl) list.push(target.webUrl);
      else list.push(target.provider === 'gmail' ? 'googlegmail://' : 'ms-outlook://', providerMailUrl(null, target.provider));
      break;
    case 'compose': {
      const to = target.to.map((t) => t.trim()).filter(Boolean);
      const q = [`to=${enc(to.join(','))}`];
      if (target.subject) q.push(`subject=${enc(target.subject)}`);
      if (target.body) q.push(`body=${enc(target.body)}`);
      if (target.provider === 'gmail') list.push(`googlegmail:///co?${q.join('&')}`);
      if (target.provider === 'outlook') list.push(`ms-outlook://compose?${q.join('&')}`);
      list.push(mailtoUrl(to, target.subject, target.body));
      break;
    }
    case 'meeting':
      list.push(...meetingCandidates(target.url));
      break;
    case 'directions': {
      const q = enc(target.location);
      if (Platform.OS === 'ios') list.push(`comgooglemaps://?q=${q}`);
      list.push(mapsUrl(target.location), `https://maps.google.com/?q=${q}`);
      break;
    }
    case 'whatsapp': {
      const phone = target.phone ? target.phone.replace(/[^\d]/g, '') : '';
      list.push(`whatsapp://send?text=${enc(target.text)}${phone ? `&phone=${phone}` : ''}`, `https://wa.me/${phone}?text=${enc(target.text)}`);
      break;
    }
    case 'phone':
      list.push(telUrl(target.phone));
      break;
    case 'source':
      if (target.source.url) list.push(target.source.url);
      break;
    default:
      break;
  }
  return list.filter(isSafeHandoffUrl);
}

/** Opens the first candidate the device can handle. Web URLs open in the in-app browser. */
export async function openHandoff(target: HandoffTarget): Promise<HandoffResult> {
  const candidates = buildHandoffUrls(target);
  if (!candidates.length) return { ok: false, url: null, reason: 'invalid' };
  let last: string | null = null;
  for (const url of candidates) {
    last = url;
    const isWeb = /^https?:/i.test(url);
    try {
      if (isWeb) {
        const ok = await openExternal(url);
        return ok ? { ok: true, url } : { ok: false, url, reason: 'failed' };
      }
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return { ok: true, url };
      }
    } catch (e) {
      captureError(e, { where: 'openHandoff', scheme: url.split(':')[0] });
    }
  }
  return { ok: false, url: last, reason: 'unavailable' };
}

/** Opens the OS settings page for this app (permission recovery). */
export async function openAppSettings(): Promise<boolean> {
  try {
    await Linking.openSettings();
    return true;
  } catch (e) {
    captureError(e, { where: 'openAppSettings' });
    return false;
  }
}
