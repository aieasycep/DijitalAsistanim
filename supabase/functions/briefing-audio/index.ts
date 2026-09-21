/**
 * POST /briefing-audio { briefingId } — audio briefing. With a TTS provider configured the narration is
 * synthesised once, stored privately (briefing-audio/<user>/…) and served via a short-lived signed URL;
 * otherwise the app narrates the script with device TTS. Chapters carry a timeline either way.
 */
import type { Briefing, BriefingAudioResponse } from '@da/domain';
import { briefingAudioRequestSchema } from '@da/validation';
import { AppError } from '@da/server-core/errors';
import { buildAudioChapters } from '@da/server-core/speech';
import { createTts } from '../_shared/ai.ts';
import { loadUserContext } from '../_shared/context.ts';
import {
  adminClient,
  assertMethod,
  handler,
  json,
  parseInput,
  requireUser,
} from '../_shared/mod.ts';
import { log } from '../_shared/log.ts';
import { camelize } from '../_shared/rows.ts';

const URL_TTL_SEC = 24 * 3600;

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const { briefingId } = await parseInput(req, briefingAudioRequestSchema);
    const admin = adminClient();
    const [ctx, { data: row }] = await Promise.all([
      loadUserContext(admin, user.id),
      admin.from('briefings').select('*').eq('id', briefingId).eq('user_id', user.id).maybeSingle(),
    ]);
    if (!row) throw new AppError('not_found', 'Brifing bulunamadı.');
    const briefing = camelize<Briefing>(row);
    const language = ctx.locale === 'en' ? 'en' : 'tr';

    const chapterInputs = (briefing.audio?.chapters ?? []).map((c) => ({
      title: c.title,
      text: c.text,
    }));
    if (chapterInputs.length === 0)
      chapterInputs.push({ title: briefing.headline, text: briefing.narrative });
    const built = buildAudioChapters(chapterInputs, { language });
    const script = briefing.audio?.script?.trim() || built.plainScript;

    const deviceResponse: BriefingAudioResponse = {
      provider: 'device_tts',
      url: null,
      script,
      chapters: built.chapters,
    };
    const tts = createTts();
    if (!tts) return json(deviceResponse);

    // Reuse a stored file while its signed URL is still valid.
    const stored = briefing.audio;
    if (
      stored?.provider === 'server_tts' &&
      stored.url &&
      (stored as { urlExpiresAt?: string }).urlExpiresAt &&
      Date.parse((stored as { urlExpiresAt?: string }).urlExpiresAt as string) > Date.now() + 60_000
    ) {
      return json({
        provider: 'server_tts',
        url: stored.url,
        script,
        chapters: stored.chapters.length ? stored.chapters : built.chapters,
      });
    }

    const path = `${user.id}/${briefing.id}-v${briefing.version}.mp3`;
    const existingFile = await admin.storage
      .from('briefing-audio')
      .list(user.id, { search: `${briefing.id}-v${briefing.version}.mp3` });
    let durationSec = stored?.durationSec ?? built.totalDurationSec;
    if (!existingFile.data?.length) {
      try {
        const result = await tts.synthesize(built.plainScript, { format: 'mp3' });
        durationSec = Math.round(result.durationSecEstimate);
        const { error: upErr } = await admin.storage
          .from('briefing-audio')
          .upload(path, result.audio, { contentType: 'audio/mpeg', upsert: true });
        if (upErr) throw new AppError('internal', `Ses dosyası kaydedilemedi: ${upErr.message}`);
      } catch (e) {
        log.warn('server tts failed; device fallback', {
          error: e instanceof Error ? e.message : 'unknown',
        });
        return json(deviceResponse);
      }
    }
    const { data: signed } = await admin.storage
      .from('briefing-audio')
      .createSignedUrl(path, URL_TTL_SEC);
    if (!signed?.signedUrl) return json(deviceResponse);
    const urlExpiresAt = new Date(Date.now() + URL_TTL_SEC * 1000).toISOString();
    const audio = {
      provider: 'server_tts' as const,
      url: signed.signedUrl,
      urlExpiresAt,
      durationSec,
      chapters: built.chapters,
      script,
    };
    await admin.from('briefings').update({ audio }).eq('id', briefing.id);
    const response: BriefingAudioResponse = {
      provider: 'server_tts',
      url: signed.signedUrl,
      script,
      chapters: built.chapters,
    };
    return json(response);
  }),
);
