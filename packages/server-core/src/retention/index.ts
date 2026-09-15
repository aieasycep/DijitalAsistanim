/**
 * retention — data lifecycle plans: scheduled retention cleanup, "delete my history",
 * account deletion ordering and export bundle rules.
 *
 * Everything here is a plan object; the edge function executes it against Postgres/Storage and
 * writes one `retention.cleanup` / `data.delete_history` / `account.delete` audit row per user.
 * Credentials, approvals (audit trail of what the AI was allowed to do) and subscriptions are never
 * part of a cleanup.
 */
import type { RetentionOption } from '@da/domain';
import { DAY, HOUR } from '../util';

// --- Cutoffs -----------------------------------------------------------------------------------

export const RETENTION_DAYS: Record<Exclude<RetentionOption, 'forever'>, number> = {
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

/** ISO instant before which data may be removed; null = keep forever. */
export function retentionCutoff(option: RetentionOption, now: string): string | null {
  if (option === 'forever') return null;
  return new Date(Date.parse(now) - RETENTION_DAYS[option] * DAY).toISOString();
}

// --- Cleanup plans -----------------------------------------------------------------------------

export const RETENTION_TABLES = [
  'email_messages',
  'email_threads',
  'memory_chunks',
  'captures',
  'android_notifications',
  'assistant_messages',
  'briefings',
  'insights',
] as const;
export type RetentionTable = (typeof RETENTION_TABLES)[number];

/** Tables a cleanup must never touch (defense in depth — checked by tests and by the executor). */
export const RETENTION_PROTECTED_TABLES = [
  'oauth_credentials',
  'oauth_states',
  'approval_actions',
  'subscriptions',
  'referrals',
  'referral_credits',
  'audit_logs',
  'profiles',
  'user_preferences',
  'connected_accounts',
] as const;

export type CleanupOp = 'delete' | 'soft_delete';

export interface CleanupStep {
  table: RetentionTable;
  /** Timestamp/date column compared against the cutoff. */
  column: string;
  op: CleanupOp;
  /** Rows with `column < cutoff` are affected. Null = all rows (full history delete). */
  cutoff: string | null;
  /** Storage objects referenced by this column must be removed as well (private bucket). */
  storagePathColumn?: string;
  /** Extra guard: only rows whose `column` is not one of `values`. */
  excludeStatuses?: { column: string; values: readonly string[] };
}

export interface CleanupPlan {
  userId: string;
  retention: RetentionOption;
  cutoff: string;
  steps: CleanupStep[];
}

function cleanupSteps(cutoff: string | null): CleanupStep[] {
  return [
    { table: 'email_messages', column: 'sent_at', op: 'delete', cutoff },
    { table: 'email_threads', column: 'last_message_at', op: 'delete', cutoff },
    { table: 'memory_chunks', column: 'occurred_at', op: 'delete', cutoff },
    {
      table: 'captures',
      column: 'created_at',
      op: 'soft_delete',
      cutoff,
      storagePathColumn: 'storage_path',
    },
    { table: 'android_notifications', column: 'posted_at', op: 'delete', cutoff },
    { table: 'assistant_messages', column: 'created_at', op: 'delete', cutoff },
    { table: 'briefings', column: 'generated_at', op: 'delete', cutoff },
    {
      table: 'insights',
      column: 'for_date',
      op: 'delete',
      cutoff,
      excludeStatuses: { column: 'status', values: ['active'] },
    },
  ];
}

export interface BuildCleanupPlanInput {
  now: string;
  users: readonly { userId: string; retention: RetentionOption }[];
}

/** One plan per user with a finite retention; `forever` users are skipped. */
export function buildCleanupPlan(input: BuildCleanupPlanInput): CleanupPlan[] {
  const plans: CleanupPlan[] = [];
  for (const user of input.users) {
    const cutoff = retentionCutoff(user.retention, input.now);
    if (cutoff === null) continue;
    plans.push({
      userId: user.userId,
      retention: user.retention,
      cutoff,
      steps: cleanupSteps(cutoff),
    });
  }
  return plans;
}

export interface DeleteHistoryPlan {
  userId: string;
  /** Null = everything (no age filter). */
  cutoff: string | null;
  steps: CleanupStep[];
}

/**
 * "Geçmişi sil": same tables as retention cleanup, optionally limited to rows older than N days.
 * `olderThanDays` 0/undefined deletes all history.
 */
export function deleteHistoryPlan(
  userId: string,
  opts: { now: string; olderThanDays?: number },
): DeleteHistoryPlan {
  const days = opts.olderThanDays ?? 0;
  if (!Number.isFinite(days) || days < 0) throw new RangeError('olderThanDays negatif olamaz');
  const cutoff = days > 0 ? new Date(Date.parse(opts.now) - days * DAY).toISOString() : null;
  return { userId, cutoff, steps: cleanupSteps(cutoff) };
}

// --- Account deletion ----------------------------------------------------------------------------

export const USER_STORAGE_PREFIXES = [
  'captures',
  'exports',
  'briefing-audio',
  'attachments-cache',
] as const;

export type AccountDeletionStep =
  | { step: 'revoke_tokens' }
  | { step: 'delete_storage_prefixes'; prefixes: string[] }
  | { step: 'unlink_revenuecat' }
  | { step: 'anonymize_audit' }
  | { step: 'delete_auth_user' };

export interface AccountDeletionPlan {
  userId: string;
  /** Execute strictly in order; a failed step stops the run so nothing is left half-deleted silently. */
  steps: AccountDeletionStep[];
}

/** Storage prefixes owned by the user (private buckets are user-scoped by prefix). */
export function userStoragePrefixes(userId: string): string[] {
  return USER_STORAGE_PREFIXES.map((p) => `${p}/${userId}`);
}

/**
 * Ordered account deletion: provider tokens are revoked first (so no sync can resurrect data),
 * files removed, the store link dropped, audit rows anonymized (kept for legal retention without
 * PII) and finally the auth user deleted — which cascades the remaining rows.
 */
export function accountDeletionPlan(userId: string): AccountDeletionPlan {
  return {
    userId,
    steps: [
      { step: 'revoke_tokens' },
      { step: 'delete_storage_prefixes', prefixes: userStoragePrefixes(userId) },
      { step: 'unlink_revenuecat' },
      { step: 'anonymize_audit' },
      { step: 'delete_auth_user' },
    ],
  };
}

// --- Export ----------------------------------------------------------------------------------------

export const EXPORT_URL_TTL_HOURS = 24;

/** Signed download URLs live 24 hours. */
export function exportUrlExpiry(now: string): string {
  return new Date(Date.parse(now) + EXPORT_URL_TTL_HOURS * HOUR).toISOString();
}

/** Never exported: secrets and infrastructure state. */
export const EXPORT_EXCLUDED_TABLES = ['oauth_credentials', 'oauth_states', 'rate_limits'] as const;

export interface ExportBundleManifest {
  version: 1;
  format: 'json';
  /** Tables included, in a stable order, with the file each one is written to. */
  tables: { name: string; file: string }[];
  /** Tables removed from the request because they must never be exported. */
  excluded: string[];
}

function isExcludedFromExport(table: string): boolean {
  return (EXPORT_EXCLUDED_TABLES as readonly string[]).includes(table);
}

export function exportBundleManifest(tables: readonly string[]): ExportBundleManifest {
  const seen = new Set<string>();
  const included: { name: string; file: string }[] = [];
  const excluded: string[] = [];
  for (const raw of tables) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (isExcludedFromExport(name)) {
      excluded.push(name);
      continue;
    }
    included.push({ name, file: `${name}.json` });
  }
  included.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return { version: 1, format: 'json', tables: included, excluded };
}
