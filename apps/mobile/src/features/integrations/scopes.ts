/**
 * Helpers over `ConnectedAccount` for the Integrations / Data Source Control screens: OAuth vs device
 * accounts, which progressive write scopes (mail send, calendar write, tasks write) are granted or still
 * missing, provider tile key, and status → badge tone.
 */
import type { BadgeTone } from '@da/design-tokens';
import type { ConnectedAccount, ConnectionStatus, DataSourceControls } from '@da/domain';
import type { ProviderCardKey } from '@/features/onboarding/ProviderCard';

export type WriteScopeGroup = 'mail_send' | 'calendar_write' | 'tasks_write';
export type OAuthProvider = 'google' | 'microsoft';
export type OAuthKind = 'email' | 'calendar' | 'tasks';

export type ControlGroup = 'mail' | 'calendar' | 'tasks';

export const WRITE_SCOPE_GROUPS: readonly WriteScopeGroup[] = [
  'mail_send',
  'calendar_write',
  'tasks_write',
];

/** Lower-cased scope strings (or suffixes) that prove a write scope group was granted. */
const SCOPE_MARKERS: Record<WriteScopeGroup, readonly string[]> = {
  mail_send: ['/auth/gmail.send', '/auth/gmail.modify', 'https://mail.google.com/', 'mail.send'],
  calendar_write: ['/auth/calendar.events', '/auth/calendar', 'calendars.readwrite'],
  tasks_write: ['/auth/tasks', 'tasks.readwrite'],
};

const KIND_TO_GROUP: Record<OAuthKind, WriteScopeGroup> = {
  email: 'mail_send',
  calendar: 'calendar_write',
  tasks: 'tasks_write',
};

export const CONTROL_GROUPS: Record<ControlGroup, readonly (keyof DataSourceControls)[]> = {
  mail: ['readEmail', 'analyzeAttachments', 'detectDeadlines', 'prepareDrafts'],
  calendar: ['readEvents', 'suggestSchedule', 'createEventsWithApproval'],
  tasks: ['readTasks'],
};

export function isLiveAccount(account: ConnectedAccount): boolean {
  return !account.deletedAt && account.status !== 'disconnected';
}

export function isOAuthAccount(account: ConnectedAccount): boolean {
  return account.provider === 'google' || account.provider === 'microsoft';
}

export function isDeviceAccount(account: ConnectedAccount): boolean {
  return account.provider === 'apple' || account.provider === 'device';
}

export function oauthProviderOf(account: ConnectedAccount): OAuthProvider | null {
  return account.provider === 'google' || account.provider === 'microsoft'
    ? account.provider
    : null;
}

export function oauthKindsOf(account: ConnectedAccount): OAuthKind[] {
  return account.kinds.filter(
    (k): k is OAuthKind => k === 'email' || k === 'calendar' || k === 'tasks',
  );
}

export function hasWriteScope(account: ConnectedAccount, group: WriteScopeGroup): boolean {
  const markers = SCOPE_MARKERS[group];
  return account.grantedScopes.some((raw) => {
    const scope = raw.trim().toLowerCase();
    return markers.some((m) => scope === m || scope.endsWith(m));
  });
}

/** Write scope groups that make sense for this account's kinds (OAuth providers only). */
export function writeGroupsFor(account: ConnectedAccount): WriteScopeGroup[] {
  if (!isOAuthAccount(account)) return [];
  return oauthKindsOf(account).map((k) => KIND_TO_GROUP[k]);
}

export function grantedWriteGroups(account: ConnectedAccount): WriteScopeGroup[] {
  return writeGroupsFor(account).filter((g) => hasWriteScope(account, g));
}

export function missingWriteGroups(account: ConnectedAccount): WriteScopeGroup[] {
  return writeGroupsFor(account).filter((g) => !hasWriteScope(account, g));
}

/** The next write scope to request through progressive OAuth, or null when everything is granted. */
export function nextWriteGroup(account: ConnectedAccount): WriteScopeGroup | null {
  return missingWriteGroups(account)[0] ?? null;
}

export function needsReconnect(account: ConnectedAccount): boolean {
  return account.status === 'expired' || account.status === 'revoked' || account.status === 'error';
}

export function statusTone(status: ConnectionStatus): BadgeTone {
  switch (status) {
    case 'active':
      return 'approved';
    case 'syncing':
      return 'calendar';
    case 'disconnected':
      return 'neutral';
    default:
      return 'critical';
  }
}

/** Provider tile / label key shared with the onboarding cards. */
export function providerCardKeyFor(account: ConnectedAccount): ProviderCardKey {
  const hasEmail = account.kinds.includes('email');
  switch (account.provider) {
    case 'google':
      return hasEmail ? 'gmail' : 'google_calendar';
    case 'microsoft':
      return hasEmail ? 'outlook' : 'microsoft_calendar';
    case 'apple':
      return 'apple_calendar';
    default:
      return 'device_calendar';
  }
}

/** Control groups an account exposes on the Data Source Control screen, by its kinds. */
export function controlGroupsFor(account: ConnectedAccount): ControlGroup[] {
  const groups: ControlGroup[] = [];
  if (account.kinds.includes('email')) groups.push('mail');
  if (account.kinds.includes('calendar')) groups.push('calendar');
  if (account.kinds.includes('tasks')) groups.push('tasks');
  return groups;
}
