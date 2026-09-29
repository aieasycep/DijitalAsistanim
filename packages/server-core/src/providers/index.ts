/**
 * providers — thin, typed REST adapters for Gmail, Google Calendar, Google Tasks and Microsoft
 * Graph, normalisation to domain drafts and a uniform `{ mail, calendar, tasks }` client so Edge
 * Functions treat both providers the same way. Provider-specific webhook helpers (Gmail watch,
 * Calendar channels, Graph subscriptions) live on the concrete clients.
 */
export type {
  CalendarClient,
  CalendarDelta,
  CalendarEventDraft,
  CalendarSyncInput,
  CreateEventInput,
  CreateEventResult,
  CreateTaskInput,
  CreateTaskResult,
  EmailAttachmentMeta,
  EmailMessageDraft,
  EmailThreadDraft,
  MailClient,
  MailDelta,
  MailSyncInput,
  ProviderClientOptions,
  ProviderClients,
  ProviderFetch,
  ProviderId,
  SendMailInput,
  SendMailResult,
  TaskDraft,
  TasksClient,
  TasksDelta,
  TasksSyncInput,
  UpdateEventInput,
  WatchResult,
} from './types.ts';
export type {
  HttpMethod,
  MapProviderErrorInput,
  ProviderErrorInfo,
  ProviderRawResponse,
  ProviderRequestInit,
  QueryValue,
} from './http.ts';
export {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  encodePathSegment,
  isProviderStatus,
  mapConcurrent,
  mapProviderError,
  parseProviderErrorBody,
  parseRetryAfter,
  providerRequest,
  providerRequestRaw,
  toIsoOrNull,
  withQuery,
} from './http.ts';
export type { RawMessageInput } from './mime.ts';
export {
  buildRawMessage,
  decodeBase64Url,
  decodeEncodedWords,
  decodeQuotedPrintable,
  encodeBase64Url,
  encodeHeaderText,
  formatMailbox,
  htmlToText,
  parseAddressList,
  stripQuotedReply,
} from './mime.ts';
export type { MeetingLink, MeetingProvider } from './meeting.ts';
export { detectMeetingLink, meetingProviderFor } from './meeting.ts';
export {
  addCalendarDays,
  dateToInstant,
  localDateInZone,
  localDateTimeInZone,
  resolveZone,
  zonedDateTimeToUtc,
} from './datetime.ts';
export type {
  GmailBody,
  GmailCategory,
  GmailClient,
  GmailClientOptions,
  GmailHeader,
  GmailHistoryRecord,
  GmailHistoryResponse,
  GmailHistoryType,
  GmailListResponse,
  GmailMessage,
  GmailMessageFormat,
  GmailMessageRef,
  GmailPart,
  GmailProfile,
  GmailSyncInput,
  GmailWatchResult,
  NormalizeGmailOptions,
} from './gmail.ts';
export {
  DEFAULT_EXCLUDED_GMAIL_CATEGORIES,
  GMAIL_API_BASE,
  GMAIL_MODIFY_SCOPE,
  createGmailClient,
  gmailAttachmentMeta,
  gmailBackfillQuery,
  gmailQueryForWindow,
  gmailWebUrl,
  normalizeGmailMessage,
} from './gmail.ts';
export type {
  GoogleAttendee,
  GoogleCalendarClient,
  GoogleCalendarClientOptions,
  GoogleCalendarEvent,
  GoogleCalendarSyncInput,
  GoogleCalendarWatchResult,
  GoogleChannel,
  GoogleConferenceData,
  GoogleEventDateTime,
  GoogleEventsListResponse,
  NormalizeGoogleEventOptions,
} from './gcal.ts';
export {
  DEFAULT_CALENDAR_ID,
  GOOGLE_CALENDAR_API_BASE,
  createGoogleCalendarClient,
  googleEventBody,
  googleEventPatch,
  normalizeGoogleEvent,
} from './gcal.ts';
export type {
  GoogleTask,
  GoogleTaskList,
  GoogleTaskListsResponse,
  GoogleTaskPatch,
  GoogleTasksClient,
  GoogleTasksClientOptions,
  GoogleTasksResponse,
} from './gtasks.ts';
export {
  GOOGLE_DEFAULT_TASK_LIST,
  GOOGLE_TASKS_API_BASE,
  createGoogleTasksClient,
  normalizeGoogleTask,
} from './gtasks.ts';
export type {
  GraphAttachment,
  GraphAttendee,
  GraphCalendarApi,
  GraphCalendarSyncInput,
  GraphClient,
  GraphClientOptions,
  GraphCollection,
  GraphDateTimeTimeZone,
  GraphEmailAddress,
  GraphEvent,
  GraphItemBody,
  GraphMailApi,
  GraphMailSyncInput,
  GraphMessage,
  GraphRecipient,
  GraphResponseType,
  GraphSubscription,
  GraphSubscriptionsApi,
  GraphTasksApi,
  GraphTodoList,
  GraphTodoTask,
  GraphUser,
  NormalizeGraphEventOptions,
  NormalizeGraphMessageOptions,
} from './graph.ts';
export {
  DEFAULT_GRAPH_MAIL_FOLDERS,
  GRAPH_API_BASE,
  GRAPH_MAIL_READWRITE_SCOPE,
  GRAPH_MAX_SUBSCRIPTION_MINUTES,
  createGraphClient,
  decodeGraphMailCursor,
  encodeGraphMailCursor,
  graphEventBody,
  normalizeGraphEvent,
  normalizeGraphMessage,
  normalizeGraphTask,
  parseGraphDateTime,
  textToHtml,
} from './graph.ts';

