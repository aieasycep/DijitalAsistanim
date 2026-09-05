import type { DemoState } from '../state';
import { RUNTIME_ID_START } from '../ids';
import { buildAccounts } from './accounts';
import { buildApprovals } from './approvals';
import {
  buildAssistantMessages,
  buildAssistantThreads,
  buildMemory,
  buildPostMeetingNotes,
} from './assistant';
import { buildMorningBriefing } from './briefings';
import { buildConflicts, buildEvents } from './calendar';
import { buildMessages, buildThreads } from './email';
import { buildInsights } from './insights';
import { buildLifeEvents } from './lifeEvents';
import { buildContacts, buildLearnedPreferences, buildRules, buildVips } from './people';
import { buildCommitments, buildFollowUps, buildReminders, buildTasks } from './plan';
import {
  buildAuditLogs,
  buildNotificationPreferences,
  buildPreferences,
  buildProfile,
  buildPushTokens,
  buildSubscriptions,
} from './profile';
import type { FixtureContext } from './types';

export type { FixtureContext } from './types';

/** Builds the complete demo dataset (mirrors supabase/seed/seed.sql) relative to the fixture clock. */
export function buildSeedState(f: FixtureContext): DemoState {
  return {
    version: 1,
    seedDate: f.today,
    idSeq: RUNTIME_ID_START,
    profile: buildProfile(f),
    preferences: buildPreferences(f),
    notificationPreferences: buildNotificationPreferences(f),
    pushTokens: buildPushTokens(f),
    accounts: buildAccounts(f),
    pendingOAuth: [],
    contacts: buildContacts(f),
    vips: buildVips(f),
    rules: buildRules(f),
    learned: buildLearnedPreferences(f),
    learnedTombstones: [],
    threads: buildThreads(f),
    messages: buildMessages(f),
    events: buildEvents(f),
    conflicts: buildConflicts(f),
    tasks: buildTasks(f),
    commitments: buildCommitments(f),
    followUps: buildFollowUps(f),
    reminders: buildReminders(f),
    lifeEvents: buildLifeEvents(f),
    insights: buildInsights(f),
    briefings: [buildMorningBriefing(f)],
    approvals: buildApprovals(f),
    assistantThreads: buildAssistantThreads(f),
    assistantMessages: buildAssistantMessages(f),
    memory: buildMemory(f),
    postMeetingNotes: buildPostMeetingNotes(f),
    captures: [],
    recentQueries: ['Mehmet fiyat konusunda en son ne demişti?', 'Bu ay hangi ödemelerim var?'],
    androidNotifications: [],
    auditLogs: buildAuditLogs(f),
    aiFeedback: [],
    userFeedback: [],
    exports: [],
    subscriptions: buildSubscriptions(f),
    referral: {
      redeemedCode: null,
      redeemedAt: null,
      bonusUntil: null,
      invitedCount: 2,
      redeemedCount: 0,
      bonusDaysEarned: 0,
    },
    revenueCatAppUserId: null,
    usage: { date: f.today, assistantQueries: 1, captures: 0 },
    analysis: null,
    counters: { emailSendExecutions: 0 },
    stats: { analyzedEmailsToday: 46, lastAnalyzedAt: f.minus(12) },
    eveningMutedFor: null,
  };
}

/** An empty account (after "hesabı sil"): profile only, nothing analysed. */
export function buildEmptyState(f: FixtureContext): DemoState {
  const seeded = buildSeedState(f);
  return {
    ...seeded,
    profile: {
      ...seeded.profile,
      onboardingCompletedAt: null,
      firstAnalysisCompletedAt: null,
      plan: 'free',
    },
    pushTokens: [],
    accounts: [],
    contacts: [],
    vips: [],
    rules: [],
    learned: [],
    threads: [],
    messages: [],
    events: [],
    conflicts: [],
    tasks: [],
    commitments: [],
    followUps: [],
    reminders: [],
    lifeEvents: [],
    insights: [],
    briefings: [],
    approvals: [],
    assistantThreads: [],
    assistantMessages: [],
    memory: [],
    postMeetingNotes: [],
    recentQueries: [],
    auditLogs: [],
    subscriptions: [],
    referral: {
      redeemedCode: null,
      redeemedAt: null,
      bonusUntil: null,
      invitedCount: 0,
      redeemedCount: 0,
      bonusDaysEarned: 0,
    },
    usage: { date: f.today, assistantQueries: 0, captures: 0 },
    stats: { analyzedEmailsToday: 0, lastAnalyzedAt: f.nowIso },
  };
}
