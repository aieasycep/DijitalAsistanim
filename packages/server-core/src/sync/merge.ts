/**
 * Merging provider deltas into stored state: grouping messages into threads (with Turkish and
 * English subject-prefix normalisation as the fallback key), thread patches, calendar delta
 * application and "plan changed" detection.
 */
import type { CalendarEvent, EmailParticipant, EmailThread } from '@da/domain';
import type {
  CalendarDelta,
  CalendarEventDraft,
  EmailMessageDraft,
  EmailThreadDraft,
} from '../providers/types';

// --- Subjects ----------------------------------------------------------------------------------

const REPLY_PREFIXES = [
  're',
  'ynt',
  'yanıt',
  'yan',
  'cevap',
  'fwd',
  'fw',
  'ilt',
  'ılt',
  'ileti',
  'aw',
  'wg',
  'tr',
  'rv',
  'sv',
  'vs',
  'vb',
  'r',
];
const PREFIX_PATTERN = new RegExp(
  `^\\s*(?:(?:${REPLY_PREFIXES.join('|')})(?:\\s*[\\[(]\\d+[\\])])?\\s*:\\s*)+`,
  'i',
);

/** Lowercase (Turkish-aware) subject with Re:/Ynt:/Fwd:/İlt: chains and extra whitespace removed. */
export function normalizeSubject(subject: string): string {
  return subject.toLocaleLowerCase('tr-TR').replace(PREFIX_PATTERN, '').replace(/\s+/g, ' ').trim();
}

// --- Messages ----------------------------------------------------------------------------------

function timeOf(message: EmailMessageDraft): number {
  const received = Date.parse(message.receivedAt);
  if (!Number.isNaN(received)) return received;
  const sent = Date.parse(message.sentAt);
  return Number.isNaN(sent) ? 0 : sent;
}

function byTime(a: EmailMessageDraft, b: EmailMessageDraft): number {
  return timeOf(a) - timeOf(b);
}

/** One draft per externalMessageId — the most recently received wins, bodies are preferred. */
export function dedupeMessages(messages: readonly EmailMessageDraft[]): EmailMessageDraft[] {
  const byId = new Map<string, EmailMessageDraft>();
  for (const message of messages) {
    const existing = byId.get(message.externalMessageId);
    if (!existing) {
      byId.set(message.externalMessageId, message);
      continue;
    }
    const newer = timeOf(message) > timeOf(existing);
    const hasBody = Boolean(message.bodyText) && !existing.bodyText;
    if (newer || hasBody) byId.set(message.externalMessageId, message);
  }
  return [...byId.values()];
}

function participantKey(list: readonly EmailParticipant[]): string {
  return [...new Set(list.map((p) => p.email.toLowerCase()))].sort().join(',');
}

/** externalThreadId, or `subject|participants` when the provider gives none. */
export function threadKeyFor(message: EmailMessageDraft): string {
  if (message.externalThreadId) return message.externalThreadId;
  const people = participantKey([message.from, ...message.to, ...message.cc]);
  return `${normalizeSubject(message.subject)}|${people}`;
}

/** Union of participants by email (first seen name kept, later names fill blanks). */
export function mergeParticipants(
  ...lists: readonly (readonly EmailParticipant[])[]
): EmailParticipant[] {
  const byEmail = new Map<string, EmailParticipant>();
  for (const list of lists) {
    for (const p of list) {
      const email = p.email.trim().toLowerCase();
      if (!email) continue;
      const existing = byEmail.get(email);
      if (!existing) byEmail.set(email, { name: p.name?.trim() || null, email });
      else if (!existing.name && p.name?.trim()) byEmail.set(email, { name: p.name.trim(), email });
    }
  }
  return [...byEmail.values()];
}

