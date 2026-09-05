/** POST /privacy-export-request — queue an async data export (processed by the exports cron job). */
import type { DataExportRequest } from '@da/domain';
import { AppError } from '@da/server-core/errors';
import {
  adminClient,
  assertMethod,
  audit,
  enforceRateLimit,
  handler,
  json,
  requireUser,
} from '../_shared/mod.ts';
import { camelize } from '../_shared/rows.ts';

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    await enforceRateLimit('export', user.id);
    const admin = adminClient();
    const { data: pending } = await admin
      .from('data_export_requests')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['requested', 'processing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pending) return json(camelize<DataExportRequest>(pending));
    const { data, error } = await admin
      .from('data_export_requests')
      .insert({ user_id: user.id, status: 'requested' })
      .select('*')
      .single();
    if (error || !data)
      throw new AppError('internal', `Dışa aktarım oluşturulamadı: ${error?.message ?? ''}`);
    await audit(admin, {
      userId: user.id,
      action: 'data.export',
      actor: 'user',
      targetType: 'data_export_request',
      targetId: (data as { id: string }).id,
      metadata: { status: 'requested' },
    });
    return json(camelize<DataExportRequest>(data));
  }),
);
