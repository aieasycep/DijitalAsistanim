/** Meeting-link detection shared by the calendar normalisers. */
import type { CalendarEvent } from '@da/domain';

export type MeetingProvider = NonNullable<CalendarEvent['meetingProvider']>;

export interface MeetingLink {
  url: string;
  provider: MeetingProvider;
}

const PATTERNS: { provider: MeetingProvider; pattern: RegExp }[] = [
  {
    provider: 'google_meet',
    pattern: /https?:\/\/meet\.google\.com\/[a-z0-9-]+(?:\?[^\s<>"']*)?/i,
  },
  {
    provider: 'teams',
    pattern:
      /https?:\/\/(?:teams\.microsoft\.com\/l\/meetup-join|teams\.live\.com\/meet)\/[^\s<>"']+/i,
  },
  { provider: 'zoom', pattern: /https?:\/\/[a-z0-9.-]*zoom\.us\/(?:j|my|s|w)\/[^\s<>"']+/i },
  {
    provider: 'other',
    pattern:
      /https?:\/\/(?:[a-z0-9.-]*webex\.com|whereby\.com|meet\.jit\.si|[a-z0-9.-]*gotomeeting\.com|app\.around\.co)\/[^\s<>"']+/i,
  },
];

/** First recognised conference link in the given texts (location, description, dedicated fields). */
export function detectMeetingLink(
  ...candidates: (string | null | undefined)[]
): MeetingLink | null {
  for (const text of candidates) {
    if (!text) continue;
    for (const { provider, pattern } of PATTERNS) {
      const match = pattern.exec(text);
      if (match) return { url: match[0].replace(/[.,;)]+$/, ''), provider };
    }
  }
  return null;
}

/** Provider of a known conference URL (for links supplied by the provider API itself). */
export function meetingProviderFor(url: string): MeetingProvider {
  return detectMeetingLink(url)?.provider ?? 'other';
}
