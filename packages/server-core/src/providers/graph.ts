/**
 * Microsoft Graph v1.0 adapter: mail (folder delta, send/reply, read state), calendar
 * (calendarView delta, create/update/delete), To Do (list delta, create) and change
 * subscriptions, plus normalisers to the domain drafts.
 *
 * Cursors: mail and tasks sync several folders/lists at once, so their cursor is a small JSON
 * document mapping folder → deltaLink; calendar uses the deltaLink string directly. A
 * `@odata.nextLink` is a valid continuation cursor, so long deltas can be resumed later.
 */
import type { CalendarAttendee, EmailParticipant, Importance } from '@da/domain';
import { AppError } from '../errors';
import { MICROSOFT_SCOPES } from '../oauth/scopes';
import { collapseWhitespace } from '../safefetch/readable';
import { MINUTE, addDays, clamp, truncate } from '../util';
import {
  addCalendarDays,
  dateToInstant,
  localDateInZone,
  localDateTimeInZone,
  zonedDateTimeToUtc,
} from './datetime';
import {
  encodePathSegment,
  isProviderStatus,
  providerRequest,
  providerRequestRaw,
  sameEmail,
  toIsoOrNull,
} from './http';
import { detectMeetingLink, meetingProviderFor, type MeetingLink } from './meeting';
import { htmlToText } from './mime';
import type {
  CalendarDelta,
  CalendarEventDraft,
  CalendarSyncInput,
  CreateEventInput,
  CreateEventResult,
  CreateTaskInput,
  CreateTaskResult,
  EmailAttachmentMeta,
  EmailMessageDraft,
  MailDelta,
  MailSyncInput,
  ProviderClientOptions,
  ProviderFetch,
  SendMailInput,
  SendMailResult,
  TaskDraft,
  TasksDelta,
  TasksSyncInput,
  UpdateEventInput,
  WatchResult,
} from './types';

export const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
export const GRAPH_MAIL_READWRITE_SCOPE = 'Mail.ReadWrite';
/** Folders synced by default: inbox for incoming mail, sent items so follow-ups see replies. */
export const DEFAULT_GRAPH_MAIL_FOLDERS: readonly string[] = ['inbox', 'sentitems'];
/** Conservative maximum lifetime of an Outlook resource subscription (3 days). */
export const GRAPH_MAX_SUBSCRIPTION_MINUTES = 4230;

const DEFAULT_MAX_MESSAGES = 100;
const DEFAULT_BACKFILL_HOURS = 72;
const DEFAULT_WINDOW_DAYS_BACK = 30;
const DEFAULT_WINDOW_DAYS_FORWARD = 90;
const DEFAULT_MAX_PAGES = 10;
const PAGE_SIZE = 50;
const SNIPPET_LENGTH = 280;
const BODY_MAX_LENGTH = 100_000;
const DESCRIPTION_MAX_LENGTH = 10_000;

const MESSAGE_SELECT = [
  'id',
  'conversationId',
  'subject',
  'bodyPreview',
  'body',
  'from',
  'sender',
  'toRecipients',
  'ccRecipients',
  'bccRecipients',
  'receivedDateTime',
  'sentDateTime',
  'isRead',
  'isDraft',
  'hasAttachments',
  'internetMessageId',
  'webLink',
  'flag',
  'categories',
  'importance',
  'parentFolderId',
].join(',');

const PREFER_TEXT_BODY = 'outlook.body-content-type="text"';
const PREFER_HTML_BODY = 'outlook.body-content-type="html"';
const PREFER_IMMUTABLE_ID = 'IdType="ImmutableId"';
const PREFER_UTC = 'outlook.timezone="UTC"';
const PREFER_PAGE = `odata.maxpagesize=${PAGE_SIZE}`;

// --- Raw API shapes -------------------------------------------------------------------------------

export interface GraphEmailAddress {
  name?: string;
  address?: string;
}
export interface GraphRecipient {
  emailAddress?: GraphEmailAddress;
}
export interface GraphItemBody {
  contentType?: 'text' | 'html' | 'Text' | 'HTML';
  content?: string;
}
export interface GraphAttachment {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
}
export interface GraphMessage {
  id: string;
  '@removed'?: { reason?: string };
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: GraphItemBody;
  from?: GraphRecipient;
  sender?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  isDraft?: boolean;
  hasAttachments?: boolean;
  internetMessageId?: string;
  webLink?: string;
  flag?: { flagStatus?: 'notFlagged' | 'complete' | 'flagged' };
  categories?: string[];
  importance?: 'low' | 'normal' | 'high';
  parentFolderId?: string;
  attachments?: GraphAttachment[];
  internetMessageHeaders?: { name?: string; value?: string }[];
}
export interface GraphDateTimeTimeZone {
  dateTime?: string;
  timeZone?: string;
}
export type GraphResponseType =
  'none' | 'organizer' | 'tentativelyAccepted' | 'accepted' | 'declined' | 'notResponded';
