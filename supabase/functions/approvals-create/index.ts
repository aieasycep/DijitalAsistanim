/**
 * POST /approvals-create — create a pending approval from a user-initiated proposal (assistant, capture,
 * email detail, plan…). The payload is validated per action type, the change summary is regenerated
 * server-side and the idempotency key collapses duplicate proposals. Returns `{ approvalId }`.
 */
import type { ApprovalAction } from '@da/domain';
import { createApprovalRequestSchema } from '@da/validation';
import { createApproval } from '@da/server-core/approvals';
import { AppError } from '@da/server-core/errors';
import {
  accountIdOf,
  insertApproval,
  loadAccount,
  loadApprovalContext,
} from '../_shared/approvals.ts';
import {
  adminClient,
  assertMethod,
  audit,
  handler,
  json,
  parseInput,
  requireUser,
} from '../_shared/mod.ts';

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const input = await parseInput(req, createApprovalRequestSchema);
    const admin = adminClient();
    const ctx = await loadApprovalContext(admin, user.id);

    const accountId = accountIdOf({ payload: input.payload } as unknown as ApprovalAction);
    const account = accountId ? await loadAccount(admin, user.id, accountId) : null;
    if (accountId && !account) throw new AppError('not_found', 'Hedef hesap bulunamadı.');

    const approval = await createApproval(
      {
        type: input.type,
        what: input.what,
        why: input.why,
        changeSummary: input.changeSummary,
        payload: input.payload as never,
        source: input.source ?? null,
        requestedBy: input.requestedBy,
        insightId: input.insightId ?? null,
        idempotencyKey: input.idempotencyKey,
      },
      {
        userId: user.id,
        now: new Date().toISOString(),
        locale: ctx.locale,
        timezone: ctx.timezone,
        provider: account?.provider ?? null,
      },
    );
    const { id, created } = await insertApproval(admin, approval);
    if (created) {
      await audit(admin, {
        userId: user.id,
        action: 'approval.create',
        actor: 'user',
        targetType: 'approval_action',
        targetId: id,
        metadata: { type: input.type, requestedBy: input.requestedBy },
      });
    }
    return json({ approvalId: id });
  }),
);
