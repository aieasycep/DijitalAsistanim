/**
 * followups — "Senin cevap beklediklerin": detect threads the user is waiting on, keep their
 * lifecycle (replied / snoozed / closed), phrase the card copy and throttle nudges so the assistant
 * never nags. Pure functions; the caller persists.
 */
import type {
  Contact,
  EmailThread,
  FollowUp,
  LearnedPreference,
  Locale,
  SourceRef,
  SourceType,
  UUID,
} from '@da/domain';
import { addDays, daysBetween, localDateOf, localToUtcIso } from '../dates';
import { DAY, HOUR, MINUTE, localDateKey } from '../util';

export const DEFAULT_TIMEZONE = 'Europe/Istanbul';
export const DEFAULT_NUDGE_DAYS = 3;
/** Threads older than this are never turned into new follow-ups. */
export const MAX_FOLLOW_UP_AGE_DAYS = 30;
/** A contact who dismissed this many follow-ups is left alone. */
export const DISMISS_LIMIT = 2;

export type FollowUpDraft = Omit<FollowUp, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

export interface DetectFollowUpsInput {
  threads: readonly EmailThread[];
  now: string;
  /** Cadence is counted in local calendar days ("3 gündür"). Default Europe/Istanbul. */
  timezone?: string;
  defaultNudgeDays?: number;
  learned?: readonly LearnedPreference[];
  existing?: readonly FollowUp[];
  contactsById?: Readonly<Record<UUID, Contact>>;
  /** The user's own addresses (to find the counterpart and skip notes-to-self). */
  userEmails?: readonly string[];
  /** Provider per account id (Gmail vs Outlook source labels). Default gmail. */
  accountSourceTypes?: Readonly<Record<UUID, SourceType>>;
  maxAgeDays?: number;
}

function ms(iso: string): number {
  return Date.parse(iso);
}

