/** GET /privacy-export-status?id — export status; refreshes the signed download URL while the export is ready. */
import { z } from 'zod';
import type { DataExportRequest } from '@da/domain';
import { adminClient, assertMethod, handler, json, parseInput, requireUser, uuidParam } from '../_shared/mod.ts';
import { camelize } from '../_shared/rows.ts';

const schema = z.object({ id: uuidParam.optional() });
const URL_TTL_SEC = 24 * 3600;

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'GET');
    const { user } = await requireUser(req);
    const { id } = await parseInput(req, schema);
    const admin = adminClient();
    let q = admin.from('data_export_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1);
    if (id) q = admin.from('data_export_requests').select('*').eq('user_id', user.id).eq('id', id).limit(1);
    const { data } = await q.maybeSingle();
    if (!data) return json(null);
    const row = data as { id: string; status: string; storage_path: string | null; url_expires_at: string | null; download_url: string | null };
    if (row.status === 'ready' && row.storage_path) {
      const expired = !row.url_expires_at || Date.parse(row.url_expires_at) < Date.now() + 60_000;
      if (expired) {
        const { data: signed } = await admin.storage.from('exports').createSignedUrl(row.storage_path, URL_TTL_SEC);
        if (signed?.signedUrl) {
          const urlExpiresAt = new Date(Date.now() + URL_TTL_SEC * 1000).toISOString();
          await admin.from('data_export_requests').update({ download_url: signed.signedUrl, url_expires_at: urlExpiresAt }).eq('id', row.id);
          return json(camelize<DataExportRequest>({ ...row, download_url: signed.signedUrl, url_expires_at: urlExpiresAt }));
        }
      }
    }
    return json(camelize<DataExportRequest>(row));
  }),
);
