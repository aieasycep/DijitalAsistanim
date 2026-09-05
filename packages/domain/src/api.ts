/**
 * API contracts between clients (mobile/web) and Supabase Edge Functions.
 * Function names follow supabase/functions/<name>. Requests are validated with @da/validation.
 */
import type {
  ApprovalActionType,
  ApprovalStatus,
  BriefingKind,
  CaptureKind,
  FlowFilter,
  MailIntelligenceCategory,
  Provider,
  ReminderOption,
  ReplyTone,
} from './enums';
import type {
  ApprovalAction,
  ApprovalPayloadMap,
  AssistantMessage,
  AssistantRichCard,
  Briefing,
  CalendarConflict,
  Capture,
  Commitment,
  ConnectedAccount,
  DataExportRequest,
  EmailThread,
  EntitlementState,
  FirstAnalysisProgress,
  FollowUp,
  Insight,
  ISODate,
  ISODateTime,
  MeetingPrep,
  PersonIntelligence,
  PlanDay,
  Reminder,
  ScheduleSuggestion,
  SearchResult,
  TodayFeed,
  UUID,
} from './entities';
import type { SourceRef } from './source';

export interface ApiError {
  code:
    | 'unauthorized'
    | 'forbidden'
    | 'not_found'
    | 'validation'
    | 'rate_limited'
    | 'quota_exceeded'
    | 'provider_unavailable'
    | 'oauth_expired'
    | 'scope_required'
    | 'ai_unavailable'
    | 'conflict'
    | 'offline'
    | 'internal';
  message: string;
  details?: Record<string, unknown>;
  retryAfterSec?: number;
  requiredScope?: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

// --- OAuth -----------------------------------------------------------------
export interface OAuthStartRequest {
  provider: Extract<Provider, 'google' | 'microsoft'>;
  kinds: ('email' | 'calendar' | 'tasks')[];
  /** Progressive authorization: ask for a write scope group */
  scopeGroup?: 'read' | 'mail_send' | 'calendar_write' | 'tasks_write';
  redirectTo: string; // app deep link
  accountId?: UUID; // when upgrading scopes of an existing account
}
export interface OAuthStartResponse {
  authorizationUrl: string;
  state: string;
}

// --- Sync ------------------------------------------------------------------
export interface InitialAnalysisStartRequest {
  windowHours?: number;
}
export type InitialAnalysisStatusResponse = FirstAnalysisProgress & {
  insights: Insight[];
  briefingId?: UUID | null;
};

export interface SyncNowRequest {
  accountId?: UUID;
  resource?: 'mail' | 'calendar' | 'tasks';
}

// --- Today / Flow / Mail --------------------------------------------------
export interface TodayRequest {
  date?: ISODate;
}
export type TodayResponse = TodayFeed;

export interface FlowRequest {
  filter: FlowFilter;
  cursor?: string;
  limit?: number;
}
export interface FlowResponse {
  items: Insight[];
  nextCursor?: string | null;
}

export interface MailIntelligenceResponse {
  totalToday: number;
  needsAttention: number;
  categories: Record<MailIntelligenceCategory, { count: number; threads: EmailThread[] }>;
}

export interface EmailDetailResponse {
  thread: EmailThread;
  messages: {
    id: UUID;
    from: string;
    sentAt: ISODateTime;
    bodyText: string;
    isFromUser: boolean;
    webUrl?: string | null;
  }[];
  relatedInsight?: Insight | null;
  followUp?: FollowUp | null;
  commitments: Commitment[];
}

export interface DraftReplyRequest {
  threadId: UUID;
  tone: ReplyTone;
  instructions?: string;
}
export interface DraftReplyResponse {
  draft: string;
  subject: string;
  to: { name?: string | null; email: string }[];
  tone: ReplyTone;
  basedOn: SourceRef[];
}

// --- Approvals ------------------------------------------------------------
export interface CreateApprovalRequest<T extends ApprovalActionType = ApprovalActionType> {
  type: T;
  what: string;
  why: string;
  changeSummary: string[];
  payload: ApprovalPayloadMap[T];
  source?: SourceRef | null;
  requestedBy: ApprovalAction['requestedBy'];
  insightId?: UUID | null;
  idempotencyKey: string;
}
export interface DecideApprovalRequest {
  approvalId: UUID;
  decision: 'approve' | 'reject';
  /** Edited payload (must validate against the action type). */
  editedPayload?: ApprovalPayloadMap[ApprovalActionType];
}
export interface DecideApprovalResponse {
  approval: ApprovalAction;
  status: ApprovalStatus;
  requiredScope?: string | null;
}

// --- Reminders ------------------------------------------------------------
export interface SmartReminderSuggestRequest {
  targetType: NonNullable<Reminder['targetType']>;
  targetId: UUID;
  dueAt?: ISODateTime | null;
}
export interface SmartReminderSuggestResponse {
  options: { option: ReminderOption; at: ISODateTime; label: string; reason?: string | null }[];
  smart: { at: ISODateTime; reason: string } | null;
}

// --- Plan -----------------------------------------------------------------
export interface PlanRequest {
  date: ISODate;
  range: 'day' | 'week';
}
export interface PlanResponse {
  days: PlanDay[];
  suggestions: ScheduleSuggestion[];
  conflicts: CalendarConflict[];
}

// --- Meetings -------------------------------------------------------------
export type MeetingPrepResponse = MeetingPrep;
export interface PostMeetingRequest {
  eventId: UUID;
  text: string;
  inputMode: 'text' | 'voice';
}
export interface PostMeetingResponse {
  proposals: {
    commitment: Omit<Commitment, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
    approvalId: UUID;
  }[];
}

// --- Assistant ------------------------------------------------------------
export interface AssistantAskRequest {
  threadId?: UUID | null;
  message: string;
  inputMode: 'text' | 'voice';
  contactId?: UUID | null;
}
export interface AssistantAskResponse {
  threadId: UUID;
  message: AssistantMessage;
  cards: AssistantRichCard[];
  approvals: ApprovalAction[];
  suggestedFollowUps: string[];
}
export interface SuggestedQuestionsResponse {
  questions: { id: string; text: string; reason?: string | null }[];
}

// --- Search ---------------------------------------------------------------
export interface SearchRequest {
  query: string;
  limit?: number;
  kinds?: SearchResult['kind'][];
}
export interface SearchResponse {
  results: SearchResult[];
  mode: 'semantic' | 'fts';
}

// --- Capture --------------------------------------------------------------
export interface CaptureCreateRequest {
  kind: CaptureKind;
  text?: string;
  url?: string;
  storagePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  origin: Capture['origin'];
}
export type CaptureAnalyzeResponse = Capture;

// --- People ---------------------------------------------------------------
export type PersonResponse = PersonIntelligence;

// --- Briefings ------------------------------------------------------------
export interface BriefingRequest {
  kind: BriefingKind;
  date?: ISODate;
  regenerate?: boolean;
}
export type BriefingResponse = Briefing;
export interface BriefingAudioRequest {
  briefingId: UUID;
}
export interface BriefingAudioResponse {
  provider: 'device_tts' | 'server_tts';
  url?: string | null;
  script: string;
  chapters: NonNullable<Briefing['audio']>['chapters'];
}

// --- Account / privacy ----------------------------------------------------
export interface ConnectedAccountsResponse {
  accounts: ConnectedAccount[];
}
export interface DeleteAccountRequest {
  confirmation: 'SİL' | 'DELETE';
}
export type ExportStatusResponse = DataExportRequest;
export interface DeleteHistoryRequest {
  olderThanDays?: number;
}

// --- Subscription / referral ---------------------------------------------
export type EntitlementResponse = EntitlementState;
export interface ReferralRedeemRequest {
  code: string;
  deviceFingerprintHash?: string;
}
export interface ReferralStatusResponse {
  code: string;
  inviteUrl: string;
  invitedCount: number;
  redeemedCount: number;
  bonusDaysEarned: number;
  activeBonusUntil?: ISODateTime | null;
}

// --- Push -----------------------------------------------------------------
export interface RegisterPushTokenRequest {
  token: string;
  platform: 'ios' | 'android';
  deviceId: string;
  deviceName?: string;
  appVersion?: string;
}

// --- Speech ---------------------------------------------------------------
export interface TranscribeResponse {
  text: string;
  provider: 'server_stt';
}
