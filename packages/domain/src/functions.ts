/**
 * Edge Function catalogue — the single list of Supabase Edge Functions, their HTTP method and
 * request/response contracts. Used by @da/api-client (SupabaseDataSource) and by supabase/functions.
 * Function folder names equal the keys below.
 */
import type {
  AssistantAskRequest,
  AssistantAskResponse,
  BriefingAudioRequest,
  BriefingAudioResponse,
  BriefingRequest,
  BriefingResponse,
  CreateApprovalRequest,
  DecideApprovalRequest,
  DecideApprovalResponse,
  DeleteAccountRequest,
  DraftReplyRequest,
  DraftReplyResponse,
  EmailDetailResponse,
  EntitlementResponse,
  ExportStatusResponse,
  FlowRequest,
  FlowResponse,
  InitialAnalysisStartRequest,
  InitialAnalysisStatusResponse,
  MailIntelligenceResponse,
  MeetingPrepResponse,
  OAuthStartRequest,
  OAuthStartResponse,
  PersonResponse,
  PlanRequest,
  PlanResponse,
  PostMeetingRequest,
  PostMeetingResponse,
  ReferralRedeemRequest,
  ReferralStatusResponse,
  SearchRequest,
  SearchResponse,
  SmartReminderSuggestRequest,
  SmartReminderSuggestResponse,
  SuggestedQuestionsResponse,
  SyncNowRequest,
  TodayRequest,
  TodayResponse,
  TranscribeResponse,
} from './api';
import type { AndroidNotificationItem, Briefing, CalendarEvent, Capture, ConnectedAccount, DataExportRequest, ISODate, UUID } from './entities';

export interface FunctionContract<Req, Res> {
  method: 'GET' | 'POST';
  /** Whether Supabase verifies the user JWT (false for provider callbacks/webhooks/cron). */
  verifyJwt: boolean;
  _req?: Req;
  _res?: Res;
}

const fn = <Req, Res>(method: 'GET' | 'POST', verifyJwt = true): FunctionContract<Req, Res> => ({ method, verifyJwt });

export const EDGE_FUNCTIONS = {
  // OAuth / accounts
  'oauth-start': fn<OAuthStartRequest, OAuthStartResponse>('POST'),
  'oauth-google-callback': fn<{ code: string; state: string }, { redirect: string }>('GET', false),
  'oauth-microsoft-callback': fn<{ code: string; state: string }, { redirect: string }>('GET', false),
  'accounts-disconnect': fn<{ accountId: UUID }, { ok: true; revoked: boolean }>('POST'),
  'accounts-sync-now': fn<SyncNowRequest, { queued: number }>('POST'),
  'device-calendar-upsert': fn<{ accountId: UUID; events: Omit<CalendarEvent, 'userId' | 'createdAt' | 'updatedAt' | 'id'>[] }, { upserted: number }>('POST'),
  // Onboarding
  'initial-analysis-start': fn<InitialAnalysisStartRequest, InitialAnalysisStatusResponse>('POST'),
  'initial-analysis-status': fn<Record<string, never>, InitialAnalysisStatusResponse>('GET'),
  // Feed
  today: fn<TodayRequest, TodayResponse>('GET'),
  flow: fn<FlowRequest, FlowResponse>('GET'),
  'mail-intelligence': fn<Record<string, never>, MailIntelligenceResponse>('GET'),
  'email-thread': fn<{ id: UUID }, EmailDetailResponse>('GET'),
  'email-draft-reply': fn<DraftReplyRequest, DraftReplyResponse>('POST'),
  'followups-draft': fn<{ followUpId: UUID }, DraftReplyResponse>('POST'),
  // Plan & meetings
  plan: fn<PlanRequest, PlanResponse>('GET'),
  'meeting-prep': fn<{ eventId: UUID; regenerate?: boolean }, MeetingPrepResponse>('GET'),
  'post-meeting': fn<PostMeetingRequest, PostMeetingResponse>('POST'),
  // Approvals
  'approvals-create': fn<CreateApprovalRequest, { approvalId: UUID }>('POST'),
  'approvals-decide': fn<DecideApprovalRequest, DecideApprovalResponse>('POST'),
  'approvals-retry': fn<{ approvalId: UUID }, DecideApprovalResponse>('POST'),
  // Reminders
  'reminders-suggest': fn<SmartReminderSuggestRequest, SmartReminderSuggestResponse>('POST'),
  // Assistant & search
  'assistant-ask': fn<AssistantAskRequest, AssistantAskResponse>('POST'),
  'assistant-suggested-questions': fn<{ contactId?: UUID | null }, SuggestedQuestionsResponse>('GET'),
  'assistant-transcribe': fn<FormData, TranscribeResponse | { provider: 'device' }>('POST'),
  search: fn<SearchRequest, SearchResponse>('POST'),
  // Capture & people
  'capture-analyze': fn<{ captureId: UUID }, Capture>('POST'),
  person: fn<{ contactId: UUID }, PersonResponse>('GET'),
  // Briefings
  briefing: fn<BriefingRequest, BriefingResponse>('GET'),
  'briefing-audio': fn<BriefingAudioRequest, BriefingAudioResponse>('POST'),
  'briefing-close-day': fn<{ briefingId: UUID; carryOverInsightIds: UUID[] }, Briefing>('POST'),
  // Billing & referral
  entitlement: fn<Record<string, never>, EntitlementResponse>('GET'),
  'billing-link-revenuecat': fn<{ appUserId: string }, { ok: true }>('POST'),
  'referral-status': fn<Record<string, never>, ReferralStatusResponse>('GET'),
  'referral-redeem': fn<ReferralRedeemRequest, { ok: boolean; reason?: string; bonusDays?: number }>('POST'),
  // Privacy
  'privacy-export-request': fn<Record<string, never>, DataExportRequest>('POST'),
  'privacy-export-status': fn<{ id?: UUID }, ExportStatusResponse | null>('GET'),
  'privacy-delete-account': fn<DeleteAccountRequest, { ok: true }>('POST'),
  // Android
  'android-notifications-ingest': fn<{ items: Omit<AndroidNotificationItem, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'analysis' | 'insightId'>[] }, { accepted: number }>('POST'),
  // Webhooks & cron (no user JWT; verified by signature / secret)
  'webhook-gmail': fn<unknown, { ok: true }>('POST', false),
  'webhook-microsoft': fn<unknown, { ok: true }>('POST', false),
  'webhook-revenuecat': fn<unknown, { ok: true }>('POST', false),
  'cron-dispatch': fn<{ job: 'briefings' | 'sync-poll' | 'reminders' | 'followups' | 'renew-subscriptions' | 'retention' | 'exports' | 'backfill'; date?: ISODate }, { ok: true; processed: number }>('POST', false),
} as const;

export type EdgeFunctionName = keyof typeof EDGE_FUNCTIONS;
export type EdgeFunctionRequest<N extends EdgeFunctionName> = NonNullable<(typeof EDGE_FUNCTIONS)[N]['_req']>;
export type EdgeFunctionResponse<N extends EdgeFunctionName> = NonNullable<(typeof EDGE_FUNCTIONS)[N]['_res']>;

/** Accounts / provider → ConnectedAccount typed helper re-export for adapters. */
export type ConnectedAccountRow = ConnectedAccount;
