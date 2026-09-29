/**
 * Deep link routes shared by push payloads, widgets, share extensions, web fallbacks and expo-router.
 * Scheme: dijitalasistan://  ·  Universal: https://dijitalasistan.app/app/<path>
 */
export const DEEP_LINK_SCHEME = 'dijitalasistan';

export const DeepLinks = {
  today: () => '/today',
  flow: (filter?: string) => (filter ? `/flow?filter=${encodeURIComponent(filter)}` : '/flow'),
  plan: (date?: string) => (date ? `/plan?date=${date}` : '/plan'),
  assistant: (q?: string) => (q ? `/assistant?q=${encodeURIComponent(q)}` : '/assistant'),
  briefing: (kind: 'morning' | 'midday' | 'evening' | 'weekly', id?: string) =>
    id ? `/briefing/${kind}?id=${id}` : `/briefing/${kind}`,
  briefingAudio: (id: string) => `/briefing/audio?id=${id}`,
  email: (id: string) => `/email/${id}`,
  emailReply: (id: string) => `/email/${id}/reply`,
  meetingPrep: (eventId: string) => `/meeting/${eventId}/prep`,
  postMeeting: (eventId: string) => `/meeting/${eventId}/post`,
  conflict: (id: string) => `/conflict/${id}`,
  person: (id: string) => `/person/${id}`,
  approvals: () => '/approvals',
  approval: (id: string) => `/approvals/${id}`,
  followUps: () => '/followups',
  waiting: () => '/waiting',
  commitments: () => '/commitments',
  lifeEvent: (id: string) => `/life/${id}`,
  capture: (captureId?: string) => (captureId ? `/capture?id=${captureId}` : '/capture'),
  search: (q?: string) => (q ? `/search?q=${encodeURIComponent(q)}` : '/search'),
  settings: (section?: string) => (section ? `/settings/${section}` : '/settings'),
  paywall: (context?: string) =>
    context ? `/paywall?context=${encodeURIComponent(context)}` : '/paywall',
  referral: (code?: string) => (code ? `/referral?code=${encodeURIComponent(code)}` : '/referral'),
  oauthCallback: (provider: string) => `/oauth/${provider}`,
} as const;

export function toSchemeUrl(path: string): string {
  return `${DEEP_LINK_SCHEME}://${path.replace(/^\//, '')}`;
}

export function toUniversalUrl(webBase: string, path: string): string {
  return `${webBase.replace(/\/$/, '')}/app${path.startsWith('/') ? path : `/${path}`}`;
}
