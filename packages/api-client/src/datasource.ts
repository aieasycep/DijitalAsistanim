/**
 * DataSource — the ONLY contract UI code talks to. Two implementations:
 *  - SupabaseDataSource: real backend (RLS-scoped tables + Edge Functions).
 *  - DemoDataSource: deterministic in-memory fixtures (development / E2E), never enabled in production builds.
 *
 * Every write that has an external side effect goes through approvals (createApproval → decideApproval).
 * Read operations never require approval. Internal-only mutations (mark insight done, snooze, dismiss,
 * preferences) apply immediately — they have no external side effect.
 */
import type {
  AiFeedbackKind,
  AndroidNotificationItem,
  ApprovalAction,
  ApprovalActionType,
  AssistantAskRequest,
  AssistantAskResponse,
  AssistantMessage,
  AssistantThread,
  Briefing,
  BriefingAudioResponse,
  BriefingKind,
  CalendarConflict,
  CalendarEvent,
  Capture,
  CaptureCreateRequest,
  Commitment,
  ConnectedAccount,
  Contact,
  CreateApprovalRequest,
  DataExportRequest,
  DataSourceControls,
  DecideApprovalResponse,
  DraftReplyRequest,
  DraftReplyResponse,
  EmailDetailResponse,
  EntitlementState,
  FirstAnalysisProgress,
  FlowFilter,
  FlowResponse,
  FollowUp,
  Insight,
  InsightStatus,
  ISODate,
  ISODateTime,
  LearnedPreference,
  LifeEvent,
  MailIntelligenceResponse,
  MeetingPrep,
  NotificationPreferences,
  OAuthStartRequest,
  OAuthStartResponse,
  PersonIntelligence,
  PlanResponse,
  PostMeetingResponse,
  PriorityRule,
  Profile,
  ReferralStatusResponse,
  RegisterPushTokenRequest,
  Reminder,
  ReminderOption,
  SearchRequest,
  SearchResponse,
  SmartReminderSuggestRequest,
  SmartReminderSuggestResponse,
  Subscription,
  SuggestedQuestionsResponse,
  TaskItem,
  TodayFeed,
  UserPreferences,
  UUID,
  VipPerson,
} from '@da/domain';

export type Unsubscribe = () => void;

export interface AuthUser {
  id: UUID;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  provider: 'apple' | 'google' | 'microsoft' | 'email' | 'demo';
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  expiresAt: ISODateTime;
}

export interface AuthApi {
  getSession(): Promise<AuthSession | null>;
  onAuthStateChange(cb: (session: AuthSession | null) => void): Unsubscribe;
  /** Native Sign in with Apple (identity token) */
  signInWithApple(input: { identityToken: string; nonce: string; fullName?: string | null }): Promise<AuthSession>;
  /** Google / Microsoft sign-in via id token (native) or a web OAuth URL when idToken is not available */
  signInWithIdToken(input: { provider: 'google' | 'azure'; idToken: string; accessToken?: string; nonce?: string }): Promise<AuthSession>;
  getOAuthSignInUrl(input: { provider: 'google' | 'azure'; redirectTo: string }): Promise<string>;
  exchangeCodeForSession(url: string): Promise<AuthSession>;
  signInWithEmailOtp(email: string): Promise<void>;
  verifyEmailOtp(input: { email: string; token: string }): Promise<AuthSession>;
  signOut(): Promise<void>;
}

export interface ProfileApi {
  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Pick<Profile, 'displayName' | 'firstName' | 'timezone' | 'locale' | 'avatarUrl'>>): Promise<Profile>;
  completeOnboarding(): Promise<Profile>;
  getPreferences(): Promise<UserPreferences>;
  updatePreferences(patch: Partial<Omit<UserPreferences, 'userId' | 'createdAt' | 'updatedAt'>>): Promise<UserPreferences>;
  getNotificationPreferences(): Promise<NotificationPreferences>;
  updateNotificationPreferences(patch: Partial<Omit<NotificationPreferences, 'userId' | 'createdAt' | 'updatedAt'>>): Promise<NotificationPreferences>;
  registerPushToken(req: RegisterPushTokenRequest): Promise<void>;
  unregisterPushToken(deviceId: string): Promise<void>;
  submitFeedback(input: { category: 'bug' | 'idea' | 'praise' | 'other'; message: string; includeDiagnostics: boolean; appVersion?: string; platform?: 'ios' | 'android' }): Promise<void>;
}