/** Group message drafts into thread drafts (messages sorted oldest → newest inside each). */
export function groupIntoThreads(messages: readonly EmailMessageDraft[]): EmailThreadDraft[] {
  const groups = new Map<string, EmailMessageDraft[]>();
  for (const message of dedupeMessages(messages)) {
    const key = threadKeyFor(message);
    const list = groups.get(key) ?? [];
    list.push(message);
    groups.set(key, list);
  }
  const threads: EmailThreadDraft[] = [];
  for (const [key, list] of groups) {
    list.sort(byTime);
    const first = list[0] as EmailMessageDraft;
    const last = list[list.length - 1] as EmailMessageDraft;
    const unreadCount = list.filter((m) => !m.isRead).length;
    const subject = list.find((m) => m.subject.trim() !== '')?.subject.trim() ?? '';
    threads.push({
      externalThreadId: first.externalThreadId || key,
      subject,
      snippet: last.snippet,
      participants: mergeParticipants(...list.map((m) => [m.from, ...m.to, ...m.cc])),
      firstMessageAt: new Date(timeOf(first)).toISOString(),
      lastMessageAt: new Date(timeOf(last)).toISOString(),
      messageCount: list.length,
      unreadCount,
      lastFromUser: last.isFromUser,
      isRead: unreadCount === 0,
      labels: [...new Set(list.flatMap((m) => m.labels))],
      hasAttachments: list.some((m) => m.hasAttachments),
      externalMessageIds: list.map((m) => m.externalMessageId),
    });
  }
  threads.sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
  return threads;
}

export type EmailThreadPatch = Partial<
  Pick<
    EmailThread,
    | 'subject'
    | 'snippet'
    | 'participants'
    | 'lastMessageAt'
    | 'messageCount'
    | 'lastFromUser'
    | 'isRead'
    | 'labels'
    | 'userDismissed'
    | 'userMarkedDone'
  >
>;

export interface MergeThreadOptions {
  /**
   * Number of messages in `incoming` that were not stored before. When given, `messageCount`
   * grows by it; otherwise `incoming` is treated as a full snapshot.
   */
  addedMessages?: number;
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}

/**
 * Patch for an existing thread given a freshly grouped draft: newer activity moves the snippet,
 * last-message fields and read state and clears "done"/"dismissed" so the thread resurfaces.
 * Empty object when nothing changed.
 */
export function mergeThreadUpdate(
  existing: EmailThread,
  incoming: EmailThreadDraft,
  opts: MergeThreadOptions = {},
): EmailThreadPatch {
  const patch: EmailThreadPatch = {};
  const existingLast = Date.parse(existing.lastMessageAt);
  const incomingLast = Date.parse(incoming.lastMessageAt);
  const newer = Number.isNaN(existingLast) || incomingLast > existingLast;

  if (!existing.subject.trim() && incoming.subject.trim()) patch.subject = incoming.subject;
  const participants = mergeParticipants(existing.participants, incoming.participants);
  if (participants.length !== existing.participants.length) patch.participants = participants;
  const labels = [...new Set([...existing.labels, ...incoming.labels])];
  if (!sameStringSet(labels, existing.labels)) patch.labels = labels;

  const messageCount =
    opts.addedMessages !== undefined
      ? existing.messageCount + Math.max(0, opts.addedMessages)
      : Math.max(existing.messageCount, incoming.messageCount);
  if (messageCount !== existing.messageCount) patch.messageCount = messageCount;

  if (newer) {
    patch.lastMessageAt = incoming.lastMessageAt;
    if (incoming.snippet !== existing.snippet) patch.snippet = incoming.snippet;
    if (incoming.lastFromUser !== existing.lastFromUser) patch.lastFromUser = incoming.lastFromUser;
    if (incoming.isRead !== existing.isRead) patch.isRead = incoming.isRead;
    const fromOthers = !incoming.lastFromUser;
    if (fromOthers && existing.userMarkedDone) patch.userMarkedDone = false;
    if (fromOthers && existing.userDismissed) patch.userDismissed = false;
  } else if (incoming.unreadCount > 0 && existing.isRead) {
    patch.isRead = false;
  }
  return patch;
}

// --- Calendar ------------------------------------------------------------------------------------

export interface CalendarDeltaApplication {
  /** Drafts to insert or update (existing events only when the provider version is newer). */
  upserts: CalendarEventDraft[];
  /** Stored events to soft-delete. */
  deletes: { id: string; externalEventId: string }[];
  /** External ids skipped because the stored copy is already current. */
  unchanged: string[];
}

