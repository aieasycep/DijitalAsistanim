/**
 * approvals — the gate between "the AI proposes" and "something happens in the real world".
 *
 * Product law: no e-mail is sent, no calendar event is written and no task is created unless an
 * ApprovalAction reached `approved` through an explicit user decision. This module owns the
 * state machine, payload validation, the human-readable change summary shown on the card, the
 * OAuth scope an action needs and the execution plan the edge function carries out.
 */
import type {
  AccountKind,
  ApprovalAction,
  ApprovalActionType,
  ApprovalPayloadMap,
  ApprovalStatus,
  CalendarCreatePayload,
  CalendarUpdatePayload,
  CommitmentCreatePayload,
  CreateApprovalRequest,
  EmailParticipant,
  EmailSendPayload,
  Locale,
  Provider,
  ReminderCreatePayload,
  TaskCreatePayload,
} from '@da/domain';
import { approvalPayloadSchemas } from '@da/validation';
import { buildIdempotencyKey, randomUuid } from '../crypto';
import { formatClock, formatDateLabel } from '../dates';
import { AppError } from '../errors';
import { requiredScopeFor as oauthRequiredScopeFor } from '../oauth';
import { HOUR } from '../util';

export { requiredScopeFor } from '../oauth';

// --- State machine ------------------------------------------------------------------------------

export const MAX_EXECUTION_ATTEMPTS = 3;
export const DEFAULT_APPROVAL_TTL_HOURS = 72;

const TRANSITIONS: Record<ApprovalStatus, readonly ApprovalStatus[]> = {
  pending: ['approved', 'rejected', 'expired'],
  approved: ['executing'],
  executing: ['executed', 'failed'],
  failed: ['executing'],
  rejected: [],
  executed: [],
  expired: [],
};