export interface AccountsApi {
  listAccounts(): Promise<ConnectedAccount[]>;
  /** Google / Microsoft: returns authorization URL to open in a browser session; callback lands on the app deep link. */
  startOAuth(req: OAuthStartRequest): Promise<OAuthStartResponse>;
  /** Called after the deep-link callback arrives (state + status). */
  completeOAuth(input: { state: string; status: 'ok' | 'error'; accountId?: string; error?: string }): Promise<ConnectedAccount | null>;
  /** Device calendars (EventKit / Android provider) are registered as accounts of provider 'apple' | 'device'. */
  registerDeviceCalendar(input: { provider: 'apple' | 'device'; displayName: string; calendarIds: string[] }): Promise<ConnectedAccount>;
  updateControls(accountId: UUID, controls: Partial<DataSourceControls>): Promise<ConnectedAccount>;
  setPrimary(accountId: UUID): Promise<void>;
  disconnect(accountId: UUID): Promise<void>;
  reconnect(accountId: UUID, redirectTo: string): Promise<OAuthStartResponse>;
  syncNow(input?: { accountId?: UUID; resource?: 'mail' | 'calendar' | 'tasks' }): Promise<void>;
  /** Uploads device-calendar events (read on device) so the backend can reason over them. */
  upsertDeviceEvents(accountId: UUID, events: Omit<CalendarEvent, 'userId' | 'createdAt' | 'updatedAt' | 'id'>[]): Promise<void>;
}

export interface OnboardingApi {
  startInitialAnalysis(input?: { windowHours?: number }): Promise<FirstAnalysisProgress>;
  getInitialAnalysisStatus(): Promise<FirstAnalysisProgress & { insights: Insight[]; briefingId?: UUID | null }>;
}

export interface FeedApi {
  getToday(input?: { date?: ISODate }): Promise<TodayFeed>;
  getFlow(input: { filter: FlowFilter; cursor?: string; limit?: number }): Promise<FlowResponse>;
  getInsight(id: UUID): Promise<Insight>;
  resolveInsight(id: UUID, status: Extract<InsightStatus, 'completed' | 'dismissed' | 'active'>, feedback?: AiFeedbackKind): Promise<Insight>;
  snoozeInsight(id: UUID, until: ISODateTime): Promise<Insight>;
  sendFeedback(input: { kind: AiFeedbackKind; entityType: string; entityId: UUID; contactId?: UUID | null; note?: string | null }): Promise<void>;
  getMailIntelligence(): Promise<MailIntelligenceResponse>;
  listWaitingForUser(): Promise<Insight[]>;
  listLifeEvents(): Promise<LifeEvent[]>;
  getLifeEvent(id: UUID): Promise<LifeEvent>;
  setLifeEventStatus(id: UUID, status: LifeEvent['status']): Promise<LifeEvent>;
}

export interface EmailApi {
  getThread(id: UUID): Promise<EmailDetailResponse>;
  markRead(id: UUID, isRead: boolean): Promise<void>;
  draftReply(req: DraftReplyRequest): Promise<DraftReplyResponse>;
  listFollowUps(): Promise<FollowUp[]>;
  getFollowUp(id: UUID): Promise<FollowUp>;
  snoozeFollowUp(id: UUID, until: ISODateTime): Promise<FollowUp>;
  closeFollowUp(id: UUID): Promise<FollowUp>;
  draftFollowUpMessage(followUpId: UUID): Promise<DraftReplyResponse>;
}