import { createGmailClient, normalizeGmailMessage } from './gmail.ts';
import { createGoogleCalendarClient } from './gcal.ts';
import { createGoogleTasksClient } from './gtasks.ts';
import { createGraphClient, normalizeGraphMessage } from './graph.ts';
import type { ProviderClientOptions, ProviderClients, ProviderFetch, ProviderId } from './types.ts';

/**
 * Uniform `{ mail, calendar, tasks }` clients for a connected account. Reply threading, default
 * task lists and cursor formats are handled inside the clients; callers only persist what the
 * deltas return.
 */
export function providerClients(
  provider: ProviderId,
  fetchImpl: ProviderFetch,
  accessToken: string,
  opts: ProviderClientOptions = {},
): ProviderClients {
  if (provider === 'google') {
    const gmail = createGmailClient(fetchImpl, accessToken, opts);
    const calendar = createGoogleCalendarClient(fetchImpl, accessToken, opts);
    const tasks = createGoogleTasksClient(fetchImpl, accessToken, opts);
    return {
      provider,
      mail: {
        sync: (input) => gmail.syncMail(input),
        send: (input) => gmail.sendMessage(input),
        getMessage: async (id) =>
          normalizeGmailMessage(await gmail.getMessage(id, { format: 'full' }), {
            userEmail: opts.userEmail,
          }),
        markRead: (id, isRead) => gmail.markRead(id, isRead),
      },
      calendar: {
        sync: (input) => calendar.syncCalendar(input),
        createEvent: (input) => calendar.createEvent(input),
        updateEvent: (id, patch) => calendar.patchEvent(id, patch),
        deleteEvent: (id, o) => calendar.deleteEvent(id, o),
      },
      tasks: {
        sync: (input) => tasks.syncTasks(input),
        createTask: (input) => tasks.createTask(input.listId, input),
      },
    };
  }
  const graph = createGraphClient(fetchImpl, accessToken, opts);
  return {
    provider,
    mail: {
      sync: (input) => graph.mail.sync(input),
      send: (input) => graph.mail.send(input),
      getMessage: async (id) =>
        normalizeGraphMessage(await graph.mail.getMessage(id), { userEmail: opts.userEmail }),
      markRead: (id, isRead) => graph.mail.markRead(id, isRead),
    },
    calendar: {
      sync: (input) => graph.calendar.sync(input),
      createEvent: (input) => graph.calendar.createEvent(input),
      updateEvent: (id, patch) => graph.calendar.updateEvent(id, patch),
      deleteEvent: (id) => graph.calendar.deleteEvent(id),
    },
    tasks: {
      sync: (input) => graph.tasks.sync(input),
      createTask: (input) => graph.tasks.createTask(input.listId, input),
    },
  };
}