const MESSAGES = {
  tr: {
    conflict: 'Bu işlem şu anki durumunda yapılamıyor.',
    expired: 'Bu onayın süresi dolmuş; işlem yapılmadı.',
    notPending: 'Yalnızca bekleyen işlemler düzenlenebilir.',
    invalidPayload: 'İşlem içeriği geçersiz.',
    immutable: 'Hesap ve hedef kayıt düzenlenemez.',
    accountRequired: 'Bu işlem için bağlı bir hesap gerekli.',
    unsupported: 'Bu hesap bu işlemi desteklemiyor.',
    notApproved: 'İşlem onaylanmadan çalıştırılamaz.',
  },
  en: {
    conflict: 'This action cannot be performed in its current state.',
    expired: 'This approval has expired; nothing was done.',
    notPending: 'Only pending actions can be edited.',
    invalidPayload: 'The action content is invalid.',
    immutable: 'The account and target record cannot be changed.',
    accountRequired: 'This action needs a connected account.',
    unsupported: 'This account does not support this action.',
    notApproved: 'An action cannot run before it is approved.',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export interface TransitionContext {
  attemptCount: number;
}

/** Pure rule check; `failed → executing` is only allowed while attempts remain. */
export function canTransition(from: ApprovalStatus, to: ApprovalStatus, ctx: TransitionContext): boolean {
  if (!TRANSITIONS[from].includes(to)) return false;
  if (from === 'failed' && to === 'executing') return ctx.attemptCount < MAX_EXECUTION_ATTEMPTS;
  return true;
}

/** Expiry only matters before execution starts; terminal states never "expire". */
export function isExpired(approval: Pick<ApprovalAction, 'status' | 'expiresAt'>, now: string): boolean {
  if (approval.status !== 'pending' && approval.status !== 'approved') return false;
  return Date.parse(now) >= Date.parse(approval.expiresAt);
}

export interface TransitionOptions {
  now: string;
  locale?: Locale;
  /** For `failed`: short, non-sensitive reason (never provider response bodies). */
  failureReason?: string | null;
  /** For `executed`: provider ids only (message id, event id), never content. */
  executionResult?: Record<string, unknown> | null;
}

/**
 * Apply a transition and return the updated approval (input is not mutated).
 * Throws `conflict` when the transition is not allowed or when approving an expired approval.
 */
export function transition<T extends ApprovalActionType>(
  approval: ApprovalAction<T>,
  to: ApprovalStatus,
  opts: TransitionOptions,
): ApprovalAction<T> {
  const locale = opts.locale ?? 'tr';
  const from = approval.status;
  if (!canTransition(from, to, { attemptCount: approval.attemptCount })) {
    throw new AppError('conflict', MESSAGES[locale].conflict, {
      details: { approvalId: approval.id, from, to, attemptCount: approval.attemptCount },
    });
  }
  if ((to === 'approved' || to === 'executing') && isExpired(approval, opts.now)) {
    throw new AppError('conflict', MESSAGES[locale].expired, {
      details: { approvalId: approval.id, from, to, reason: 'expired', expiresAt: approval.expiresAt },
    });
  }

  const next: ApprovalAction<T> = { ...approval, status: to, updatedAt: opts.now };
  switch (to) {
    case 'approved':
      next.approvedAt = opts.now;
      break;
    case 'rejected':
      next.rejectedAt = opts.now;
      break;
    case 'executing':
      next.attemptCount = approval.attemptCount + 1;
      next.failureReason = null;
      break;
    case 'executed':
      next.executedAt = opts.now;
      next.executionResult = opts.executionResult ?? null;
      next.failureReason = null;
      break;
    case 'failed':
      next.failureReason = opts.failureReason ?? null;
      break;
    case 'expired':
    case 'pending':
      break;
  }
  return next;
}

/** Cron helper: pending approvals past their TTL become `expired`; everything else is returned as-is. */
export function expireIfDue<T extends ApprovalActionType>(approval: ApprovalAction<T>, now: string): ApprovalAction<T> {
  if (approval.status !== 'pending' || !isExpired(approval, now)) return approval;
  return transition(approval, 'expired', { now });
}

// --- Payload validation & typing ------------------------------------------------------------------

type TypedPayload = { [K in ApprovalActionType]: { type: K; payload: ApprovalPayloadMap[K] } }[ApprovalActionType];

function typed<T extends ApprovalActionType>(type: T, payload: ApprovalPayloadMap[T]): TypedPayload {
  return { type, payload } as TypedPayload;
}

/** Validate an untrusted payload against the schema of its action type. Throws `validation`. */
export function validateApprovalPayload<T extends ApprovalActionType>(
  type: T,
  payload: unknown,
  locale: Locale = 'tr',
): ApprovalPayloadMap[T] {
  const result = approvalPayloadSchemas[type].safeParse(payload);
  if (!result.success) {
    throw new AppError('validation', MESSAGES[locale].invalidPayload, {
      details: {
        type,
        issues: result.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })),
      },
    });
  }
  return result.data as ApprovalPayloadMap[T];
}

// --- Idempotency ------------------------------------------------------------------------------------

function participantKeys(list: readonly EmailParticipant[] | undefined): string[] {
  return (list ?? []).map((p) => p.email.trim().toLowerCase()).sort();
}

/**
 * The parts that define an action's *intent*. Two AI proposals for the same intent (e.g. two
 * reply drafts for the same thread) collapse into one approval; different bodies do not matter.
 */
