import type {
  ApprovalAction,
  ApprovalPayloadMap,
  ApprovalStatus,
  DecideApprovalResponse,
} from '@da/domain';
import { approvalPayloadSchemas } from '@da/validation';
import type { ApprovalsApi } from '../../datasource';
import type { DemoContext } from '../context';
import {
  createApprovalCore,
  emitPending,
  executeApprovalCore,
  getApproval,
  pendingCount,
} from '../core/approvals';
import { appendAudit } from '../core/audit';
import { reinforcePreference } from '../core/learning';
import type { DemoState } from '../state';
import { conflict, validate } from '../validate';

const STATUS_ORDER: ApprovalStatus[] = [
  'pending',
  'executing',
  'failed',
  'approved',
  'executed',
  'rejected',
  'expired',
];

const TYPE_LABEL: Record<ApprovalAction['type'], string> = {
  email_send: 'mail gönderme',
  calendar_create: 'takvime ekleme',
  calendar_update: 'etkinlik taşıma',
  task_create: 'görev oluşturma',
  reminder_create: 'hatırlatıcı',
  commitment_create: 'taahhüt',
};

function expireStale(s: DemoState, nowIso: string): void {
  for (const a of s.approvals) {
    if (a.status === 'pending' && a.expiresAt < nowIso) {
      a.status = 'expired';
      a.updatedAt = nowIso;
    }
  }
}

export function createApprovalsApi(ctx: DemoContext): ApprovalsApi {
  return {
    listApprovals: (input) =>
      ctx.run(() => {
        ctx.store.mutate((s) => expireStale(s, ctx.nowIso()));
        const wanted = input?.status?.length ? new Set(input.status) : null;
        return ctx.store.state.approvals
          .filter((a) => !wanted || wanted.has(a.status))
          .sort((a, b) => {
            const sa = STATUS_ORDER.indexOf(a.status);
            const sb = STATUS_ORDER.indexOf(b.status);
            if (sa !== sb) return sa - sb;
            return Date.parse(b.createdAt) - Date.parse(a.createdAt);
          })
          .map((a) => ({ ...a }));
      }),
    getApproval: (id) => ctx.run(() => ({ ...getApproval(ctx.store.state, id) })),
    createApproval: (req) => ctx.run(() => createApprovalCore(ctx, req)),
    decideApproval: (input) =>
      ctx.run(async (): Promise<DecideApprovalResponse> => {
        const current = getApproval(ctx.store.state, input.approvalId);
        if (current.status !== 'pending') throw conflict('Bu onay zaten sonuçlanmış.');
        const now = ctx.nowIso();
        if (input.editedPayload) {
          const payload = validate(
            approvalPayloadSchemas[current.type],
            input.editedPayload,
          ) as unknown as ApprovalPayloadMap[typeof current.type];
          ctx.store.mutate((s) => {
            const a = getApproval(s, input.approvalId);
            a.payload = payload;
            a.editedByUser = true;
            a.updatedAt = now;
            appendAudit(ctx, s, 'approval.edit', {
              targetType: 'approval_action',
              targetId: a.id,
              metadata: { type: a.type },
            });
          });
        }
        if (input.decision === 'reject') {
          const rejected = ctx.store.mutate((s) => {
            const a = getApproval(s, input.approvalId);
            a.status = 'rejected';
            a.rejectedAt = now;
            a.updatedAt = now;
            appendAudit(ctx, s, 'approval.reject', {
              targetType: 'approval_action',
              targetId: a.id,
              metadata: { type: a.type },
            });
            reinforcePreference(ctx, s, {
              kind: 'dismiss_pattern',
              subjectKey: `approval:${a.type}`,
              statement: `${TYPE_LABEL[a.type]} önerilerini daha az yapıyorum.`,
              weight: -0.4,
            });
            return { ...a };
          });
          emitPending(ctx);
          return { approval: rejected, status: 'rejected' };
        }
        ctx.store.mutate((s) => {
          const a = getApproval(s, input.approvalId);
          a.status = 'approved';
          a.approvedAt = now;
          a.updatedAt = now;
          appendAudit(ctx, s, 'approval.approve', {
            targetType: 'approval_action',
            targetId: a.id,
            metadata: { type: a.type },
          });
        });
        emitPending(ctx);
        const executed = await executeApprovalCore(ctx, input.approvalId);
        return {
          approval: { ...executed },
          status: executed.status,
          requiredScope: executed.requiredScope ?? null,
        };
      }),
    retryApproval: (id) =>
      ctx.run(async (): Promise<DecideApprovalResponse> => {
        const current = getApproval(ctx.store.state, id);
        if (current.status !== 'failed')
          throw conflict('Yalnızca başarısız onaylar yeniden denenebilir.');
        const executed = await executeApprovalCore(ctx, id);
        return {
          approval: { ...executed },
          status: executed.status,
          requiredScope: executed.requiredScope ?? null,
        };
      }),
    pendingCount: () =>
      ctx.run(() => {
        ctx.store.mutate((s) => expireStale(s, ctx.nowIso()));
        return pendingCount(ctx.store.state);
      }),
    onPendingChange: (cb) => ctx.pendingChanged.on(cb),
  };
}
