/**
 * POST /assistant-transcribe (multipart: file, mimeType, durationSec) — server-side speech-to-text.
 * Returns `{ provider: 'device' }` when no STT provider is configured so the app uses on-device recognition.
 * Audio is processed in memory and never stored; only the duration is counted against usage.
 */
import type { TranscribeResponse } from '@da/domain';
import { AppError } from '@da/server-core/errors';
import { createStt } from '../_shared/ai.ts';
import {
  adminClient,
  assertMethod,
  enforceRateLimit,
  handler,
  json,
  requireUser,
} from '../_shared/mod.ts';
import { localDateKey } from '../_shared/rows.ts';

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_DURATION_SEC = 180;

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    await enforceRateLimit('assistant_query', user.id);
    const stt = createStt();
    if (!stt) return json({ provider: 'device' as const });

    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data'))
      throw new AppError('validation', 'Ses dosyası multipart olarak gönderilmeli.');
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new AppError('validation', 'Ses dosyası eksik.');
    if (file.size === 0 || file.size > MAX_BYTES)
      throw new AppError('validation', 'Ses dosyası boyutu desteklenmiyor.');
    const durationSec = Math.min(
      MAX_DURATION_SEC,
      Math.max(0, Number(form.get('durationSec') ?? 0) || 0),
    );
    const mimeType = String(form.get('mimeType') ?? file.type ?? 'audio/m4a');

    const admin = adminClient();
    const { data: prefs } = await admin
      .from('user_preferences')
      .select('locale, timezone')
      .eq('user_id', user.id)
      .maybeSingle();
    const p = prefs as { locale: 'tr' | 'en'; timezone: string } | null;

    const audio = new Uint8Array(await file.arrayBuffer());
    const result = await stt.transcribe(audio, { mimeType, language: p?.locale ?? 'tr' });

    const seconds = Math.round(result.durationSec ?? durationSec);
    if (seconds > 0) {
      const day = localDateKey(new Date(), p?.timezone ?? 'Europe/Istanbul');
      const { data } = await admin
        .from('usage_counters')
        .select('voice_seconds')
        .eq('user_id', user.id)
        .eq('day', day)
        .maybeSingle();
      const current = (data as { voice_seconds: number } | null)?.voice_seconds ?? 0;
      await admin.from('usage_counters').upsert(
        {
          user_id: user.id,
          day,
          voice_seconds: current + seconds,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,day' },
      );
    }
    const response: TranscribeResponse = { text: result.text.trim(), provider: 'server_stt' };
    return json(response);
  }),
);