export function idempotencyParts(userId: string, tp: TypedPayload): Record<string, unknown> {
  switch (tp.type) {
    case 'email_send':
      return {
        userId,
        accountId: tp.payload.accountId,
        threadId: tp.payload.threadId ?? null,
        to: participantKeys(tp.payload.to),
        subject: tp.payload.subject.trim().toLocaleLowerCase('tr-TR'),
      };
    case 'calendar_create':
      return {
        userId,
        accountId: tp.payload.accountId,
        title: tp.payload.title.trim().toLocaleLowerCase('tr-TR'),
        startAt: tp.payload.startAt,
        endAt: tp.payload.endAt,
      };
    case 'calendar_update':
      return { userId, accountId: tp.payload.accountId, eventId: tp.payload.eventId, changes: tp.payload.changes };
    case 'task_create':
      return {
        userId,
        accountId: tp.payload.accountId ?? null,
        title: tp.payload.title.trim().toLocaleLowerCase('tr-TR'),
        dueAt: tp.payload.dueAt ?? null,
      };
    case 'reminder_create':
      return tp.payload.targetType && tp.payload.targetId
        ? { userId, targetType: tp.payload.targetType, targetId: tp.payload.targetId, remindAt: tp.payload.remindAt }
        : { userId, title: tp.payload.title.trim().toLocaleLowerCase('tr-TR'), remindAt: tp.payload.remindAt };
    case 'commitment_create':
      return {
        userId,
        text: tp.payload.text.trim().toLocaleLowerCase('tr-TR'),
        direction: tp.payload.direction,
        counterpartName: tp.payload.counterpartName?.trim().toLocaleLowerCase('tr-TR') ?? null,
        dueAt: tp.payload.dueAt ?? null,
      };
  }
}

export async function approvalIdempotencyKey<T extends ApprovalActionType>(
  userId: string,
  type: T,
  payload: ApprovalPayloadMap[T],
): Promise<string> {
  return buildIdempotencyKey(`approval:${type}`, idempotencyParts(userId, typed(type, payload)));
}

// --- Change summary ---------------------------------------------------------------------------------

export interface SummaryOptions {
  locale?: Locale;
  timezone: string;
  /** Reference instant for "bugün / yarın" labels; defaults to the current time. */
  now?: string;
  /** Provider of the account the action targets ("Takvim: Google"). */
  provider?: Provider | null;
}

const L = {
  tr: {
    to: 'Kime',
    cc: 'Bilgi',
    from: 'Kimden',
    subject: 'Konu',
    title: 'Başlık',
    when: 'Ne zaman',
    where: 'Nerede',
    attendees: 'Katılımcı',
    people: 'kişi',
    calendar: 'Takvim',
    newTitle: 'Yeni başlık',
    newTime: 'Yeni zaman',
    newLocation: 'Yeni yer',
    descriptionUpdated: 'Açıklama güncellenecek',
    task: 'Görev',
    due: 'Son tarih',
    planned: 'Planlanan',
    list: 'Liste',
    reminder: 'Hatırlatıcı',
    promise: 'Sözün',
    expected: 'Beklenen',
    allDay: 'tüm gün',
    internal: 'Dijital Asistan',
    deviceCalendar: 'Cihaz takvimi',
  },
  en: {
    to: 'To',
    cc: 'Cc',
    from: 'From',
    subject: 'Subject',
    title: 'Title',
    when: 'When',
    where: 'Where',
    attendees: 'Attendees',
    people: 'people',
    calendar: 'Calendar',
    newTitle: 'New title',
    newTime: 'New time',
    newLocation: 'New location',
    descriptionUpdated: 'Description will be updated',
    task: 'Task',
    due: 'Due',
    planned: 'Planned',
    list: 'List',
    reminder: 'Reminder',
    promise: 'Your promise',
    expected: 'Expected',
    allDay: 'all day',
    internal: 'Dijital Asistan',
    deviceCalendar: 'Device calendar',
  },
} as const satisfies Record<Locale, Record<string, string>>;

function capitalize(s: string, locale: Locale): string {
  if (!s) return s;
  const first = locale === 'tr' ? s.charAt(0).toLocaleUpperCase('tr-TR') : s.charAt(0).toUpperCase();
  return first + s.slice(1);
}

function personLabel(p: EmailParticipant): string {
  return p.name?.trim() || p.email;
}

