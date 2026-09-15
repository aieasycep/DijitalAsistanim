/**
 * Pure presentation helpers for approval cards and rows: icon / badge tone per type, status tones,
 * failure-reason copy keys, scope groups for progressive OAuth and the "Ne değişecek?" lines derived
 * from a (possibly edited) payload.
 */
import type { BadgeTone, IconName } from '@da/design-tokens';
import type {
  ApprovalAction,
  ApprovalActionType,
  ApprovalStatus,
  CalendarCreatePayload,
  CalendarUpdatePayload,
  CommitmentCreatePayload,
  EmailSendPayload,
  OAuthStartRequest,
  ReminderCreatePayload,
  TaskCreatePayload,
} from '@da/domain';
import {
  formatShortDate,
  formatTime,
  isToday,
  isTomorrow,
  toLocalDateKey,
  type FormatCtx,
} from '@da/i18n';
import type { TFunction } from 'i18next';

export const APPROVAL_ICON: Record<ApprovalActionType, IconName> = {
  email_send: 'mail',
  calendar_create: 'calendarAdd',
  calendar_update: 'move',
  task_create: 'taskAdd',
  reminder_create: 'reminder',
  commitment_create: 'commitment',
};

/** Colour only where it carries meaning: calendar writes are blue, everything else neutral. */
export function badgeToneForType(type: ApprovalActionType): BadgeTone {
  return type === 'calendar_create' || type === 'calendar_update' ? 'calendar' : 'neutral';
}

/** Statuses that still belong to the "pending" list (the user or the executor still owes a step). */
export const OPEN_STATUSES: readonly ApprovalStatus[] = ['pending', 'approved', 'executing'];

export function isOpenStatus(status: ApprovalStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

const byCreatedDesc = (a: ApprovalAction, b: ApprovalAction) =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt);
const byUpdatedDesc = (a: ApprovalAction, b: ApprovalAction) =>
  Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

/** Approval Center sections: open items newest first, then history by last change. */
export function splitApprovals(list: ApprovalAction[]): {
  pending: ApprovalAction[];
  history: ApprovalAction[];
} {
  return {
    pending: list.filter((a) => isOpenStatus(a.status)).sort(byCreatedDesc),
    history: list.filter((a) => !isOpenStatus(a.status)).sort(byUpdatedDesc),
  };
}

export type StatusTone = 'tertiary' | 'primary' | 'warning' | 'success' | 'critical';

export function statusTone(status: ApprovalStatus): StatusTone {
  switch (status) {
    case 'executed':
      return 'success';
    case 'failed':
      return 'critical';
    case 'pending':
      return 'warning';
    case 'approved':
    case 'executing':
      return 'primary';
    default:
      return 'tertiary';
  }
}

export function statusLabelKey(status: ApprovalStatus): string {
  return status === 'pending' ? 'approvals.pendingStatus' : `approvals.${status}`;
}

/** Write scope group an action needs on a Google / Microsoft account (progressive OAuth). */
export const SCOPE_GROUP: Record<ApprovalActionType, OAuthStartRequest['scopeGroup'] | null> = {
  email_send: 'mail_send',
  calendar_create: 'calendar_write',
  calendar_update: 'calendar_write',
  task_create: 'tasks_write',
  reminder_create: null,
  commitment_create: null,
};

