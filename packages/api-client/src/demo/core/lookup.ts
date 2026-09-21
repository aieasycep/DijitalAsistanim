/** Read helpers over DemoState (pure functions, no mutation). */
import type {
  CalendarEvent,
  Commitment,
  ConnectedAccount,
  Contact,
  EmailParticipant,
  EmailThread,
  FollowUp,
  Insight,
  LifeEvent,
  SourceRef,
  UUID,
} from '@da/domain';
import type { DemoState } from '../state';
import { fold, tokenize } from '../text';
import { notFound } from '../validate';
import { firstName } from '../format';

export function getThread(state: DemoState, id: UUID): EmailThread {
  const thread = state.threads.find((t) => t.id === id && !t.deletedAt);
  if (!thread) throw notFound('Mail dizisi', id);
  return thread;
}

export function getEvent(state: DemoState, id: UUID): CalendarEvent {
  const event = state.events.find((e) => e.id === id && !e.deletedAt);
  if (!event) throw notFound('Etkinlik', id);
  return event;
}

export function getContact(state: DemoState, id: UUID): Contact {
  const contact = state.contacts.find((c) => c.id === id && !c.deletedAt);
  if (!contact) throw notFound('Kişi', id);
  return contact;
}

export function getInsight(state: DemoState, id: UUID): Insight {
  const insight = state.insights.find((i) => i.id === id && !i.deletedAt);
  if (!insight) throw notFound('Kart', id);
  return insight;
}

export function getCommitment(state: DemoState, id: UUID): Commitment {
  const c = state.commitments.find((x) => x.id === id && !x.deletedAt);
  if (!c) throw notFound('Taahhüt', id);
  return c;
}

export function getFollowUp(state: DemoState, id: UUID): FollowUp {
  const f = state.followUps.find((x) => x.id === id);
  if (!f) throw notFound('Takip', id);
  return f;
}

export function getLifeEvent(state: DemoState, id: UUID): LifeEvent {
  const l = state.lifeEvents.find((x) => x.id === id && !x.deletedAt);
  if (!l) throw notFound('Kişisel gelişme', id);
  return l;
}

export function primaryAccount(state: DemoState): ConnectedAccount | undefined {
  const active = state.accounts.filter((a) => !a.deletedAt);
  return active.find((a) => a.isPrimary) ?? active[0];
}

export function userParticipant(state: DemoState): EmailParticipant {
  return { name: state.profile.displayName, email: state.profile.email ?? 'yunus@example.com' };
}

export function isUserEmail(state: DemoState, email: string | null | undefined): boolean {
  if (!email) return false;
  const mine = new Set<string>();
  if (state.profile.email) mine.add(state.profile.email.toLowerCase());
  for (const a of state.accounts) if (a.email) mine.add(a.email.toLowerCase());
  return mine.has(email.toLowerCase());
}

export function findContactByEmail(
  state: DemoState,
  email: string | null | undefined,
): Contact | undefined {
  if (!email) return undefined;
  const lower = email.toLowerCase();
  return state.contacts.find(
    (c) => !c.deletedAt && c.emails.some((e) => e.toLowerCase() === lower),
  );
}

/** Matches "Mehmet", "Mehmet'e", "mehmet ile" … against contact first names (Turkish-insensitive). */
export function findContactByName(state: DemoState, text: string): Contact | undefined {
  const words = new Set(tokenize(text));
  let best: Contact | undefined;
  for (const contact of state.contacts) {
    if (contact.deletedAt) continue;
    const first = fold(firstName(contact.displayName));
    const full = fold(contact.displayName);
    const hit =
      words.has(first) ||
      fold(text).includes(full) ||
      Array.from(words).some((w) => w.startsWith(`${first}`) && w.length - first.length <= 3);
    if (hit && (!best || contact.interactionCount > best.interactionCount)) best = contact;
  }
  return best;
}

export function threadsForContact(state: DemoState, contact: Contact): EmailThread[] {
  const emails = new Set(contact.emails.map((e) => e.toLowerCase()));
  return state.threads
    .filter((t) => !t.deletedAt && t.participants.some((p) => emails.has(p.email.toLowerCase())))
    .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
}

export function threadsForEmails(state: DemoState, emails: string[]): EmailThread[] {
  const set = new Set(emails.map((e) => e.toLowerCase()));
  return state.threads
    .filter((t) => !t.deletedAt && t.participants.some((p) => set.has(p.email.toLowerCase())))
    .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
}

export function eventsForContact(state: DemoState, contact: Contact): CalendarEvent[] {
  const emails = new Set(contact.emails.map((e) => e.toLowerCase()));
  return state.events
    .filter(
      (e) =>
        !e.deletedAt &&
        e.status !== 'cancelled' &&
        e.attendees.some(
          (a) => a.contactId === contact.id || (a.email && emails.has(a.email.toLowerCase())),
        ),
    )
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

export function insightsForEntity(
  state: DemoState,
  entityType: Insight['entityType'],
  entityId: UUID,
): Insight[] {
  return state.insights.filter(
    (i) => !i.deletedAt && i.entityType === entityType && i.entityId === entityId,
  );
}

export function counterpartOf(state: DemoState, thread: EmailThread): EmailParticipant | undefined {
  return thread.participants.find((p) => !isUserEmail(state, p.email));
}

export function threadSource(thread: EmailThread, extra: Partial<SourceRef> = {}): SourceRef {
  const other = thread.participants.find(
    (p) => !thread.labels.includes('SENT') || p.email !== thread.participants[0]?.email,
  );
  return {
    type: 'gmail',
    id: thread.id,
    externalId: thread.externalThreadId,
    label: 'Gmail',
    person: other?.name ?? other?.email,
    timestamp: thread.lastMessageAt,
    excerpt: thread.snippet.slice(0, 200),
    ...extra,
  };
}

export function eventSource(event: CalendarEvent, extra: Partial<SourceRef> = {}): SourceRef {
  const label =
    event.source === 'google_calendar'
      ? 'Google Takvim'
      : event.source === 'microsoft_calendar'
        ? 'Outlook Takvim'
        : event.source === 'apple_calendar'
          ? 'Apple Takvim'
          : 'Takvim';
  return {
    type: event.source,
    id: event.id,
    externalId: event.externalEventId,
    label,
    timestamp: event.startAt,
    ...extra,
  };
}

export function lifeEventSource(life: LifeEvent): SourceRef {
  return { ...life.source };
}

export function commitmentSource(c: Commitment): SourceRef {
  return { ...c.source };
}