function calendarLabel(provider: Provider | null | undefined, locale: Locale): string | null {
  switch (provider) {
    case 'google':
      return 'Google';
    case 'microsoft':
      return 'Microsoft';
    case 'apple':
      return 'Apple';
    case 'device':
      return L[locale].deviceCalendar;
    case 'demo':
      return 'Demo';
    default:
      return null;
  }
}

function taskListLabel(provider: Provider | null | undefined, locale: Locale): string {
  switch (provider) {
    case 'google':
      return 'Google Tasks';
    case 'microsoft':
      return 'Microsoft To Do';
    case 'apple':
    case 'device':
      return locale === 'tr' ? 'Cihaz' : 'Device';
    default:
      return L[locale].internal;
  }
}

interface WhenContext {
  locale: Locale;
  timezone: string;
  now: string;
}

/** "Yarın 09:10" / "Tomorrow 09:10"; all-day → "Yarın (tüm gün)". */
function whenLabel(iso: string, ctx: WhenContext, allDay = false): string {
  const day = capitalize(formatDateLabel(iso, { now: ctx.now, timezone: ctx.timezone, locale: ctx.locale }), ctx.locale);
  return allDay ? `${day} (${L[ctx.locale].allDay})` : `${day} ${formatClock(iso, ctx.timezone)}`;
}

/** "Yarın 09:10–10:00" when both ends fall on the same local day, otherwise two full labels. */
function rangeLabel(startIso: string, endIso: string, ctx: WhenContext, allDay = false): string {
  if (allDay) return whenLabel(startIso, ctx, true);
  const startDay = formatDateLabel(startIso, { now: ctx.now, timezone: ctx.timezone, locale: ctx.locale });
  const endDay = formatDateLabel(endIso, { now: ctx.now, timezone: ctx.timezone, locale: ctx.locale });
  if (startDay === endDay) return `${whenLabel(startIso, ctx)}–${formatClock(endIso, ctx.timezone)}`;
  return `${whenLabel(startIso, ctx)} – ${whenLabel(endIso, ctx)}`;
}