export interface PlanApi {
  getPlan(input: { date: ISODate; range: 'day' | 'week' }): Promise<PlanResponse>;
  listTasks(input?: { status?: TaskItem['status'] }): Promise<TaskItem[]>;
  completeTask(id: UUID, completed: boolean): Promise<TaskItem>;
  listCommitments(input?: { status?: Commitment['status'] }): Promise<Commitment[]>;
  getCommitment(id: UUID): Promise<Commitment>;
  completeCommitment(id: UUID): Promise<Commitment>;
  postponeCommitment(id: UUID, until: ISODateTime): Promise<Commitment>;
  confirmCommitment(id: UUID, accept: boolean): Promise<Commitment>;
  listConflicts(): Promise<CalendarConflict[]>;
  getConflict(id: UUID): Promise<CalendarConflict>;
  ignoreConflict(id: UUID): Promise<CalendarConflict>;
  getEvent(id: UUID): Promise<CalendarEvent>;
  listEvents(input: { from: ISODateTime; to: ISODateTime }): Promise<CalendarEvent[]>;
}

export interface MeetingApi {
  getMeetingPrep(eventId: UUID, opts?: { regenerate?: boolean }): Promise<MeetingPrep>;
  submitPostMeeting(input: { eventId: UUID; text: string; inputMode: 'text' | 'voice' }): Promise<PostMeetingResponse>;
  markPostMeetingHandled(eventId: UUID): Promise<void>;
  /** Events that ended in the last N hours without a post-meeting note (used to prompt "Toplantın bitti.") */
  listRecentlyEndedMeetings(input?: { hours?: number }): Promise<CalendarEvent[]>;
}

export interface ApprovalsApi {
  listApprovals(input?: { status?: ApprovalAction['status'][] }): Promise<ApprovalAction[]>;
  getApproval(id: UUID): Promise<ApprovalAction>;
  createApproval<T extends ApprovalActionType>(req: CreateApprovalRequest<T>): Promise<ApprovalAction<T>>;
  decideApproval(input: { approvalId: UUID; decision: 'approve' | 'reject'; editedPayload?: Record<string, unknown> }): Promise<DecideApprovalResponse>;
  retryApproval(id: UUID): Promise<DecideApprovalResponse>;
  pendingCount(): Promise<number>;
  onPendingChange?(cb: (count: number) => void): Unsubscribe;
}

export interface RemindersApi {
  suggestReminder(req: SmartReminderSuggestRequest): Promise<SmartReminderSuggestResponse>;
  listReminders(input?: { status?: Reminder['status'] }): Promise<Reminder[]>;
  /** Internal reminder creation happens through approvals (reminder_create); this cancels a scheduled one. */
  cancelReminder(id: UUID): Promise<void>;
  completeReminder(id: UUID): Promise<void>;
  reminderOptionLabels(): ReminderOption[];
}

export interface AssistantApi {
  ask(req: AssistantAskRequest): Promise<AssistantAskResponse>;
  suggestedQuestions(input?: { contactId?: UUID | null }): Promise<SuggestedQuestionsResponse>;
  listThreads(): Promise<AssistantThread[]>;
  getThreadMessages(threadId: UUID): Promise<AssistantMessage[]>;
  deleteThread(threadId: UUID): Promise<void>;
  /** Server-side STT when configured; returns null when the client should use on-device recognition. */
  transcribe(input: { uri: string; mimeType: string; durationSec: number }): Promise<{ text: string } | null>;
}

export interface SearchApi {
  search(req: SearchRequest): Promise<SearchResponse>;
  recentQueries(): Promise<string[]>;
  rememberQuery(q: string): Promise<void>;
}

export interface CaptureApi {
  /** Upload binary content to private storage (user-scoped path). Returns storagePath. */
  uploadCaptureFile(input: { uri: string; mimeType: string; sizeBytes: number; fileName: string }): Promise<{ storagePath: string }>;
  createCapture(req: CaptureCreateRequest): Promise<Capture>;
  analyzeCapture(id: UUID): Promise<Capture>;
  getCapture(id: UUID): Promise<Capture>;
  listCaptures(): Promise<Capture[]>;
  deleteCapture(id: UUID): Promise<void>;
}

