/**
 * POST /privacy-delete-account { confirmation } — irreversible.
 * Order: revoke provider grants → delete storage prefixes → unlink RevenueCat → anonymize audit → delete auth user (cascades).
 */
import { deleteAccountRequestSchema } from '@da/validation';
import { AppError } from '@da/server-core/errors';
import { adminClient, assertMethod, audit, getEnv, handler, json, parseInput, requireUser } from '../_shared/mod.ts';
import { revokeAccountCredentials } from '../_shared/credentials.ts';
import { log } from '../_shared/log.ts';

const BUCKETS = ['captures', 'exports', 'briefing-audio', 'attachments-cache'];

async function deletePrefix(bucket: string, prefix: string): Promise<number> {
  const admin = adminClient();
  let removed = 0;
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error || !data || data.length === 0) break;
    const paths = data.filter((f) => f.name).map((f) => `${prefix}/${f.name}`);
    if (paths.length) {
      const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
      if (rmErr) log.warn('storage remove failed', { bucket, error: rmErr.message });
      removed += paths.length;
    }
    if (data.length < 100) break;
    offset += 100;
  }
  return removed;
}

async function unlinkRevenueCat(appUserId: string | null): Promise<void> {
  const env = getEnv();
  if (!appUserId || !env.revenuecat.secretApiKey) return;
  try {
    await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.revenuecat.secretApiKey}` },
    });
  } catch (e) {
    log.warn('revenuecat unlink failed', { error: e instanceof Error ? e.message : 'unknown' });
  }
}

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    await parseInput(req, deleteAccountRequestSchema);
    const admin = adminClient();

    const { data: accounts } = await admin.from('connected_accounts').select('id').eq('user_id', user.id);
    for (const a of (accounts ?? []) as { id: string }[]) {
      await revokeAccountCredentials(admin, a.id);
    }
    let removedFiles = 0;
    for (const bucket of BUCKETS) removedFiles += await deletePrefix(bucket, user.id);

    const { data: profile } = await admin.from('profiles').select('revenuecat_app_user_id').eq('id', user.id).maybeSingle();
    await unlinkRevenueCat((profile as { revenuecat_app_user_id: string | null } | null)?.revenuecat_app_user_id ?? null);

    await audit(admin, { userId: user.id, action: 'account.delete', actor: 'user', targetType: 'user', targetId: user.id, metadata: { accounts: (accounts ?? []).length, removedFiles } });
    await admin.from('audit_logs').update({ user_id: null, ip: null }).eq('user_id', user.id);

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new AppError('internal', `Hesap silinemedi: ${error.message}`);
    return json({ ok: true as const });
  }),
);
