/**
 * POST /approvals-retry { approvalId } — re-run an `approved` (scope was missing) or `failed` approval.
 * At most 3 attempts; an already executed approval is returned as-is (idempotent).
 */
import { z } from 'zod';
import type { DecideApprovalResponse } from '@da/domain';
import { MAX_EXECUTION_ATTEMPTS } from '@da/server-core/approvals';
import { AppError } from '@da/server-core/errors';
import { loadApproval, loadApprovalContext } from '../_shared/approvals.ts';
import { executeApproval } from '../_shared/execute.ts';
import { adminClient, assertMethod, handler, json, parseInput, requireUser, uuidParam } from '../_shared/mod.ts';

const schema = z.object({ approvalId: uuidParam });

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const { approvalId } = await parseInput(req, schema);
    const admin = adminClient();
    const ctx = await loadApprovalContext(admin, user.id);
    const approval = await loadApproval(admin, user.id, approvalId);

    if (approval.status === 'executed') {
      const response: DecideApprovalResponse = { approval, status: approval.status };
      return json(response);
    }
    if (approval.status !== 'approved' && approval.status !== 'failed') {
      throw new AppError('conflict', 'Bu işlem yeniden denenemez.', { details: { status: approval.status } });
    }
    if (approval.attemptCount >= MAX_EXECUTION_ATTEMPTS) {
      throw new AppError('conflict', 'Deneme sınırına ulaşıldı. İşlemi yeniden oluşturman gerekiyor.', { details: { attemptCount: approval.attemptCount } });
    }

    const result = await executeApproval(admin, approval, { actor: 'user', ctx });
    const response: DecideApprovalResponse = {
      approval: result.approval,
      status: result.approval.status,
      ...(result.requiredScope ? { requiredScope: result.requiredScope } : {}),
    };
    return json(response);
  }),
);