export interface PeopleApi {
  listContacts(input?: { query?: string; limit?: number }): Promise<Contact[]>;
  getPerson(contactId: UUID): Promise<PersonIntelligence>;
  listVips(): Promise<VipPerson[]>;
  addVip(input: { contactId?: UUID | null; displayName: string; email?: string | null; relation?: string | null; notifyAlways?: boolean }): Promise<VipPerson>;
  removeVip(vipId: UUID): Promise<void>;
  setVip(contactId: UUID, isVip: boolean): Promise<void>;
}

export interface RulesApi {
  listRules(): Promise<PriorityRule[]>;
  upsertRule(rule: Omit<PriorityRule, 'userId' | 'createdAt' | 'updatedAt' | 'id'> & { id?: UUID }): Promise<PriorityRule>;
  deleteRule(id: UUID): Promise<void>;
  reorderRules(ids: UUID[]): Promise<void>;
  listLearnedPreferences(): Promise<LearnedPreference[]>;
  setLearnedPreferenceEnabled(id: UUID, enabled: boolean): Promise<LearnedPreference>;
  deleteLearnedPreference(id: UUID): Promise<void>;
}

export interface BriefingsApi {
  getBriefing(input: { kind: BriefingKind; date?: ISODate; regenerate?: boolean }): Promise<Briefing | null>;
  getBriefingById(id: UUID): Promise<Briefing>;
  markOpened(id: UUID): Promise<void>;
  /** Evening close: "Yarına Hazırım" — mutes evening notifications and optionally carries open items over. */
  closeDay(input: { briefingId: UUID; carryOverInsightIds: UUID[] }): Promise<Briefing>;
  getAudio(briefingId: UUID): Promise<BriefingAudioResponse>;
  getWeekly(input?: { weekStart?: ISODate }): Promise<Briefing | null>;
}

export interface BillingApi {
  getEntitlement(): Promise<EntitlementState>;
  listSubscriptions(): Promise<Subscription[]>;
  /** Links the RevenueCat app user id to the profile (after Purchases.logIn). */
  linkRevenueCatUser(appUserId: string): Promise<void>;
  getReferralStatus(): Promise<ReferralStatusResponse>;
  redeemReferral(input: { code: string; deviceFingerprintHash?: string }): Promise<{ ok: boolean; reason?: string; bonusDays?: number }>;
}

export interface PrivacyApi {
  requestExport(): Promise<DataExportRequest>;
  getExportStatus(id?: UUID): Promise<DataExportRequest | null>;
  deleteHistory(input?: { olderThanDays?: number }): Promise<Record<string, number>>;
  deleteAccount(input: { confirmation: 'SİL' | 'DELETE' }): Promise<void>;
  listAuditLogs(input?: { limit?: number }): Promise<{ action: string; actor: string; createdAt: ISODateTime; targetType?: string | null }[]>;
}

export interface AndroidNotificationsApi {
  ingest(items: Omit<AndroidNotificationItem, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'analysis' | 'insightId'>[]): Promise<{ accepted: number }>;
  listRecent(input?: { limit?: number }): Promise<AndroidNotificationItem[]>;
  clearAll(): Promise<void>;
}

export interface DataSource {
  readonly mode: 'demo' | 'supabase';
  auth: AuthApi;
  profile: ProfileApi;
  accounts: AccountsApi;
  onboarding: OnboardingApi;
  feed: FeedApi;
  email: EmailApi;
  plan: PlanApi;
  meetings: MeetingApi;
  approvals: ApprovalsApi;
  reminders: RemindersApi;
  assistant: AssistantApi;
  search: SearchApi;
  capture: CaptureApi;
  people: PeopleApi;
  rules: RulesApi;
  briefings: BriefingsApi;
  billing: BillingApi;
  privacy: PrivacyApi;
  androidNotifications: AndroidNotificationsApi;
  /** Clears any local caches held by the data source (logout / delete account). */
  clearLocalState(): Promise<void>;
}
