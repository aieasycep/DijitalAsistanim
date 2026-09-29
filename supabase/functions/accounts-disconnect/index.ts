/**
 * POST /accounts-disconnect { accountId } — revoke the provider grant where possible, wipe our encrypted copy,
 * stop sync and soft-delete the account. Analyzed content stays until retention/"Geçmişi Sil" (design: 30 days).
 */
import { z } from 'zod';
import { AppError } from '@da/server-core/errors';
import {
  adminClient,
  assertMethod,
  audit,
  handler,
  json,
  parseInput,
  requireUser,
  uuidParam,
} from '../_shared/mod.ts';
import { revokeAccountCredentials } from '../_shared/credentials.ts';

const schema = z.object({ accountId: uuidParam });

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const { accountId } = await parseInput(req, schema);
    const admin = adminClient();

    const { data: account, error } = await admin
      .from('connected_accounts')
      .select('id, provider, user_id')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error || !account) throw new AppError('not_found', 'Hesap bulunamadı.');

    const result = await revokeAccountCredentials(admin, accountId);
    await admin.from('sync_states').delete().eq('account_id', accountId);
    await admin
      .from('connected_accounts')
      .update({
        status: 'disconnected',
        deleted_at: new Date().toISOString(),
        is_primary: false,
        last_error: null,
      })
      .eq('id', accountId);

    await audit(admin, {
      userId: user.id,
      action: 'oauth.revoke',
      actor: 'user',
      targetType: 'connected_account',
      targetId: accountId,
      metadata: { revoked: result.revoked },
    });

    return json({
      ok: true as const,
      revoked: result.revoked,
      ...(result.manualUrl ? { manualUrl: result.manualUrl } : {}),
    });
  }),
);