/** Card lines such as "Kime: Ahmet Yılmaz", "Konu: Re: Revize teklif", "Ne zaman: Yarın 09:10", "Takvim: Google". */
export function summarizeChange<T extends ApprovalActionType>(
  type: T,
  payload: ApprovalPayloadMap[T],
  opts: SummaryOptions,
): string[] {
  const locale = opts.locale ?? 'tr';
  const ctx: WhenContext = { locale, timezone: opts.timezone, now: opts.now ?? new Date().toISOString() };
  const t = L[locale];
  const lines: string[] = [];
  const tp = typed(type, payload);

  switch (tp.type) {
    case 'email_send': {
      lines.push(`${t.to}: ${tp.payload.to.map(personLabel).join(', ')}`);
      if (tp.payload.cc && tp.payload.cc.length > 0) lines.push(`${t.cc}: ${tp.payload.cc.map(personLabel).join(', ')}`);
      lines.push(`${t.subject}: ${tp.payload.subject}`);
      break;
    }
    case 'calendar_create': {
      const p = tp.payload;
      lines.push(`${t.title}: ${p.title}`);
      lines.push(`${t.when}: ${rangeLabel(p.startAt, p.endAt, ctx, p.allDay ?? false)}`);
      if (p.location) lines.push(`${t.where}: ${p.location}`);
      if (p.attendees && p.attendees.length > 0) lines.push(`${t.attendees}: ${p.attendees.length} ${t.people}`);
      const cal = calendarLabel(opts.provider, locale);
      if (cal) lines.push(`${t.calendar}: ${cal}`);
      break;
    }
    case 'calendar_update': {
      const c = tp.payload.changes;
      if (c.title !== undefined) lines.push(`${t.newTitle}: ${c.title}`);
      if (c.startAt !== undefined || c.endAt !== undefined) {
        const start = c.startAt ?? c.endAt ?? '';
        const end = c.endAt ?? c.startAt ?? '';
        lines.push(`${t.newTime}: ${c.startAt && c.endAt ? rangeLabel(start, end, ctx) : whenLabel(start, ctx)}`);
      }
      if (c.location !== undefined && c.location !== null) lines.push(`${t.newLocation}: ${c.location}`);
      if (c.description !== undefined) lines.push(t.descriptionUpdated);
      const cal = calendarLabel(opts.provider, locale);
      if (cal) lines.push(`${t.calendar}: ${cal}`);
      break;
    }
    case 'task_create': {
      const p = tp.payload;
      lines.push(`${t.task}: ${p.title}`);
      if (p.dueAt) lines.push(`${t.due}: ${whenLabel(p.dueAt, ctx)}`);
      if (p.scheduledStartAt && p.scheduledEndAt) lines.push(`${t.planned}: ${rangeLabel(p.scheduledStartAt, p.scheduledEndAt, ctx)}`);
      lines.push(`${t.list}: ${taskListLabel(p.accountId ? opts.provider : null, locale)}`);
      break;
    }
    case 'reminder_create': {
      lines.push(`${t.reminder}: ${tp.payload.title}`);
      lines.push(`${t.when}: ${whenLabel(tp.payload.remindAt, ctx)}`);
      break;
    }
    case 'commitment_create': {
      const p = tp.payload;
      const owes = p.direction === 'user_owes';
      lines.push(`${owes ? t.promise : t.expected}: ${p.text}`);
      if (p.counterpartName) lines.push(`${owes ? t.to : t.from}: ${p.counterpartName}`);
      if (p.dueAt) lines.push(`${t.due}: ${whenLabel(p.dueAt, ctx)}`);
      else if (p.dueText) lines.push(`${t.due}: ${p.dueText}`);
      break;
    }
  }
  return lines;
}

// --- Creation & edits -----------------------------------------------------------------------------------

export type CreateApprovalInput<T extends ApprovalActionType = ApprovalActionType> = Omit<
  CreateApprovalRequest<T>,
  'idempotencyKey' | 'changeSummary'
> & {
  /** Computed from the intent when missing. */
  idempotencyKey?: string | null;
  /** Generated from the payload when missing or empty. */
  changeSummary?: string[];
};

export interface CreateApprovalOptions {
  userId: string;
  now: string;
  ttlHours?: number;
  locale?: Locale;
  timezone?: string;
  /** Provider of the target account, when known (sets `requiredScope` and the calendar label). */
  provider?: Provider | null;
  /** Row id; generated when omitted. */
  id?: string;
}

/**
 * Build a pending ApprovalAction from an AI/user request. The payload is validated against the
 * action schema, the original payload is kept for audit and the idempotency key is derived from
 * the intent when the caller did not provide one.
 */
export async function createApproval<T extends ApprovalActionType>(
  input: CreateApprovalInput<T>,
  opts: CreateApprovalOptions,
): Promise<ApprovalAction<T>> {
  const locale = opts.locale ?? 'tr';
  const timezone = opts.timezone ?? 'Europe/Istanbul';
  const ttlHours = opts.ttlHours ?? DEFAULT_APPROVAL_TTL_HOURS;
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) throw new RangeError('ttlHours pozitif olmalı');

  const payload = validateApprovalPayload(input.type, input.payload, locale);
  const idempotencyKey = input.idempotencyKey?.trim() || (await approvalIdempotencyKey(opts.userId, input.type, payload));
  const changeSummary =
    input.changeSummary && input.changeSummary.length > 0
      ? input.changeSummary
      : summarizeChange(input.type, payload, { locale, timezone, now: opts.now, provider: opts.provider ?? null });

  return {
    id: opts.id ?? randomUuid(),
    userId: opts.userId,
    type: input.type,
    status: 'pending',
    what: input.what,
    why: input.why,
    changeSummary,
    source: input.source ?? null,
    payload,
    originalPayload: structuredClone(payload),
    editedByUser: false,
    idempotencyKey,
    expiresAt: new Date(Date.parse(opts.now) + ttlHours * HOUR).toISOString(),
    approvedAt: null,
    rejectedAt: null,
    executedAt: null,
    executionResult: null,
    failureReason: null,
    attemptCount: 0,
    requestedBy: input.requestedBy,
    insightId: input.insightId ?? null,
    requiredScope: approvalRequiredScope(input.type, opts.provider ?? null),
    createdAt: opts.now,
    updatedAt: opts.now,
  };
}