export function accountIdOf(payload: Record<string, unknown> | null | undefined): string | null {
  const v = payload?.accountId;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** True while the backend waits for the phone to write the event (EventKit / Android provider). */
export function isDevicePending(
  approval: Pick<ApprovalAction, 'status' | 'executionResult'>,
): boolean {
  if (approval.status !== 'executing') return false;
  const handler = (approval.executionResult as { handler?: unknown } | null)?.handler;
  return handler === 'device';
}

const KNOWN_FAILURES = new Set([
  'connection_expired',
  'scope_required',
  'provider_unavailable',
  'rate_limited',
  'target_missing',
  'invalid_payload',
  'account_missing',
  'device_write_failed',
]);

/** Failure copy: known codes map to i18n; a human sentence (demo adapter) is shown as-is; else generic. */
export function failureReasonCopy(reason: string | null | undefined, t: TFunction): string {
  if (!reason) return t('approvals.failureReasons.unknown');
  if (KNOWN_FAILURES.has(reason)) return t(`approvals.failureReasons.${reason}`);
  if (/\s/.test(reason)) return reason;
  return t('approvals.failureReasons.unknown');
}

/** "Bugün 16:30" · "Yarın 09:10" · "12 Eyl 20:00" */
export function formatDateTime(iso: string, ctx: FormatCtx, t: TFunction): string {
  const time = formatTime(iso, ctx);
  if (isToday(iso, ctx)) return `${t('common.today')} ${time}`;
  if (isTomorrow(iso, ctx)) return `${t('common.tomorrow')} ${time}`;
  return `${formatShortDate(iso, ctx)} ${time}`;
}

/** "Bugün 16:30–17:00" on the same day, otherwise both ends spelled out. */
export function formatRange(
  startIso: string,
  endIso: string,
  ctx: FormatCtx,
  t: TFunction,
): string {
  const start = formatDateTime(startIso, ctx, t);
  if (toLocalDateKey(startIso, ctx) === toLocalDateKey(endIso, ctx))
    return `${start}–${formatTime(endIso, ctx)}`;
  return `${start} – ${formatDateTime(endIso, ctx, t)}`;
}

function participantsLabel(list: EmailSendPayload['to'] | undefined): string {
  return (list ?? []).map((p) => p.name?.trim() || p.email).join(', ');
}

function line(t: TFunction, fieldKey: string, value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? `${t(`approvals.fields.${fieldKey}`)}: ${v}` : null;
}

/** Lines shown under "Ne değişecek?" — derived from the payload so edits are reflected immediately. */
export function describePayload(
  type: ApprovalActionType,
  payload: Record<string, unknown>,
  ctx: FormatCtx,
  t: TFunction,
): string[] {
  const lines: (string | null)[] = [];
  switch (type) {
    case 'email_send': {
      const p = payload as unknown as EmailSendPayload;
      lines.push(line(t, 'to', participantsLabel(p.to)), line(t, 'subject', p.subject));
      const body = p.bodyText?.replace(/\s+/g, ' ').trim() ?? '';
      lines.push(line(t, 'bodyText', body.length > 90 ? `${body.slice(0, 90)}…` : body));
      break;
    }
    case 'calendar_create': {
      const p = payload as unknown as CalendarCreatePayload;
      lines.push(line(t, 'title', p.title));
      if (p.startAt && p.endAt)
        lines.push(line(t, 'when', formatRange(p.startAt, p.endAt, ctx, t)));
      lines.push(line(t, 'location', p.location));
      break;
    }
    case 'calendar_update': {
      const c = (payload as unknown as CalendarUpdatePayload).changes ?? {};
      lines.push(line(t, 'title', c.title));
      if (c.startAt) lines.push(line(t, 'startAt', formatDateTime(c.startAt, ctx, t)));
      if (c.endAt) lines.push(line(t, 'endAt', formatDateTime(c.endAt, ctx, t)));
      if (c.location !== undefined) lines.push(line(t, 'location', c.location ?? '—'));
      break;
    }
    case 'task_create': {
      const p = payload as unknown as TaskCreatePayload;
      lines.push(
        line(t, 'title', p.title),
        line(t, 'dueAt', p.dueAt ? formatDateTime(p.dueAt, ctx, t) : t('approvals.noDate')),
      );
      break;
    }
    case 'reminder_create': {
      const p = payload as unknown as ReminderCreatePayload;
      lines.push(line(t, 'title', p.title));
      if (p.remindAt) lines.push(line(t, 'remindAt', formatDateTime(p.remindAt, ctx, t)));
      break;
    }
    case 'commitment_create': {
      const p = payload as unknown as CommitmentCreatePayload;
      lines.push(line(t, 'text', p.text), line(t, 'dueText', p.dueText));
      break;
    }
  }
  return lines.filter((l): l is string => Boolean(l));
}