export interface GraphAttendee {
  emailAddress?: GraphEmailAddress;
  type?: 'required' | 'optional' | 'resource';
  status?: { response?: GraphResponseType; time?: string };
}
export interface GraphEvent {
  id: string;
  '@removed'?: { reason?: string };
  subject?: string;
  bodyPreview?: string;
  body?: GraphItemBody;
  start?: GraphDateTimeTimeZone;
  end?: GraphDateTimeTimeZone;
  isAllDay?: boolean;
  isCancelled?: boolean;
  isOrganizer?: boolean;
  location?: { displayName?: string };
  attendees?: GraphAttendee[];
  organizer?: GraphRecipient;
  onlineMeeting?: { joinUrl?: string } | null;
  onlineMeetingUrl?: string | null;
  onlineMeetingProvider?: string;
  isOnlineMeeting?: boolean;
  webLink?: string;
  lastModifiedDateTime?: string;
  createdDateTime?: string;
  seriesMasterId?: string | null;
  type?: 'singleInstance' | 'occurrence' | 'exception' | 'seriesMaster';
  showAs?: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown';
  responseStatus?: { response?: GraphResponseType };
}
export interface GraphTodoList {
  id: string;
  displayName?: string;
  wellknownListName?: 'none' | 'defaultList' | 'flaggedEmails' | 'unknownFutureValue';
}
export interface GraphTodoTask {
  id: string;
  '@removed'?: { reason?: string };
  title?: string;
  body?: GraphItemBody;
  status?: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred';
  importance?: 'low' | 'normal' | 'high';
  dueDateTime?: GraphDateTimeTimeZone | null;
  completedDateTime?: GraphDateTimeTimeZone | null;
  lastModifiedDateTime?: string;
  createdDateTime?: string;
}
export interface GraphCollection<T> {
  value?: T[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}
export interface GraphSubscription {
  id: string;
  resource: string;
  changeType: string;
  expirationDateTime: string;
  notificationUrl: string;
  clientState?: string;
}
export interface GraphUser {
  id: string;
  mail?: string | null;
  userPrincipalName?: string;
  displayName?: string;
}

// --- Shared helpers -------------------------------------------------------------------------------

function participant(address: GraphEmailAddress | undefined): EmailParticipant | null {
  const email = address?.address?.trim().toLowerCase();
  if (!email) return null;
  return { name: address?.name?.trim() || null, email };
}

function participants(list: GraphRecipient[] | undefined): EmailParticipant[] {
  return (list ?? [])
    .map((r) => participant(r.emailAddress))
    .filter((p): p is EmailParticipant => p !== null);
}

function recipientBody(p: EmailParticipant): { emailAddress: GraphEmailAddress } {
  return { emailAddress: { address: p.email, ...(p.name ? { name: p.name } : {}) } };
}

function bodyToText(body: GraphItemBody | undefined): string {
  const content = body?.content ?? '';
  if (!content) return '';
  return body?.contentType?.toLowerCase() === 'html' ? htmlToText(content) : content;
}

function stripAngle(id: string | null | undefined): string | null {
  const trimmed = id?.trim() ?? '';
  return trimmed.replace(/^<|>$/g, '') || null;
}

/** Graph `dateTimeTimeZone` → ISO instant (null when absent). */
export function parseGraphDateTime(value: GraphDateTimeTimeZone | null | undefined): string | null {
  const raw = value?.dateTime?.trim();
  if (!raw) return null;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) return toIsoOrNull(raw);
  return zonedDateTimeToUtc(raw.slice(0, 19), value?.timeZone ?? 'UTC');
}

function graphDateTime(iso: string, zone: string): GraphDateTimeTimeZone {
  return { dateTime: localDateTimeInZone(iso, zone), timeZone: zone };
}

function graphAllDay(
  startAt: string,
  endAt: string,
  zone: string,
): [GraphDateTimeTimeZone, GraphDateTimeTimeZone] {
  const startDate = localDateInZone(startAt, zone);
  let endDate = localDateInZone(endAt, zone);
  if (endDate <= startDate) endDate = addCalendarDays(startDate, 1);
  return [
    { dateTime: `${startDate}T00:00:00`, timeZone: zone },
    { dateTime: `${endDate}T00:00:00`, timeZone: zone },
  ];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain text → minimal HTML (paragraphs and line breaks) for Outlook bodies. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

interface DeltaResult<T> {
  items: T[];
  removed: string[];
  deltaLink: string | null;
  nextLink: string | null;
}

// --- Cursors ------------------------------------------------------------------------------------

interface GraphMapCursor {
  v: 1;
  links: Record<string, string>;
}

function decodeMapCursor(
  cursor: string | null | undefined,
  legacyKey: string,
): Record<string, string> {
  if (!cursor) return {};
  if (cursor.startsWith('{')) {
    try {
      const parsed = JSON.parse(cursor) as Partial<GraphMapCursor>;
      const links = parsed.links;
      if (typeof links === 'object' && links !== null) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(links)) if (typeof v === 'string' && v) out[k] = v;
        return out;
      }
    } catch {
      return {};
    }
    return {};
  }
  return cursor.startsWith('http') ? { [legacyKey]: cursor } : {};
}

function encodeMapCursor(links: Record<string, string>): string {
  const cursor: GraphMapCursor = { v: 1, links };
  return JSON.stringify(cursor);
}

