/**
 * Least-privilege scope groups for Google and Microsoft data-source connections.
 *
 * Read scopes are granted per requested kind (email / calendar / tasks); write scopes are
 * requested only through progressive authorization right before an approved action needs them.
 */
import type { ApprovalActionType, OAuthStartRequest } from '@da/domain';

export type OAuthProvider = OAuthStartRequest['provider'];
export type OAuthKind = OAuthStartRequest['kinds'][number];
export type OAuthScopeGroup = NonNullable<OAuthStartRequest['scopeGroup']>;

export const OAUTH_PROVIDERS = ['google', 'microsoft'] as const satisfies readonly OAuthProvider[];
export const OAUTH_KINDS = ['email', 'calendar', 'tasks'] as const satisfies readonly OAuthKind[];
export const OAUTH_SCOPE_GROUPS = [
  'read',
  'mail_send',
  'calendar_write',
  'tasks_write',
] as const satisfies readonly OAuthScopeGroup[];

export const GOOGLE_SCOPES = {
  openid: 'openid',
  email: 'email',
  profile: 'profile',
  gmailReadonly: 'https://www.googleapis.com/auth/gmail.readonly',
  gmailSend: 'https://www.googleapis.com/auth/gmail.send',
  calendarReadonly: 'https://www.googleapis.com/auth/calendar.readonly',
  calendarEvents: 'https://www.googleapis.com/auth/calendar.events',
  tasksReadonly: 'https://www.googleapis.com/auth/tasks.readonly',
  tasks: 'https://www.googleapis.com/auth/tasks',
} as const;

export const MICROSOFT_SCOPES = {
  openid: 'openid',
  email: 'email',
  profile: 'profile',
  offlineAccess: 'offline_access',
  userRead: 'User.Read',
  mailRead: 'Mail.Read',
  mailSend: 'Mail.Send',
  calendarsRead: 'Calendars.Read',
  calendarsReadWrite: 'Calendars.ReadWrite',
  tasksRead: 'Tasks.Read',
  tasksReadWrite: 'Tasks.ReadWrite',
} as const;

const GOOGLE_READ_BY_KIND: Record<OAuthKind, string> = {
  email: GOOGLE_SCOPES.gmailReadonly,
  calendar: GOOGLE_SCOPES.calendarReadonly,
  tasks: GOOGLE_SCOPES.tasksReadonly,
};

const MICROSOFT_READ_BY_KIND: Record<OAuthKind, string> = {
  email: MICROSOFT_SCOPES.mailRead,
  calendar: MICROSOFT_SCOPES.calendarsRead,
  tasks: MICROSOFT_SCOPES.tasksRead,
};

const WRITE_SCOPES: Record<OAuthProvider, Record<Exclude<OAuthScopeGroup, 'read'>, string>> = {
  google: {
    mail_send: GOOGLE_SCOPES.gmailSend,
    calendar_write: GOOGLE_SCOPES.calendarEvents,
    tasks_write: GOOGLE_SCOPES.tasks,
  },
  microsoft: {
    mail_send: MICROSOFT_SCOPES.mailSend,
    calendar_write: MICROSOFT_SCOPES.calendarsReadWrite,
    tasks_write: MICROSOFT_SCOPES.tasksReadWrite,
  },
};

/** Identity scopes: Google needs openid/email/profile for the id_token; Microsoft likewise plus offline_access for refresh tokens. */
function baseScopes(provider: OAuthProvider): string[] {
  return provider === 'google'
    ? [GOOGLE_SCOPES.openid, GOOGLE_SCOPES.email, GOOGLE_SCOPES.profile]
    : [
        MICROSOFT_SCOPES.openid,
        MICROSOFT_SCOPES.email,
        MICROSOFT_SCOPES.profile,
        MICROSOFT_SCOPES.offlineAccess,
        MICROSOFT_SCOPES.userRead,
      ];
}

/** Read scopes for the given kinds (always includes the identity base). */
export function readScopesFor(provider: OAuthProvider, kinds: readonly OAuthKind[]): string[] {
  const byKind = provider === 'google' ? GOOGLE_READ_BY_KIND : MICROSOFT_READ_BY_KIND;
  const out = [...baseScopes(provider)];
  for (const kind of OAUTH_KINDS) if (kinds.includes(kind)) out.push(byKind[kind]);
  return out;
}