export interface ApplyEditOptions {
  now: string;
  timezone: string;
  locale?: Locale;
  provider?: Provider | null;
}

function immutableFields(tp: TypedPayload): Record<string, unknown> {
  switch (tp.type) {
    case 'email_send':
    case 'calendar_create':
      return { accountId: tp.payload.accountId };
    case 'calendar_update':
      return { accountId: tp.payload.accountId, eventId: tp.payload.eventId, externalEventId: tp.payload.externalEventId };
    case 'task_create':
      return { accountId: tp.payload.accountId ?? null };
    case 'reminder_create':
    case 'commitment_create':
      return {};
  }
}

/**
 * The user edited the proposal before approving. Only pending approvals can be edited; the edit
 * must validate, may not retarget the account/event, and regenerates the change summary.
 */
export function applyEdit<T extends ApprovalActionType>(
  approval: ApprovalAction<T>,
  editedPayload: unknown,
  opts: ApplyEditOptions,
): ApprovalAction<T> {
  const locale = opts.locale ?? 'tr';
  if (approval.status !== 'pending') {
    throw new AppError('conflict', MESSAGES[locale].notPending, { details: { approvalId: approval.id, status: approval.status } });
  }
  const payload = validateApprovalPayload(approval.type, editedPayload, locale);
  const before = immutableFields(typed(approval.type, approval.payload));
  const after = immutableFields(typed(approval.type, payload));
  for (const key of Object.keys(before)) {
    if (before[key] !== after[key]) {
      throw new AppError('validation', MESSAGES[locale].immutable, { details: { approvalId: approval.id, field: key } });
    }
  }
  return {
    ...approval,
    payload,
    editedByUser: true,
    changeSummary: summarizeChange(approval.type, payload, { locale, timezone: opts.timezone, now: opts.now, provider: opts.provider ?? null }),
    updatedAt: opts.now,
  };
}

// --- Scopes & execution planning ----------------------------------------------------------------------

/**
 * Provider scope the action needs on the target account, or null for internal actions and for
 * accounts without OAuth scopes (device / Apple / demo).
 */
export function approvalRequiredScope(type: ApprovalActionType, provider: Provider | null | undefined): string | null {
  if (provider !== 'google' && provider !== 'microsoft') return null;
  return oauthRequiredScopeFor(type, provider);
}

export interface ExecutionAccount {
  provider: Provider;
  kinds: readonly AccountKind[];
}

interface PlanBase {
  approvalId: string;
  idempotencyKey: string;
  /** Scope the executor must hold before calling the provider (null for internal/device). */
  requiredScope: string | null;
}

export type ExecutionPlan =
  | (PlanBase & { kind: 'gmail_send' | 'graph_send'; payload: EmailSendPayload })
  | (PlanBase & { kind: 'gcal_create' | 'graph_event_create' | 'device_event_create'; payload: CalendarCreatePayload })
  | (PlanBase & { kind: 'gcal_update' | 'graph_event_update' | 'device_event_update'; payload: CalendarUpdatePayload })
  | (PlanBase & { kind: 'gtasks_create' | 'graph_task_create' | 'internal_task'; payload: TaskCreatePayload })
  | (PlanBase & { kind: 'internal_reminder'; payload: ReminderCreatePayload })
  | (PlanBase & { kind: 'internal_commitment'; payload: CommitmentCreatePayload });

