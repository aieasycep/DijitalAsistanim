import type { AuditAction } from '@da/domain';
import type { Db } from './db.ts';
import { log } from './log.ts';

/** Append-only audit trail. Metadata must never include bodies, tokens or free text. */
export async function audit(
  db: Db,
  entry: {
    userId?: string | null;
    action: AuditAction;
    actor: 'user' | 'system' | 'assistant' | 'cron' | 'webhook';
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, string | number | boolean | null>;
    ip?: string;
  },
): Promise<void> {
  const { error } = await db.from('audit_logs').insert({
    user_id: entry.userId ?? null,
    action: entry.action,
    actor: entry.actor,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
    ip: entry.ip ?? null,
  });
  if (error) log.warn('audit insert failed', { action: entry.action, error: error.message });
}