/** Mail cursor: `{ v: 1, links: { inbox: deltaLink, sentitems: deltaLink } }`. */
export function decodeGraphMailCursor(cursor: string | null | undefined): Record<string, string> {
  return decodeMapCursor(cursor, 'inbox');
}
export function encodeGraphMailCursor(links: Record<string, string>): string {
  return encodeMapCursor(links);
}

// --- Normalisation: mail --------------------------------------------------------------------------

export interface NormalizeGraphMessageOptions {
  userEmail?: string | null;
}

export function normalizeGraphMessage(
  raw: GraphMessage,
  opts: NormalizeGraphMessageOptions = {},
): EmailMessageDraft {
  const from: EmailParticipant = participant(raw.from?.emailAddress) ??
    participant(raw.sender?.emailAddress) ?? { name: null, email: '' };
  const bodyText = truncate(bodyToText(raw.body).trim(), BODY_MAX_LENGTH);
  const preview = collapseWhitespace(raw.bodyPreview ?? '');
  const snippet = truncate(preview || collapseWhitespace(bodyText), SNIPPET_LENGTH);
  const receivedAt = toIsoOrNull(raw.receivedDateTime);
  const sentAt = toIsoOrNull(raw.sentDateTime) ?? receivedAt ?? new Date(0).toISOString();
  const attachments: EmailAttachmentMeta[] = (raw.attachments ?? [])
    .filter((a) => a.isInline !== true)
    .map((a) => ({
      id: a.id,
      filename: a.name ?? '',
      mimeType: a.contentType ?? 'application/octet-stream',
      size: a.size ?? 0,
    }));
  const headers = raw.internetMessageHeaders ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
  return {
    externalMessageId: raw.id,
    externalThreadId: raw.conversationId ?? raw.id,
    from,
    to: participants(raw.toRecipients),
    cc: participants(raw.ccRecipients),
    bcc: participants(raw.bccRecipients),
    subject: raw.subject?.trim() ?? '',
    snippet,
    bodyText: bodyText || snippet,
    sentAt,
    receivedAt: receivedAt ?? sentAt,
    isFromUser: sameEmail(from.email, opts.userEmail),
    isRead: raw.isRead ?? true,
    isStarred: raw.flag?.flagStatus === 'flagged',
    hasAttachments: raw.hasAttachments ?? attachments.length > 0,
    attachments,
    labels: raw.categories ?? [],
    webUrl: raw.webLink ?? null,
    rfcMessageId: stripAngle(raw.internetMessageId),
    inReplyTo: stripAngle(header('In-Reply-To')),
    references: (header('References') ?? '')
      .split(/\s+/)
      .map((r) => stripAngle(r))
      .filter((r): r is string => r !== null),
  };
}

// --- Normalisation: calendar ----------------------------------------------------------------------

export interface NormalizeGraphEventOptions {
  userEmail?: string | null;
  calendarId?: string;
  /** Zone that anchors all-day events (default UTC). */
  defaultTimezone?: string;
}

function mapResponse(response: GraphResponseType | undefined): CalendarAttendee['responseStatus'] {
  switch (response) {
    case 'accepted':
    case 'organizer':
      return 'accepted';
    case 'declined':
      return 'declined';
    case 'tentativelyAccepted':
      return 'tentative';
    case 'none':
    case 'notResponded':
      return 'needsAction';
    default:
      return null;
  }
}

function graphMeetingLink(raw: GraphEvent): MeetingLink | null {
  const url = raw.onlineMeeting?.joinUrl ?? raw.onlineMeetingUrl ?? null;
  if (url) {
    const provider = raw.onlineMeetingProvider ?? '';
    return {
      url,
      provider:
        /^teams/i.test(provider) || /^skype/i.test(provider) ? 'teams' : meetingProviderFor(url),
    };
  }
  return detectMeetingLink(raw.location?.displayName, raw.bodyPreview, raw.body?.content);
}