export type ExecutionKind = ExecutionPlan['kind'];

export interface PlanExecutionOptions {
  now: string;
  locale?: Locale;
}

/**
 * Decide *how* an approved action runs. Refuses anything that is not approved (or already
 * executing for a retry) and anything whose approval has expired.
 */
export function planExecution<T extends ApprovalActionType>(
  approval: ApprovalAction<T>,
  account: ExecutionAccount | null,
  opts: PlanExecutionOptions,
): ExecutionPlan {
  const locale = opts.locale ?? 'tr';
  if (approval.status !== 'approved' && approval.status !== 'executing') {
    throw new AppError('conflict', MESSAGES[locale].notApproved, { details: { approvalId: approval.id, status: approval.status } });
  }
  if (isExpired(approval, opts.now)) {
    throw new AppError('conflict', MESSAGES[locale].expired, { details: { approvalId: approval.id, reason: 'expired' } });
  }

  const base: PlanBase = {
    approvalId: approval.id,
    idempotencyKey: approval.idempotencyKey,
    requiredScope: approvalRequiredScope(approval.type, account?.provider ?? null),
  };
  const needAccount = (kind: AccountKind): ExecutionAccount => {
    if (!account) {
      throw new AppError('validation', MESSAGES[locale].accountRequired, { details: { approvalId: approval.id, reason: 'account_required', kind } });
    }
    if (!account.kinds.includes(kind)) {
      throw new AppError('validation', MESSAGES[locale].unsupported, {
        details: { approvalId: approval.id, reason: 'unsupported_provider', provider: account.provider, kind },
      });
    }
    return account;
  };
  const unsupported = (): never => {
    throw new AppError('validation', MESSAGES[locale].unsupported, {
      details: { approvalId: approval.id, reason: 'unsupported_provider', provider: account?.provider ?? null },
    });
  };

  const tp = typed(approval.type, approval.payload);
  switch (tp.type) {
    case 'email_send': {
      const acc = needAccount('email');
      if (acc.provider === 'google') return { ...base, kind: 'gmail_send', payload: tp.payload };
      if (acc.provider === 'microsoft') return { ...base, kind: 'graph_send', payload: tp.payload };
      return unsupported();
    }
    case 'calendar_create': {
      const acc = needAccount('calendar');
      if (acc.provider === 'google') return { ...base, kind: 'gcal_create', payload: tp.payload };
      if (acc.provider === 'microsoft') return { ...base, kind: 'graph_event_create', payload: tp.payload };
      if (acc.provider === 'apple' || acc.provider === 'device') return { ...base, kind: 'device_event_create', payload: tp.payload };
      return unsupported();
    }
    case 'calendar_update': {
      const acc = needAccount('calendar');
      if (acc.provider === 'google') return { ...base, kind: 'gcal_update', payload: tp.payload };
      if (acc.provider === 'microsoft') return { ...base, kind: 'graph_event_update', payload: tp.payload };
      if (acc.provider === 'apple' || acc.provider === 'device') return { ...base, kind: 'device_event_update', payload: tp.payload };
      return unsupported();
    }
    case 'task_create': {
      const external = account && tp.payload.accountId && account.kinds.includes('tasks');
      if (external && account.provider === 'google') return { ...base, kind: 'gtasks_create', payload: tp.payload };
      if (external && account.provider === 'microsoft') return { ...base, kind: 'graph_task_create', payload: tp.payload };
      return { ...base, requiredScope: null, kind: 'internal_task', payload: tp.payload };
    }
    case 'reminder_create':
      return { ...base, requiredScope: null, kind: 'internal_reminder', payload: tp.payload };
    case 'commitment_create':
      return { ...base, requiredScope: null, kind: 'internal_commitment', payload: tp.payload };
  }
}
