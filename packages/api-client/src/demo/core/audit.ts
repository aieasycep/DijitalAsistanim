import type { AuditAction, AuditLog } from '@da/domain';
import type { DemoContext } from '../context';
import type { DemoState } from '../state';

export function appendAudit(
  ctx: DemoContext,
  state: DemoState,
  action: AuditAction,
  input: {
    actor?: AuditLog['actor'];
    targetType?: string | null;
    targetId?: string | null;
    metadata?: AuditLog['metadata'];
  } = {},
): AuditLog {
  const entry: AuditLog = {
    id: ctx.nextId(),
    userId: ctx.userId,
    action,
    actor: input.actor ?? 'user',
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? {},
    ip: null,
    createdAt: ctx.nowIso(),
  };
  state.auditLogs.push(entry);
  return entry;
}