export function normalizeGraphEvent(
  raw: GraphEvent,
  opts: NormalizeGraphEventOptions = {},
): CalendarEventDraft {
  const zone = opts.defaultTimezone ?? 'UTC';
  const allDay = raw.isAllDay === true;
  let startAt: string;
  let endAt: string;
  if (allDay) {
    const startDate = (raw.start?.dateTime ?? '').slice(0, 10);
    const endDate = (raw.end?.dateTime ?? '').slice(0, 10);
    startAt = startDate
      ? dateToInstant(startDate, zone)
      : (parseGraphDateTime(raw.start) ?? new Date(0).toISOString());
    endAt =
      endDate && endDate > startDate
        ? dateToInstant(endDate, zone)
        : dateToInstant(addCalendarDays(startDate || '1970-01-01', 1), zone);
  } else {
    startAt =
      parseGraphDateTime(raw.start) ??
      toIsoOrNull(raw.createdDateTime) ??
      new Date(0).toISOString();
    endAt = parseGraphDateTime(raw.end) ?? startAt;
  }
  const organizerEmail = raw.organizer?.emailAddress?.address ?? null;
  const attendees: CalendarAttendee[] = (raw.attendees ?? [])
    .filter((a) => a.type !== 'resource')
    .map((a) => ({
      name: a.emailAddress?.name?.trim() || null,
      email: a.emailAddress?.address?.trim().toLowerCase() || null,
      contactId: null,
      isOrganizer:
        a.status?.response === 'organizer' || sameEmail(a.emailAddress?.address, organizerEmail),
      responseStatus: mapResponse(a.status?.response),
    }));
  const meeting = graphMeetingLink(raw);
  const status: CalendarEventDraft['status'] = raw.isCancelled
    ? 'cancelled'
    : raw.showAs === 'tentative' || raw.responseStatus?.response === 'tentativelyAccepted'
      ? 'tentative'
      : 'confirmed';
  const description = truncate(
    bodyToText(raw.body).trim() || collapseWhitespace(raw.bodyPreview ?? ''),
    DESCRIPTION_MAX_LENGTH,
  );
  return {
    externalEventId: raw.id,
    calendarId: opts.calendarId ?? 'primary',
    title: raw.subject?.trim() ?? '',
    description: description || null,
    location: raw.location?.displayName?.trim() || null,
    meetingUrl: meeting?.url ?? null,
    meetingProvider: meeting?.provider ?? null,
    startAt,
    endAt,
    allDay,
    attendees,
    organizerIsUser: raw.isOrganizer === true || sameEmail(organizerEmail, opts.userEmail),
    status,
    providerUpdatedAt: toIsoOrNull(raw.lastModifiedDateTime),
    source: 'microsoft_calendar',
    isAiCreated: false,
    webUrl: raw.webLink ?? null,
    recurringEventId: raw.seriesMasterId ?? null,
  };
}

// --- Normalisation: tasks -------------------------------------------------------------------------

function importanceToPriority(importance: GraphTodoTask['importance']): Importance {
  if (importance === 'high') return 'high';
  if (importance === 'low') return 'low';
  return 'normal';
}

export function normalizeGraphTask(raw: GraphTodoTask, opts: { listId: string }): TaskDraft {
  const completed = raw.status === 'completed';
  const notes = bodyToText(raw.body).trim();
  return {
    externalTaskId: raw.id,
    externalListId: opts.listId,
    title: raw.title?.trim() ?? '',
    notes: notes || null,
    dueAt: parseGraphDateTime(raw.dueDateTime),
    status: completed ? 'completed' : 'open',
    completedAt: completed ? parseGraphDateTime(raw.completedDateTime) : null,
    provider: 'microsoft',
    priority: importanceToPriority(raw.importance),
    providerUpdatedAt: toIsoOrNull(raw.lastModifiedDateTime),
    webUrl: null,
  };
}

// --- Request bodies -------------------------------------------------------------------------------

/** Graph event resource for create (full) or update (partial) calls. */
export function graphEventBody(
  input: CreateEventInput | UpdateEventInput,
  mode: 'create' | 'update',
): Record<string, unknown> {
  const zone = input.timezone;
  const allDay = input.allDay === true;
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.subject = input.title;
  if (input.description !== undefined) {
    body.body = { contentType: 'text', content: input.description ?? '' };
  }
  if (input.location !== undefined) body.location = { displayName: input.location ?? '' };
  if (input.attendees !== undefined) {
    body.attendees = input.attendees.map((a) => ({ ...recipientBody(a), type: 'required' }));
  }
  if (input.startAt !== undefined && input.endAt !== undefined && allDay) {
    const [start, end] = graphAllDay(input.startAt, input.endAt, zone);
    body.start = start;
    body.end = end;
    body.isAllDay = true;
  } else {
    if (input.startAt !== undefined) body.start = graphDateTime(input.startAt, zone);
    if (input.endAt !== undefined) body.end = graphDateTime(input.endAt, zone);
    if (input.allDay !== undefined || mode === 'create') body.isAllDay = allDay;
  }
  if (mode === 'create' && (input as CreateEventInput).conferenceRequested) {
    body.isOnlineMeeting = true;
    body.onlineMeetingProvider = 'teamsForBusiness';
  }
  return body;
}

function graphTaskBody(input: CreateTaskInput): Record<string, unknown> {
  const due = input.dueAt ? toIsoOrNull(input.dueAt) : null;
  return {
    title: input.title,
    ...(input.notes ? { body: { contentType: 'text', content: input.notes } } : {}),
    ...(due ? { dueDateTime: { dateTime: `${due.slice(0, 10)}T00:00:00`, timeZone: 'UTC' } } : {}),
  };
}

// --- Client -------------------------------------------------------------------------------------

export interface GraphClientOptions extends ProviderClientOptions {
  baseUrl?: string;
}

export interface GraphMailSyncInput extends MailSyncInput {
  /** Well-known folder names or ids (default inbox + sentitems). */
  folders?: readonly string[];
  maxPages?: number;
}

export interface GraphCalendarSyncInput extends CalendarSyncInput {
  maxPages?: number;
}

export interface GraphMailApi {
  delta(input: {
    deltaLink?: string | null;
    folder?: string;
    since?: string | null;
    maxItems?: number;
    maxPages?: number;
  }): Promise<DeltaResult<GraphMessage>>;
  getMessage(id: string): Promise<GraphMessage>;
  send(input: SendMailInput): Promise<SendMailResult>;
  markRead(id: string, isRead?: boolean): Promise<void>;
  sync(input: GraphMailSyncInput): Promise<MailDelta>;
}