function lower(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

const NO_REPLY =
  /(^|[._-])(no-?reply|noreply|donotreply|do-not-reply|bounce|mailer-daemon|newsletter|bulten|bülten|notifications?|info|kampanya|promo)([._-]|@|$)/i;

export function stripSubjectPrefixes(subject: string): string {
  let s = subject.trim();
  for (let i = 0; i < 5; i++) {
    const next = s.replace(/^((re|fw|fwd|ynt|ilt|aw|wg)\s*:\s*)/i, '').trim();
    if (next === s) break;
    s = next;
  }
  return s || subject.trim();
}

function counterpartOf(
  thread: EmailThread,
  userEmails: Set<string>,
): EmailThread['participants'][number] | null {
  for (const p of thread.participants) {
    const e = lower(p.email);
    if (!e || userEmails.has(e)) continue;
    return p;
  }
  return null;
}

function looksLikeNewsletter(thread: EmailThread): boolean {
  if (thread.category === 'promotion') return true;
  const labels = thread.labels.map((l) => l.toLowerCase());
  if (
    labels.some(
      (l) =>
        l.includes('promotion') ||
        l.includes('newsletter') ||
        l.includes('bülten') ||
        l.includes('bulten'),
    )
  )
    return true;
  return false;
}

function contactByEmail(
  contacts: Readonly<Record<UUID, Contact>> | undefined,
  email: string,
): Contact | null {
  if (!contacts) return null;
  const e = lower(email);
  for (const c of Object.values(contacts)) {
    if (c.emails.some((x) => lower(x) === e)) return c;
  }
  return null;
}

/** Sum of learned follow_up_cadence weights that apply (contact, email, category, or global "default"). */
export function cadenceWeight(
  learned: readonly LearnedPreference[],
  keys: readonly string[],
): number {
  const set = new Set(keys.map((k) => k.toLowerCase()));
  set.add('default');
  set.add('follow_up_cadence');
  let w = 0;
  for (const p of learned) {
    if (!p.enabled || p.kind !== 'follow_up_cadence') continue;
    if (!set.has(p.subjectKey.toLowerCase())) continue;
    w += p.weight;
  }
  return Math.max(-1, Math.min(1, w));
}

/** Positive weight = the user likes earlier nudges; negative = later. Result clamped to 1..14 days. */
export function adjustNudgeDays(base: number, weight: number): number {
  const adjusted = Math.round(base * (1 - 0.5 * weight));
  return Math.max(1, Math.min(14, adjusted));
}

function dismissedTooOften(
  existing: readonly FollowUp[],
  contactId: string | null,
  counterpartEmail: string,
  threadsByCounterpart: ReadonlyMap<string, string>,
): boolean {
  let count = 0;
  for (const f of existing) {
    const sameContact = contactId && f.contactId === contactId;
    const sameEmail = threadsByCounterpart.get(f.threadId) === counterpartEmail;
    if (sameContact || sameEmail) count += f.dismissCount;
  }
  return count >= DISMISS_LIMIT;
}

/**
 * Follow-up drafts for threads whose last message is from the user and that still deserve an
 * answer (not low importance, not promotions/newsletters, not a note to self, not already watched).
 */
export function detectFollowUps(input: DetectFollowUpsInput): FollowUpDraft[] {
  const nowMs = ms(input.now);
  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  const defaultDays = input.defaultNudgeDays ?? DEFAULT_NUDGE_DAYS;
  const learned = input.learned ?? [];
  const existing = input.existing ?? [];
  const userEmails = new Set((input.userEmails ?? []).map(lower).filter(Boolean));
  const maxAge = (input.maxAgeDays ?? MAX_FOLLOW_UP_AGE_DAYS) * DAY;
  const existingByThread = new Map<string, FollowUp[]>();
  for (const f of existing) {
    const list = existingByThread.get(f.threadId) ?? [];
    list.push(f);
    existingByThread.set(f.threadId, list);
  }
  // counterpart email per existing follow-up thread (from the threads we know about)
  const counterpartByThread = new Map<string, string>();
  for (const t of input.threads) {
    const cp = counterpartOf(t, userEmails);
    if (cp) counterpartByThread.set(t.id, lower(cp.email));
  }

  const out: FollowUpDraft[] = [];
  for (const thread of input.threads) {
    if (thread.deletedAt || !thread.lastFromUser) continue;
    if (thread.userDismissed || thread.userMarkedDone) continue;
    if (thread.importance === 'low') continue;
    if (looksLikeNewsletter(thread)) continue;
    if (thread.analysis?.followUp && thread.analysis.followUp.expected === false) continue;
    const sentMs = ms(thread.lastMessageAt);
    if (Number.isNaN(sentMs) || sentMs > nowMs + MINUTE || nowMs - sentMs > maxAge) continue;
    const counterpart = counterpartOf(thread, userEmails);
    if (!counterpart) continue;
    const counterpartEmail = lower(counterpart.email);
    if (NO_REPLY.test(counterpartEmail)) continue;
    if (thread.participants.length === 1 && userEmails.size === 0) continue;

    const prior = existingByThread.get(thread.id) ?? [];
    const open = prior.find(
      (f) => f.status === 'watching' || f.status === 'nudge_due' || f.status === 'snoozed',
    );
    if (open) continue;
    const closedAfterSend = prior.find(
      (f) => (f.status === 'closed' || f.status === 'replied') && ms(f.sentAt) >= sentMs,
    );
    if (closedAfterSend) continue;

    const contact = contactByEmail(input.contactsById, counterpartEmail);
    const contactId = contact?.id ?? null;
    if (dismissedTooOften(existing, contactId, counterpartEmail, counterpartByThread)) continue;
    const dismissPattern = learned.some(
      (p) =>
        p.enabled &&
        p.kind === 'dismiss_pattern' &&
        p.weight >= 0.5 &&
        [contactId ?? '', counterpartEmail, thread.id]
          .map(lower)
          .includes(p.subjectKey.toLowerCase()),
    );
    if (dismissPattern) continue;

    const base = thread.analysis?.followUp?.nudgeAfterDays ?? defaultDays;
    const keys = [contactId ?? '', counterpartEmail, thread.category].filter(Boolean);
    const nudgeAfterDays = adjustNudgeDays(base, cadenceWeight(learned, keys));
    const dueMs = ms(
      followUpDueAt({ sentAt: thread.lastMessageAt, nudgeAfterDays, snoozedUntil: null }, timezone),
    );
    const sourceType = input.accountSourceTypes?.[thread.accountId] ?? 'gmail';
    const counterpartName = counterpart.name?.trim() || contact?.displayName || counterpart.email;
    const source: SourceRef = {
      type: sourceType,
      id: thread.id,
      externalId: thread.externalThreadId,
      label: sourceType === 'outlook' ? 'Outlook' : 'Gmail',
      person: counterpartName,
      ...(contactId ? { personId: contactId } : {}),
      timestamp: thread.lastMessageAt,
    };
    out.push({
      threadId: thread.id,
      contactId,
      counterpartName,
      topic: stripSubjectPrefixes(thread.subject),
      sentAt: thread.lastMessageAt,
      nudgeAfterDays,
      status: nowMs >= dueMs ? 'nudge_due' : 'watching',
      snoozedUntil: null,
      repliedAt: null,
      closedAt: null,
      source,
      dismissCount: 0,
    });
  }
  return out.sort((a, b) => ms(a.sentAt) - ms(b.sentAt));
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** A reply after the tracked message closes the loop; earlier replies are ignored. */
export function followUpStatusAfterReply<T extends FollowUp | FollowUpDraft>(
  followUp: T,
  replyAt: string,
): T {
  if (Number.isNaN(ms(replyAt)) || ms(replyAt) < ms(followUp.sentAt)) return followUp;
  if (followUp.status === 'closed') return followUp;
  return { ...followUp, status: 'replied', repliedAt: replyAt, snoozedUntil: null };
}

export function snoozeFollowUp<T extends FollowUp | FollowUpDraft>(followUp: T, until: string): T {
  if (followUp.status === 'closed' || followUp.status === 'replied') return followUp;
  return { ...followUp, status: 'snoozed', snoozedUntil: until };
}

export function closeFollowUp<T extends FollowUp | FollowUpDraft>(
  followUp: T,
  at: string,
  opts: { dismissed?: boolean } = {},
): T {
  return {
    ...followUp,
    status: 'closed',
    closedAt: at,
    snoozedUntil: null,
    dismissCount: followUp.dismissCount + (opts.dismissed ? 1 : 0),
  };
}

/**
 * Instant at which the nudge becomes due: the local midnight `nudgeAfterDays` calendar days after
 * the message was sent (so a mail sent Tuesday at 10:15 is "3 gündür" on Friday morning);
 * a snooze wins over the cadence.
 */
export function followUpDueAt(
  followUp: Pick<FollowUp, 'sentAt' | 'nudgeAfterDays' | 'snoozedUntil'>,
  timezone: string = DEFAULT_TIMEZONE,
): string {
  const dueDate = addDays(localDateOf(followUp.sentAt, timezone), followUp.nudgeAfterDays);
  const cadence = ms(localToUtcIso(dueDate, 0, 0, timezone));
  const snoozed = followUp.snoozedUntil ? ms(followUp.snoozedUntil) : Number.NEGATIVE_INFINITY;
  return new Date(Math.max(cadence, snoozed)).toISOString();
}

/** Re-evaluate watching/snoozed follow-ups against now. */
export function refreshFollowUpStatus<T extends FollowUp | FollowUpDraft>(
  followUp: T,
  now: string,
  timezone: string = DEFAULT_TIMEZONE,
): T {
  if (followUp.status === 'closed' || followUp.status === 'replied') return followUp;
  if (followUp.status === 'snoozed' && followUp.snoozedUntil && ms(followUp.snoozedUntil) > ms(now))
    return followUp;
  const due = ms(followUpDueAt(followUp, timezone)) <= ms(now);
  const status: FollowUp['status'] = due ? 'nudge_due' : 'watching';
  if (status === followUp.status) return followUp;
  return { ...followUp, status };
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export interface FollowUpCopyOptions {
  now: string;
  locale?: Locale;
  timezone?: string;
}

/** Local calendar days since the message was sent (Tuesday 10:15 → Friday 08:42 = 3). */
export function waitingDays(
  followUp: Pick<FollowUp, 'sentAt'>,
  now: string,
  timezone: string = DEFAULT_TIMEZONE,
): number {
  return Math.max(
    0,
    daysBetween(localDateOf(followUp.sentAt, timezone), localDateOf(now, timezone)),
  );
}

/** "3 gün" / "3 days" — the card's time label. */
export function followUpWaitLabel(
  followUp: Pick<FollowUp, 'sentAt'>,
  opts: FollowUpCopyOptions,
): string {
  const days = waitingDays(followUp, opts.now, opts.timezone);
  const en = opts.locale === 'en';
  if (days === 0) {
    const hours = Math.max(1, Math.floor((ms(opts.now) - ms(followUp.sentAt)) / HOUR));
    return en ? `${hours} h` : `${hours} saat`;
  }
  return en ? `${days} ${days === 1 ? 'day' : 'days'}` : `${days} gün`;
}

function topicPhrase(topic: string, locale: Locale): string {
  const clean = topic.trim();
  if (!clean) return locale === 'en' ? 'your' : 'gönderdiğin';
  const words = clean.split(/\s+/);
  if (words.length <= 2)
    return locale === 'en' ? `your ${clean}` : clean.toLocaleLowerCase('tr-TR');
  return locale === 'en' ? `your “${clean}”` : `“${clean}”`;
}

/** "Gönderdiğin teklif mailine 3 gündür cevap gelmedi." */
export function followUpBrief(
  followUp: Pick<FollowUp, 'sentAt' | 'topic' | 'counterpartName'>,
  opts: FollowUpCopyOptions,
): string {
  const locale = opts.locale ?? 'tr';
  const days = waitingDays(followUp, opts.now, opts.timezone);
  const topic = topicPhrase(followUp.topic, locale);
  if (locale === 'en') {
    if (days === 0) return `No reply yet to ${topic} email you sent today.`;
    return `No reply to ${topic} email for ${days} ${days === 1 ? 'day' : 'days'}.`;
  }
  if (days === 0) return `Bugün gönderdiğin ${topic} mailine henüz cevap gelmedi.`;
  return `Gönderdiğin ${topic} mailine ${days} gündür cevap gelmedi.`;
}

/** Bottom-sheet reason: "Son mesajı sen gönderdin ve 3 gündür yanıt yok." */
export function followUpReason(
  followUp: Pick<FollowUp, 'sentAt' | 'counterpartName'>,
  opts: FollowUpCopyOptions,
): string {
  const days = waitingDays(followUp, opts.now, opts.timezone);
  if (opts.locale === 'en')
    return `You sent the last message and ${followUp.counterpartName} has not replied for ${days} ${days === 1 ? 'day' : 'days'}.`;
  return `Son mesajı sen gönderdin ve ${followUp.counterpartName} ${days} gündür yanıt vermedi.`;
}

// ---------------------------------------------------------------------------
// Anti-spam nudge selection
// ---------------------------------------------------------------------------

export interface SelectNudgesOptions {
  now: string;
  timezone?: string;
  /** Max nudges per local day, default 3. */
  maxPerDay?: number;
  /** Do not nudge the same thread again within this many hours, default 48. */
  minHoursBetweenSameThread?: number;
  /** Last time each thread was nudged (threadId → ISO). */
  lastNudgeAtByThread?: Readonly<Record<string, string>>;
  /** Nudges already sent today (counts against maxPerDay); ISO instants. */
  sentToday?: readonly string[];
}

/**
 * Which due follow-ups to surface now: one per thread and per person, none nudged recently,
 * none snoozed, longest-waiting first, capped per day.
 */
export function selectNudges<T extends FollowUp | FollowUpDraft>(
  candidates: readonly T[],
  opts: SelectNudgesOptions,
): T[] {
  const nowMs = ms(opts.now);
  const tz = opts.timezone ?? DEFAULT_TIMEZONE;
  const maxPerDay = opts.maxPerDay ?? 3;
  const minGapMs = (opts.minHoursBetweenSameThread ?? 48) * HOUR;
  const todayKey = localDateKey(opts.now, tz);
  const alreadyToday = (opts.sentToday ?? []).filter(
    (iso) => localDateKey(iso, tz) === todayKey,
  ).length;
  let budget = Math.max(0, maxPerDay - alreadyToday);
  if (budget === 0) return [];
  const due = candidates
    .map((f) => refreshFollowUpStatus(f, opts.now, tz))
    .filter((f) => f.status === 'nudge_due')
    .filter((f) => {
      const last = opts.lastNudgeAtByThread?.[f.threadId];
      return !last || nowMs - ms(last) >= minGapMs;
    })
    .sort((a, b) => ms(a.sentAt) - ms(b.sentAt));
  const out: T[] = [];
  const threads = new Set<string>();
  const people = new Set<string>();
  for (const f of due) {
    if (budget <= 0) break;
    const person = (f.contactId ?? f.counterpartName).toLowerCase();
    if (threads.has(f.threadId) || people.has(person)) continue;
    threads.add(f.threadId);
    people.add(person);
    out.push(f);
    budget -= 1;
  }
  return out;
}
