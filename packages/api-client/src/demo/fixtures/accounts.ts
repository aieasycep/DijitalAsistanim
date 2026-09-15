import type { ConnectedAccount, DataSourceControls } from '@da/domain';
import { ACCOUNT_DEVICE, ACCOUNT_GMAIL } from '../ids';
import type { FixtureContext } from './types';

export const DEFAULT_CONTROLS: DataSourceControls = {
  readEmail: true,
  analyzeAttachments: true,
  detectDeadlines: true,
  prepareDrafts: true,
  readEvents: true,
  suggestSchedule: true,
  createEventsWithApproval: true,
  readTasks: true,
};

export const GOOGLE_READ_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

export function buildAccounts(f: FixtureContext): ConnectedAccount[] {
  return [
    {
      id: ACCOUNT_GMAIL,
      userId: f.userId,
      provider: 'google',
      kinds: ['email', 'calendar', 'tasks'],
      externalAccountId: f.email,
      displayName: `Gmail · ${f.email}`,
      email: f.email,
      status: 'active',
      grantedScopes: [...GOOGLE_READ_SCOPES],
      controls: { ...DEFAULT_CONTROLS },
      lastSyncAt: f.minus(12),
      lastError: null,
      backfillCompleted: true,
      isPrimary: true,
      createdAt: f.lt(-3, '08:58'),
      updatedAt: f.minus(12),
      deletedAt: null,
    },
    {
      id: ACCOUNT_DEVICE,
      userId: f.userId,
      provider: 'device',
      kinds: ['calendar'],
      externalAccountId: 'device',
      displayName: 'Apple Takvim',
      email: null,
      status: 'active',
      grantedScopes: [],
      controls: {
        ...DEFAULT_CONTROLS,
        readEmail: false,
        analyzeAttachments: false,
        prepareDrafts: false,
        readTasks: false,
      },
      lastSyncAt: f.minus(12),
      lastError: null,
      backfillCompleted: true,
      isPrimary: false,
      createdAt: f.lt(-3, '09:00'),
      updatedAt: f.minus(12),
      deletedAt: null,
    },
  ];
}
