/**
 * POST /capture-analyze { captureId } — Universal Capture analysis.
 *  text → as is · link → SSRF-safe fetch + readable text · image/PDF/file → provider vision/document
 *  transcription · audio → server STT when configured. The extracted text is then analysed with the
 *  evidence-only capture prompt; every date carries the verbatim phrase it came from. Contextual actions
 *  (add to calendar, create task, remind, pay…) are proposals — the app turns them into approvals.
 */
import { z } from 'zod';
import type { Capture, CaptureAnalysis } from '@da/domain';
import { captureAnalysisAiSchema } from '@da/validation';
import { captureAnalysis } from '@da/server-core/ai';
import { AppError } from '@da/server-core/errors';
import { extractReadableText, safeFetchOrThrow } from '@da/server-core/safefetch';
import { aiConfigured, checkAiBudget, createAi, createStt } from '../_shared/ai.ts';
import { loadUserContext } from '../_shared/context.ts';
import { extractTextFromMedia } from '../_shared/media.ts';
import { upsertMemory } from '../_shared/memory.ts';
import {
  adminClient,
  assertMethod,
  enforceRateLimit,
  handler,
  json,
  parseInput,
  requireUser,
  uuidParam,
} from '../_shared/mod.ts';
import { log } from '../_shared/log.ts';
import { resolvePlan } from '../_shared/plan.ts';
import { camelize } from '../_shared/rows.ts';

const schema = z.object({ captureId: uuidParam });
const MAX_TEXT = 20_000;

async function extractText(
  admin: ReturnType<typeof adminClient>,
  capture: Capture,
  locale: 'tr' | 'en',
): Promise<string> {
  switch (capture.kind) {
    case 'text':
      return (capture.originalText ?? '').slice(0, MAX_TEXT);
    case 'link': {
      if (!capture.url) throw new AppError('validation', 'Bağlantı eksik.');
      const page = await safeFetchOrThrow(capture.url, {
        fetch: (input, init) => fetch(input, init),
      });
      if (page.mimeType === 'application/pdf')
        return extractTextFromMedia({
          bytes: page.bytes,
          mimeType: 'application/pdf',
          filename: 'link.pdf',
        });
      const html = page.text ?? new TextDecoder().decode(page.bytes);
      const readable = extractReadableText(html, { maxLength: MAX_TEXT });
      return [readable.title, readable.text].filter(Boolean).join('\n\n');
    }
    case 'image':
    case 'pdf':
    case 'file':
    case 'audio': {
      if (!capture.storagePath) throw new AppError('validation', 'Dosya eksik.');
      const { data, error } = await admin.storage.from('captures').download(capture.storagePath);
      if (error || !data) throw new AppError('not_found', 'Dosya bulunamadı.');
      const bytes = new Uint8Array(await data.arrayBuffer());
      const mimeType = capture.mimeType ?? data.type ?? 'application/octet-stream';
      if (capture.kind === 'audio') {
        const stt = createStt();
        if (!stt)
          throw new AppError(
            'ai_unavailable',
            'Sesli not dökümü için bir konuşma tanıma sağlayıcısı gerekli.',
            { status: 503 },
          );
        const result = await stt.transcribe(bytes, { mimeType, language: locale });
        return result.text.slice(0, MAX_TEXT);
      }
      return extractTextFromMedia({
        bytes,
        mimeType,
        filename: capture.storagePath.split('/').pop() ?? 'file',
      });
    }
  }
}

function toAnalysis(ai: z.infer<typeof captureAnalysisAiSchema>): CaptureAnalysis {
  return {
    detectedType: ai.detectedType,
    title: ai.title,
    summary: ai.summary,
    event: ai.event
      ? {
          title: ai.event.title,
          startAt: ai.event.start?.iso ?? null,
          endAt: ai.event.end?.iso ?? null,
          location: ai.event.location ?? null,
          dateText: ai.event.start?.text ?? null,
        }
      : null,
    task: ai.task ? { title: ai.task.title, dueAt: ai.task.due?.iso ?? null } : null,
    deadline: ai.deadline
      ? {
          title: ai.deadline.title,
          dueAt: ai.deadline.due?.iso ?? null,
          dueText: ai.deadline.due?.text ?? null,
        }
      : null,
    person: ai.person
      ? {
          name: ai.person.name,
          email: ai.person.email ?? null,
          phone: ai.person.phone ?? null,
          company: ai.person.company ?? null,
        }
      : null,
    payment: ai.payment
      ? {
          payee: ai.payment.payee ?? null,
          amount: ai.payment.amount ?? null,
          currency: ai.payment.currency ?? null,
          dueAt: ai.payment.due?.iso ?? null,
        }
      : null,
    keyPoints: ai.keyPoints,
    dates: ai.dates.map((d) => ({ text: d.text, iso: d.iso ?? null })),
    suggestedActions: ai.suggestedActions,
    confidence: ai.confidence,
  };
}

