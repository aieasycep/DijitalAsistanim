/**
 * Single in-memory state of the demo adapter plus optional JSON persistence.
 *
 * The snapshot is only valid for the local day it was seeded for (fixtures are relative to "today"), so a
 * snapshot from another day is discarded on hydration and the demo starts fresh.
 */
import type {
  AiFeedback,
  AndroidNotificationItem,
  ApprovalAction,
  AssistantMessage,
  AssistantThread,
  AuditLog,
  Briefing,
  CalendarConflict,
  CalendarEvent,
  Capture,
  Commitment,
  ConnectedAccount,
  Contact,
  DataExportRequest,
  EmailMessage,
  EmailThread,
  FirstAnalysisProgress,
  FollowUp,
  Insight,
  ISODate,
  ISODateTime,
  LearnedPreference,
  LifeEvent,
  MemoryChunk,
  NotificationPreferences,
  PostMeetingNote,
  PriorityRule,
  Profile,
  PushToken,
  Reminder,
  ScheduleSuggestion,
  Subscription,
  TaskItem,
  UserPreferences,
  UUID,
  VipPerson,
} from '@da/domain';
import type { KeyValueStorage } from '../config';
import { runtimeId } from './ids';
import { schedule } from './latency';

export const STATE_STORAGE_KEY = 'da.demo.state.v1';
export const SESSION_STORAGE_KEY = 'da.demo.session';

export interface StoredConflict {
  id: UUID;
  eventAId: UUID;
  eventBId: UUID;
  overlapMinutes: number;
  suggestions: ScheduleSuggestion[];
  status: CalendarConflict['status'];
}

export interface PendingOAuth {
  state: string;
  provider: 'google' | 'microsoft';
  kinds: ('email' | 'calendar' | 'tasks')[];
  scopeGroup: 'read' | 'mail_send' | 'calendar_write' | 'tasks_write';
  accountId: UUID;
  /** Scope upgrade / reconnect of an existing account. */
  existing: boolean;
  redirectTo: string;
  createdAt: ISODateTime;
}

export interface UserFeedbackEntry {
  id: UUID;
  category: 'bug' | 'idea' | 'praise' | 'other';
  message: string;
  includeDiagnostics: boolean;
  appVersion?: string | null;
  platform?: 'ios' | 'android' | null;
  createdAt: ISODateTime;
}

export interface ReferralState {
  redeemedCode: string | null;
  redeemedAt: ISODateTime | null;
  bonusUntil: ISODateTime | null;
  invitedCount: number;
  redeemedCount: number;
  bonusDaysEarned: number;
}

export interface DemoState {
  version: 1;
  seedDate: ISODate;
  idSeq: number;
  profile: Profile;
  preferences: UserPreferences;
  notificationPreferences: NotificationPreferences;
  pushTokens: PushToken[];
  accounts: ConnectedAccount[];
  pendingOAuth: PendingOAuth[];
  contacts: Contact[];
  vips: VipPerson[];
  rules: PriorityRule[];
  learned: LearnedPreference[];
  /** subjectKeys the user deleted — never re-inferred. */
  learnedTombstones: string[];
  threads: EmailThread[];
  messages: EmailMessage[];
  events: CalendarEvent[];
  conflicts: StoredConflict[];
  tasks: TaskItem[];
  commitments: Commitment[];
  followUps: FollowUp[];
  reminders: Reminder[];
  lifeEvents: LifeEvent[];
  insights: Insight[];
  briefings: Briefing[];
  approvals: ApprovalAction[];
  assistantThreads: AssistantThread[];
  assistantMessages: AssistantMessage[];
  memory: MemoryChunk[];
  postMeetingNotes: PostMeetingNote[];
  captures: Capture[];
  recentQueries: string[];
  androidNotifications: AndroidNotificationItem[];
  auditLogs: AuditLog[];
  aiFeedback: AiFeedback[];
  userFeedback: UserFeedbackEntry[];
  exports: DataExportRequest[];
  subscriptions: Subscription[];
  referral: ReferralState;
  revenueCatAppUserId: string | null;
  usage: { date: ISODate; assistantQueries: number; captures: number };
  analysis: FirstAnalysisProgress | null;
  counters: { emailSendExecutions: number };
  stats: { analyzedEmailsToday: number; lastAnalyzedAt: ISODateTime };
  eveningMutedFor: ISODate | null;
}

export interface DemoStore {
  readonly state: DemoState;
  /** Resolves once hydration from storage finished (or was skipped). */
  readonly ready: Promise<void>;
  mutate<T>(fn: (state: DemoState) => T): T;
  nextId(): UUID;
  flush(): Promise<void>;
  /** Re-seeds fixtures and removes the persisted snapshot. */
  reset(): Promise<void>;
  /** Swaps the whole state (account deletion) and persists it. */
  replace(next: DemoState): void;
}

function isSnapshot(value: unknown): value is DemoState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.seedDate === 'string' &&
    typeof v.idSeq === 'number' &&
    Array.isArray(v.insights) &&
    Array.isArray(v.threads) &&
    Array.isArray(v.approvals) &&
    typeof v.profile === 'object' &&
    v.profile !== null
  );
}

export function createStore(input: {
  storage?: KeyValueStorage;
  seed: () => DemoState;
  today: ISODate;
  persistDebounceMs: number;
}): DemoStore {
  let current = input.seed();
  let cancelPersist: (() => void) | null = null;
  let persisting: Promise<void> = Promise.resolve();

  const persistNow = async (): Promise<void> => {
    if (!input.storage) return;
    try {
      await input.storage.setItem(STATE_STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Persistence is best-effort: the in-memory state stays authoritative.
    }
  };

  const schedulePersist = (): void => {
    if (!input.storage) return;
    cancelPersist?.();
    cancelPersist = schedule(input.persistDebounceMs, () => {
      cancelPersist = null;
      persisting = persistNow();
    });
  };

  const hydrate = async (): Promise<void> => {
    if (!input.storage) return;
    try {
      const raw = await input.storage.getItem(STATE_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (isSnapshot(parsed) && parsed.seedDate === input.today) current = parsed;
    } catch {
      // Corrupt or incompatible snapshot: keep the fresh seed.
    }
  };

  const ready = hydrate();

  return {
    get state() {
      return current;
    },
    ready,
    mutate: (fn) => {
      const result = fn(current);
      schedulePersist();
      return result;
    },
    nextId: () => {
      const seq = current.idSeq;
      current.idSeq = seq + 1;
      schedulePersist();
      return runtimeId(seq);
    },
    flush: async () => {
      if (cancelPersist) {
        cancelPersist();
        cancelPersist = null;
        persisting = persistNow();
      }
      await persisting;
    },
    reset: async () => {
      cancelPersist?.();
      cancelPersist = null;
      current = input.seed();
      if (!input.storage) return;
      try {
        await input.storage.removeItem(STATE_STORAGE_KEY);
      } catch {
        // Ignore storage failures on reset.
      }
    },
    replace: (next) => {
      current = next;
      schedulePersist();
    },
  };
}
