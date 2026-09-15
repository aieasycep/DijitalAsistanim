/**
 * Gmail REST adapter (users.messages / history / watch) plus normalisation to EmailMessageDraft.
 *
 * Sync strategy: with a cursor (historyId) we read `history.list`; a 404 means the id is too old
 * and the caller must resync. Without a cursor we backfill a `newer_than` listing page by page and
 * hand back the profile historyId captured *before* the listing so nothing slips between the two.
 */
import type { EmailParticipant } from '@da/domain';
import { GOOGLE_SCOPES } from '../oauth/scopes';
import { collapseWhitespace, decodeHtmlEntities } from '../safefetch/readable';
import { clamp, truncate } from '../util';
import {
  encodePathSegment,
  isProviderStatus,
  mapConcurrent,
  providerRequest,
  providerRequestRaw,
  sameEmail,
  toIsoOrNull,
} from './http';
import {
  buildRawMessage,
  decodeBase64Url,
  decodeEncodedWords,
  encodeBase64Url,
  htmlToText,
  parseAddressList,
} from './mime';
import type {
  EmailAttachmentMeta,
  EmailMessageDraft,
  MailDelta,
  MailSyncInput,
  ProviderClientOptions,
  ProviderFetch,
  SendMailInput,
  SendMailResult,
  WatchResult,
} from './types';

export const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
export const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

const DEFAULT_MAX_MESSAGES = 100;
const DEFAULT_BACKFILL_HOURS = 72;
const FETCH_CONCURRENCY = 4;
const SNIPPET_LENGTH = 280;
const BODY_MAX_LENGTH = 100_000;
const HISTORY_PAGE_SIZE = 500;

/** Gmail inbox categories that can be skipped during sync. */
export type GmailCategory = 'promotions' | 'social' | 'updates' | 'forums' | 'primary';
export const DEFAULT_EXCLUDED_GMAIL_CATEGORIES: readonly GmailCategory[] = ['promotions', 'social'];
const CATEGORY_LABELS: Record<GmailCategory, string> = {
  promotions: 'CATEGORY_PROMOTIONS',
  social: 'CATEGORY_SOCIAL',
  updates: 'CATEGORY_UPDATES',
  forums: 'CATEGORY_FORUMS',
  primary: 'CATEGORY_PERSONAL',
};
/** Messages carrying these labels are never synced; TRASH/SPAM additionally count as deletions. */
const SKIP_LABELS = new Set(['DRAFT', 'CHAT', 'SPAM', 'TRASH']);
const DELETION_LABELS = new Set(['SPAM', 'TRASH']);

// --- Raw API shapes -------------------------------------------------------------------------------

export interface GmailHeader {
  name: string;
  value: string;
}
export interface GmailBody {
  attachmentId?: string;
  size?: number;
  data?: string;
}
export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailBody;
  parts?: GmailPart[];
}
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailPart;
  sizeEstimate?: number;
}
export interface GmailMessageRef {
  id: string;
  threadId?: string;
  labelIds?: string[];
}
export interface GmailListResponse {
  messages?: GmailMessageRef[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}
export interface GmailHistoryRecord {
  id: string;
  messages?: GmailMessageRef[];
  messagesAdded?: { message: GmailMessageRef }[];
  messagesDeleted?: { message: GmailMessageRef }[];
  labelsAdded?: { message: GmailMessageRef; labelIds?: string[] }[];
  labelsRemoved?: { message: GmailMessageRef; labelIds?: string[] }[];
}
export interface GmailHistoryResponse {
  history?: GmailHistoryRecord[];
  nextPageToken?: string;
  historyId: string;
}
export interface GmailProfile {
  emailAddress: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId: string;
}
export interface GmailWatchResult extends WatchResult {
  historyId: string;
}

export type GmailHistoryType = 'messageAdded' | 'messageDeleted' | 'labelAdded' | 'labelRemoved';
export type GmailMessageFormat = 'full' | 'metadata' | 'minimal';

// --- Normalisation -------------------------------------------------------------------------------

function headerValue(headers: GmailHeader[] | undefined, name: string): string | null {
  const lower = name.toLowerCase();
  return headers?.find((h) => h.name.toLowerCase() === lower)?.value ?? null;
}

function charsetOf(part: GmailPart): string | null {
  const contentType = headerValue(part.headers, 'content-type');
  const match = contentType ? /charset\s*=\s*"?([A-Za-z0-9_.:-]+)"?/i.exec(contentType) : null;
  return match?.[1] ?? null;
}

function stripAngle(id: string | null): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  return trimmed.replace(/^<|>$/g, '') || null;
}