/** Deterministic analysis when no LLM is configured: title from the first line, dates left to the user. */
function fallbackAnalysis(text: string, locale: 'tr' | 'en', url: string | null): CaptureAnalysis {
  const firstLine =
    text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ??
    url ??
    (locale === 'en' ? 'Note' : 'Not');
  return {
    detectedType: 'note',
    title: firstLine.slice(0, 120),
    summary: text.replace(/\s+/g, ' ').trim().slice(0, 400),
    keyPoints: [],
    dates: [],
    suggestedActions: [
      { kind: 'create_task', label: locale === 'en' ? 'Create task' : 'Görev oluştur' },
      ...(url
        ? [
            {
              kind: 'open_link' as const,
              label: locale === 'en' ? 'Open link' : 'Bağlantıyı aç',
              payload: { url },
            },
          ]
        : []),
    ],
    confidence: 0.4,
  };
}

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const { captureId } = await parseInput(req, schema);
    await enforceRateLimit('capture_upload', user.id);
    const admin = adminClient();
    const ctx = await loadUserContext(admin, user.id);
    const { data: row } = await admin
      .from('captures')
      .select('*')
      .eq('id', captureId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!row) throw new AppError('not_found', 'Yakalama bulunamadı.');
    const capture = camelize<Capture>(row);
    if (capture.status === 'analyzed' && capture.analysis) return json(capture);

    await admin
      .from('captures')
      .update({ status: 'analyzing', failure_reason: null })
      .eq('id', capture.id);
    try {
      const text = (await extractText(admin, capture, ctx.locale)).trim();
      if (!text)
        throw new AppError(
          'validation',
          ctx.locale === 'en' ? 'No readable text was found.' : 'Okunabilir bir metin bulunamadı.',
        );
      let analysis: CaptureAnalysis;
      if (aiConfigured()) {
        const plan = await resolvePlan(admin, user.id);
        const aiCtx = {
          userId: user.id,
          plan: plan.plan,
          timezone: ctx.timezone,
          locale: ctx.locale,
        };
        await checkAiBudget(aiCtx, 2000);
        const spec = captureAnalysis({
          now: new Date().toISOString(),
          locale: ctx.locale,
          timezone: ctx.timezone,
          kind: capture.kind,
          text,
          url: capture.url ?? null,
          filename: capture.storagePath?.split('/').pop() ?? null,
          mimeType: capture.mimeType ?? null,
          userNote: capture.kind === 'text' ? null : (capture.originalText ?? null),
        });
        const result = await createAi(aiCtx).generateStructured(captureAnalysisAiSchema, spec, {
          userId: user.id,
          locale: ctx.locale,
        });
        analysis = toAnalysis(result.data);
      } else {
        analysis = fallbackAnalysis(text, ctx.locale, capture.url ?? null);
      }
      const { data: updated, error } = await admin
        .from('captures')
        .update({ status: 'analyzed', extracted_text: text.slice(0, MAX_TEXT), analysis })
        .eq('id', capture.id)
        .select('*')
        .single();
      if (error || !updated)
        throw new AppError('internal', `Analiz kaydedilemedi: ${error?.message ?? ''}`);
      const saved = camelize<Capture>(updated);
      await upsertMemory(admin, user.id, {
        source: { kind: 'capture', entity: saved },
        timezone: ctx.timezone,
        locale: ctx.locale,
        userEmails: ctx.userEmails,
      });
      return json(saved);
    } catch (e) {
      const reason = e instanceof AppError ? e.code : 'unknown';
      await admin
        .from('captures')
        .update({ status: 'failed', failure_reason: reason })
        .eq('id', capture.id);
      log.warn('capture analysis failed', { captureId, reason });
      throw e;
    }
  }),
);