export function writeScopeFor(
  provider: OAuthProvider,
  group: Exclude<OAuthScopeGroup, 'read'>,
): string {
  return WRITE_SCOPES[provider][group];
}

export interface ScopesForInput {
  provider: OAuthProvider;
  kinds: readonly OAuthKind[];
  /** Scope groups wanted in the resulting token; 'read' is implied. */
  groups?: readonly OAuthScopeGroup[];
}

/** Full, de-duplicated scope list to request (read for kinds + requested write groups). */
export function scopesFor(input: ScopesForInput): string[] {
  const scopes = readScopesFor(input.provider, input.kinds);
  for (const group of input.groups ?? []) {
    if (group === 'read') continue;
    scopes.push(writeScopeFor(input.provider, group));
  }
  return uniqueScopes(scopes);
}

export function uniqueScopes(scopes: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of scopes) {
    const trimmed = s.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** Normalize a scope for comparison: trim, drop Graph resource prefix, lowercase. */
export function normalizeScope(scope: string): string {
  return scope
    .trim()
    .replace(/^https:\/\/graph\.microsoft\.com\//i, '')
    .replace(/^https:\/\/outlook\.office\.com\//i, '')
    .toLowerCase();
}

/** Broader scopes that imply narrower ones (normalized form). */
const SCOPE_IMPLICATIONS: Record<string, readonly string[]> = {
  'https://mail.google.com/': [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.compose',
  ],
  'https://www.googleapis.com/auth/gmail.modify': [
    'https://www.googleapis.com/auth/gmail.readonly',
  ],
  'https://www.googleapis.com/auth/calendar': [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.events.readonly',
  ],
  'https://www.googleapis.com/auth/calendar.events': [
    'https://www.googleapis.com/auth/calendar.events.readonly',
  ],
  'https://www.googleapis.com/auth/calendar.readonly': [
    'https://www.googleapis.com/auth/calendar.events.readonly',
  ],
  'https://www.googleapis.com/auth/tasks': ['https://www.googleapis.com/auth/tasks.readonly'],
  'mail.readwrite': ['mail.read'],
  'calendars.readwrite': ['calendars.read'],
  'tasks.readwrite': ['tasks.read'],
  'user.readwrite': ['user.read'],
};

function expandGranted(granted: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of granted) {
    const scope = normalizeScope(raw);
    if (!scope) continue;
    out.add(scope);
    for (const implied of SCOPE_IMPLICATIONS[scope] ?? []) out.add(implied);
  }
  return out;
}

/** True when every required scope is granted directly or implied by a broader granted scope. */
export function scopeSatisfies(
  granted: readonly string[],
  required: string | readonly string[],
): boolean {
  const have = expandGranted(granted);
  const need = typeof required === 'string' ? required.split(/\s+/) : required;
  return need.every((r) => {
    const scope = normalizeScope(r);
    return scope === '' || have.has(scope);
  });
}

/** Scopes from `required` that are not covered by `granted`. */
export function missingScopes(granted: readonly string[], required: readonly string[]): string[] {
  const have = expandGranted(granted);
  return uniqueScopes(required.filter((r) => !have.has(normalizeScope(r))));
}

/** Which progressive-auth group an approval action needs; null for internal-only actions. */
export function scopeGroupFor(
  actionType: ApprovalActionType,
): Exclude<OAuthScopeGroup, 'read'> | null {
  switch (actionType) {
    case 'email_send':
      return 'mail_send';
    case 'calendar_create':
    case 'calendar_update':
      return 'calendar_write';
    case 'task_create':
      return 'tasks_write';
    case 'reminder_create':
    case 'commitment_create':
      return null;
  }
}

/** Provider scope string an approved action needs before execution; null when none. */
export function requiredScopeFor(
  actionType: ApprovalActionType,
  provider: OAuthProvider,
): string | null {
  const group = scopeGroupFor(actionType);
  return group ? writeScopeFor(provider, group) : null;
}

/** Parse a provider's space-separated `scope` response field. */
export function parseScopeString(scope: string | null | undefined): string[] {
  return scope ? uniqueScopes(scope.split(/[\s,]+/)) : [];
}