function parseReferences(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/\s+/)
    .map((v) => stripAngle(v))
    .filter((v): v is string => v !== null);
}

interface Bodies {
  text: string | null;
  html: string | null;
}

function collectBodies(part: GmailPart | undefined, acc: Bodies): void {
  if (!part) return;
  const mime = part.mimeType?.toLowerCase() ?? '';
  const isAttachment = Boolean(part.filename) || Boolean(part.body?.attachmentId);
  if (!isAttachment && part.body?.data) {
    if (mime === 'text/plain' && acc.text === null) {
      acc.text = decodeBase64Url(part.body.data, charsetOf(part));
    } else if (mime === 'text/html' && acc.html === null) {
      acc.html = decodeBase64Url(part.body.data, charsetOf(part));
    }
  }
  for (const child of part.parts ?? []) collectBodies(child, acc);
}

function collectAttachments(part: GmailPart | undefined, acc: EmailAttachmentMeta[]): void {
  if (!part) return;
  const attachmentId = part.body?.attachmentId;
  if (part.filename && attachmentId) {
    acc.push({
      id: attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      size: part.body?.size ?? 0,
    });
  }
  for (const child of part.parts ?? []) collectAttachments(child, acc);
}

/** Attachment metadata (id/filename/mimeType/size) from a message's MIME tree. */
export function gmailAttachmentMeta(raw: GmailMessage): EmailAttachmentMeta[] {
  const out: EmailAttachmentMeta[] = [];
  collectAttachments(raw.payload, out);
  return out;
}