export interface GraphCalendarApi {
  delta(input: {
    deltaLink?: string | null;
    startDateTime?: string;
    endDateTime?: string;
    maxItems?: number;
    maxPages?: number;
  }): Promise<DeltaResult<GraphEvent>>;
  createEvent(input: CreateEventInput): Promise<CreateEventResult>;
  updateEvent(externalEventId: string, patch: UpdateEventInput): Promise<void>;
  deleteEvent(externalEventId: string): Promise<void>;
  sync(input: GraphCalendarSyncInput): Promise<CalendarDelta>;
}

export interface GraphTasksApi {
  listLists(): Promise<GraphTodoList[]>;
  listTasks(listId: string): Promise<GraphTodoTask[]>;
  delta(listId: string, deltaLink?: string | null): Promise<DeltaResult<GraphTodoTask>>;
  createTask(listId: string | null | undefined, input: CreateTaskInput): Promise<CreateTaskResult>;
  sync(input: TasksSyncInput): Promise<TasksDelta>;
}

export interface GraphSubscriptionsApi {
  create(input: {
    resource: string;
    changeType: string;
    notificationUrl: string;
    clientState: string;
    expirationMinutes?: number;
    lifecycleNotificationUrl?: string;
    now?: string;
  }): Promise<WatchResult>;
  renew(id: string, expirationMinutes?: number, now?: string): Promise<WatchResult>;
  delete(id: string): Promise<void>;
}

export interface GraphClient {
  mail: GraphMailApi;
  calendar: GraphCalendarApi;
  tasks: GraphTasksApi;
  subscriptions: GraphSubscriptionsApi;
  me(): Promise<{ id: string; email: string | null; displayName: string | null }>;
}

const EMPTY_MAIL_DELTA: MailDelta = {
  messages: [],
  deletedExternalIds: [],
  nextCursor: null,
  nextPageToken: null,
  hasMore: false,
};
const EMPTY_CALENDAR_DELTA: CalendarDelta = {
  events: [],
  deletedExternalIds: [],
  nextCursor: null,
  nextPageToken: null,
  hasMore: false,
};
const EMPTY_TASKS_DELTA: TasksDelta = {
  tasks: [],
  deletedExternalIds: [],
  nextCursor: null,
  nextPageToken: null,
  hasMore: false,
};

function expirationIso(minutes: number | undefined, now: string | undefined): string {
  const clamped = clamp(
    minutes ?? GRAPH_MAX_SUBSCRIPTION_MINUTES,
    1,
    GRAPH_MAX_SUBSCRIPTION_MINUTES,
  );
  const base = now ? Date.parse(now) : Date.now();
  return new Date(base + clamped * MINUTE).toISOString();
}

