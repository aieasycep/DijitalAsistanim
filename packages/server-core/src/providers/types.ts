/**
 * Provider adapter contracts: draft shapes that Gmail / Google Calendar / Google Tasks / Microsoft
 * Graph normalisers produce, delta results the sync jobs persist, and the uniform client
 * interfaces Edge Functions use so both providers look the same.
 *
 * Drafts are domain entities minus the columns the persistence layer assigns (ids, ownership,
 * timestamps, fingerprints, analysis). Everything provider-specific that the domain entity does
 * not carry (thread id, RFC message ids, read state) is added explicitly.
 */
import type { CalendarEvent, EmailMessage, EmailParticipant, EmailThread, TaskItem } from '@da/domain';
import type { FetchLike } from '../safefetch/fetch';

/** Injected fetch (the global in edge functions, a stub in tests). */
export type ProviderFetch = FetchLike;

export type ProviderId = 'google' | 'microsoft';

export interface ProviderClientOptions {
  /** Address of the connected account — drives `isFromUser` / `organizerIsUser` and the From mailbox. */
  userEmail?: string | null;
  /** IANA zone used to anchor all-day events (default `UTC`). */
  defaultTimezone?: string;
  /** Per-request timeout (default 20 000 ms). */
  timeoutMs?: number;
}

// --- Mail ------------------------------------------------------------------------------------------

export type EmailAttachmentMeta = EmailMessage['attachments'][number];

export type EmailMessageDraft = Omit<
  EmailMessage,
  | 'id'
  | 'userId'
  | 'accountId'
  | 'threadId'
  | 'fingerprint'
  | 'analysis'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
> & {
  /** Gmail threadId / Graph conversationId. */
  externalThreadId: string;
  /** Provider delivery instant (Gmail internalDate / Graph receivedDateTime). */
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  bcc: EmailParticipant[];
  /** RFC 5322 Message-ID (angle brackets stripped) when the provider exposes it. */
  rfcMessageId: string | null;
  inReplyTo: string | null;
  references: string[];
};

export type EmailThreadDraft = Pick<
  EmailThread,
  | 'externalThreadId'
  | 'subject'
  | 'snippet'
  | 'participants'
  | 'lastMessageAt'
  | 'messageCount'
  | 'lastFromUser'
  | 'isRead'
  | 'labels'
> & {
  firstMessageAt: string;
  unreadCount: number;
  hasAttachments: boolean;
  /** External ids of the messages that formed this draft (oldest first). */
  externalMessageIds: string[];
};

export interface MailDelta {
  messages: EmailMessageDraft[];
  deletedExternalIds: string[];
  /** Cursor to persist; `null` means "keep the current cursor". */
  nextCursor: string | null;
  /** Continuation token for a multi-page listing (persist in `backfill_page_token`). */
  nextPageToken: string | null;
  hasMore: boolean;
  /** The provider lost our cursor (Gmail history 404 / Google 410 / Graph 410): start over. */
  fullResyncRequired?: boolean;
}

export interface MailSyncInput {
  cursor: string | null;
  pageToken?: string | null;
  /** Upper bound of normalised messages per call (default 100). */
  maxMessages?: number;
  /** Initial backfill window when no cursor exists (default 72 h). */
  backfillWindowHours?: number;
  /** Anchors relative windows; defaults to the current time. */
  now?: string;
}

export interface SendMailInput {
  to: EmailParticipant[];
  cc?: EmailParticipant[];
  bcc?: EmailParticipant[];
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  /**
   * Provider message id (Gmail message id / Graph message id) of the message being answered.
   * The client owns threading: Gmail looks up the RFC headers, Graph replies through the message.
   */
  inReplyToExternalMessageId?: string | null;
  /** RFC Message-IDs for the References header when already known (Gmail). */
  references?: string[];
  externalThreadId?: string | null;
  fromName?: string | null;
}