export function gmailWebUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(messageId)}`;
}

export interface NormalizeGmailOptions {
  userEmail?: string | null;
}

/** Map a `users.messages.get` (format=full) payload to an EmailMessageDraft. */
export function normalizeGmailMessage(
  raw: GmailMessage,
  opts: NormalizeGmailOptions = {},
): EmailMessageDraft {
  const headers = raw.payload?.headers;
  const from: EmailParticipant = parseAddressList(headerValue(headers, 'from'))[0] ?? {
    name: null,
    email: '',
  };
  const labels = raw.labelIds ?? [];
  const bodies: Bodies = { text: null, html: null };
  collectBodies(raw.payload, bodies);
  const snippetRaw = collapseWhitespace(decodeHtmlEntities(raw.snippet ?? ''));
  const bodyFromParts = bodies.text?.trim() || (bodies.html ? htmlToText(bodies.html) : '');
  const bodyText = truncate(bodyFromParts || snippetRaw, BODY_MAX_LENGTH);
  const snippet = truncate(snippetRaw || collapseWhitespace(bodyText), SNIPPET_LENGTH);
  const receivedAt =
    toIsoOrNull(Number(raw.internalDate)) ?? toIsoOrNull(headerValue(headers, 'date'));
  const sentAt =
    toIsoOrNull(headerValue(headers, 'date')) ?? receivedAt ?? new Date(0).toISOString();
  const attachments = gmailAttachmentMeta(raw);
  return {
    externalMessageId: raw.id,
    externalThreadId: raw.threadId,
    from,
    to: parseAddressList(headerValue(headers, 'to')),
    cc: parseAddressList(headerValue(headers, 'cc')),
    bcc: parseAddressList(headerValue(headers, 'bcc')),
    subject: decodeEncodedWords(headerValue(headers, 'subject') ?? '').trim(),
    snippet,
    bodyText,
    sentAt,
    receivedAt: receivedAt ?? sentAt,
    isFromUser: labels.includes('SENT') || sameEmail(from.email, opts.userEmail),
    isRead: !labels.includes('UNREAD'),
    isStarred: labels.includes('STARRED'),
    hasAttachments: attachments.length > 0,
    attachments,
    labels,
    webUrl: gmailWebUrl(raw.id),
    rfcMessageId: stripAngle(headerValue(headers, 'message-id')),
    inReplyTo: stripAngle(headerValue(headers, 'in-reply-to')),
    references: parseReferences(headerValue(headers, 'references')),
  };
}

// --- Queries ------------------------------------------------------------------------------------

function categoryExclusions(categories: readonly GmailCategory[]): string {
  return categories.map((c) => `-category:${c}`).join(' ');
}

/** Gmail search query for an absolute window (`after:`/`before:` take epoch seconds). */
export function gmailQueryForWindow(
  since: string,
  until: string | null,
  excludeCategories: readonly GmailCategory[] = DEFAULT_EXCLUDED_GMAIL_CATEGORIES,
): string {
  const parts = [`after:${Math.floor(Date.parse(since) / 1000)}`];
  if (until) parts.push(`before:${Math.ceil(Date.parse(until) / 1000)}`);
  parts.push('-in:spam', '-in:trash', '-in:chats');
  const exclusions = categoryExclusions(excludeCategories);
  if (exclusions) parts.push(exclusions);
  return parts.join(' ');
}

/** Gmail search query for a relative window (`newer_than:Nd`). */
export function gmailBackfillQuery(
  windowHours: number,
  excludeCategories: readonly GmailCategory[] = DEFAULT_EXCLUDED_GMAIL_CATEGORIES,
): string {
  const days = Math.max(1, Math.ceil(windowHours / 24));
  const parts = [`newer_than:${days}d`, '-in:spam', '-in:trash', '-in:chats'];
  const exclusions = categoryExclusions(excludeCategories);
  if (exclusions) parts.push(exclusions);
  return parts.join(' ');
}

function isSyncable(raw: GmailMessage, excludedLabels: ReadonlySet<string>): boolean {
  return !(raw.labelIds ?? []).some((l) => SKIP_LABELS.has(l) || excludedLabels.has(l));
}

function isDeletedByLabel(raw: GmailMessage): boolean {
  return (raw.labelIds ?? []).some((l) => DELETION_LABELS.has(l));
}

// --- Client -------------------------------------------------------------------------------------

export interface GmailClientOptions extends ProviderClientOptions {
  baseUrl?: string;
}

export interface GmailSyncInput extends MailSyncInput {
  excludeCategories?: readonly GmailCategory[];
  /** Full query override for the backfill listing (e.g. from `gmailQueryForWindow`). */
  query?: string;
  labelIds?: string[];
}

export interface GmailClient {
  getProfile(): Promise<GmailProfile>;
  listHistory(input: {
    startHistoryId: string;
    pageToken?: string | null;
    maxResults?: number;
    historyTypes?: GmailHistoryType[];
    labelId?: string;
  }): Promise<GmailHistoryResponse>;
  listMessages(input: {
    q?: string;
    pageToken?: string | null;
    maxResults?: number;
    labelIds?: string[];
  }): Promise<GmailListResponse>;
  getMessage(
    id: string,
    opts?: { format?: GmailMessageFormat; metadataHeaders?: string[] },
  ): Promise<GmailMessage>;
  /** Fetch many messages with bounded concurrency; ids that answer 404 land in `missingIds`. */
  getMessagesBatch(
    ids: readonly string[],
    opts?: { format?: GmailMessageFormat; concurrency?: number },
  ): Promise<{ messages: GmailMessage[]; missingIds: string[] }>;
  sendMessage(input: SendMailInput & { from?: string | null }): Promise<SendMailResult>;
  modifyLabels(id: string, change: { add?: string[]; remove?: string[] }): Promise<GmailMessage>;
  markRead(id: string, isRead?: boolean): Promise<void>;
  watch(input: {
    topicName: string;
    labelIds?: string[];
    labelFilterBehavior?: 'INCLUDE' | 'EXCLUDE';
  }): Promise<GmailWatchResult>;
  stopWatch(): Promise<void>;
  syncMail(input: GmailSyncInput): Promise<MailDelta>;
}

const EMPTY_DELTA: MailDelta = {
  messages: [],
  deletedExternalIds: [],
  nextCursor: null,
  nextPageToken: null,
  hasMore: false,
};

export function createGmailClient(
  fetchImpl: ProviderFetch,
  accessToken: string,
  opts: GmailClientOptions = {},
): GmailClient {
  const base = opts.baseUrl ?? GMAIL_API_BASE;
  const timeoutMs = opts.timeoutMs;
  const readScope = GOOGLE_SCOPES.gmailReadonly;

  const getProfile = (): Promise<GmailProfile> =>
    providerRequest<GmailProfile>(fetchImpl, {
      url: `${base}/profile`,
      token: accessToken,
      timeoutMs,
      requiredScope: readScope,
    });

  const listHistory: GmailClient['listHistory'] = (input) =>
    providerRequest<GmailHistoryResponse>(fetchImpl, {
      url: `${base}/history`,
      token: accessToken,
      timeoutMs,
      requiredScope: readScope,
      query: {
        startHistoryId: input.startHistoryId,
        pageToken: input.pageToken ?? undefined,
        maxResults: input.maxResults ?? HISTORY_PAGE_SIZE,
        historyTypes: input.historyTypes,
        labelId: input.labelId,
      },
    });

  const listMessages: GmailClient['listMessages'] = (input) =>
    providerRequest<GmailListResponse>(fetchImpl, {
      url: `${base}/messages`,
      token: accessToken,
      timeoutMs,
      requiredScope: readScope,
      query: {
        q: input.q,
        pageToken: input.pageToken ?? undefined,
        maxResults: input.maxResults ?? DEFAULT_MAX_MESSAGES,
        labelIds: input.labelIds,
      },
    });

  const getMessage: GmailClient['getMessage'] = (id, o = {}) =>
    providerRequest<GmailMessage>(fetchImpl, {
      url: `${base}/messages/${encodePathSegment(id)}`,
      token: accessToken,
      timeoutMs,
      requiredScope: readScope,
      query: { format: o.format ?? 'full', metadataHeaders: o.metadataHeaders },
    });

  const getMessagesBatch: GmailClient['getMessagesBatch'] = async (ids, o = {}) => {
    const missingIds: string[] = [];
    const results = await mapConcurrent(ids, o.concurrency ?? FETCH_CONCURRENCY, async (id) => {
      try {
        return await getMessage(id, { format: o.format ?? 'full' });
      } catch (e) {
        if (isProviderStatus(e, 404)) {
          missingIds.push(id);
          return null;
        }
        throw e;
      }
    });
    return { messages: results.filter((m): m is GmailMessage => m !== null), missingIds };
  };

  /** RFC Message-ID + References of the message being answered (metadata format). */
  const replyHeaders = async (
    externalId: string,
  ): Promise<{ messageId: string | null; references: string[]; threadId: string }> => {
    const original = await getMessage(externalId, {
      format: 'metadata',
      metadataHeaders: ['Message-ID', 'References', 'In-Reply-To', 'Subject'],
    });
    const headers = original.payload?.headers;
    return {
      messageId: stripAngle(headerValue(headers, 'message-id')),
      references: parseReferences(headerValue(headers, 'references')),
      threadId: original.threadId,
    };
  };

  const sendMessage: GmailClient['sendMessage'] = async (input) => {
    let inReplyToMessageId: string | null = null;
    let references = input.references ?? [];
    let threadId = input.externalThreadId ?? null;
    if (input.inReplyToExternalMessageId) {
      const original = await replyHeaders(input.inReplyToExternalMessageId);
      inReplyToMessageId = original.messageId;
      if (references.length === 0 && original.messageId) {
        references = [...original.references, original.messageId];
      }
      threadId ??= original.threadId;
    }
    const raw = buildRawMessage({
      ...input,
      from: input.from ?? opts.userEmail ?? null,
      inReplyToMessageId,
      references,
    });
    const sent = await providerRequest<{ id: string; threadId?: string }>(fetchImpl, {
      url: `${base}/messages/send`,
      method: 'POST',
      token: accessToken,
      timeoutMs,
      requiredScope: GOOGLE_SCOPES.gmailSend,
      body: { raw: encodeBase64Url(raw), ...(threadId ? { threadId } : {}) },
    });
    return { externalMessageId: sent.id, externalThreadId: sent.threadId ?? threadId };
  };

  const modifyLabels: GmailClient['modifyLabels'] = (id, change) =>
    providerRequest<GmailMessage>(fetchImpl, {
      url: `${base}/messages/${encodePathSegment(id)}/modify`,
      method: 'POST',
      token: accessToken,
      timeoutMs,
      requiredScope: GMAIL_MODIFY_SCOPE,
      body: { addLabelIds: change.add ?? [], removeLabelIds: change.remove ?? [] },
    });

  const markRead: GmailClient['markRead'] = async (id, isRead = true) => {
    await modifyLabels(id, isRead ? { remove: ['UNREAD'] } : { add: ['UNREAD'] });
  };

  const watch: GmailClient['watch'] = async (input) => {
    const result = await providerRequest<{ historyId: string; expiration: string }>(fetchImpl, {
      url: `${base}/watch`,
      method: 'POST',
      token: accessToken,
      timeoutMs,
      requiredScope: readScope,
      body: {
        topicName: input.topicName,
        ...(input.labelIds ? { labelIds: input.labelIds } : {}),
        ...(input.labelFilterBehavior ? { labelFilterBehavior: input.labelFilterBehavior } : {}),
      },
    });
    return {
      subscriptionId: input.topicName,
      expiresAt: toIsoOrNull(Number(result.expiration)) ?? new Date().toISOString(),
      historyId: result.historyId,
    };
  };

  const stopWatch = async (): Promise<void> => {
    await providerRequestRaw(fetchImpl, {
      url: `${base}/stop`,
      method: 'POST',
      token: accessToken,
      timeoutMs,
      requiredScope: readScope,
    });
  };

  const normalizeAll = (raws: GmailMessage[], excluded: ReadonlySet<string>) => {
    const messages: EmailMessageDraft[] = [];
    const deleted: string[] = [];
    for (const raw of raws) {
      if (isDeletedByLabel(raw)) deleted.push(raw.id);
      else if (isSyncable(raw, excluded)) {
        messages.push(normalizeGmailMessage(raw, { userEmail: opts.userEmail }));
      }
    }
    return { messages, deleted };
  };

  const backfill = async (input: GmailSyncInput, excluded: ReadonlySet<string>) => {
    const firstPage = !input.pageToken;
    // Capture the history id before listing so anything arriving meanwhile is covered by history.
    const profile = firstPage ? await getProfile() : null;
    const maxMessages = clamp(input.maxMessages ?? DEFAULT_MAX_MESSAGES, 1, 500);
    const list = await listMessages({
      q:
        input.query ??
        gmailBackfillQuery(
          input.backfillWindowHours ?? DEFAULT_BACKFILL_HOURS,
          input.excludeCategories ?? DEFAULT_EXCLUDED_GMAIL_CATEGORIES,
        ),
      pageToken: input.pageToken ?? null,
      maxResults: maxMessages,
      labelIds: input.labelIds,
    });
    const ids = (list.messages ?? []).map((m) => m.id);
    const { messages: raws } = await getMessagesBatch(ids, { format: 'full' });
    const { messages } = normalizeAll(raws, excluded);
    return {
      messages,
      deletedExternalIds: [],
      nextCursor: profile?.historyId ?? null,
      nextPageToken: list.nextPageToken ?? null,
      hasMore: Boolean(list.nextPageToken),
    } satisfies MailDelta;
  };

  const syncFromHistory = async (
    cursor: string,
    input: GmailSyncInput,
    excluded: ReadonlySet<string>,
  ): Promise<MailDelta> => {
    const maxMessages = clamp(input.maxMessages ?? DEFAULT_MAX_MESSAGES, 1, 500);
    let history: GmailHistoryResponse;
    try {
      history = await listHistory({
        startHistoryId: cursor,
        historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
      });
    } catch (e) {
      if (isProviderStatus(e, 404)) return { ...EMPTY_DELTA, fullResyncRequired: true };
      throw e;
    }
    const changed = new Set<string>();
    const deleted = new Set<string>();
    let lastConsumed: string | null = null;
    let stoppedEarly = false;
    for (const record of history.history ?? []) {
      const addedIds = [
        ...(record.messagesAdded ?? []).map((m) => m.message.id),
        ...(record.labelsAdded ?? []).map((m) => m.message.id),
        ...(record.labelsRemoved ?? []).map((m) => m.message.id),
      ];
      const deletedIds = (record.messagesDeleted ?? []).map((m) => m.message.id);
      const fresh = addedIds.filter((id) => !changed.has(id) && !deletedIds.includes(id));
      if (changed.size > 0 && changed.size + new Set(fresh).size > maxMessages) {
        stoppedEarly = true;
        break;
      }
      for (const id of deletedIds) {
        deleted.add(id);
        changed.delete(id);
      }
      for (const id of addedIds) if (!deleted.has(id)) changed.add(id);
      lastConsumed = record.id;
    }
    const hasMore = stoppedEarly || Boolean(history.nextPageToken);
    const nextCursor = hasMore ? (lastConsumed ?? cursor) : history.historyId;
    const { messages: raws, missingIds } = await getMessagesBatch([...changed], { format: 'full' });
    const normalised = normalizeAll(raws, excluded);
    return {
      messages: normalised.messages,
      deletedExternalIds: [...new Set([...deleted, ...missingIds, ...normalised.deleted])],
      nextCursor,
      nextPageToken: null,
      hasMore,
    };
  };

  const syncMail: GmailClient['syncMail'] = (input) => {
    const excluded = new Set(
      (input.excludeCategories ?? DEFAULT_EXCLUDED_GMAIL_CATEGORIES).map((c) => CATEGORY_LABELS[c]),
    );
    if (input.cursor && !input.pageToken) return syncFromHistory(input.cursor, input, excluded);
    return backfill(input, excluded);
  };

  return {
    getProfile,
    listHistory,
    listMessages,
    getMessage,
    getMessagesBatch,
    sendMessage,
    modifyLabels,
    markRead,
    watch,
    stopWatch,
    syncMail,
  };
}
