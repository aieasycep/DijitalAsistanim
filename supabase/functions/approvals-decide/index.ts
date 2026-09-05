/**
 * POST /approvals-decide { approvalId, decision, editedPayload? }
 *  reject  → rejected (nothing happens, ever).
 *  approve → (optional edit) → approved → executed immediately when the grant has the needed scope;
 *            otherwise the response carries `requiredScope` and the app runs progressive OAuth, then
 *            calls approvals-retry. Device-calendar actions stay `executing` until the app reports back.
 */
import type { DecideApprovalResponse } from '@da/domain';
import { decideApprovalRequestSchema } from '@da/validation';
import { applyEdit, transition } from '@da/server-core/approvals';
import { accountIdOf, loadAccount, loadApproval, loadApprovalContext, persistApproval } from '../_shared/approvals.ts';
import { executeApproval } from '../_shared/execute.ts';
import { adminClient, assertMethod, audit, handler, json, parseInput, requireUser } from '../_shared/mod.ts';

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const input = await parseInput(req, decideApprovalRequestSchema);
    const admin = adminClient();
    const ctx = await loadApprovalContext(admin, user.id);
    let approval = await loadApproval(admin, user.id, input.approvalId);
    const now = new Date().toISOString();

    if (input.decision === 'reject') {
      const rejected = transition(approval, 'rejected', { now, locale: ctx.locale });
      await persistApproval(admin, rejected);
      await audit(admin, { userId: user.id, action: 'approval.reject', actor: 'user', targetType: 'approval_action', targetId: approval.id, metadata: { type: approval.type } });
      const response: DecideApprovalResponse = { approval: rejected, status: rejected.status };
      return json(response);
    }

    const accountId = accountIdOf(approval);
    const account = accountId ? await loadAccount(admin, user.id, accountId) : null;

    if (input.editedPayload) {
      approval = applyEdit(approval, input.editedPayload, { now, timezone: ctx.timezone, locale: ctx.locale, provider: account?.provider ?? null });
      await persistApproval(admin, approval);
      await audit(admin, { userId: user.id, action: 'approval.edit', actor: 'user', targetType: 'approval_action', targetId: approval.id, metadata: { type: approval.type } });
    }

    const approved = transition(approval, 'approved', { now, locale: ctx.locale });
    await persistApproval(admin, approved);
    await audit(admin, { userId: user.id, action: 'approval.approve', actor: 'user', targetType: 'approval_action', targetId: approval.id, metadata: { type: approval.type, edited: approved.editedByUser } });

    const result = await executeApproval(admin, approved, { actor: 'user', ctx });
    const response: DecideApprovalResponse = {
      approval: result.approval,
      status: result.approval.status,
      ...(result.requiredScope ? { requiredScope: result.requiredScope } : {}),
    };
    return json(response);
  }),
);
