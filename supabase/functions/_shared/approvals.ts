/**
 * Approval persistence helpers shared by approvals-create / approvals-decide / approvals-retry,
 * the assistant, post-meeting and capture functions (which create approvals) and the executor.
 */
import type { ApprovalAction, ApprovalActionType, ConnectedAccount, Locale } from '@da/domain';
import { AppError } from '@da/server-core/errors';
import type { Db } from './db.ts';
import { camelize } from './rows.ts';

export interface ApprovalContext {
  locale: Locale;
  timezone: string;
}

/** Locale + timezone used for change-summary lines ("Yarın 09:10"). */
export async function loadApprovalContext(admin: Db, userId: string): Promise<ApprovalContext> {
  const { data } = await admin
    .from('user_preferences')
    .select('locale, timezone')
    .eq('user_id', userId)
    .maybeSingle();
  const row = data as { locale: Locale; timezone: string } | null;
  return { locale: row?.locale ?? 'tr', timezone: row?.timezone ?? 'Europe/Istanbul' };
}

export async function loadApproval(
  db: Db,
  userId: string,
  approvalId: string,
): Promise<ApprovalAction> {
  const { data, error } = await db
    .from('approval_actions')
    .select('*')
    .eq('id', approvalId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new AppError('internal', `Onay okunamadı: ${error.message}`);
  if (!data) throw new AppError('not_found', 'Onay bulunamadı.');
  return camelize<ApprovalAction>(data);
}

export function approvalToRow(a: ApprovalAction): Record<string, unknown> {
  return {
    id: a.id,
    user_id: a.userId,
    type: a.type,
    status: a.status,
    what: a.what,
    why: a.why,
    change_summary: a.changeSummary,
    source: a.source ?? null,
    payload: a.payload,
    original_payload: a.originalPayload,
    edited_by_user: a.editedByUser,
    idempotency_key: a.idempotencyKey,
    expires_at: a.expiresAt,
    approved_at: a.approvedAt ?? null,
    rejected_at: a.rejectedAt ?? null,
    executed_at: a.executedAt ?? null,
    execution_result: a.executionResult ?? null,
    failure_reason: a.failureReason ?? null,
    attempt_count: a.attemptCount,
    requested_by: a.requestedBy,
    insight_id: a.insightId ?? null,
    required_scope: a.requiredScope ?? null,
  };
}

/** Insert a new approval; when the idempotency key already exists the existing row id is returned. */
export async function insertApproval(
  admin: Db,
  approval: ApprovalAction,
): Promise<{ id: string; created: boolean }> {
  const { data: existing } = await admin
    .from('approval_actions')
    .select('id')
    .eq('user_id', approval.userId)
    .eq('idempotency_key', approval.idempotencyKey)
    .maybeSingle();
  if (existing) return { id: (existing as { id: string }).id, created: false };
  const { error } = await admin.from('approval_actions').insert(approvalToRow(approval));
  if (error) {
    if (error.code === '23505') {
      const { data: again } = await admin
        .from('approval_actions')
        .select('id')
        .eq('user_id', approval.userId)
        .eq('idempotency_key', approval.idempotencyKey)
        .maybeSingle();
      if (again) return { id: (again as { id: string }).id, created: false };
    }
    throw new AppError('internal', `Onay oluşturulamadı: ${error.message}`);
  }
  return { id: approval.id, created: true };
}

/** Persist the mutable part of an approval after a state transition or edit. */
export async function persistApproval(admin: Db, approval: ApprovalAction): Promise<void> {
  const row = approvalToRow(approval);
  delete row.id;
  delete row.user_id;
  delete row.type;
  delete row.original_payload;
  delete row.idempotency_key;
  delete row.requested_by;
  const { error } = await admin.from('approval_actions').update(row).eq('id', approval.id);
  if (error) throw new AppError('internal', `Onay güncellenemedi: ${error.message}`);
}

/** The connected account an approval targets (null for internal reminders/commitments and internal tasks). */
export function accountIdOf(approval: ApprovalAction): string | null {
  const p = approval.payload as { accountId?: string | null };
  return typeof p.accountId === 'string' && p.accountId.length > 0 ? p.accountId : null;
}

export async function loadAccount(
  admin: Db,
  userId: string,
  accountId: string,
): Promise<ConnectedAccount | null> {
  const { data } = await admin
    .from('connected_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  return data ? camelize<ConnectedAccount>(data) : null;
}

export function isApprovalType(value: string): value is ApprovalActionType {
  return [
    'email_send',
    'calendar_create',
    'calendar_update',
    'task_create',
    'reminder_create',
    'commitment_create',
  ].includes(value);
}