export interface SendMailResult {
  externalMessageId: string;
  externalThreadId: string | null;
}

export interface MailClient {
  sync(input: MailSyncInput): Promise<MailDelta>;
  send(input: SendMailInput): Promise<SendMailResult>;
  getMessage(externalMessageId: string): Promise<EmailMessageDraft>;
  markRead(externalMessageId: string, isRead?: boolean): Promise<void>;
}

// --- Calendar --------------------------------------------------------------------------------------

export type CalendarEventDraft = Omit<
  CalendarEvent,
  | 'id'
  | 'userId'
  | 'accountId'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
  | 'prepGeneratedAt'
  | 'postMeetingHandledAt'
> & {
  webUrl: string | null;
  /** Series master id for recurring occurrences. */
  recurringEventId: string | null;
};

export interface CalendarDelta {
  events: CalendarEventDraft[];
  deletedExternalIds: string[];
  nextCursor: string | null;
  nextPageToken: string | null;
  hasMore: boolean;
  fullResyncRequired?: boolean;
}

export interface CalendarSyncInput {
  cursor: string | null;
  pageToken?: string | null;
  /** Initial window (defaults: 30 days back, 90 days forward). */
  windowDaysBack?: number;
  windowDaysForward?: number;
  now?: string;
  calendarId?: string;
}

export interface CreateEventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  attendees?: EmailParticipant[];
  /** IANA zone the event is expressed in (all-day dates, recurrence). */
  timezone: string;
  /** Ask the provider to attach a Meet / Teams link. */
  conferenceRequested?: boolean;
  /** Send invitations to attendees (default: yes when there are attendees). */
  sendInvites?: boolean;
  calendarId?: string;
}

export interface UpdateEventInput {
  title?: string;
  description?: string | null;
  location?: string | null;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  attendees?: EmailParticipant[];
  /** IANA zone the patched times are expressed in. */
  timezone: string;
  calendarId?: string;
  sendUpdates?: boolean;
}

export interface CreateEventResult {
  externalEventId: string;
  htmlLink: string | null;
}

export interface CalendarClient {
  sync(input: CalendarSyncInput): Promise<CalendarDelta>;
  createEvent(input: CreateEventInput): Promise<CreateEventResult>;
  updateEvent(externalEventId: string, patch: UpdateEventInput): Promise<void>;
  deleteEvent(externalEventId: string, opts?: { calendarId?: string }): Promise<void>;
}

// --- Tasks -----------------------------------------------------------------------------------------

export type TaskDraft = Omit<
  TaskItem,
  | 'id'
  | 'userId'
  | 'accountId'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
  | 'externalTaskId'
  | 'source'
  | 'scheduledStartAt'
  | 'scheduledEndAt'
> & {
  externalTaskId: string;
  externalListId: string;
  providerUpdatedAt: string | null;
  webUrl: string | null;
};

export interface TasksDelta {
  tasks: TaskDraft[];
  deletedExternalIds: string[];
  nextCursor: string | null;
  nextPageToken: string | null;
  hasMore: boolean;
  fullResyncRequired?: boolean;
}

export interface TasksSyncInput {
  cursor: string | null;
  now?: string;
}

export interface CreateTaskInput {
  title: string;
  notes: string | null;
  dueAt: string | null;
  /** Target list; the provider's default list when omitted (Google `@default`, Graph `defaultList`). */
  listId?: string | null;
}

export interface CreateTaskResult {
  externalTaskId: string;
  listId: string;
}

export interface TasksClient {
  sync(input: TasksSyncInput): Promise<TasksDelta>;
  createTask(input: CreateTaskInput): Promise<CreateTaskResult>;
}

// --- Webhooks --------------------------------------------------------------------------------------

export interface WatchResult {
  subscriptionId: string;
  expiresAt: string;
}

export interface ProviderClients {
  provider: ProviderId;
  mail: MailClient;
  calendar: CalendarClient;
  tasks: TasksClient;
}