export function createGraphClient(
  fetchImpl: ProviderFetch,
  accessToken: string,
  opts: GraphClientOptions = {},
): GraphClient {
  const base = opts.baseUrl ?? GRAPH_API_BASE;
  const timeoutMs = opts.timeoutMs;
  const zone = opts.defaultTimezone ?? 'UTC';

  const get = <T>(url: string, requiredScope: string, headers?: Record<string, string>) =>
    providerRequest<T>(fetchImpl, { url, token: accessToken, timeoutMs, requiredScope, headers });

  async function followDelta<T extends { id: string; '@removed'?: unknown }>(
    startUrl: string,
    headers: Record<string, string>,
    requiredScope: string,
    limits: { maxItems: number; maxPages: number },
  ): Promise<DeltaResult<T>> {
    const items: T[] = [];
    const removed: string[] = [];
    let url = startUrl;
    for (let page = 1; ; page++) {
      const result = await get<GraphCollection<T>>(url, requiredScope, headers);
      for (const item of result.value ?? []) {
        if (item['@removed']) removed.push(item.id);
        else items.push(item);
      }
      const deltaLink = result['@odata.deltaLink'] ?? null;
      const nextLink = result['@odata.nextLink'] ?? null;
      if (deltaLink) return { items, removed, deltaLink, nextLink: null };
      if (!nextLink) return { items, removed, deltaLink: null, nextLink: null };
      if (items.length >= limits.maxItems || page >= limits.maxPages) {
        return { items, removed, deltaLink: null, nextLink };
      }
      url = nextLink;
    }
  }

  // --- mail ---
  const mailHeaders = { prefer: `${PREFER_TEXT_BODY}, ${PREFER_IMMUTABLE_ID}, ${PREFER_PAGE}` };

  const mailDelta: GraphMailApi['delta'] = (input) => {
    const folder = input.folder ?? 'inbox';
    let url = input.deltaLink ?? null;
    if (!url) {
      const target = new URL(`${base}/me/mailFolders/${encodePathSegment(folder)}/messages/delta`);
      target.searchParams.set('$select', MESSAGE_SELECT);
      if (input.since) target.searchParams.set('$filter', `receivedDateTime ge ${input.since}`);
      url = target.toString();
    }
    return followDelta<GraphMessage>(url, mailHeaders, MICROSOFT_SCOPES.mailRead, {
      maxItems: input.maxItems ?? DEFAULT_MAX_MESSAGES,
      maxPages: input.maxPages ?? DEFAULT_MAX_PAGES,
    });
  };

  const getMessage: GraphMailApi['getMessage'] = (id) => {
    const target = new URL(`${base}/me/messages/${encodePathSegment(id)}`);
    target.searchParams.set('$select', MESSAGE_SELECT);
    target.searchParams.set('$expand', 'attachments($select=id,name,contentType,size,isInline)');
    return get<GraphMessage>(target.toString(), MICROSOFT_SCOPES.mailRead, {
      prefer: `${PREFER_TEXT_BODY}, ${PREFER_IMMUTABLE_ID}`,
    });
  };

  const draftHeaders = { prefer: `${PREFER_HTML_BODY}, ${PREFER_IMMUTABLE_ID}` };

  /**
   * Reply: createReply (keeps conversation + In-Reply-To) → PATCH our text above the quoted
   * history → send. New mail: create draft → send. Both return a real message id.
   */
  const send: GraphMailApi['send'] = async (input) => {
    const ourHtml = input.bodyHtml?.trim() || textToHtml(input.bodyText);
    let draft: GraphMessage;
    if (input.inReplyToExternalMessageId) {
      draft = await providerRequest<GraphMessage>(fetchImpl, {
        url: `${base}/me/messages/${encodePathSegment(input.inReplyToExternalMessageId)}/createReply`,
        method: 'POST',
        token: accessToken,
        timeoutMs,
        requiredScope: GRAPH_MAIL_READWRITE_SCOPE,
        headers: draftHeaders,
        body: {},
      });
      const quoted = draft.body?.content ?? '';
      await providerRequest<GraphMessage>(fetchImpl, {
        url: `${base}/me/messages/${encodePathSegment(draft.id)}`,
        method: 'PATCH',
        token: accessToken,
        timeoutMs,
        requiredScope: GRAPH_MAIL_READWRITE_SCOPE,
        headers: draftHeaders,
        body: {
          body: { contentType: 'html', content: quoted ? `${ourHtml}<br>${quoted}` : ourHtml },
          ...(input.to.length > 0 ? { toRecipients: input.to.map(recipientBody) } : {}),
          ...(input.cc?.length ? { ccRecipients: input.cc.map(recipientBody) } : {}),
          ...(input.bcc?.length ? { bccRecipients: input.bcc.map(recipientBody) } : {}),
        },
      });
    } else {
      draft = await providerRequest<GraphMessage>(fetchImpl, {
        url: `${base}/me/messages`,
        method: 'POST',
        token: accessToken,
        timeoutMs,
        requiredScope: GRAPH_MAIL_READWRITE_SCOPE,
        headers: draftHeaders,
        body: {
          subject: input.subject,
          body: { contentType: 'html', content: ourHtml },
          toRecipients: input.to.map(recipientBody),
          ...(input.cc?.length ? { ccRecipients: input.cc.map(recipientBody) } : {}),
          ...(input.bcc?.length ? { bccRecipients: input.bcc.map(recipientBody) } : {}),
        },
      });
    }
    await providerRequestRaw(fetchImpl, {
      url: `${base}/me/messages/${encodePathSegment(draft.id)}/send`,
      method: 'POST',
      token: accessToken,
      timeoutMs,
      requiredScope: MICROSOFT_SCOPES.mailSend,
      headers: { prefer: PREFER_IMMUTABLE_ID },
    });
    return {
      externalMessageId: draft.id,
      externalThreadId: draft.conversationId ?? input.externalThreadId ?? null,
    };
  };

  const markRead: GraphMailApi['markRead'] = async (id, isRead = true) => {
    await providerRequest<GraphMessage>(fetchImpl, {
      url: `${base}/me/messages/${encodePathSegment(id)}`,
      method: 'PATCH',
      token: accessToken,
      timeoutMs,
      requiredScope: GRAPH_MAIL_READWRITE_SCOPE,
      headers: { prefer: PREFER_IMMUTABLE_ID },
      body: { isRead },
    });
  };

  const mailSync: GraphMailApi['sync'] = async (input) => {
    const folders = input.folders ?? DEFAULT_GRAPH_MAIL_FOLDERS;
    const links = decodeGraphMailCursor(input.cursor);
    const nextLinks = { ...links };
    const maxMessages = clamp(input.maxMessages ?? DEFAULT_MAX_MESSAGES, 1, 1000);
    const now = input.now ?? new Date().toISOString();
    const since = addDays(now, -(input.backfillWindowHours ?? DEFAULT_BACKFILL_HOURS) / 24);
    const messages: EmailMessageDraft[] = [];
    const deleted: string[] = [];
    let hasMore = false;
    for (const folder of folders) {
      const remaining = maxMessages - messages.length;
      if (remaining <= 0) {
        hasMore = true;
        break;
      }
      let result: DeltaResult<GraphMessage>;
      try {
        result = await mailDelta({
          deltaLink: links[folder] ?? null,
          folder,
          since,
          maxItems: remaining,
          maxPages: input.maxPages,
        });
      } catch (e) {
        if (isProviderStatus(e, 410)) return { ...EMPTY_MAIL_DELTA, fullResyncRequired: true };
        throw e;
      }
      for (const raw of result.items) {
        if (raw.isDraft === true) continue;
        messages.push(normalizeGraphMessage(raw, { userEmail: opts.userEmail }));
      }
      deleted.push(...result.removed);
      if (result.deltaLink) nextLinks[folder] = result.deltaLink;
      else if (result.nextLink) {
        nextLinks[folder] = result.nextLink;
        hasMore = true;
        break;
      }
    }
    return {
      messages,
      deletedExternalIds: [...new Set(deleted)],
      nextCursor: encodeGraphMailCursor(nextLinks),
      nextPageToken: null,
      hasMore,
    };
  };

  // --- calendar ---
  const calendarHeaders = { prefer: `${PREFER_UTC}, ${PREFER_PAGE}` };

  const calendarDelta: GraphCalendarApi['delta'] = (input) => {
    let url = input.deltaLink ?? null;
    if (!url) {
      const target = new URL(`${base}/me/calendarView/delta`);
      if (input.startDateTime) target.searchParams.set('startDateTime', input.startDateTime);
      if (input.endDateTime) target.searchParams.set('endDateTime', input.endDateTime);
      url = target.toString();
    }
    return followDelta<GraphEvent>(url, calendarHeaders, MICROSOFT_SCOPES.calendarsRead, {
      maxItems: input.maxItems ?? Number.MAX_SAFE_INTEGER,
      maxPages: input.maxPages ?? DEFAULT_MAX_PAGES,
    });
  };

  const createEvent: GraphCalendarApi['createEvent'] = async (input) => {
    const created = await providerRequest<GraphEvent>(fetchImpl, {
      url: `${base}/me/events`,
      method: 'POST',
      token: accessToken,
      timeoutMs,
      requiredScope: MICROSOFT_SCOPES.calendarsReadWrite,
      headers: { prefer: PREFER_UTC },
      body: graphEventBody(input, 'create'),
    });
    return { externalEventId: created.id, htmlLink: created.webLink ?? null };
  };

  const updateEvent: GraphCalendarApi['updateEvent'] = async (externalEventId, patch) => {
    await providerRequest<GraphEvent>(fetchImpl, {
      url: `${base}/me/events/${encodePathSegment(externalEventId)}`,
      method: 'PATCH',
      token: accessToken,
      timeoutMs,
      requiredScope: MICROSOFT_SCOPES.calendarsReadWrite,
      headers: { prefer: PREFER_UTC },
      body: graphEventBody(patch, 'update'),
    });
  };

  const deleteEvent: GraphCalendarApi['deleteEvent'] = async (externalEventId) => {
    try {
      await providerRequestRaw(fetchImpl, {
        url: `${base}/me/events/${encodePathSegment(externalEventId)}`,
        method: 'DELETE',
        token: accessToken,
        timeoutMs,
        requiredScope: MICROSOFT_SCOPES.calendarsReadWrite,
      });
    } catch (e) {
      if (isProviderStatus(e, 404) || isProviderStatus(e, 410)) return;
      throw e;
    }
  };

  const calendarSync: GraphCalendarApi['sync'] = async (input) => {
    const now = input.now ?? new Date().toISOString();
    let result: DeltaResult<GraphEvent>;
    try {
      result = await calendarDelta({
        deltaLink: input.pageToken ?? input.cursor ?? null,
        startDateTime: addDays(now, -(input.windowDaysBack ?? DEFAULT_WINDOW_DAYS_BACK)),
        endDateTime: addDays(now, input.windowDaysForward ?? DEFAULT_WINDOW_DAYS_FORWARD),
        maxPages: input.maxPages,
      });
    } catch (e) {
      if (isProviderStatus(e, 410)) return { ...EMPTY_CALENDAR_DELTA, fullResyncRequired: true };
      throw e;
    }
    const events: CalendarEventDraft[] = [];
    const deleted = [...result.removed];
    for (const raw of result.items) {
      const draft = normalizeGraphEvent(raw, {
        userEmail: opts.userEmail,
        calendarId: input.calendarId,
        defaultTimezone: zone,
      });
      if (draft.status === 'cancelled') deleted.push(draft.externalEventId);
      else events.push(draft);
    }
    return {
      events,
      deletedExternalIds: [...new Set(deleted)],
      nextCursor: result.deltaLink,
      nextPageToken: result.nextLink,
      hasMore: result.nextLink !== null,
    };
  };

  // --- tasks ---
  const listLists: GraphTasksApi['listLists'] = async () => {
    const lists: GraphTodoList[] = [];
    let url: string | null = `${base}/me/todo/lists`;
    for (let page = 0; url && page < DEFAULT_MAX_PAGES; page++) {
      const result: GraphCollection<GraphTodoList> = await get<GraphCollection<GraphTodoList>>(
        url,
        MICROSOFT_SCOPES.tasksRead,
      );
      lists.push(...(result.value ?? []));
      url = result['@odata.nextLink'] ?? null;
    }
    return lists;
  };

  const listTasks: GraphTasksApi['listTasks'] = async (listId) => {
    const tasks: GraphTodoTask[] = [];
    let url: string | null = `${base}/me/todo/lists/${encodePathSegment(listId)}/tasks`;
    for (let page = 0; url && page < DEFAULT_MAX_PAGES; page++) {
      const result: GraphCollection<GraphTodoTask> = await get<GraphCollection<GraphTodoTask>>(
        url,
        MICROSOFT_SCOPES.tasksRead,
        { prefer: PREFER_PAGE },
      );
      tasks.push(...(result.value ?? []));
      url = result['@odata.nextLink'] ?? null;
    }
    return tasks;
  };

  const tasksDelta: GraphTasksApi['delta'] = (listId, deltaLink) =>
    followDelta<GraphTodoTask>(
      deltaLink ?? `${base}/me/todo/lists/${encodePathSegment(listId)}/tasks/delta`,
      { prefer: PREFER_PAGE },
      MICROSOFT_SCOPES.tasksRead,
      { maxItems: Number.MAX_SAFE_INTEGER, maxPages: DEFAULT_MAX_PAGES },
    );

  const defaultListId = async (): Promise<string> => {
    const lists = await listLists();
    const preferred = lists.find((l) => l.wellknownListName === 'defaultList') ?? lists[0];
    if (!preferred) throw new AppError('not_found', 'Görev listesi bulunamadı.');
    return preferred.id;
  };

  const createTask: GraphTasksApi['createTask'] = async (listId, input) => {
    const targetList = listId || input.listId || (await defaultListId());
    const created = await providerRequest<GraphTodoTask>(fetchImpl, {
      url: `${base}/me/todo/lists/${encodePathSegment(targetList)}/tasks`,
      method: 'POST',
      token: accessToken,
      timeoutMs,
      requiredScope: MICROSOFT_SCOPES.tasksReadWrite,
      body: graphTaskBody(input),
    });
    return { externalTaskId: created.id, listId: targetList };
  };

  const tasksSync: GraphTasksApi['sync'] = async (input) => {
    const links = decodeMapCursor(input.cursor, '');
    const nextLinks: Record<string, string> = {};
    const tasks: TaskDraft[] = [];
    const deleted: string[] = [];
    let hasMore = false;
    for (const list of await listLists()) {
      let result: DeltaResult<GraphTodoTask>;
      try {
        result = await tasksDelta(list.id, links[list.id] ?? null);
      } catch (e) {
        if (isProviderStatus(e, 410)) return { ...EMPTY_TASKS_DELTA, fullResyncRequired: true };
        throw e;
      }
      for (const raw of result.items) tasks.push(normalizeGraphTask(raw, { listId: list.id }));
      deleted.push(...result.removed);
      const link = result.deltaLink ?? result.nextLink;
      if (link) nextLinks[list.id] = link;
      if (result.nextLink) hasMore = true;
    }
    return {
      tasks,
      deletedExternalIds: [...new Set(deleted)],
      nextCursor: encodeMapCursor(nextLinks),
      nextPageToken: null,
      hasMore,
    };
  };

  // --- subscriptions ---
  const toWatch = (s: GraphSubscription): WatchResult => ({
    subscriptionId: s.id,
    expiresAt: toIsoOrNull(s.expirationDateTime) ?? s.expirationDateTime,
  });

  const subscriptions: GraphSubscriptionsApi = {
    create: async (input) =>
      toWatch(
        await providerRequest<GraphSubscription>(fetchImpl, {
          url: `${base}/subscriptions`,
          method: 'POST',
          token: accessToken,
          timeoutMs,
          body: {
            changeType: input.changeType,
            notificationUrl: input.notificationUrl,
            resource: input.resource,
            clientState: input.clientState,
            expirationDateTime: expirationIso(input.expirationMinutes, input.now),
            ...(input.lifecycleNotificationUrl
              ? { lifecycleNotificationUrl: input.lifecycleNotificationUrl }
              : {}),
          },
        }),
      ),
    renew: async (id, expirationMinutes, now) =>
      toWatch(
        await providerRequest<GraphSubscription>(fetchImpl, {
          url: `${base}/subscriptions/${encodePathSegment(id)}`,
          method: 'PATCH',
          token: accessToken,
          timeoutMs,
          body: { expirationDateTime: expirationIso(expirationMinutes, now) },
        }),
      ),
    delete: async (id) => {
      try {
        await providerRequestRaw(fetchImpl, {
          url: `${base}/subscriptions/${encodePathSegment(id)}`,
          method: 'DELETE',
          token: accessToken,
          timeoutMs,
        });
      } catch (e) {
        if (isProviderStatus(e, 404)) return;
        throw e;
      }
    },
  };

  const me: GraphClient['me'] = async () => {
    const user = await get<GraphUser>(
      `${base}/me?$select=id,mail,userPrincipalName,displayName`,
      MICROSOFT_SCOPES.userRead,
    );
    return {
      id: user.id,
      email: (user.mail ?? user.userPrincipalName ?? null)?.toLowerCase() ?? null,
      displayName: user.displayName ?? null,
    };
  };

  return {
    mail: { delta: mailDelta, getMessage, send, markRead, sync: mailSync },
    calendar: {
      delta: calendarDelta,
      createEvent,
      updateEvent,
      deleteEvent,
      sync: calendarSync,
    },
    tasks: { listLists, listTasks, delta: tasksDelta, createTask, sync: tasksSync },
    subscriptions,
    me,
  };
}
