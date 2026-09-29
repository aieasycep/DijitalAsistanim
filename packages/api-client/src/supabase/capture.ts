/** CaptureApi: private `captures` bucket upload (user-scoped path), captures table, capture-analyze function. */
import type { CaptureApi } from '../datasource';
import { ClientApiError } from '../errors';
import { exec, read, toClientError, write, type SupabaseContext } from './client';
import {
  appendFilePart,
  extensionForMime,
  isNativePart,
  loadFileBody,
  safeFileName,
  type NativeFilePart,
} from './files';
import { captureToRow, toCapture } from './mappers';
import type { CaptureRow } from './rows';

const BUCKET = 'captures';

export function createCaptureApi(ctx: SupabaseContext): CaptureApi {
  const captures = () => ctx.table<CaptureRow>('captures');

  /**
   * React Native fallback: its FormData lacks `has()` (which storage-js calls), so the native `{ uri, name, type }`
   * part is posted straight to the Storage REST endpoint that storage-js would call anyway.
   */
  async function uploadNativePart(path: string, part: NativeFilePart): Promise<void> {
    const token = await ctx.getAccessToken();
    if (!token)
      throw new ClientApiError({
        code: 'unauthorized',
        message: 'Oturum bulunamadı. Lütfen tekrar giriş yap.',
      });
    const form = new FormData();
    appendFilePart(form, '', part, part.name);
    const url = `${ctx.supabaseUrl}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
    let response: Response;
    try {
      response = await ctx.fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: ctx.anonKey, 'x-upsert': 'false' },
        body: form,
      });
    } catch {
      throw new ClientApiError({
        code: 'offline',
        message: 'Çevrimdışısın.',
        details: { reason: 'network' },
      });
    }
    if (!response.ok) {
      const text = await response.text();
      throw toClientError({
        __isStorageError: true,
        name: 'StorageApiError',
        message: text || response.statusText,
        status: response.status,
      });
    }
  }

  return {
    uploadCaptureFile: (input) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        const ext = extensionForMime(input.mimeType);
        const name = safeFileName(input.fileName, ext);
        const path = `${userId}/${ctx.now().getTime()}-${name}`;
        const body = await loadFileBody(ctx.fetch, {
          uri: input.uri,
          mimeType: input.mimeType,
          name,
        });
        if (isNativePart(body)) {
          await uploadNativePart(path, body);
        } else {
          const { error } = await ctx.client.storage
            .from(BUCKET)
            .upload(path, body, { contentType: input.mimeType, upsert: false });
          if (error) throw error;
        }
        return { storagePath: path };
      }),

    createCapture: (req) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        return toCapture(
          await exec(captures().insert(captureToRow(userId, req)).select('*').single()),
        );
      }),

    analyzeCapture: (id) => ctx.call('capture-analyze', { captureId: id }),

    getCapture: (id) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        return toCapture(
          await exec(captures().select('*').eq('user_id', userId).eq('id', id).single()),
        );
      }),

    listCaptures: () =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          captures()
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false }),
        );
        return rows.map(toCapture);
      }),

    /** Soft delete; the storage object is removed by the retention job so a pending analysis cannot dangle. */
    deleteCapture: (id) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await exec(
          captures()
            .update({ deleted_at: ctx.now().toISOString() })
            .eq('user_id', userId)
            .eq('id', id)
            .is('deleted_at', null),
        );
      }),
  };
}