function isNewer(draft: CalendarEventDraft, stored: CalendarEvent): boolean {
  const incoming = draft.providerUpdatedAt ? Date.parse(draft.providerUpdatedAt) : Number.NaN;
  const current = stored.providerUpdatedAt ? Date.parse(stored.providerUpdatedAt) : Number.NaN;
  if (Number.isNaN(incoming) || Number.isNaN(current)) return true;
  return incoming > current;
}

/** Split a provider delta into upserts and deletes against the stored events. */
export function applyCalendarDelta(
  existing: readonly CalendarEvent[],
  delta: Pick<CalendarDelta, 'events' | 'deletedExternalIds'>,
): CalendarDeltaApplication {
  const byExternalId = new Map(existing.map((e) => [e.externalEventId, e]));
  const result: CalendarDeltaApplication = { upserts: [], deletes: [], unchanged: [] };
  const deleted = new Set<string>();
  const markDeleted = (externalId: string) => {
    if (deleted.has(externalId)) return;
    const stored = byExternalId.get(externalId);
    if (stored && !stored.deletedAt)
      result.deletes.push({ id: stored.id, externalEventId: externalId });
    deleted.add(externalId);
  };
  for (const externalId of delta.deletedExternalIds) markDeleted(externalId);
  for (const draft of delta.events) {
    if (draft.status === 'cancelled') {
      markDeleted(draft.externalEventId);
      continue;
    }
    const stored = byExternalId.get(draft.externalEventId);
    if (stored && !stored.deletedAt && !isNewer(draft, stored)) {
      result.unchanged.push(draft.externalEventId);
      continue;
    }
    result.upserts.push(draft);
  }
  return result;
}

export type EventLike = Pick<
  CalendarEvent,
  | 'externalEventId'
  | 'title'
  | 'startAt'
  | 'endAt'
  | 'status'
  | 'organizerIsUser'
  | 'attendees'
  | 'location'
>;

export interface ChangedEvents<P extends EventLike, N extends EventLike> {
  /** Same event, different start/end. */
  moved: { before: P; after: N }[];
  /** Previously live events now cancelled (in `next` with cancelled status or in `cancelledExternalIds`). */
  cancelled: P[];
  /** Events that appeared and were organised by someone else. */
  newInvites: N[];
  /** Same time, but title/location changed. */
  updated: { before: P; after: N }[];
}

/** Compare stored events with a new snapshot/delta for "your plan changed" insights. */
export function detectChangedEvents<P extends EventLike, N extends EventLike>(
  prev: readonly P[],
  next: readonly N[],
  opts: { cancelledExternalIds?: readonly string[] } = {},
): ChangedEvents<P, N> {
  const before = new Map(prev.map((e) => [e.externalEventId, e]));
  const out: ChangedEvents<P, N> = { moved: [], cancelled: [], newInvites: [], updated: [] };
  const cancelledIds = new Set(opts.cancelledExternalIds ?? []);
  for (const event of next) {
    const old = before.get(event.externalEventId);
    if (event.status === 'cancelled') {
      if (old && old.status !== 'cancelled') out.cancelled.push(old);
      continue;
    }
    if (!old) {
      if (!event.organizerIsUser && event.attendees.length > 0) out.newInvites.push(event);
      continue;
    }
    if (old.status === 'cancelled') continue;
    const sameStart = Date.parse(old.startAt) === Date.parse(event.startAt);
    const sameEnd = Date.parse(old.endAt) === Date.parse(event.endAt);
    if (!sameStart || !sameEnd) out.moved.push({ before: old, after: event });
    else if (old.title !== event.title || (old.location ?? null) !== (event.location ?? null)) {
      out.updated.push({ before: old, after: event });
    }
  }
  for (const id of cancelledIds) {
    const old = before.get(id);
    if (old && old.status !== 'cancelled' && !out.cancelled.includes(old)) out.cancelled.push(old);
  }
  return out;
}
